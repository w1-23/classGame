$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$launcherSource = Join-Path $PSScriptRoot 'launcher\Launcher.cs'
$uninstallerSource = Join-Path $PSScriptRoot 'uninstaller\Uninstaller.cs'
$buildDirectory = Join-Path $projectRoot 'build'
$launcherOutput = Join-Path $buildDirectory 'ClassGameLauncher.exe'
$uninstallerOutput = Join-Path $buildDirectory 'ClassGameUninstaller.exe'
$icon = Join-Path $buildDirectory 'icon.ico'

if (-not (Test-Path -LiteralPath $compiler)) {
    throw "C# compiler not found: $compiler"
}

if (-not (Test-Path -LiteralPath $launcherSource)) {
    throw "Launcher source not found: $launcherSource"
}

if (-not (Test-Path -LiteralPath $uninstallerSource)) {
    throw "Uninstaller source not found: $uninstallerSource"
}

New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null

function Build-HelperExecutable {
    param(
        [string]$Source,
        [string]$Output
    )

    & $compiler `
        /nologo `
        /target:winexe `
        /platform:anycpu `
        /optimize+ `
        /r:System.dll `
        /r:System.Core.dll `
        /r:System.Windows.Forms.dll `
        "/win32icon:$icon" `
        "/out:$Output" `
        $Source

    if ($LASTEXITCODE -ne 0) {
        throw "Compilation failed for $Source with exit code $LASTEXITCODE"
    }
}

Build-HelperExecutable -Source $launcherSource -Output $launcherOutput
Build-HelperExecutable -Source $uninstallerSource -Output $uninstallerOutput

Write-Output "Launcher built: $launcherOutput"
Write-Output "Uninstaller built: $uninstallerOutput"
