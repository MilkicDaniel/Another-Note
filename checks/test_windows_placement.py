"""Check placement in physical multi-monitor coordinates without requiring a display."""
import ctypes as C
import sys
import types
import unittest
from unittest.mock import Mock,patch
from windows.win32_support import WindowsPlatform,MonitorInfo,near_pointer_bounds

class PointerBoundsTests(unittest.TestCase):
    def test_uses_the_secondary_monitor_instead_of_the_primary_origin(self):
        self.assertEqual(near_pointer_bounds((4400,300),(3840,0,7680,2120),(1120,790)),(4416,316,1120,790))
    def test_retains_negative_coordinates_for_left_and_upper_monitors(self):
        self.assertEqual(near_pointer_bounds((-2300,-1200),(-2560,-1440,0,0),(1120,790)),(-2284,-1184,1120,790))
    def test_keeps_the_window_inside_work_area_with_top_left_and_bottom_taskbars(self):
        self.assertEqual(near_pointer_bounds((3800,1030),(1940,40,3840,1040),(1120,790)),(2720,250,1120,790))
        self.assertEqual(near_pointer_bounds((1920,0),(1940,40,3840,1040),(1120,790)),(1940,40,1120,790))
    def test_shrinks_a_large_window_to_the_selected_monitor(self):
        self.assertEqual(near_pointer_bounds((2000,100),(1920,0,2944,728),(2240,1580)),(1920,0,1024,728))
    def test_rejects_an_unusable_monitor_area(self):
        with self.assertRaises(ValueError):near_pointer_bounds((100,100),(0,0,0,0),(1120,790))

class NativePlacementTests(unittest.TestCase):
    def setUp(self):
        system=types.ModuleType('System');system.__path__=[]
        windows=types.ModuleType('System.Windows');windows.__path__=[]
        forms=types.ModuleType('System.Windows.Forms');forms.FormStartPosition=types.SimpleNamespace(Manual='manual')
        system.Windows=windows;windows.Forms=forms
        replacement=patch.dict(sys.modules,{'System':system,'System.Windows':windows,'System.Windows.Forms':forms})
        replacement.start();self.addCleanup(replacement.stop)
    def platform(self,frames=None,area=(3840,0,7680,2120)):
        platform=WindowsPlatform.__new__(WindowsPlatform);platform.user=Mock();platform.handle=lambda editor:123
        platform.user.SetThreadDpiAwarenessContext.return_value=457
        platform.user.GetDpiForSystem.return_value=144
        platform.user.MonitorFromWindow.return_value=9
        platform.user.MonitorFromPoint.return_value=9;platform.user.SetWindowPos.return_value=1
        def monitor_info(monitor,pointer):
            self.assertEqual(monitor,9);info=pointer._obj;self.assertEqual(info.size,C.sizeof(MonitorInfo))
            info.work.left,info.work.top,info.work.right,info.work.bottom=area
            return 1
        platform.user.GetMonitorInfoW.side_effect=monitor_info
        rectangles=iter(frames or [(0,0,1120,790),(4416,316,5536,1106)])
        def window_rect(handle,pointer):
            self.assertEqual(handle,123);rect=pointer._obj
            rect.left,rect.top,rect.right,rect.bottom=next(rectangles)
            return 1
        platform.user.GetWindowRect.side_effect=window_rect
        editor=types.SimpleNamespace(window=types.SimpleNamespace(native=types.SimpleNamespace(StartPosition='automatic')),ui=Mock(side_effect=lambda fn:fn()))
        return platform,editor
    def test_launch_pointer_is_physical_even_before_the_gui_sets_dpi_awareness(self):
        platform,_=self.platform()
        def physical(pointer):pointer._obj.x=-2200;pointer._obj.y=500;return 1
        platform.user.GetPhysicalCursorPos.side_effect=physical
        self.assertEqual(platform.launch_point(),(-2200,500));platform.user.GetCursorPos.assert_not_called()
    def test_initial_coordinates_account_for_winforms_system_scaling(self):
        platform,_=self.platform()
        self.assertEqual(platform.initial_window_bounds((4400,300),1120,790),{'x':2944,'y':211,'width':1120,'height':790})
        self.assertEqual(platform.user.SetThreadDpiAwarenessContext.call_args.args,(457,))
    def test_show_time_reset_to_primary_is_corrected(self):
        platform,editor=self.platform(frames=[(0,0,1120,790),(4416,316,5536,1106)])
        platform.user.MonitorFromWindow.side_effect=[1,9]
        report=platform.confirm_launch_position(editor,(4400,300))
        self.assertTrue(report['ok']);self.assertEqual(report['corrections'],1)
        self.assertEqual(platform.user.SetWindowPos.call_args.args,(123,None,4416,316,1120,790,0x14))
    def test_already_correct_shown_window_is_not_moved(self):
        platform,editor=self.platform(frames=[(4416,316,5536,1106)])
        report=platform.confirm_launch_position(editor,(4400,300))
        self.assertTrue(report['ok']);self.assertEqual(report['corrections'],0);platform.user.SetWindowPos.assert_not_called()
    def test_native_placement_failure_has_the_requested_and_actual_monitor(self):
        platform,editor=self.platform(frames=[(0,0,1120,790)]*4)
        platform.user.MonitorFromWindow.return_value=1
        report=platform.confirm_launch_position(editor,(4400,300))
        self.assertFalse(report['ok']);self.assertEqual(report['requestedMonitor'],9);self.assertEqual(report['actualMonitor'],1)
        self.assertEqual(report['corrections'],3);self.assertIn('error',report)
    def test_native_placement_selects_the_pointer_monitor_without_showing_the_window(self):
        platform,editor=self.platform();platform.position_near_pointer(editor,(4400,300))
        point,flags=platform.user.MonitorFromPoint.call_args.args
        self.assertEqual((point.x,point.y,flags),(4400,300,2));self.assertEqual(editor.window.native.StartPosition,'manual')
        self.assertEqual(platform.user.SetWindowPos.call_count,2)
        self.assertEqual(platform.user.SetWindowPos.call_args.args,(123,None,4416,316,1120,790,0x14))
        platform.user.ShowWindow.assert_not_called();editor.ui.assert_called_once()
        self.assertEqual(platform.user.SetThreadDpiAwarenessContext.call_args.args,(457,))
    def test_second_pass_accounts_for_a_physical_size_change_on_a_different_dpi_monitor(self):
        platform,editor=self.platform(frames=[(0,0,1120,790),(6560,1330,8800,2910)])
        platform.position_near_pointer(editor,(7600,2100))
        self.assertEqual(platform.user.SetWindowPos.call_args_list[0].args,(123,None,6560,1330,1120,790,0x14))
        self.assertEqual(platform.user.SetWindowPos.call_args_list[1].args,(123,None,5440,540,2240,1580,0x14))
    def test_native_errors_restore_the_original_dpi_context(self):
        platform,editor=self.platform();platform.user.SetWindowPos.side_effect=OSError('Window unavailable')
        with self.assertRaises(OSError):platform.position_near_pointer(editor,(4400,300))
        self.assertEqual(platform.user.SetThreadDpiAwarenessContext.call_args.args,(457,))
    def test_per_monitor_v1_is_available_when_v2_is_not_supported(self):
        platform,editor=self.platform();platform.user.SetThreadDpiAwarenessContext.side_effect=[None,457,457]
        platform.position_near_pointer(editor,(4400,300))
        calls=platform.user.SetThreadDpiAwarenessContext.call_args_list
        self.assertEqual(calls[0].args[0].value,C.c_void_p(-4).value)
        self.assertEqual(calls[1].args[0].value,C.c_void_p(-3).value)
        self.assertEqual(calls[2].args,(457,))

if __name__=='__main__':unittest.main()
