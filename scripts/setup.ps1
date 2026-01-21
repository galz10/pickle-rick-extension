<#
.SYNOPSIS
    Pickle Rick Session Bootstrapper for PowerShell
.DESCRIPTION
    Initializes the recursive development environment on Windows.
#>
[CmdletBinding()]
Param(
    [Parameter(Position=0)]
    [string]$Task,

    [string]$MaxIterations,
    [string]$MaxTime,
    [string]$WorkerTimeout = "1200",
    [string]$CompletionPromise,
    
    [string]$ResumePath,
    [Switch]$Resume,
    [Switch]$Reset,
    [Switch]$Paused
)

$ErrorActionPreference = "Stop"

# -- Configuration --
# Use $HOME if available, otherwise UserProfile
$HomeDir = if ($env:HOME) { $env:HOME } else { $env:UserProfile }
$RootDir = Join-Path $HomeDir ".gemini\extensions\pickle-rick"
$SessionsRoot = Join-Path $RootDir "sessions"
$SessionsMap = Join-Path $RootDir "current_sessions.json"

# -- State Variables --
$LoopLimit = if ($MaxIterations) { [int]$MaxIterations } else { $null }
$TimeLimit = if ($MaxTime) { [int]$MaxTime } else { $null }
$WorkerTimeoutInt = [int]$WorkerTimeout
$PromiseToken = if ($CompletionPromise) { $CompletionPromise } else { $null }
# Epoch time
$CurrentEpoch = [int64][double]::Parse((Get-Date -UFormat %s))

# -- Helpers --
function Write-Die {
    param([string]$Message)
    Write-Error "❌ Error: $Message"
    exit 1
}

function Update-SessionMap {
    param([string]$Cwd, [string]$Path)
    
    if (-not (Test-Path $SessionsMap)) { "{}" | Out-File -FilePath $SessionsMap -Encoding utf8 }
    
    try {
        $MapContent = Get-Content $SessionsMap -Raw | ConvertFrom-Json
    } catch {
        $MapContent = [PSCustomObject]@{}
    }

    # Add or Update the property
    if ($MapContent.PSObject.Properties.Match($Cwd).Count -gt 0) {
        $MapContent.$Cwd = $Path
    } else {
        $MapContent | Add-Member -MemberType NoteProperty -Name $Cwd -Value $Path
    }

    $MapContent | ConvertTo-Json -Depth 5 | Out-File -FilePath $SessionsMap -Encoding utf8
}

# -- Logic --

if ($Resume) {
    # 1. Resolve Path
    $FullSessionPath = $null
    if ($ResumePath) {
        $FullSessionPath = $ResumePath
    } elseif (Test-Path $SessionsMap) {
        try {
            $MapContent = Get-Content $SessionsMap -Raw | ConvertFrom-Json
            if ($MapContent.PSObject.Properties.Match($PWD.Path).Count -gt 0) {
                $FullSessionPath = $MapContent.($PWD.Path)
            }
        } catch {
            Write-Warning "Could not parse session map."
        }
    }

    if (-not $FullSessionPath) {
        Write-Die "No active session found or provided."
    }

    # 2. Validate
    if (-not (Test-Path $FullSessionPath)) { Write-Die "Session directory not found: $FullSessionPath" }
    $StatePath = Join-Path $FullSessionPath "state.json"
    if (-not (Test-Path $StatePath)) { Write-Die "State file not found: $StatePath" }

    # 3. Reactivate & Update
    $State = Get-Content $StatePath -Raw | ConvertFrom-Json
    $State.active = $true
    
    if ($LoopLimit) { $State.max_iterations = $LoopLimit }
    if ($TimeLimit) { $State.max_time_minutes = $TimeLimit }
    if ($Reset) { 
        $State.iteration = 1 
        $State.start_time_epoch = $CurrentEpoch
    }
    
    $State | ConvertTo-Json -Depth 10 | Out-File -FilePath $StatePath -Encoding utf8
    
    # Refresh locals for display
    $LoopLimit = $State.max_iterations
    $TimeLimit = $State.max_time_minutes
    $CurrentIteration = $State.iteration
    $PromiseToken = if ($State.completion_promise) { $State.completion_promise } else { "null" }
    
    Update-SessionMap -Cwd $PWD.Path -Path $FullSessionPath

} else {
    # -- New Session --
    if (-not $Task) { Write-Die "No task specified." }
    
    if (-not $LoopLimit) { $LoopLimit = 5 }
    if (-not $TimeLimit) { $TimeLimit = 60 }
    $CurrentIteration = 1
    
    $Today = Get-Date -Format "yyyy-MM-dd"
    # Simple hash generation
    $Hash = -join ((48..57) + (97..102) | Get-Random -Count 8 | ForEach-Object {[char]$_})
    $SessionId = "${Today}-${Hash}"
    
    $FullSessionPath = Join-Path $SessionsRoot $SessionId
    $StatePath = Join-Path $FullSessionPath "state.json"
    
    if (-not (Test-Path $FullSessionPath)) {
        New-Item -Path $FullSessionPath -ItemType Directory | Out-Null
    }
    
    Update-SessionMap -Cwd $PWD.Path -Path $FullSessionPath
    
    $Timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $InitialActive = -not $Paused
    
    # Construct State Object
    $State = [PSCustomObject]@{
        active = $InitialActive
        working_dir = $PWD.Path
        step = "prd"
        iteration = 1
        max_iterations = $LoopLimit
        max_time_minutes = $TimeLimit
        worker_timeout_seconds = $WorkerTimeoutInt
        start_time_epoch = $CurrentEpoch
        completion_promise = $PromiseToken
        original_prompt = $Task
        current_ticket = $null
        history = @()
        started_at = $Timestamp
        session_dir = $FullSessionPath
    }
    
    $State | ConvertTo-Json -Depth 10 | Out-File -FilePath $StatePath -Encoding utf8
}

# -- Output --
$DisplayLimit = if ($LoopLimit -gt 0) { $LoopLimit } else { "∞" }
$DisplayPromise = if ($PromiseToken) { $PromiseToken } else { "None" }

Write-Host "🥒 Pickle Rick Activated!"
Write-Host ""
Write-Host ">> Loop Config:"
Write-Host "   Iteration: $CurrentIteration"
Write-Host "   Limit:     $DisplayLimit"
Write-Host "   Max Time:  ${TimeLimit}m"
Write-Host "   Worker TO: ${WorkerTimeoutInt}s"
Write-Host "   Promise:   $DisplayPromise"
Write-Host ""
Write-Host ">> Workspace:"
Write-Host "   Path:      $FullSessionPath"
Write-Host "   State:     $StatePath"
Write-Host ""
Write-Host ">> Directive:"
Write-Host "   $Task"
Write-Host ""
Write-Host "⚠️  WARNING: This loop will continue until the task is complete,"
Write-Host "    the iteration limit ($LoopLimit) is reached, the time limit (${TimeLimit}m) expires, or a promise is fulfilled."

if ($PromiseToken) {
    Write-Host ""
    Write-Host "⚠️  STRICT EXIT CONDITION ACTIVE"
    Write-Host "   You must output: <promise>$PromiseToken</promise>"
}
