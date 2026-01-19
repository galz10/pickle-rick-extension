param ([string]$TargetDir = (Get-Location).Path)
$ErrorActionPreference = 'Stop'
$MapFile = Join-Path $HOME ".gemini/extensions/pickle-rick/current_sessions.json"

if (-not (Test-Path $MapFile)) { exit 1 }

try {
    $Map = Get-Content $MapFile -Raw | ConvertFrom-Json -AsHashtable
    if ($Map.ContainsKey($TargetDir)) { Write-Output $Map[$TargetDir] }
    else { exit 1 }
} catch { exit 1 }