$ErrorActionPreference = "Stop"
$StatePath = $env:PICKLE_STATE_FILE
if (-not $StatePath) { Write-Error "❌ PICKLE_STATE_FILE not set"; exit 1 }

$TaskStr = $args -join " "
$SessionDir = Split-Path $StatePath -Parent
if (-not (Test-Path $SessionDir)) { New-Item -ItemType Directory -Force -Path $SessionDir | Out-Null }

$State = @{
    active = $true
    working_dir = (Get-Location).Path
    worker = $true
    step = "research"
    iteration = 1
    max_iterations = 20
    max_time_minutes = 30
    start_time_epoch = [int64]([DateTimeOffset]::Now.ToUnixTimeSeconds())
    completion_promise = "I AM DONE"
    original_prompt = $TaskStr
    started_at = (Get-Date).ToString("o")
    session_dir = $SessionDir
}

$State | ConvertTo-Json -Depth 10 | Set-Content $StatePath -Encoding UTF8

Write-Host "🥒 Pickle Worker (Morty) Activated!"
Write-Host ">> Task: $TaskStr"
Write-Host "⚠️  Morty works until 'I AM DONE' or timeout."