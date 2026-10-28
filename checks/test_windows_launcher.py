import json,types,unittest
from unittest.mock import Mock,patch
from windows import launcher

class Connection:
    def __init__(self,reply=None,request=None):self.reply=reply;self.request=request;self.sent=[]
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def send_bytes(self,data):self.sent.append(json.loads(data))
    def poll(self,timeout):return True
    def recv_bytes(self,limit):
        if self.request is not None:return json.dumps(self.request).encode()
        if self.reply is None:raise EOFError()
        return json.dumps(self.reply).encode()

class WindowsInstanceTests(unittest.TestCase):
    def setUp(self):
        self.instance=launcher.Instance.__new__(launcher.Instance);self.instance.pipe='test-pipe';self.instance.build='2026.10.27-r5';self.instance.editor_digest='f'*64;self.instance.key=lambda:b'key'
        self.editor=types.SimpleNamespace(closed=False,deliver_imports=Mock(),window=types.SimpleNamespace(show=Mock()));self.fresh=types.SimpleNamespace(window=types.SimpleNamespace(show=Mock()));self.app=types.SimpleNamespace(editors={'main':self.editor},new_window=Mock(return_value=self.fresh))
    def request(self,**extra):return dict(protocol=2,build=self.instance.build,sha256=self.instance.editor_digest,paths=[],**extra)
    def test_matching_instances_forward_files_after_a_version_handshake(self):
        connection=Connection(reply={'status':'accepted','build':self.instance.build,'sha256':self.instance.editor_digest})
        with patch.object(launcher,'Client',return_value=connection):self.instance.forward(['note.txt'])
        self.assertEqual(connection.sent[0]['protocol'],2);self.assertEqual(connection.sent[0]['paths'],['note.txt']);self.assertEqual(connection.sent[0]['build'],self.instance.build)
    def test_forwarded_launch_includes_the_physical_pointer_position(self):
        connection=Connection(reply={'status':'accepted','build':self.instance.build,'sha256':self.instance.editor_digest})
        with patch.object(launcher,'Client',return_value=connection):self.instance.forward([],(-2200,500))
        self.assertEqual(connection.sent[0]['launchPoint'],[-2200,500])
    def test_server_passes_the_launch_pointer_to_the_new_window(self):
        connection=Connection(request=self.request(launchPoint=[4400,-300]));self.instance.receive(self.app,connection)
        self.app.new_window.assert_called_once_with(ids=[],launch_point=(4400,-300));self.assertEqual(connection.sent[0]['status'],'accepted')
    def test_invalid_pointer_coordinates_are_rejected_without_opening_windows(self):
        for point in ('invalid',[1],[True,1],[1,2,3],[2**40,0],[float('nan'),0]):
            with self.subTest(point=point):
                self.instance.receive(self.app,Connection(request=self.request(launchPoint=point)))
                self.app.new_window.assert_not_called();self.editor.window.show.assert_not_called()
    def test_file_arguments_do_not_reposition_or_replace_an_existing_window(self):
        request=self.request(launchPoint=[4400,300]);request['paths']=['file.txt'];self.instance.receive(self.app,Connection(request=request))
        self.app.new_window.assert_not_called();self.editor.deliver_imports.assert_called_once_with(['file.txt']);self.editor.window.show.assert_called_once()
    def test_an_older_launcher_without_a_handshake_does_not_silently_reopen(self):
        with patch.object(launcher,'Client',return_value=Connection()),self.assertRaisesRegex(launcher.DifferentBuildRunning,'Close all Another Note windows'):
            self.instance.forward([])
    def test_another_running_build_is_reported(self):
        connection=Connection(reply={'status':'different-build','build':'2026.10.27-r2','sha256':'0'*64})
        with patch.object(launcher,'Client',return_value=connection),self.assertRaisesRegex(launcher.DifferentBuildRunning,'2026.10.27-r2'):
            self.instance.forward([])
    def test_a_different_package_with_the_same_build_is_not_silently_reopened(self):
        connection=Connection(reply={'status':'accepted','build':self.instance.build,'sha256':'0'*64})
        with patch.object(launcher,'Client',return_value=connection),self.assertRaises(launcher.DifferentBuildRunning):self.instance.forward([])
    def test_server_rejects_another_build_before_showing_or_importing(self):
        request=self.request();request['build']='2026.10.27-r2';connection=Connection(request=request);self.instance.receive(self.app,connection)
        self.assertEqual(connection.sent[0]['status'],'different-build');self.editor.deliver_imports.assert_not_called();self.editor.window.show.assert_not_called()
    def test_server_accepts_the_current_build_and_acknowledges_it(self):
        request=self.request();request['paths']=['file.txt'];connection=Connection(request=request);self.instance.receive(self.app,connection)
        self.editor.deliver_imports.assert_called_once_with(['file.txt']);self.editor.window.show.assert_called_once();self.assertEqual(connection.sent[0]['status'],'accepted')
    def test_existing_legacy_launchers_can_still_forward_to_the_new_build(self):
        self.instance.receive(self.app,Connection(request=['file.txt']));self.editor.deliver_imports.assert_called_once_with(['file.txt']);self.editor.window.show.assert_called_once()
    def test_relaunch_without_files_creates_a_fresh_window_without_showing_existing_ones(self):
        connection=Connection(request=self.request());self.instance.receive(self.app,connection)
        self.app.new_window.assert_called_once_with(ids=[]);self.editor.window.show.assert_not_called();self.editor.deliver_imports.assert_not_called();self.fresh.window.show.assert_not_called()
        self.assertEqual(connection.sent[0]['status'],'accepted')
    def test_legacy_relaunch_without_files_also_creates_a_fresh_window(self):
        self.instance.receive(self.app,Connection(request=[]));self.app.new_window.assert_called_once_with(ids=[]);self.editor.window.show.assert_not_called()
    def test_invalid_paths_do_not_import_or_show(self):
        request=self.request();request['paths']=[{}];self.instance.receive(self.app,Connection(request=request));self.editor.deliver_imports.assert_not_called();self.editor.window.show.assert_not_called()

if __name__=='__main__':unittest.main()
