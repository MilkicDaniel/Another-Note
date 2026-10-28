#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <wchar.h>
#include <stdlib.h>
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE previous,PWSTR args,int show) {
    /* Capture before Python imports and GUI startup can move the pointer. */
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    POINT pointer;
    if(GetPhysicalCursorPos(&pointer)) {
        wchar_t point[80];
        if(swprintf(point,80,L"%ld,%ld",pointer.x,pointer.y)>0)SetEnvironmentVariableW(L"ANOTHER_NOTE_LAUNCH_POINT",point);
    }
    wchar_t root[32768],python[32768],script[32768],command[32768];
    DWORD n=GetModuleFileNameW(NULL,root,32768);
    if(!n || n>=32768) return 1;
    wchar_t *slash=wcsrchr(root,L'\\');if(!slash)return 1;*slash=0;
    if(swprintf(python,32768,L"%ls\\runtime\\pythonw.exe",root)<0 || swprintf(script,32768,L"%ls\\launcher.py",root)<0)return 1;
    if(swprintf(command,32768,L"\"%ls\" \"%ls\" %ls",python,script,args)<0)return 1;
    STARTUPINFOW si={0};si.cb=sizeof(si);PROCESS_INFORMATION pi={0};
    if(!CreateProcessW(python,command,NULL,NULL,FALSE,0,NULL,NULL,&si,&pi)) {
        MessageBoxW(NULL,L"Another Note could not start. Extract the entire Windows package, including its runtime folder, and try again.",L"Another Note",MB_OK|MB_ICONERROR);return 1;
    }
    CloseHandle(pi.hThread);CloseHandle(pi.hProcess);return 0;
}
