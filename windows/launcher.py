#!/usr/bin/env python3
"""Run the bundled Windows desktop app; no system Python installation is needed."""
import ctypes as C,hashlib,json,os,secrets,sys,threading,time,traceback
from pathlib import Path
from multiprocessing import AuthenticationError
from multiprocessing.connection import Client,Listener
if __package__:
    from .windows_host import Application
    from .windows_release import load_release
    from .win32_support import WindowsPlatform
else:
    from windows_host import Application
    from windows_release import load_release
    from win32_support import WindowsPlatform

ROOT=Path(__file__).resolve().parent

def data_folder():return Path(os.environ.get('LOCALAPPDATA',Path.home()/'AppData'/'Local'))/'Another Note'

def captured_launch_point(platform):
    raw=os.environ.pop('ANOTHER_NOTE_LAUNCH_POINT',None)
    if raw:
        try:
            point=tuple(int(part) for part in raw.split(','))
            if len(point)==2 and all(-(2**31)<=value<2**31 for value in point):return point
        except ValueError:pass
    return platform.launch_point()

class DifferentBuildRunning(RuntimeError):pass

class Instance:
    def __init__(self,folder,release):
        self.build=release['build'];self.editor_digest=release['sha256'];self.folder=folder;digest=hashlib.sha256(str(folder.resolve()).casefold().encode()).hexdigest()[:24];self.pipe=r'\\.\pipe\AnotherNote-'+digest;self.kernel=C.WinDLL('kernel32',use_last_error=True);self.kernel.CreateMutexW.argtypes=[C.c_void_p,C.c_int,C.c_wchar_p];self.kernel.CreateMutexW.restype=C.c_void_p;self.kernel.CloseHandle.argtypes=[C.c_void_p];C.set_last_error(0);self.handle=self.kernel.CreateMutexW(None,False,'Local\\AnotherNote-'+digest)
        if not self.handle:raise OSError('Could not protect the workspace from a second app process.')
        self.primary=C.get_last_error()!=183
    def key(self):
        path=self.folder/'instance.key'
        if self.primary and not path.exists():
            self.folder.mkdir(parents=True,exist_ok=True);descriptor=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(descriptor,'wb') as output:output.write(secrets.token_bytes(32))
        data=path.read_bytes()
        if len(data)!=32:raise ValueError('The local app connection key is invalid.')
        return data
    def forward(self,paths,launch_point=None):
        for _ in range(30):
            try:
                with Client(self.pipe,family='AF_PIPE',authkey=self.key()) as connection:
                    request={'protocol':2,'build':self.build,'sha256':self.editor_digest,'paths':paths}
                    if launch_point is not None:request['launchPoint']=launch_point
                    connection.send_bytes(json.dumps(request).encode())
                    try:
                        if not connection.poll(2):raise EOFError()
                        reply=json.loads(connection.recv_bytes(4096))
                    except (EOFError,ValueError,OSError):
                        raise DifferentBuildRunning('An older copy of Another Note is already running. Close all Another Note windows, then open build '+self.build+' again. Your files have been kept.')
                    if not isinstance(reply,dict) or reply.get('build')!=self.build or reply.get('sha256')!=self.editor_digest or reply.get('status')!='accepted':
                        running=reply.get('build') if isinstance(reply,dict) else None
                        raise DifferentBuildRunning('Another Note'+(' build '+str(running) if running else '')+' is already running from a different package. Close all Another Note windows, then open build '+self.build+' again. Your files have been kept.')
                    return
            except OSError:time.sleep(.1)
        raise RuntimeError('Another Note is already running but is still starting. Try opening the files again in a moment.')
    def receive(self,app,connection):
        request=json.loads(connection.recv_bytes(1024*1024));structured=isinstance(request,dict)
        if structured:
            if request.get('protocol')!=2:return
            if request.get('build')!=self.build or request.get('sha256')!=self.editor_digest:
                connection.send_bytes(json.dumps({'status':'different-build','build':self.build,'sha256':self.editor_digest}).encode());return
            paths=request.get('paths')
        else:paths=request
        if not isinstance(paths,list) or any(not isinstance(p,str) for p in paths):return
        point=request.get('launchPoint') if structured else None
        if point is not None:
            if not isinstance(point,list) or len(point)!=2 or any(type(v) is not int or not -(2**31)<=v<2**31 for v in point):return
            point=tuple(point)
        options={'launch_point':point} if point is not None else {}
        editor=app.new_window(ids=[],**options) if not paths else next((e for e in list(app.editors.values()) if not e.closed),None)
        if editor:
            if paths:
                editor.deliver_imports(paths)
                editor.window.show()
            if structured:connection.send_bytes(json.dumps({'status':'accepted','build':self.build,'sha256':self.editor_digest}).encode())
    def serve(self,app):
        def receive():
            try:
                with Listener(self.pipe,family='AF_PIPE',authkey=self.key()) as listener:
                    while app.editors:
                        try:connection=listener.accept()
                        except (AuthenticationError,OSError):continue
                        with connection:
                            try:
                                self.receive(app,connection)
                            except (ValueError,OSError,EOFError):continue
            except Exception as error:app.log('Local app connection: '+str(error))
        threading.Thread(target=receive,daemon=True).start()
    def close(self):
        if self.handle:self.kernel.CloseHandle(self.handle);self.handle=None

def main():
    if os.name!='nt':raise RuntimeError('Run Another-Note.exe on Windows 10 or 11 (64-bit).')
    platform=WindowsPlatform();instance=None;folder=data_folder()
    try:
        platform.initialize_dpi()
        try:launch_point=captured_launch_point(platform)
        except OSError:launch_point=None
        instance=Instance(folder,load_release(ROOT))
        if not instance.primary:instance.forward(sys.argv[1:],launch_point);return 0
        import webview
        webview.settings['ALLOW_FILE_URLS']=True;webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER']=True
        app=Application(webview,platform,folder);editor=app.new_window(launch_point=launch_point);editor.pending_imports=[str(Path(p).expanduser().resolve()) for p in sys.argv[1:]];instance.serve(app)
        webview.start(gui='edgechromium',private_mode=False,storage_path=str(folder/'webview'),icon=str(ROOT/'another-note.ico'),debug=False)
        return 0
    except DifferentBuildRunning as error:
        platform.message(str(error));return 1
    except Exception as error:
        folder.mkdir(parents=True,exist_ok=True);(folder/'startup-error.log').write_text(traceback.format_exc(),encoding='utf-8')
        platform.message('Another Note could not start.\n\n'+str(error)+'\n\nThis build requires Microsoft Edge WebView2 Runtime. If it is missing, install it from the Microsoft link in README.txt. Your saved files have been kept.\n\nDetails: '+str(folder/'startup-error.log'));return 1
    finally:
        if instance:instance.close()

if __name__=='__main__':raise SystemExit(main())
