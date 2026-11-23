param(
    [string]$InstallerPath = "release\classGame-0.6.1-x64-setup.exe",
    [string]$InstallDirectory = ".installer-test-0.6.1",
    [string]$ScreenshotPath = "docs\screenshots\installed-0.6.1.png"
)

$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$installer = [IO.Path]::GetFullPath((Join-Path $projectRoot $InstallerPath))
$installRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot $InstallDirectory))
$screenshot = [IO.Path]::GetFullPath((Join-Path $projectRoot $ScreenshotPath))
$workspacePrefix = $projectRoot.TrimEnd("\") + "\"
if (-not $installRoot.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Install test directory must stay inside the project workspace."
}
if (-not (Test-Path -LiteralPath $installer)) {
    throw "Installer not found: $installer"
}

$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$productName = $package.build.productName
$version = $package.version
$mainExecutableName = "$productName.exe"
$coreExecutableName = "$productName-core.exe"

function Get-UninstallEntries {
    $roots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )
    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }
        Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
            $properties = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
            if (-not $properties) {
                return
            }
            [pscustomobject]@{
                Key = $_.PSPath
                DisplayName = [string]$properties.DisplayName
                DisplayVersion = [string]$properties.DisplayVersion
                DisplayIcon = [string]$properties.DisplayIcon
                InstallLocation = [string]$properties.InstallLocation
                UninstallString = [string]$properties.UninstallString
                QuietUninstallString = [string]$properties.QuietUninstallString
            }
        }
    }
}

function Find-TestUninstallEntry {
    $expected = [IO.Path]::GetFullPath($installRoot).TrimEnd("\")
    Get-UninstallEntries | Where-Object {
        $location = $_.InstallLocation
        if (-not $location) {
            return $false
        }
        try {
            return [string]::Equals(
                [IO.Path]::GetFullPath($location).TrimEnd("\"),
                $expected,
                [StringComparison]::OrdinalIgnoreCase
            )
        } catch {
            return $false
        }
    } | Select-Object -First 1
}

function Remove-TestRegistryEntries {
    $entry = Find-TestUninstallEntry
    if ($entry) {
        Remove-Item -LiteralPath $entry.Key -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Test-Shortcut {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Shortcut missing: $Path"
    }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    if (-not [string]::Equals(
        [IO.Path]::GetFullPath($shortcut.TargetPath),
        [IO.Path]::GetFullPath($mainExecutable),
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Shortcut target mismatch: $Path -> $($shortcut.TargetPath)"
    }
}

function Stop-TestProcesses {
    $paths = @(
        (Join-Path $installRoot $mainExecutableName),
        (Join-Path $installRoot $coreExecutableName)
    )
    Get-Process | Where-Object {
        try { $_.Path -and ($paths -contains [IO.Path]::GetFullPath($_.Path)) } catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $installRoot) {
    Stop-TestProcesses
    Remove-Item -LiteralPath $installRoot -Recurse -Force
}
Remove-TestRegistryEntries
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null

Write-Output "INSTALL STEP: $installer"
$installerProcess = Start-Process -FilePath $installer -ArgumentList @("/S", "/D=$installRoot") -WindowStyle Hidden -PassThru -Wait
if ($installerProcess.ExitCode -ne 0) {
    throw "Installer exited with code $($installerProcess.ExitCode)."
}
$deadline = [DateTime]::UtcNow.AddSeconds(180)
while ([DateTime]::UtcNow -lt $deadline) {
    if ((Test-Path -LiteralPath (Join-Path $installRoot $mainExecutableName)) -and
        (Find-TestUninstallEntry)) {
        break
    }
    Start-Sleep -Seconds 1
}

$mainExecutable = Join-Path $installRoot $mainExecutableName
$coreExecutable = Join-Path $installRoot $coreExecutableName
foreach ($required in @($mainExecutable, $coreExecutable)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Installed file missing: $required"
    }
}
$uninstallEntry = Find-TestUninstallEntry
if (-not $uninstallEntry) {
    throw "Uninstall registry entry was not created."
}
$registeredVersion = $uninstallEntry.DisplayVersion
if ($registeredVersion -ne $version) {
    throw "Registered version mismatch: expected $version, got $registeredVersion"
}
if ($uninstallEntry.DisplayName -notlike "*$productName*") {
    throw "Uninstall display name mismatch: $($uninstallEntry.DisplayName)"
}
if (-not $uninstallEntry.UninstallString) {
    throw "Uninstall command is missing from the registry entry."
}
Write-Output "INSTALLED VERSION: $registeredVersion"
Write-Output "UNINSTALL ENTRY: $($uninstallEntry.Key)"

$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "$productName.lnk"
$startMenuShortcut = Join-Path ([Environment]::GetFolderPath("Programs")) "$productName\$productName.lnk"
Test-Shortcut -Path $desktopShortcut
Test-Shortcut -Path $startMenuShortcut
Write-Output "SHORTCUTS VERIFIED"

Write-Output "PACKAGED GAMEPLAY VERIFICATION"
& conda run --no-capture-output -n GAME node (Join-Path $projectRoot "tools\verify_packaged.mjs") $coreExecutable $screenshot
if ($LASTEXITCODE -ne 0) {
    throw "Packaged gameplay verification failed."
}

Write-Output "LAUNCHER VERIFICATION"
$launcher = Start-Process -FilePath $mainExecutable -PassThru
$coreProcess = $null
$deadline = [DateTime]::UtcNow.AddSeconds(25)
while ([DateTime]::UtcNow -lt $deadline -and -not $coreProcess) {
    Start-Sleep -Milliseconds 500
    $coreProcess = Get-Process | Where-Object {
        try {
            $_.Path -and [IO.Path]::GetFullPath($_.Path) -eq $coreExecutable
        } catch {
            $false
        }
    } | Select-Object -First 1
}
if (-not $coreProcess) {
    throw "Installed launcher did not start the Electron core executable."
}
Write-Output "LAUNCHER STARTED CORE: $($coreProcess.Id)"
Stop-Process -Id $coreProcess.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $launcher.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Output "UNINSTALL STEP"
$uninstallCommand = $uninstallEntry.QuietUninstallString
if (-not $uninstallCommand) {
    $uninstallCommand = "$($uninstallEntry.UninstallString) /S"
}
$uninstallerPath = $uninstallCommand -replace '^"([^"]+)".*$', '$1' -replace '^([^\s]+).*$', '$1'
if (-not (Test-Path -LiteralPath $uninstallerPath)) {
    throw "Uninstaller executable not found: $uninstallerPath"
}
$uninstallerProcess = Start-Process -FilePath $uninstallerPath -ArgumentList @("/S") -WindowStyle Hidden -PassThru
$null = $uninstallerProcess.Handle
$deadline = [DateTime]::UtcNow.AddSeconds(60)
while ([DateTime]::UtcNow -lt $deadline) {
    if (-not (Test-Path -LiteralPath $mainExecutable) -and
        -not (Find-TestUninstallEntry)) {
        break
    }
    Start-Sleep -Seconds 1
}
Start-Sleep -Seconds 5
if (Test-Path -LiteralPath $mainExecutable) {
    throw "Uninstaller left the main executable in place."
}
if (Test-Path -LiteralPath $coreExecutable) {
    throw "Uninstaller left the core executable in place."
}
if (Find-TestUninstallEntry) {
    throw "Uninstaller left the uninstall registry entry in place."
}
if (Test-Path -LiteralPath $desktopShortcut) {
    throw "Uninstaller left the desktop shortcut in place."
}
if (Test-Path -LiteralPath $startMenuShortcut) {
    throw "Uninstaller left the Start menu shortcut in place."
}
$remaining = @()
if (Test-Path -LiteralPath $installRoot) {
    $remaining = Get-ChildItem -LiteralPath $installRoot -Force
}
if ($remaining.Count -gt 0) {
    throw "Uninstaller left $($remaining.Count) files or folders behind."
}
Write-Output "UNINSTALL VERIFIED: registry entry and installed files removed."
Write-Output "WINDOWS INSTALL TEST PASSED"
