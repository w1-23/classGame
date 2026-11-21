$ErrorActionPreference = 'Stop'
$payload = Join-Path $env:TEMP 'LearningAdventurePark-payload.zip'
$destination = Join-Path $env:LOCALAPPDATA '学习闯关乐园'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Expand-Archive -LiteralPath $payload -DestinationPath $destination -Force
$app = Join-Path $destination 'LearningAdventurePark-win32-x64'
$exe = Join-Path $app 'electron.exe'
$shell = New-Object -ComObject WScript.Shell
foreach ($shortcutPath in @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) '学习闯关乐园.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) '学习闯关乐园.lnk')
)) {
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $exe
  $shortcut.WorkingDirectory = $app
  $shortcut.Save()
}
Write-Host "安装完成：$app"
Write-Host '已创建桌面和开始菜单快捷方式。'
