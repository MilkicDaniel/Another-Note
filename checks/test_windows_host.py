import copy,json,os,tempfile,threading,types,unittest
from pathlib import Path
from unittest.mock import Mock,patch
from windows import windows_host as host
from windows.win32_support import WindowsPlatform
import notebook_store

class Event:
    def __init__(self):self.handlers=[]
    def __iadd__(self,handler):self.handlers.append(handler);return self
    def emit(self):
        for handler in self.handlers:handler()
class Window:
    def __init__(self,**kwargs):self.url=kwargs['url'];self.api=kwargs['js_api'];self.events=types.SimpleNamespace(closing=Event(),closed=Event(),loaded=Event());self.scripts=[];self.dialog=[];self.destroyed=False;self.visible=False;self.reply={'index':1};self.on_script=None
    def get_current_url(self):return self.url
    def evaluate_js(self,script):self.scripts.append(script);return self.reply
    def run_js(self,script):
        self.scripts.append(script)
        if self.on_script:self.on_script(script)
    def show(self):self.visible=True
    def set_title(self,title):self.title=title
    def create_file_dialog(self,*args,**kwargs):return self.dialog
    def destroy(self):self.destroyed=True;self.events.closed.emit()
class Platform:
    def __init__(self):self.messages=[];self.point=(100,100);self.root=0;self.ghost=False;self.keys={1:True,27:False};self.positions=[]
    def appearance(self,editor,theme):self.theme=theme
    def position(self,editor,anchor):self.positions.append(anchor)
    def message(self,text):self.messages.append(text)
    def root_at(self,point):return self.root
    def handle(self,editor):return id(editor)
    def local_point(self,editor,point):return point
    def cursor(self):return self.point
    def pressed(self,key):return self.keys.get(key,False)
    def frame(self,editor):return (0,0,1120,790,0,0)
    def create_ghost(self,*args):self.ghost=True
    def move_ghost(self,*args):pass
    def close_ghost(self,*args):self.ghost=False
class GUI:
    FileDialog=types.SimpleNamespace(OPEN=1,SAVE=2)
    def create_window(self,title,**kwargs):return Window(**kwargs)
def workspace():
    return {'format':'vista-notes','version':1,'updatedAt':100,'activeId':'a','settings':{'openIds':['a'],'theme':'dark'},'notes':[dict(id=id,title=id+'.txt',content='draft '+id,mode='text',createdAt=1,updatedAt=100,trashedAt=0,removedAt=0) for id in 'ab']}
class WindowsHostTests(unittest.TestCase):
    def test_image_links_use_the_system_viewer_and_never_import_image_bytes(self):
        path=self.folder/'picture.png';path.write_bytes(b'\x89PNG\r\n\x1a\n\xff')
        self.platform.open_image=Mock()
        result=self.source.dispatch({'command':'open_link','reference':path.as_uri()})
        self.assertEqual(result,{'external':True,'image':True});self.platform.open_image.assert_called_once_with(str(path))
        self.target();self.assertEqual(set(self.source.dispatch({'command':'open_tabs'})['openIds']),{'a','b'})
    def test_drag_ghost_is_positioned_before_its_first_show(self):
        platform=WindowsPlatform.__new__(WindowsPlatform);platform.user=Mock();platform.instance=1;platform.user.CreateWindowExW.return_value=123
        platform.create_ghost(types.SimpleNamespace(ui=lambda fn:fn()),{'title':'Held file'},190,36)
        platform.user.ShowWindow.assert_not_called();self.assertFalse(platform.ghost_visible)
        platform.move_ghost((400,300),(20,10));platform.user.ShowWindow.assert_called_once_with(123,4)
    def test_drag_ghost_visibility_changes_only_on_window_boundaries(self):
        platform=WindowsPlatform.__new__(WindowsPlatform);platform.user=Mock();platform.ghost=123;platform.ghost_visible=True
        platform.move_ghost((100,100),(20,10));platform.move_ghost((101,100),(20,10));platform.user.ShowWindow.assert_not_called()
        platform.move_ghost((102,100),(20,10),False);platform.move_ghost((103,100),(20,10),False);platform.user.ShowWindow.assert_called_once_with(123,0)
        platform.move_ghost((104,100),(20,10),True);self.assertEqual(platform.user.ShowWindow.call_count,2)
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.folder=Path(self.temp.name);self.platform=Platform();self.app=host.Application(GUI(),self.platform,self.folder,Path(__file__).resolve().parents[1]/'fedora');self.source=self.app.new_window();self.source.dispatch({'command':'load'});self.state=workspace();self.source.dispatch({'command':'save','state':self.state});self.source.dispatch({'command':'ready','theme':'dark','build':self.app.build})
    def tearDown(self):
        for editor in list(self.app.editors.values()):
            if editor.startup_timer:editor.startup_timer.cancel()
            editor.ready.set()
        self.temp.cleanup()
    def target(self):
        target=self.app.new_window(['b']);target.dispatch({'command':'load'});target.dispatch({'command':'ready','theme':'light','build':self.app.build});return target
    def test_fresh_launch_window_loads_no_existing_tabs_and_waits_until_ready_to_show(self):
        fresh=self.app.new_window(ids=[]);loaded=fresh.dispatch({'command':'load'})['state']
        self.assertEqual(loaded['settings']['openIds'],[]);self.assertIsNone(loaded['activeId']);self.assertEqual([note['content'] for note in loaded['notes']],['draft a','draft b'])
        self.assertEqual(self.app.hub.tabs[self.source.identity],['a']);self.assertFalse(fresh.window.visible)
        fresh.dispatch({'command':'ready','theme':'dark','build':self.app.build});self.assertTrue(fresh.window.visible)
    def transfer(self,**extra):return dict(fileId='a',transfer={'fileId':'a','cursor':{'start':2,'end':5},'history':{'undo':[{'content':'old'}],'redo':[]}},**extra)
    def test_workspace_and_draft_survive_restart(self):
        loaded=host.NotebookStore(self.app.store.folder).read()['state'];self.assertEqual(loaded['notes'][0]['content'],'draft a');self.assertTrue(self.source.window.visible);self.assertEqual(self.source.dispatch({'command':'load'})['liveDrag'],True)
    def test_bridge_rejects_remote_documents_and_malformed_requests(self):
        bridge=host.Bridge(self.source);self.source.window.url='https://example.com/';result=bridge.dispatch(json.dumps({'id':'x','command':'save','state':{}}));self.assertIn('only in the editor',result['error']);self.assertIsNone(result['result']);self.source.window.url=self.app.uri
        self.assertIsNotNone(bridge.dispatch('[]')['error']);self.assertIsNotNone(bridge.dispatch('{bad')['error']);self.assertIsNotNone(bridge.dispatch(json.dumps({'id':None}))['error'])
    def test_clr_uri_objects_are_accepted_without_exposing_other_locations(self):
        class Uri:
            def __str__(inner):return self.app.uri
        self.source.window.url=Uri();self.assertTrue(self.source.trusted())
    def test_a_stale_editor_page_is_closed_without_showing_the_old_build(self):
        other=self.app.new_window();reply=other.dispatch({'command':'load'});self.assertEqual(reply['editorBuild'],self.app.build)
        result=other.dispatch({'command':'ready','theme':'dark','build':'2026.10.27-r2'})
        self.assertEqual(result,{'ready':False});self.assertTrue(other.closed);self.assertFalse(other.window.visible)
        self.assertIn(self.app.build,self.platform.messages[-1]);self.assertTrue(self.source.window.visible)
    def test_file_open_save_and_format_preserve_binding_bom_and_crlf(self):
        path=self.folder/'日本語.txt';path.write_bytes(b'\xef\xbb\xbfline\r\n');self.source.window.dialog=[str(path)];entry=self.source.dispatch({'command':'import'})['files'][0];self.assertTrue(entry['bom']);self.assertEqual(entry['lineEnding'],'crlf')
        saved=self.source.dispatch({'command':'save_file','fileKey':entry['fileKey'],'text':'new\nline\n'});self.assertEqual(saved['fileKey'],entry['fileKey']);self.assertEqual(path.read_bytes(),b'\xef\xbb\xbfnew\r\nline\r\n');self.assertEqual(self.source.dispatch({'command':'read_file','fileKey':saved['fileKey']})['text'],'new\r\nline\r\n')
    def test_save_as_and_cancel_never_write_other_files(self):
        path=self.folder/'new.txt';self.source.window.dialog=[str(path)];saved=self.source.dispatch({'command':'save_file','name':'new.txt','text':'draft','saveAs':True});self.assertEqual(path.read_text(),'draft');self.assertTrue(saved['fileKey'])
        self.source.window.dialog=[]
        with self.assertRaisesRegex(ValueError,'Cancelled'):self.source.dispatch({'command':'save_file','name':'other.txt','text':'overwrite','saveAs':True})
        self.assertEqual(path.read_text(),'draft')
    def test_import_errors_are_per_file(self):
        good=self.folder/'good.txt';good.write_text('okay');bad=self.folder/'bad.bin';bad.write_bytes(b'\xff\xff');entries=self.app.read_imports([good,bad,self.folder/'missing']);self.assertEqual(entries[0]['text'],'okay');self.assertIn('error',entries[1]);self.assertIn('error',entries[2])
    def test_versions_and_export(self):
        versions=[dict(id='v1',title='a',content='old',mode='text',reason='Saved',createdAt=1)];self.source.dispatch(dict(command='versions_store',fileId='a',versions=versions));self.assertEqual(self.source.dispatch(dict(command='versions_load',fileId='a'))['versions'],versions);self.source.dispatch(dict(command='versions_delete',fileId='a'));self.assertEqual(self.app.versions.read('a'),[])
        path=self.folder/'backup.vnotes';self.source.window.dialog=[str(path)];self.source.dispatch({'command':'export','name':'backup.vnotes','text':'backup'});self.assertEqual(path.read_text(),'backup')
    def test_compact_checkpoint_append_matches_the_current_editor(self):
        self.assertTrue(self.source.dispatch({'command':'load'})['historyAppend'])
        version=dict(id='first',title='a.txt',content='first checkpoint',mode='text',reason='Saved',createdAt=1)
        reply=self.source.dispatch(dict(command='versions_append',fileId='a',version=version))
        self.assertEqual(reply,{'saved':True,'count':1});self.assertNotIn('versions',reply)
        self.assertEqual(self.app.versions.read('a'),[version])
    def test_external_file_checks_and_explicit_editor_format(self):
        path=self.folder/'changed.txt';path.write_bytes(b'original\n');entry=self.app.files.open(path)
        self.assertEqual(self.source.dispatch(dict(command='check_files',files=[dict(fileKey=entry['fileKey'],diskStamp=entry['diskStamp'])])),{'files':[]})
        path.write_bytes(b'\xef\xbb\xbfexternal\r\n')
        changed=self.source.dispatch(dict(command='check_files',files=[dict(fileKey=entry['fileKey'],diskStamp=entry['diskStamp'])]))['files'][0]
        self.assertEqual(changed['text'],'external\r\n');self.assertTrue(changed['bom'])
        self.source.dispatch(dict(command='save_file',fileKey=entry['fileKey'],text='kept\n',lineEnding='lf',bom=False))
        self.assertEqual(path.read_bytes(),b'kept\n')
    def test_window_updates_broadcast_without_changing_target_order(self):
        target=self.target();state=copy.deepcopy(self.state);state['notes'][0]['content']='new';state['notes'][0]['updatedAt']=200;self.source.dispatch({'command':'save','state':state});self.assertTrue(any('vistaNotesWorkspaceChanged' in s for s in target.window.scripts));self.assertEqual(self.app.hub.tabs[target.identity],['b'])
    def test_last_window_close_retains_recovery(self):
        self.assertEqual(self.source.dispatch({'command':'close_prompt'})['windowCount'],1);self.source.can_destroy=True;self.source.on_closed();saved=host.NotebookStore(self.app.store.folder).read()['state'];self.assertEqual(saved['settings']['openIds'],['a']);self.assertEqual(saved['notes'][0]['content'],'draft a')
    def test_final_empty_window_stays_and_second_empty_window_closes(self):
        state=copy.deepcopy(self.state);state['settings']['openIds']=[];state['activeId']=None;self.source.dispatch({'command':'save','state':state})
        self.assertFalse(self.source.dispatch({'command':'close_empty_window'})['closed']);self.assertFalse(self.source.can_destroy)
        target=self.target();self.assertTrue(self.source.dispatch({'command':'close_empty_window'})['closed']);self.assertTrue(self.source.can_destroy)
        state['settings']['openIds']=[];target.dispatch({'command':'save','state':state})
        self.assertFalse(target.dispatch({'command':'close_empty_window'})['closed'],'A pending close cannot count as the remaining window')
    def test_clicked_links_open_local_text_or_default_browser(self):
        index=self.folder/'index.html';index.write_text('<script src="app.js"></script>');script=self.folder/'app.js';script.write_text('const ready = true;')
        entry=self.app.files.open(index);result=self.source.dispatch({'command':'open_link','reference':'app.js?version=1','fileKey':entry['fileKey']})
        self.assertEqual(result['file']['text'],'const ready = true;');self.assertEqual(script.read_text(),'const ready = true;')
        with patch('webbrowser.open',return_value=True) as browser:
            self.assertEqual(self.source.dispatch({'command':'open_link','reference':'https://example.com/?x=1&y=2'}),{'external':True});browser.assert_called_once_with('https://example.com/?x=1&y=2',new=2)
        with patch('webbrowser.open') as browser:
            with self.assertRaises(ValueError):self.source.dispatch({'command':'open_link','reference':'javascript:alert(1)'})
            browser.assert_not_called()
    def test_multiple_windows_close_count_and_cancel(self):
        self.target();self.assertEqual(self.source.dispatch({'command':'close_prompt'})['windowCount'],2);self.assertFalse(self.source.request_close());self.assertTrue(self.source.closing);self.source.dispatch({'command':'close_cancelled'});self.assertFalse(self.source.closing)
    def test_move_waits_for_saved_destination_ack_and_preserves_source(self):
        target=self.target();tokens=[]
        def incoming(script):
            if not script.startswith('window.vistaNotesAcceptTabTransfer('):return
            token,seed,index=json.loads('['+script[len('window.vistaNotesAcceptTabTransfer('):-2]+']');tokens.append(token);self.assertEqual(index,0);self.assertEqual(self.app.hub.tabs[self.source.identity],['a']);self.assertEqual(seed['transfer']['cursor']['start'],2)
            state=seed['workspace'];state['settings']['openIds']=['a','b'];self.app.hub.save(target.identity,state);self.assertTrue(self.app.transfer_result(target,{'token':token,'ok':True}))
        target.window.on_script=incoming;result=self.app.move(self.source,self.transfer(targetId=target.identity,index=0));self.assertTrue(result['moved']);self.assertEqual(self.app.hub.tabs[self.source.identity],['a'],'Frontend releases the source only after this acknowledgement');self.assertEqual(self.app.hub.tabs[target.identity],['a','b']);self.assertTrue(self.app.transfer_result(target,{'token':tokens[0],'ok':True}));self.assertFalse(self.app.transfer_result(self.source,{'token':tokens[0],'ok':True}))
    def test_failed_move_rolls_back_and_keeps_source(self):
        target=self.target()
        class Timeout:
            def wait(self,seconds):return False
        with patch.object(host.threading,'Event',Timeout):
            with self.assertRaisesRegex(ValueError,'original tab was kept'):self.app.move(self.source,self.transfer(targetId=target.identity))
        self.assertEqual(self.app.hub.tabs[self.source.identity],['a']);self.assertEqual(self.app.hub.tabs[target.identity],['b']);self.assertTrue(any('vistaNotesCancelTabTransfer' in s for s in target.window.scripts))
    def test_new_window_does_not_release_source_before_ready(self):
        create=self.app.new_window
        def ready(ids,transfer,anchor):
            child=create(ids,transfer,anchor);result=child.dispatch({'command':'load'});self.assertEqual(result['state']['settings']['openIds'],['a']);self.assertEqual(result['transfer']['fileId'],'a');child.dispatch({'command':'ready','theme':'dark','build':self.app.build});return child
        with patch.object(self.app,'new_window',ready):result=self.app.detach(self.source,self.transfer(),{'point':(500,400)})
        self.assertTrue(result['moved']);self.assertEqual(self.app.hub.tabs[self.source.identity],['a']);self.assertEqual(self.platform.positions,[{'point':(500,400)}])
    def test_live_drag_follows_target_and_freezes_on_release(self):
        target=self.target();self.platform.root=id(target);self.platform.keys[1]=False
        data=self.transfer(token='drag',grabRatio=.3);record=dict(source=self.source,data=data,meta={'token':'drag','grabRatio':.3},point=(100,100),target=None,generation=0,ended=False,cancelled=False,offset=(30,16));self.app.drag.current=record;self.platform.ghost=True
        self.app.drag._run(record);self.assertTrue(record['ended']);self.assertFalse(self.platform.ghost);self.assertTrue(any('vistaNotesLiveTabHover' in s and s.endswith(',true)') for s in target.window.scripts));self.assertTrue(any('"targetId": "'+target.identity+'"' in s for s in self.source.window.scripts));self.assertEqual(self.app.hub.tabs[self.source.identity],['a'])
    def test_escape_drag_cancels_instead_of_detaching(self):
        data=self.transfer(token='escape');record=dict(source=self.source,data=data,meta={'token':'escape'},point=(10,10),target=None,generation=0,ended=False,cancelled=False,offset=(30,16));self.app.drag.current=record;self.platform.keys[27]=True;self.app.drag._run(record);self.assertTrue(record['cancelled']);self.assertIn('{"cancelled": true}',self.source.window.scripts[-1])
        with self.assertRaisesRegex(ValueError,'no longer available'):self.app.drag.commit(self.source,{'token':'escape'})
    def test_invalid_or_busy_transfer_is_rejected(self):
        with self.assertRaises(ValueError):self.app.move(self.source,self.transfer(targetId=self.source.identity))
        self.source.closing=True
        with self.assertRaises(ValueError):self.app.detach(self.source,self.transfer())
    def test_bundle_whitelist_and_missing_error(self):
        bundles=host.BundleStore(self.folder)
        with self.assertRaises(ValueError):bundles.read('../file')
        with self.assertRaisesRegex(ValueError,'complete Windows package'):bundles.read('format')
        (self.folder/'format-worker.js.gz').write_bytes(b'bytes');self.assertEqual(bundles.read('format')['source'],'Ynl0ZXM=')
    def test_dpi_conversion_uses_actual_client_size(self):
        platform=WindowsPlatform.__new__(WindowsPlatform);platform.frame=lambda editor:(1000,100,2000,1000,980,70);platform.handle=lambda editor:123;platform.user=Mock();self.source.viewport=(1000,500)
        self.assertEqual(platform.local_point(self.source,(1500,450)),(250,175));platform.position(self.source,dict(point=(1500,450),tabX=50,offsetX=80,tabY=33,offsetY=16));self.assertEqual(platform.user.SetWindowPos.call_args.args,(123,None,1220,322,0,0,0x15))
    def test_windows_atomic_write_does_not_require_posix_calls(self):
        proxy=types.SimpleNamespace(name='nt',fdopen=os.fdopen,fsync=os.fsync,replace=os.replace,path=os.path,unlink=os.unlink);path=self.folder/'windows-atomic.txt'
        with patch.object(notebook_store,'os',proxy):self.app.store.atomic_write(path,b'new')
        self.assertEqual(path.read_bytes(),b'new')

if __name__=='__main__':unittest.main()
