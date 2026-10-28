"""Windows WebView2 shell sharing the Fedora persistence and editor protocol."""
import base64,copy,json,math,os,sys,threading,time,uuid
from pathlib import Path
from urllib.parse import urlsplit,unquote
if __package__:
    from .windows_release import load_release
else:
    from windows_release import load_release

ROOT=Path(__file__).resolve().parent
if not (ROOT/'notebook_store.py').exists():sys.path.insert(0,str(ROOT.parent/'fedora'))
from notebook_store import NotebookStore,WorkspaceHub,MAX_BYTES
from file_store import FileStore,VersionStore

class BundleStore:
    names={'spelling':'spelling-worker.js.gz','format':'format-worker.js.gz'}
    def __init__(self,folder):self.folder=Path(folder);self.cache={};self.lock=threading.Lock()
    def read(self,name):
        if not isinstance(name,str) or name not in self.names:raise ValueError('Unknown editor tool bundle.')
        with self.lock:
            if name not in self.cache:
                try:self.cache[name]=base64.b64encode((self.folder/self.names[name]).read_bytes()).decode('ascii')
                except FileNotFoundError:raise ValueError('Editor tools are missing. Re-extract the complete Windows package.')
            return {'source':self.cache[name]}

class Bridge:
    def __init__(self,editor):self._editor=editor
    def dispatch(self,raw):
        try:
            if not isinstance(raw,str) or len(raw)>MAX_BYTES+1024*1024:raise ValueError('The desktop request is too large.')
            data=json.loads(raw)
            if not isinstance(data,dict) or not isinstance(data.get('id'),str) or len(data['id'])>100:raise ValueError('Invalid desktop request.')
            if not self._editor.trusted():raise ValueError('Desktop actions are available only in the editor.')
            return {'result':self._editor.dispatch(data),'error':None}
        except Exception as error:return {'result':None,'error':str(error)}

class Editor:
    def __init__(self,app,identity,ids=None,transfer=None,anchor=None):
        self.app=app;self.identity=identity;self.initial_ids=ids;self.transfer=transfer;self.anchor=anchor;self.window=None;self.loaded=False;self.closed=False;self.closing=False;self.can_destroy=False;self.viewport=(1120,790);self.ready=threading.Event();self.failed=None;self.pending_imports=[];self.ui_ready=threading.Event();self.startup_timer=None
    def trusted(self):
        if self.closed or self.window is None:return False
        current=self.window.get_current_url()
        if not current:return False
        parsed=urlsplit(str(current));expected=urlsplit(self.app.uri)
        return parsed.scheme=='file' and parsed.netloc==expected.netloc and unquote(parsed.path).casefold()==unquote(expected.path).casefold() and not parsed.query
    def ui(self,fn):
        from System import Action
        native=self.window.native
        if native.InvokeRequired:native.Invoke(Action(fn))
        else:fn()
    def evaluate(self,script):
        if self.closed:return None
        return self.window.evaluate_js(script)
    def fire(self,script):
        if not self.closed:self.window.run_js(script)
    def request_close(self):
        if self.can_destroy:return True
        if not self.loaded:return False
        if not self.closing:
            self.closing=True
            threading.Thread(target=self.fire,args=('window.vistaNotesPrepareClose && window.vistaNotesPrepareClose();',),daemon=True).start()
        return False
    def destroy(self):
        self.can_destroy=True;self.window.destroy()
    def on_closed(self):
        if self.startup_timer:self.startup_timer.cancel()
        self.closed=True;self.ready.set();self.app.drag.cancel_source(self)
        with self.app.lock:self.app.editors.pop(self.identity,None)
        snapshot=self.app.hub.retire(self.identity)
        if snapshot:self.app.publish(self,snapshot)
    def on_loaded(self):
        try:
            from webview.dom import DOMEventHandler
            def dropped(event):
                if self.closing or self.closed or self.app.drag.current:return
                files=event.get('dataTransfer',{}).get('files',[]);paths=[f.get('pywebviewFullPath') for f in files if isinstance(f,dict) and f.get('pywebviewFullPath')]
                if paths:self.deliver_imports(paths)
            self.window.dom.document.events.drop+=DOMEventHandler(dropped,prevent_default=True,stop_propagation=True,stop_immediate_propagation=True)
            def secure_navigation(_sender,event):
                candidate=urlsplit(str(event.Uri));allowed=urlsplit(self.app.uri)
                if candidate.scheme!='file' or candidate.netloc!=allowed.netloc or unquote(candidate.path).casefold()!=unquote(allowed.path).casefold():event.Cancel=True
            def configure_native():
                core=self.window.native.webview.CoreWebView2
                core.Settings.AreBrowserAcceleratorKeysEnabled=False
                core.Settings.IsZoomControlEnabled=False
                core.Settings.IsStatusBarEnabled=False
                core.NavigationStarting+=secure_navigation
            self.ui(configure_native)
        except Exception as error:self.app.log('Native event binding: '+str(error))
    def deliver_imports(self,paths):
        if not self.loaded:self.pending_imports.extend(paths);return
        entries=self.app.read_imports(paths);self.fire('window.vistaNotesOpenDroppedFiles('+json.dumps(entries,ensure_ascii=True)+');')
    def dispatch(self,data):
        command=data.get('command');app=self.app
        if command=='load':
            result=app.hub.load(self.identity,self.initial_ids);self.initial_ids=None
            result.update(windowId=self.identity,nativeDrag=False,liveDrag=True,historyAppend=True,editorBuild=app.build,transfer=self.transfer,openIds=app.hub.open_file_ids());self.transfer=None;return result
        if command=='ready':
            if self.startup_timer:self.startup_timer.cancel()
            if data.get('build')!=app.build:
                self.failed='The editor page is from a different build. Close all Another Note windows and reinstall build '+app.build+'.'
                self.ready.set();app.platform.message(self.failed);self.destroy();return {'ready':False}
            if data.get('failed'):
                self.failed='The editor could not load its workspace.';self.loaded=True;self.window.show();self.ready.set();return {'ready':False}
            self.loaded=True;app.platform.appearance(self,data.get('theme','dark'))
            if self.anchor:app.platform.position(self,self.anchor)
            self.window.show();self.ready.set()
            if self.pending_imports:paths=self.pending_imports;self.pending_imports=[];threading.Thread(target=self.deliver_imports,args=(paths,),daemon=True).start()
            return {'ready':True}
        if command=='appearance':
            if data.get('theme') not in ('dark','light'):raise ValueError('Invalid appearance.')
            app.platform.appearance(self,data['theme']);return {'updated':True}
        if command=='geometry':
            width,height=data.get('width'),data.get('height')
            if all(type(v) in (int,float) and math.isfinite(v) and 0<v<100000 for v in (width,height)):self.viewport=(width,height)
            return {'updated':True}
        if command=='title':self.window.set_title(str(data.get('title') or 'Another Note')[:1000]);return {'updated':True}
        if command=='editor_bundle':return app.bundles.read(data.get('bundle'))
        if command=='save':
            snapshot=app.hub.save(self.identity,data.get('state'));app.publish(self,snapshot);return {'saved':True,'openIds':snapshot['settings']['openIds']}
        if command=='open_tabs':return {'openIds':app.hub.open_file_ids()}
        if command=='read_file':return app.files.read_bound(data.get('fileKey'))
        if command=='check_files':return app.files.check_changes(data.get('files'))
        if command=='open_link':
            target=app.files.link_target(data.get('reference'),data.get('fileKey'))
            if 'url' in target:
                import webbrowser
                if not webbrowser.open(target['url'],new=2):raise ValueError('The default browser could not open this link.')
                return {'external':True}
            if target.get('image'):app.platform.open_image(target['path']);return {'external':True,'image':True}
            return {'file':app.files.open_link(target)}
        if command=='save_file':
            text=data.get('text');key=data.get('fileKey')
            if not isinstance(text,str):raise ValueError('Invalid file contents.')
            destination=None
            if not key or data.get('saveAs'):
                chosen=self.window.create_file_dialog(app.webview.FileDialog.SAVE,save_filename=Path(str(data.get('name') or 'untitled.txt')).name)
                if not chosen:raise ValueError('Cancelled')
                destination=chosen[0] if not isinstance(chosen,str) else chosen
            return app.files.write(text,key=key,destination=destination,line_ending=data.get('lineEnding'),bom=data.get('bom'))
        if command=='import':
            chosen=self.window.create_file_dialog(app.webview.FileDialog.OPEN,allow_multiple=True)
            if not chosen:raise ValueError('Cancelled')
            return {'files':app.read_imports(chosen)}
        if command=='export':
            if not isinstance(data.get('name'),str) or not isinstance(data.get('text'),str):raise ValueError('Invalid export.')
            chosen=self.window.create_file_dialog(app.webview.FileDialog.SAVE,save_filename=Path(data['name']).name)
            if not chosen:raise ValueError('Cancelled')
            destination=Path(chosen[0] if not isinstance(chosen,str) else chosen);app.store.atomic_write(destination,data['text'].encode('utf-8'));return {'saved':True}
        if command=='versions_load':return {'versions':app.versions.read(data.get('fileId'))}
        if command=='versions_store':return app.versions.write(data.get('fileId'),data.get('versions'))
        if command=='versions_append':return app.versions.append(data.get('fileId'),data.get('version'))
        if command=='versions_delete':return app.versions.delete(data.get('fileId'))
        if command=='clipboard':
            if not isinstance(data.get('text'),str):raise ValueError('Invalid clipboard text.')
            def copy_text():
                from System.Windows.Forms import Clipboard
                Clipboard.SetText(data['text']) if data['text'] else Clipboard.Clear()
            self.ui(copy_text);return {'copied':True}
        if command=='print':self.ui(lambda:self.window.native.webview.CoreWebView2.ShowPrintUI());return {'printed':True}
        if command=='close_prompt':return {'waiting':True,'windowCount':sum(not e.closed for e in app.editors.values())}
        if command=='close_ready':self.can_destroy=True;threading.Timer(.05,self.destroy).start();return {'closed':True}
        if command in ('close_cancelled','close_failed'):
            self.closing=False
            if command=='close_failed':app.platform.message('Your latest changes could not be saved. The app stayed open. Back up your files before closing.')
            return {'stayed':True}
        if command=='close_window':threading.Timer(.05,self.request_close).start();return {'closing':True}
        if command=='close_empty_window':
            with app.lock:
                empty=self.loaded and app.hub.tabs.get(self.identity)==[] and any(e is not self and not e.closed and not e.can_destroy for e in app.editors.values())
                if empty:self.can_destroy=True
            if empty:threading.Timer(.05,self.destroy).start()
            return {'closed':empty}
        if command=='detach_file':return app.detach(self,data)
        if command=='move_file':return app.move(self,data)
        if command=='transfer_result':return {'accepted':app.transfer_result(self,data)}
        if command=='begin_tab_drag':return app.drag.begin(self,data)
        if command=='commit_tab_drag':return app.drag.commit(self,data)
        if command=='finish_tab_drag':app.drag.finish(self,data);return {'finished':True}
        if command=='tab_drop_target':return app.drop_target(self)
        raise ValueError('Unsupported desktop action.')

class LiveDrags:
    def __init__(self,app):self.app=app;self.current=None;self.lock=threading.Lock()
    def begin(self,source,data):
        self.app.validate_source(source,data)
        token=data.get('token')
        if not isinstance(token,str) or not token or len(token)>100:raise ValueError('Invalid drag token.')
        with self.lock:
            if self.current or not self.app.platform.pressed(1):return {'started':False}
            meta={k:data.get(k) for k in ['token','title','modified','grabRatio','theme']};record={'source':source,'data':data.copy(),'meta':meta,'point':self.app.platform.cursor(),'target':None,'generation':0,'ended':False,'cancelled':False}
            self.current=record
        try:
            _,_,width,height,_,_=self.app.platform.frame(source);vw,vh=source.viewport;sx,sy=width/vw,height/vh
            w=max(105,min(240,float(data.get('width',190))));h=max(30,min(48,float(data.get('height',36))))
            record['offset']=(float(data.get('offsetX',30))*sx,float(data.get('offsetY',16))*sy)
            self.app.platform.create_ghost(source,meta,round(w*sx),round(h*sy))
            threading.Thread(target=self._run,args=(record,),daemon=True).start();return {'started':True}
        except Exception:
            self.current=None;raise
    def _clear_target(self,record):
        target=record.get('target')
        if target and not target.closed:target.fire('window.vistaNotesClearLiveTabHover('+json.dumps(record['data']['token'])+','+str(record['generation'])+');')
        record['target']=None
    def _hover(self,record,point,finished=False):
        target=self.app.at_point(point,record['source'])
        if target is not record.get('target'):
            record['generation']+=1;self._clear_target(record);record['target']=target
        if not target:return None,None
        x,y=self.app.platform.local_point(target,point)
        info=target.evaluate('window.vistaNotesLiveTabHover('+json.dumps(record['meta'])+','+json.dumps(x)+','+json.dumps(y)+','+str(record['generation'])+','+json.dumps(finished)+')')
        return target,info if isinstance(info,dict) else {'blocked':True}
    def _run(self,record):
        try:
            previous=None
            while self.current is record and not record['source'].closed:
                point=self.app.platform.cursor();record['point']=point
                cancelled=record['cancelled'] or self.app.platform.pressed(27)
                if cancelled or not self.app.platform.pressed(1):
                    record['ended']=True;record['cancelled']=cancelled;outcome={'cancelled':True} if cancelled else {}
                    if not cancelled:
                        target,info=self._hover(record,point,True)
                        if target:outcome={'cancelled':True} if info.get('blocked') else {'targetId':target.identity,'index':info.get('index')}
                    if cancelled:self._clear_target(record)
                    self.app.platform.close_ghost(record['source']);record['source'].fire('window.vistaNotesFinishLiveTabDrag('+json.dumps(record['data']['token'])+','+json.dumps(outcome)+');');return
                if point!=previous:
                    target,info=self._hover(record,point);self.app.platform.move_ghost(point,record['offset'],not target or info.get('blocked'));previous=point
                time.sleep(.016)
        except Exception as error:
            record['ended']=True;record['cancelled']=True;self.app.log('Drag: '+str(error));self._clear_target(record);self.app.platform.close_ghost(record['source']);record['source'].fire('window.vistaNotesFinishLiveTabDrag('+json.dumps(record['data']['token'])+',{"cancelled":true});')
        finally:
            if record['source'].closed:
                try:self._clear_target(record);self.app.platform.close_ghost(record['source'])
                except Exception:pass
                if self.current is record:self.current=None
    def commit(self,source,data):
        record=self.current
        if not record or record['source'] is not source or data.get('token')!=record['data']['token'] or not record['ended'] or record['cancelled']:raise ValueError('The drag is no longer available.')
        anchor={k:record['data'].get(k) for k in ['offsetX','offsetY','tabX','tabY']};anchor['point']=record['point']
        return self.app.detach(source,record['data'],anchor)
    def finish(self,source,data):
        record=self.current
        if record and record['source'] is source and record['data']['token']==data.get('token'):
            self._clear_target(record);self.app.platform.close_ghost(source);self.current=None
    def cancel_source(self,source):
        if self.current and self.current['source'] is source:self.current['cancelled']=True

class Application:
    def __init__(self,webview,platform,folder,assets=ROOT):
        self.webview=webview;self.platform=platform;self.folder=Path(folder);self.assets=Path(assets);release=load_release(self.assets);self.build=release['build'];self.editor_digest=release['sha256'];self.uri=(self.assets/release['editor']).as_uri();self.store=NotebookStore(self.folder/'notebook');self.hub=WorkspaceHub(self.store);self.files=FileStore(self.store.folder);self.versions=VersionStore(self.store.folder);self.bundles=BundleStore(self.assets);self.editors={};self.transfers={};self.receipts={};self.lock=threading.RLock();self.drag=LiveDrags(self);self.window_sequence=0
    def log(self,text):
        try:
            self.folder.mkdir(parents=True,exist_ok=True)
            with (self.folder/'diagnostics.log').open('a',encoding='utf-8') as output:output.write(str(text)+'\n')
        except OSError:pass
    def new_window(self,ids=None,transfer=None,anchor=None):
        with self.lock:
            identity='main' if self.window_sequence==0 else 'window-'+uuid.uuid4().hex;self.window_sequence+=1;editor=Editor(self,identity,ids,transfer,anchor);self.editors[identity]=editor
        try:
            editor.window=self.webview.create_window('Another Note',url=self.uri,js_api=Bridge(editor),width=1120,height=790,min_size=(480,340),hidden=True,background_color='#191e23',text_select=True)
            editor.window.events.closing+=editor.request_close;editor.window.events.closed+=editor.on_closed;editor.window.events.loaded+=editor.on_loaded
            def stalled():
                if not editor.ready.is_set() and not editor.closed:
                    editor.failed='The editor did not finish starting.';editor.ready.set();self.platform.message('Another Note did not finish starting. Your recovery files were kept.');editor.destroy()
            timer=threading.Timer(35,stalled);timer.daemon=True;editor.startup_timer=timer;timer.start()
            return editor
        except Exception:
            self.editors.pop(identity,None);raise
    def publish(self,source,state):
        for editor in list(self.editors.values()):
            if editor is not source and editor.loaded and not editor.closed:
                try:editor.fire('window.vistaNotesWorkspaceChanged('+json.dumps(state,ensure_ascii=True)+');')
                except Exception as error:self.log(str(error))
    def read_imports(self,paths):
        entries=[]
        for value in paths:
            try:
                path=Path(value);limit=128*1024*1024 if path.suffix.lower() in ('.vnotes','.json') else 20*1024*1024
                entries.append(self.files.open(path,limit))
            except (OSError,ValueError,TypeError) as error:entries.append({'name':Path(value).name if value else 'File','error':str(error)})
        return entries
    def validate_source(self,source,data):
        if source.closed or source.closing or not source.loaded or data.get('fileId') not in self.hub.tabs.get(source.identity,[]):raise ValueError('That file is not open in this window.')
        if not isinstance(data.get('transfer'),dict) or data['transfer'].get('fileId')!=data['fileId']:raise ValueError('Invalid file transfer.')
    def seed(self,source,data):
        self.validate_source(source,data);state=self.hub.load(source.identity)['state'];state['settings']['openIds']=[data['fileId']];state['activeId']=data['fileId'];return {'workspace':state,'transfer':data['transfer']}
    def detach(self,source,data,anchor=None):
        self.seed(source,data);child=self.new_window([data['fileId']],data['transfer'],anchor)
        if not child.ready.wait(35) or child.failed or child.closed:
            child.destroy();raise ValueError('The new window could not load. The original tab was kept.')
        return {'moved':True,'windowId':child.identity}
    def move(self,source,data):
        target=self.editors.get(data.get('targetId'))
        if not target or target is source or target.closed or target.closing or not target.loaded:raise ValueError('The destination window is unavailable.')
        seed=self.seed(source,data);token=uuid.uuid4().hex;record={'source':source,'target':target,'fileId':data['fileId'],'event':threading.Event(),'ok':False,'error':'The destination did not confirm the move. The original tab was kept.'}
        with self.lock:self.transfers[token]=record
        try:
            index=data.get('index');index=index if type(index) is int and index>=0 else None
            target.fire('window.vistaNotesAcceptTabTransfer('+json.dumps(token)+','+json.dumps(seed,ensure_ascii=True)+','+json.dumps(index)+');')
            if not record['event'].wait(35) or not record['ok']:
                if not target.closed:target.fire('window.vistaNotesCancelTabTransfer('+json.dumps(token)+');')
                raise ValueError(record['error'])
            target.window.show();return {'moved':True,'windowId':target.identity}
        finally:
            with self.lock:
                self.transfers.pop(token,None);self.receipts[token]=(target.identity,record['ok'])
                while len(self.receipts)>100:self.receipts.pop(next(iter(self.receipts)))
    def transfer_result(self,target,data):
        token=data.get('token')
        with self.lock:
            record=self.transfers.get(token)
            if not record:return self.receipts.get(token)==(target.identity,True)
            if record['target'] is not target:raise ValueError('This transfer belongs to another window.')
            record['ok']=data.get('ok') is True and record['fileId'] in self.hub.tabs.get(target.identity,[])
            if not record['ok']:record['error']=str(data.get('error') or 'The destination could not receive the file.')
            record['event'].set();return record['ok']
    def at_point(self,point,source):
        handle=self.platform.root_at(point)
        return next((e for e in list(self.editors.values()) if e is not source and not e.closed and not e.closing and e.loaded and self.platform.handle(e)==handle),None)
    def drop_target(self,source):
        point=self.platform.cursor();target=self.at_point(point,source)
        if not target:return {'targetId':None}
        x,y=self.platform.local_point(target,point);info=target.evaluate('window.vistaNotesTabDropInfo('+json.dumps(x)+','+json.dumps(y)+',true)')
        if not isinstance(info,dict):return {'targetId':None}
        return {'blocked':True} if info.get('blocked') else {'targetId':target.identity,'index':info.get('index')}
