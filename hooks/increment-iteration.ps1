# Increment Iteration Hook
$ErrorActionPreference = "Stop"
$DebugLog = Join-Path $HOME ".gemini/extensions/pickle-rick/debug.log"

function Log-Message([string]$msg) {
    Add-Content -Path $DebugLog -Value "[$((Get-Date).ToString('u'))] [Increment] $msg"
}

try { $Json = $input | Out-String | ConvertFrom-Json } 
catch { Write-Output '{"decision": "allow"}'; exit 0 }

$StateFile = $env:PICKLE_STATE_FILE
if (-not $StateFile) { $StateFile = Join-Path $HOME ".gemini/extensions/pickle-rick/state.json" }

if (-not (Test-Path $StateFile)) { Write-Output '{"decision": "allow"}'; exit 0 }

try { $State = Get-Content $StateFile -Raw | ConvertFrom-Json }
catch { Write-Output '{"decision": "allow"}'; exit 0 }

if (-not $State.active) { Write-Output '{"decision": "allow"}'; exit 0 }

# Context Check
if ($State.working_dir) {
    $Pwd = (Resolve-Path .).Path
    $SessionDir = (Resolve-Path $State.working_dir).Path
    if ($Pwd -ne $SessionDir) { Write-Output '{"decision": "allow"}'; exit 0 }
}

# Increment
$Iter = $State.iteration -as [int]
$State.iteration = $Iter + 1
Log-Message "Iteration: $Iter -> $($State.iteration)"

try { $State | ConvertTo-Json -Depth 10 | Set-Content $StateFile -Encoding UTF8 }
catch { Log-Message "Failed to update state" }

Write-Output '{"decision": "allow"}'