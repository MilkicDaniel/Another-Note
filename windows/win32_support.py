"""Small Windows adapter: pointer state, hit testing, tab image and window chrome."""
import ctypes as C
from ctypes import wintypes as W
import os
from contextlib import contextmanager

class MonitorInfo(C.Structure):
    _fields_=[('size',W.DWORD),('monitor',W.RECT),('work',W.RECT),('flags',W.DWORD)]

def near_pointer_bounds(point,work_area,window_size):
    """Place a window near a physical pointer, inside that monitor's work area."""
    left,top,right,bottom=work_area
    if right<=left or bottom<=top:raise ValueError('The monitor has no usable work area.')
    width=min(max(1,window_size[0]),right-left);height=min(max(1,window_size[1]),bottom-top)
    return max(left,min(point[0]+16,right-width)),max(top,min(point[1]+16,bottom-height)),width,height

class WindowsPlatform:
    def __init__(self):
        if os.name != 'nt': raise RuntimeError('This desktop version requires Windows.')
        self.user=C.WinDLL('user32',use_last_error=True);self.gdi=C.WinDLL('gdi32',use_last_error=True);self.kernel=C.WinDLL('kernel32',use_last_error=True)
        def bind(lib,name,args,result):
            fn=getattr(lib,name);fn.argtypes=args;fn.restype=result;return fn
        ptr=C.c_void_p
        bind(self.user,'GetCursorPos',[C.POINTER(W.POINT)],W.BOOL)
        bind(self.user,'GetPhysicalCursorPos',[C.POINTER(W.POINT)],W.BOOL)
        bind(self.user,'MonitorFromPoint',[W.POINT,W.DWORD],ptr)
        bind(self.user,'MonitorFromWindow',[ptr,W.DWORD],ptr)
        bind(self.user,'GetMonitorInfoW',[ptr,C.POINTER(MonitorInfo)],W.BOOL)
        bind(self.user,'SetThreadDpiAwarenessContext',[ptr],ptr)
        bind(self.user,'SetProcessDpiAwarenessContext',[ptr],W.BOOL)
        bind(self.user,'GetDpiForSystem',[],W.UINT)
        bind(self.user,'GetDpiForWindow',[ptr],W.UINT)
        bind(self.user,'GetWindowDpiAwarenessContext',[ptr],ptr)
        bind(self.user,'GetAwarenessFromDpiAwarenessContext',[ptr],C.c_int)
        bind(self.user,'GetAsyncKeyState',[C.c_int],C.c_short)
        bind(self.user,'WindowFromPoint',[W.POINT],ptr)
        bind(self.user,'GetAncestor',[ptr,W.UINT],ptr)
        bind(self.user,'GetClientRect',[ptr,C.POINTER(W.RECT)],W.BOOL)
        bind(self.user,'GetWindowRect',[ptr,C.POINTER(W.RECT)],W.BOOL)
        bind(self.user,'ClientToScreen',[ptr,C.POINTER(W.POINT)],W.BOOL)
        bind(self.user,'SetWindowPos',[ptr,ptr,C.c_int,C.c_int,C.c_int,C.c_int,W.UINT],W.BOOL)
        bind(self.user,'DestroyWindow',[ptr],W.BOOL)
        bind(self.user,'ShowWindow',[ptr,C.c_int],W.BOOL)
        bind(self.user,'InvalidateRect',[ptr,ptr,W.BOOL],W.BOOL)
        bind(self.user,'DefWindowProcW',[ptr,W.UINT,C.c_size_t,C.c_ssize_t],C.c_ssize_t)
        bind(self.user,'CreateWindowExW',[W.DWORD,W.LPCWSTR,W.LPCWSTR,W.DWORD,C.c_int,C.c_int,C.c_int,C.c_int,ptr,ptr,ptr,ptr],ptr)
        bind(self.kernel,'GetModuleHandleW',[W.LPCWSTR],ptr)
        bind(self.user,'MessageBoxW',[ptr,W.LPCWSTR,W.LPCWSTR,W.UINT],C.c_int)
        bind(self.gdi,'CreateSolidBrush',[W.DWORD],ptr)
        bind(self.gdi,'DeleteObject',[ptr],W.BOOL)
        bind(self.gdi,'SetTextColor',[ptr,W.DWORD],W.DWORD)
        bind(self.gdi,'SetBkMode',[ptr,C.c_int],C.c_int)
        bind(self.gdi,'GetStockObject',[C.c_int],ptr)
        bind(self.gdi,'SelectObject',[ptr,ptr],ptr)
        bind(self.user,'FillRect',[ptr,C.POINTER(W.RECT),ptr],C.c_int)
        bind(self.user,'DrawTextW',[ptr,W.LPCWSTR,C.c_int,C.POINTER(W.RECT),W.UINT],C.c_int)
        class PAINT(C.Structure):
            _fields_=[('hdc',ptr),('erase',W.BOOL),('rect',W.RECT),('restore',W.BOOL),('inc',W.BOOL),('reserved',C.c_byte*32)]
        self.Paint=PAINT
        bind(self.user,'BeginPaint',[ptr,C.POINTER(PAINT)],ptr);bind(self.user,'EndPaint',[ptr,C.POINTER(PAINT)],W.BOOL)
        self.callback=C.WINFUNCTYPE(C.c_ssize_t,ptr,W.UINT,C.c_size_t,C.c_ssize_t)(self._wndproc)
        class CLASS(C.Structure):
            _fields_=[('style',W.UINT),('proc',ptr),('class_extra',C.c_int),('window_extra',C.c_int),('instance',ptr),('icon',ptr),('cursor',ptr),('brush',ptr),('menu',W.LPCWSTR),('name',W.LPCWSTR)]
        self.instance=self.kernel.GetModuleHandleW(None)
        cls=CLASS();cls.proc=C.cast(self.callback,ptr);cls.instance=self.instance;cls.name='AnotherNoteHeldTab'
        bind(self.user,'RegisterClassW',[C.POINTER(CLASS)],W.WORD)(C.byref(cls))
        self.ghost_meta={};self.ghost=0

    @staticmethod
    def handle(editor):return int(editor.window.native.Handle.ToInt64())
    def cursor(self):
        p=W.POINT()
        if not self.user.GetCursorPos(C.byref(p)):raise OSError('Could not read mouse position.')
        return p.x,p.y
    def launch_point(self):
        # A second launcher has not initialized the GUI or its DPI mode yet.
        p=W.POINT()
        if not self.user.GetPhysicalCursorPos(C.byref(p)):raise OSError('Could not read the launch mouse position.')
        return p.x,p.y
    def initialize_dpi(self):
        # Window DPI mode belongs to its creation context, not to a later
        # SetWindowPos call. Select it before importing the GUI toolkit.
        return bool(self.user.SetProcessDpiAwarenessContext(C.c_void_p(-4)))
    def watch_launch_position(self,editor,point):
        # Show/Activate and DPI layout may queue work. Verify from the native
        # message loop after those callbacks have run. Stop if the user drags
        # or resizes so startup recovery never fights an intentional move.
        def start():
            from System.Windows.Forms import Timer
            form=editor.window.native;timer=Timer();timer.Interval=160;checks=0;stopped=False
            def stop(*_):
                nonlocal stopped
                if stopped:return
                stopped=True
                timer.Stop();timer.Tick-=tick;form.ResizeBegin-=stop;form.FormClosed-=stop;timer.Dispose();editor.placement_watch=None
            def tick(*_):
                nonlocal checks
                if stopped:return
                if editor.closed or self.pressed(1):stop();return
                report=self.confirm_launch_position(editor,point);checks+=1;report.update(phase='settled',checks=checks)
                editor.app.record_window_placement(editor,report)
                if checks>=3:stop()
                else:timer.Interval=240 if checks==1 else 400
            timer.Tick+=tick;form.ResizeBegin+=stop;form.FormClosed+=stop;editor.placement_watch=(timer,tick,stop);timer.Start()
        editor.ui(start)
    @contextmanager
    def dpi_context(self,mode=-4):
        previous=self.user.SetThreadDpiAwarenessContext(C.c_void_p(mode))
        if not previous and mode==-4:previous=self.user.SetThreadDpiAwarenessContext(C.c_void_p(-3))
        if not previous:raise OSError('Could not select the window coordinate space.')
        try:yield
        finally:self.user.SetThreadDpiAwarenessContext(previous)
    def monitor_area(self,point):
        monitor=self.user.MonitorFromPoint(W.POINT(*point),2)
        info=MonitorInfo();info.size=C.sizeof(info)
        if not monitor or not self.user.GetMonitorInfoW(monitor,C.byref(info)):raise OSError('Could not read the launch monitor.')
        work=info.work
        return monitor,(work.left,work.top,work.right,work.bottom)
    def initial_window_bounds(self,point,width,height):
        # WinForms multiplies pywebview's initial coordinates by the system
        # scale. Supply those coordinates before its first hidden Show, so it
        # never starts by centering the window on the default monitor.
        with self.dpi_context(-2):
            dpi=self.user.GetDpiForSystem()
            if not dpi:raise OSError('Could not read the system display scale.')
        scale=dpi/96
        with self.dpi_context():
            _,area=self.monitor_area(point)
            x,y,w,h=near_pointer_bounds(point,area,(round(width*scale),round(height*scale)))
        return dict(x=round(x/scale),y=round(y/scale),width=max(1,round(w/scale)),height=max(1,round(h/scale)))
    def position_near_pointer(self,editor,point):
        def place():
            from System.Windows.Forms import FormStartPosition
            editor.window.native.StartPosition=FormStartPosition.Manual
            # Use physical pixels consistently even across differently scaled
            # monitors, then restore the GUI thread's original DPI context.
            with self.dpi_context():
                _,area=self.monitor_area(point);handle=self.handle(editor)
                # Moving to a different DPI can change the physical window
                # size. Read it again there before the final on-screen clamp.
                for _ in range(2):
                    rect=W.RECT()
                    if not self.user.GetWindowRect(handle,C.byref(rect)):raise OSError('Could not read the new window bounds.')
                    bounds=near_pointer_bounds(point,area,(rect.right-rect.left,rect.bottom-rect.top))
                    if not self.user.SetWindowPos(handle,None,*bounds,0x14):raise OSError('Could not position the new window.')
        editor.ui(place)
    def confirm_launch_position(self,editor,point):
        report={'point':point,'ok':False,'corrections':0}
        def confirm():
            with self.dpi_context():
                monitor,area=self.monitor_area(point);handle=self.handle(editor)
                context=self.user.GetWindowDpiAwarenessContext(handle)
                report.update(requestedMonitor=int(monitor),workArea=area,dpi=int(self.user.GetDpiForWindow(handle)),dpiAwareness=int(self.user.GetAwarenessFromDpiAwarenessContext(context)))
                for attempt in range(4):
                    rect=W.RECT()
                    if not self.user.GetWindowRect(handle,C.byref(rect)):raise OSError('Could not verify the shown window.')
                    actual=(rect.left,rect.top,rect.right-rect.left,rect.bottom-rect.top)
                    expected=near_pointer_bounds(point,area,actual[2:])
                    actual_monitor=int(self.user.MonitorFromWindow(handle,2) or 0)
                    report.update(actualMonitor=actual_monitor,actualBounds=actual,expectedBounds=expected)
                    if actual_monitor==int(monitor) and all(abs(a-b)<=2 for a,b in zip(actual,expected)):
                        report['ok']=True;return
                    if attempt<3:
                        if not self.user.SetWindowPos(handle,None,*expected,0x14):raise OSError('Could not correct the shown window position.')
                        report['corrections']+=1
                report['error']='The shown window did not stay on its requested monitor.'
        try:editor.ui(confirm)
        except Exception as error:report['error']=str(error)
        return report
    def pressed(self,key):return bool(self.user.GetAsyncKeyState(key)&0x8000)
    def root_at(self,point):return int(self.user.GetAncestor(self.user.WindowFromPoint(W.POINT(*point)),2) or 0)
    def frame(self,editor):
        handle=self.handle(editor);rect=W.RECT();outer=W.RECT();origin=W.POINT(0,0)
        if not self.user.GetClientRect(handle,C.byref(rect)) or not self.user.GetWindowRect(handle,C.byref(outer)) or not self.user.ClientToScreen(handle,C.byref(origin)):raise OSError('The window is unavailable.')
        return origin.x,origin.y,max(1,rect.right-rect.left),max(1,rect.bottom-rect.top),outer.left,outer.top
    def local_point(self,editor,point):
        x,y,w,h,_,_=self.frame(editor);vw,vh=editor.viewport
        return (point[0]-x)*vw/w,(point[1]-y)*vh/h
    def position(self,editor,anchor):
        x,y,w,h,left,top=self.frame(editor);vw,vh=editor.viewport;scale_x,scale_y=w/max(1,vw),h/max(1,vh)
        px,py=anchor['point'];new_x=round(px-(x-left)-(anchor.get('tabX',50)+anchor.get('offsetX',30))*scale_x);new_y=round(py-(y-top)-(anchor.get('tabY',33)+anchor.get('offsetY',16))*scale_y)
        self.user.SetWindowPos(self.handle(editor),None,new_x,new_y,0,0,0x15)
    def appearance(self,editor,theme):
        def apply():
            from System.Drawing import Color
            color=Color.FromArgb(*( (25,30,35) if theme=='dark' else (252,252,252) ))
            editor.window.native.BackColor=color;editor.window.native.webview.DefaultBackgroundColor=color
            try:
                dark=C.c_int(theme=='dark');dwm=C.WinDLL('dwmapi');dwm.DwmSetWindowAttribute.argtypes=[C.c_void_p,W.DWORD,C.c_void_p,W.DWORD];dwm.DwmSetWindowAttribute(self.handle(editor),20,C.byref(dark),C.sizeof(dark))
            except (AttributeError,OSError):pass
        editor.ui(apply)
    def create_ghost(self,editor,meta,width,height):
        def create():
            self.ghost_meta=meta
            self.ghost=self.user.CreateWindowExW(0x08000000|0x00000080|0x00000020|0x00000008,'AnotherNoteHeldTab','',0x80000000|0x08000000,0,0,width,height,None,None,self.instance,None)
            if not self.ghost:raise OSError('Could not create the dragged tab image.')
            # The first motion positions the image before revealing it.
            self.ghost_visible=False
        editor.ui(create)
    def move_ghost(self,point,offset,visible=True):
        if self.ghost:
            self.user.SetWindowPos(self.ghost,C.c_void_p(-1),round(point[0]-offset[0]),round(point[1]-offset[1]),0,0,0x11)
            if visible!=self.ghost_visible:self.user.ShowWindow(self.ghost,4 if visible else 0);self.ghost_visible=visible
    def close_ghost(self,editor):
        def destroy():
            if self.ghost:self.user.DestroyWindow(self.ghost);self.ghost=0
        if self.ghost:
            owner=editor if not editor.closed else next((e for e in editor.app.editors.values() if not e.closed),None)
            if owner:owner.ui(destroy)
    def message(self,text):self.user.MessageBoxW(None,str(text),'Another Note',0x10)
    def open_image(self,path):
        import os
        os.startfile(str(path))
    def _wndproc(self,handle,message,wparam,lparam):
        if message==0x84:return -1
        if message==0x0f:
            paint=self.Paint();dc=self.user.BeginPaint(handle,C.byref(paint));rect=W.RECT();self.user.GetClientRect(handle,C.byref(rect));light=self.ghost_meta.get('theme')=='light';background=0xfcfcfc if light else 0x463d34;foreground=0x201810 if light else 0xefe8e1
            brush=self.gdi.CreateSolidBrush(background);self.user.FillRect(dc,C.byref(rect),brush);self.gdi.DeleteObject(brush);self.gdi.SetBkMode(dc,1);self.gdi.SetTextColor(dc,foreground);old=self.gdi.SelectObject(dc,self.gdi.GetStockObject(17));rect.left+=12;rect.right-=30
            title=str(self.ghost_meta.get('title') or 'untitled')+('  ●' if self.ghost_meta.get('modified') else '')
            self.user.DrawTextW(dc,title,-1,C.byref(rect),0x20|4|0x8000|0x800);rect.left=rect.right+6;rect.right+=24;self.user.DrawTextW(dc,'×',-1,C.byref(rect),0x20|4|1);self.gdi.SelectObject(dc,old);self.user.EndPaint(handle,C.byref(paint));return 0
        return self.user.DefWindowProcW(handle,message,wparam,lparam)
