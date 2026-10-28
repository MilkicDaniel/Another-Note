#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <wchar.h>
#include "setup_command.h"
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE previous,PWSTR args,int show) {
    wchar_t path[32768];DWORD n=GetModuleFileNameW(NULL,path,32768);
    if(!n||n>=32768)return 1;
    if(!SetEnvironmentVariableW(L"ANOTHER_NOTE_SETUP",path))return 1;
    STARTUPINFOW si={0};si.cb=sizeof(si);si.dwFlags=STARTF_USESHOWWINDOW;si.wShowWindow=SW_HIDE;PROCESS_INFORMATION pi={0};
    wchar_t powershell[32768];DWORD size=GetSystemDirectoryW(powershell,32768);
    if(!size||size>32000)return 1;
    wcscat(powershell,L"\\WindowsPowerShell\\v1.0\\powershell.exe");
    if(!CreateProcessW(powershell,setup_command,NULL,NULL,FALSE,CREATE_NO_WINDOW,NULL,NULL,&si,&pi)) {
        MessageBoxW(NULL,L"The installer could not start Windows PowerShell.",L"Another Note Setup",MB_OK|MB_ICONERROR);return 1;
    }
    WaitForSingleObject(pi.hProcess,INFINITE);DWORD code=1;GetExitCodeProcess(pi.hProcess,&code);CloseHandle(pi.hThread);CloseHandle(pi.hProcess);return (int)code;
}
