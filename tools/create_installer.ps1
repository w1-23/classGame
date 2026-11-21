$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot '..\dist-app\LearningAdventurePark-win32-x64'
$target = Join-Path $env:LOCALAPPDATA '学习闯关乐园'
$shortcutSource = Join-Path $target '学习闯关乐园.exe'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) '学习闯关乐园.lnk'
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) '学习闯关乐园'
$startMenuShortcut = Join-Path $startMenu '学习闯关乐园.lnk'

if (-not (Test-Path -LiteralPath $source)) {
  throw '未找到便携应用目录，请保持安装包结构完整。'
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
robocopy $source $target /E /NFL /NDL /NJH /NJS /NP /XF 一键安装.bat | Out-Null
if ($LASTEXITCODE -gt 7) {
  throw "复制应用失败，robocode=$LASTEXITCODE"
}

$shell = New-Object -ComObject WScript.Shell
foreach ($shortcutPath in @($desktopShortcut, $startMenuShortcut)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $shortcutPath) | Out-Null
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $shortcutSource
  $shortcut.WorkingDirectory = $target
  $shortcut.Description = '小学离线学习闯关乐园'
  $shortcut.Save()
}

Write-Output "安装完成：$target"
Write-Output "桌面快捷方式：$desktopShortcut"
Write-Output "开始菜单：$startMenuShortcut"

$launch = Read-Host '是否立即启动？(Y/N)'
if ($launch -match '^[Yy]') {
  Start-Process -FilePath $shortcutSource -WorkingDirectory $target
}
