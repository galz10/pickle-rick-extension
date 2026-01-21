$ScriptDir = $PSScriptRoot
$DetectScript = Join-Path $ScriptDir "detect_python.ps1"

if (-not (Test-Path $DetectScript)) {
    Write-Error "Error: detect_python.ps1 not found at $DetectScript"
    exit 1
}

$PythonExe = & $DetectScript
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($PythonExe)) {
    Write-Error "Error: Failed to detect Python 3."
    exit 1
}

& $PythonExe $args
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
