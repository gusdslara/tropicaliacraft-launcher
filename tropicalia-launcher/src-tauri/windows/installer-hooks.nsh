; Releases before the rename installed as "Tropicalia Launcher" (with a space). NSIS keys the
; uninstall entry and install folder by product name, so remove that copy silently first
; (app data is kept: the silent uninstaller leaves the "delete app data" option unchecked).
!macro TROPICALIA_REMOVE_LEGACY ROOT
  ReadRegStr $R0 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\Tropicalia Launcher" "InstallLocation"
  ${If} $R0 != ""
  ${AndIf} ${FileExists} "$R0\uninstall.exe"
    ExecWait '"$R0\uninstall.exe" /S _?=$R0'
    Delete "$R0\uninstall.exe"
    RMDir "$R0"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro TROPICALIA_REMOVE_LEGACY HKCU
  !insertmacro TROPICALIA_REMOVE_LEGACY HKLM
!macroend
