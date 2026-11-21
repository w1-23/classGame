@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$zip = Get-ChildItem -LiteralPath '.' -Filter 'LearningAdventurePark-payload.zip' | Select-Object -First 1;" ^
  "if (-not $zip) { throw 'missing payload' };" ^
  "$destination = Join-Path $env:LOCALAPPDATA '学习闯关乐园';" ^
  "New-Item -ItemType Directory -Force -Path $destination | Out-Null;" ^
  "Expand-Archive -LiteralPath $zip.FullName -DestinationPath $destination -Force;" ^
  "$app = Join-Path $destination 'LearningAdventurePark-win32-x64';" ^
  "$exe = Join-Path $app 'electron.exe';" ^
  "$shell = New-Object -ComObject WScript.Shell;" ^
  "$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) '学习闯关乐园.lnk';" ^
  "$menu = Join-Path ([Environment]::GetFolderPath('Programs')) '学习闯关乐园.lnk';" ^
  "foreach ($shortcutPath in @($desktop, $menu)) { $shortcut = $shell.CreateShortcut($shortcutPath); $shortcut.TargetPath = $exe; $shortcut.WorkingDirectory = $app; $shortcut.Save(); };" ^
  "Write-Host ('Installed: ' + $app); Write-Host ('Shortcuts: ' + $desktop + ', ' + $menu)"
pause
