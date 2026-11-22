#Requires -Version 5.1
# Requires Windows and installed System.Speech desktop voices.
# Candidate audio generation only. This includes clearly-labelled pinyin previews;
# generated speech is never treated as teacher-approved pronunciation.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][string]$JobsFile,
    [string]$ChineseVoice = "",
    [string]$EnglishVoice = "",
    [switch]$Overwrite
)
$ErrorActionPreference = "Stop"
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "Run this script on Windows with installed System.Speech desktop voices."
}
Add-Type -AssemblyName System.Speech
$audioRoot = [IO.Path]::GetFullPath($ProjectRoot)
$audioRootPrefix = $audioRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$jobFilePath = [IO.Path]::GetFullPath($JobsFile)
$audioPlan = [IO.File]::ReadAllText($jobFilePath, [Text.Encoding]::UTF8) | ConvertFrom-Json
if ($audioPlan.schemaVersion -ne 1 -or $audioPlan.jobs -isnot [array]) { throw "Unsupported audio job schema." }
function Resolve-ProjectPath([string]$Relative) {
    $relativePath = $Relative.Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ([IO.Path]::IsPathRooted($relativePath) -or $relativePath.Contains(':')) { throw "Path must be project-relative." }
    $resolved = [IO.Path]::GetFullPath((Join-Path $audioRoot $relativePath))
    if (-not $resolved.StartsWith($audioRootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path leaves project." }
    # FullPath is lexical in .NET Framework; reject junction/symlink children
    # instead of following one out of the project during generation.
    $part = $resolved
    while ($part -and $part.StartsWith($audioRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        if (Test-Path -LiteralPath $part) {
            if ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Project audio/source path contains a reparse point: $Relative"
            }
        }
        $part = [IO.Path]::GetDirectoryName($part)
    }
    return $resolved
}
$synth = New-Object -TypeName System.Speech.Synthesis.SpeechSynthesizer
$records = New-Object -TypeName 'System.Collections.Generic.List[object]'
$fatalError = $null
try {
    $manifestPath = Resolve-ProjectPath "data/manifest.json"
    if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -ne $audioPlan.sourceManifestSha256) {
        throw "Content manifest changed since prepare; regenerate jobs."
    }
    $manifest = [IO.File]::ReadAllText($manifestPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if (@($audioPlan.sourceFiles).Count -ne @($manifest.packs).Count) { throw "Source list does not match manifest." }
    $sourcePacks = @{}
    $sourceIndex = 0
    foreach ($source in $audioPlan.sourceFiles) {
        if ($source.path -cne $manifest.packs[$sourceIndex] -or $sourcePacks.ContainsKey([string]$source.path)) {
            throw "Source list contains duplicate, missing, or changed pack paths."
        }
        $sourceIndex += 1
        $sourcePath = Resolve-ProjectPath ([string]$source.path)
        if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne $source.sha256) {
            throw "Content changed since prepare: $($source.path)"
        }
        $sourcePacks[[string]$source.path] = [IO.File]::ReadAllText($sourcePath, [Text.Encoding]::UTF8) | ConvertFrom-Json
    }
    $seenJobs = @{}
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        # Validate all text, roles and destinations before creating any WAV.
        foreach ($job in $audioPlan.jobs) {
            $language = [string]$job.lang
            if ($language -cnotin @("zh-CN", "en-US") -or $job.text -isnot [string] -or
                [string]::IsNullOrWhiteSpace($job.text) -or $job.requiresManualRecording -isnot [bool]) {
                throw "Every job needs text, an exact supported language, and an explicit manual-recording boolean."
            }
            $role = if ($job.requiresManualRecording) { "phoneme-recording" } else { "word-tts-candidate" }
            $keyMaterial = $role + [char]0 + $language + [char]0 + [string]$job.text
            $keyBytes = $hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($keyMaterial))
            $expectedId = ([BitConverter]::ToString($keyBytes)).Replace('-', '').ToLowerInvariant().Substring(0, 24)
            if ($job.id -cne $expectedId -or $job.output -cne "audio/generated/$language/$expectedId.wav" -or $seenJobs.ContainsKey($expectedId)) {
                throw "Duplicate or changed audio job; regenerate jobs."
            }
            $seenJobs[$expectedId] = $true
            Resolve-ProjectPath ([string]$job.output) | Out-Null
            if ($null -eq $job.references -or @($job.references).Count -eq 0) { throw "Audio job has no content reference." }
            foreach ($reference in $job.references) {
                if (-not $sourcePacks.ContainsKey([string]$reference.pack)) { throw "Unknown referenced content pack." }
                $pack = $sourcePacks[[string]$reference.pack]
                if ($pack.PSObject.Properties.Name -contains "poems" -or $pack.subject -match '^\u53e4\u8bd7$') {
                    throw "Poetry cloze must not enter the word TTS pipeline."
                }
                $manual = $pack.id -eq "g1-chinese-pinyin" -or $pack.name -match '\u62fc\u97f3'
                if ($manual -ne $job.requiresManualRecording) { throw "Pinyin preview jobs must retain their manual-review marker." }
                $item = $pack
                foreach ($part in $reference.location) {
                    if ($part -is [string]) { $item = $item.$part }
                    elseif (($part -is [int] -or $part -is [long]) -and $part -ge 0 -and $part -le [int]::MaxValue) {
                        $item = @($item)[[int]$part]
                    }
                    else { throw "Invalid item location in audio plan." }
                }
                if ($pack.id -cne $reference.packId -or $item.id -cne $reference.itemId -or
                    $item.speechText -cne $job.text -or $item.speechLang -cne $language) {
                    throw "Audio plan does not match its source item."
                }
            }
        }
    } finally { $hasher.Dispose() }
    $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo })
    $selection = @{}
    $languages = @($audioPlan.jobs | Select-Object -ExpandProperty lang -Unique)
    # Find every required voice before generating files; do not silently use another language.
    foreach ($language in $languages) {
        $requested = if ($language -eq "zh-CN") { $ChineseVoice } elseif ($language -eq "en-US") { $EnglishVoice } else { "" }
        $candidates = @($voices | Where-Object { $_.Culture.Name -ceq $language })
        if ($requested) { $candidates = @($candidates | Where-Object { $_.Name -ceq $requested }) }
        if ($candidates.Count -eq 0) {
            $available = ($voices | ForEach-Object { $_.Name + " [" + $_.Culture.Name + "]" }) -join "; "
            throw "Missing enabled desktop voice for $language. Available: $available"
        }
        $selection[$language] = $candidates[0].Name
        $synth.SelectVoice($selection[$language])
        if ($synth.Voice.Culture.Name -cne $language) { throw "The selected voice has an unexpected language: $language" }
    }
    $synth.Rate = 0
    $synth.Volume = 100
    $formatArguments = @(
        22050,
        [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
        [System.Speech.AudioFormat.AudioChannel]::Mono
    )
    $format = New-Object -TypeName System.Speech.AudioFormat.SpeechAudioFormatInfo -ArgumentList $formatArguments
    $processed = 0
    foreach ($job in $audioPlan.jobs) {
        $processed += 1
        $destination = Resolve-ProjectPath ([string]$job.output)
        if ((Test-Path -LiteralPath $destination) -and -not $Overwrite) {
            $records.Add([pscustomobject]@{ id = $job.id; status = "existing_requires_validation"; output = $job.output })
            continue
        }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        $temporary = $destination + "." + [Guid]::NewGuid().ToString("N") + ".generating.wav"
        try {
            $synth.SelectVoice($selection[[string]$job.lang])
            $synth.SetOutputToWaveFile($temporary, $format)
            # JSON text is a .NET string argument, never executable PowerShell
            # or SSML. Apostrophes and other punctuation need no shell escaping.
            $synth.Speak([string]$job.text)
            $synth.SetOutputToNull()
            if ((Get-Item -LiteralPath $temporary).Length -le 44) { throw "Empty waveform generated." }
            Move-Item -LiteralPath $temporary -Destination $destination -Force
            $status = if ($job.requiresManualRecording) {
                "generated_pinyin_preview_pending_teacher_review"
            } else {
                "generated_tts_preview_pending_teacher_review"
            }
            $records.Add([pscustomobject]@{
                id = $job.id
                status = $status
                output = $job.output
                voice = $selection[[string]$job.lang]
                requiresManualRecording = $job.requiresManualRecording
            })
        } catch {
            try { $synth.SetOutputToNull() } catch {}
            if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
            $records.Add([pscustomobject]@{ id = $job.id; status = "failed"; output = $job.output; error = $_.Exception.Message })
        }
        Write-Progress -Activity "Generating local speech candidates" -Status "$processed / $($audioPlan.jobs.Count)" -PercentComplete (100 * $processed / [Math]::Max(1, $audioPlan.jobs.Count))
    }
} catch {
    $fatalError = $_.Exception.Message
    throw
} finally {
    $synth.Dispose()
    $report = [ordered]@{ schemaVersion = 1; createdAt = [DateTime]::UtcNow.ToString('o'); fatalError = $fatalError; jobs = $records.ToArray() }
    $reportPath = $jobFilePath + ".generation-report.json"
    $utf8NoBom = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
    [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 12), $utf8NoBom)
}
$failed = @($records | Where-Object { $_.status -eq "failed" }).Count
$pinyin = @($records | Where-Object { $_.status -eq "generated_pinyin_preview_pending_teacher_review" }).Count
Write-Output "Generation finished. Failed: $failed. Pinyin previews pending teacher review: $pinyin."
Write-Output "Run prepare_offline_audio.py verify --require-complete before write-back or packaging."
if ($failed -gt 0) { exit 1 }
