$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$payload = Join-Path $root 'dist-app\LearningAdventurePark-payload.zip'
$output = Join-Path $root 'dist-app\LearningAdventurePark-installer.exe'
$stub = Join-Path $PSScriptRoot 'installer-stub.ps1'

if (-not (Test-Path -LiteralPath $payload)) { throw "Missing payload: $payload" }

Copy-Item -LiteralPath $stub -Destination "$env:TEMP\LearningAdventurePark-stub.ps1" -Force
Copy-Item -LiteralPath $payload -Destination "$env:TEMP\LearningAdventurePark-payload.zip" -Force

$publisher = Join-Path $env:TEMP 'LearningAdventurePark-publisher.ps1'
@'
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
Start-Process -FilePath $exe -WorkingDirectory $app
'@ | Set-Content -LiteralPath $publisher -Encoding UTF8

& "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $publisher
Write-Output "Installer output path reserved: $output"
