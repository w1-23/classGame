!macro customInstall
  SetShellVarContext current

  CreateShortCut "$DESKTOP\学习闯关乐园.lnk" "$INSTDIR\学习闯关乐园.exe" "" "$INSTDIR\学习闯关乐园.exe" 0
  CreateDirectory "$SMPROGRAMS\学习闯关乐园"
  CreateShortCut "$SMPROGRAMS\学习闯关乐园\学习闯关乐园.lnk" "$INSTDIR\学习闯关乐园.exe" "" "$INSTDIR\学习闯关乐园.exe" 0

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\cn.classgame.learningpark" "DisplayName" "学习闯关乐园"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\cn.classgame.learningpark" "DisplayVersion" "0.4.1"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\cn.classgame.learningpark" "DisplayIcon" "$INSTDIR\学习闯关乐园.exe,0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\cn.classgame.learningpark" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\cn.classgame.learningpark" "UninstallString" '"$INSTDIR\卸载学习闯关乐园.exe" /currentuser'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\cn.classgame.learningpark" "QuietUninstallString" '"$INSTDIR\卸载学习闯关乐园.exe" /currentuser /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\cn.classgame.learningpark" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\cn.classgame.learningpark" "NoRepair" 1
!macroend
