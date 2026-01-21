# Try 'py' launcher first (most reliable on Windows)
if (Get-Command "py" -ErrorAction SilentlyContinue) {
    try {
        $path = py -3 -c "import sys; print(sys.executable)"
        if ($LASTEXITCODE -eq 0 -and !([string]::IsNullOrWhiteSpace($path))) {
            Write-Output $path.Trim()
            exit 0
        }
    } catch {}
}

# Try 'python3'
if (Get-Command "python3" -ErrorAction SilentlyContinue) {
    $ver = python3 -c "import sys; print(sys.version_info.major)"
    if ($ver -eq "3") {
        Write-Output (Get-Command "python3").Source
        exit 0
    }
}

# Try 'python'
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    $ver = python -c "import sys; print(sys.version_info.major)"
    if ($ver -eq "3") {
        Write-Output (Get-Command "python").Source
        exit 0
    }
}

Write-Error "Error: Python 3 not found."
exit 1
