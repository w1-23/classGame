$ErrorActionPreference = 'Stop'

$target = Join-Path $env:LOCALAPPDATA '学习闯关乐园'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) '学习闯关乐园.lnk'
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) '学习闯关乐园.lnk'

Remove-Item -LiteralPath $desktopShortcut -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $startMenu -Force -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath $target)) {
  Write-Output '未发现已安装的学习闯关乐园。'
  exit 0
}

$resolved = (Resolve-Path -LiteralPath $target).Path
$expected = Join-Path $env:LOCALAPPDATA '学习闯关乐园'
if ($resolved -ne $expected) { throw "安装目录异常：$resolved" }

Remove-Item -LiteralPath $desktopShortcut -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $startMenu -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $resolved -Recurse -Force
Write-Output "卸载完成：$resolved"
Write-Output '学生本地存档保存在浏览器 localStorage 中；如需彻底清理，请在浏览器设置中清除该站点数据。'
