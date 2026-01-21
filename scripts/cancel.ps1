# Cancel Script
$ErrorActionPreference = "Stop"

# Resolve Session Dir
$GetSession = Join-Path $PSScriptRoot "get_session.ps1"
try { $SessionDir = & $GetSession } catch { $SessionDir = $null }

if (-not $SessionDir) { Write-Error "❌ No active session found."; exit 1 }

$StateFile = Join-Path $SessionDir "state.json"
if (-not (Test-Path $StateFile)) { Write-Error "❌ State file missing: $StateFile"; exit 1 }

try { $State = Get-Content $StateFile -Raw | ConvertFrom-Json }
catch { Write-Error "❌ Invalid state file"; exit 1 }

# Check CWD alignment
if ($State.working_dir) {
    $SessionPath = (Resolve-Path $State.working_dir -ErrorAction SilentlyContinue).Path
    if ((Resolve-Path .).Path -ne $SessionPath) {
        Write-Error "❌ Wrong directory. Active session is in $($State.working_dir)."
        exit 1
    }
}

if ($State.active) {
    $State.active = $false
    $State | ConvertTo-Json -Depth 10 | Set-Content $StateFile
    Write-Host "✅ Pickle Rick cancelled."
} else {
    Write-Host "⚠️  Already cancelled."
}