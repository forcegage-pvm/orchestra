# Orchestra Check Utilities
# Common functions for validation scripts

function Write-OrchestraHeader {
    param([string]$Title)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host " $Title" -ForegroundColor White
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-OrchestraStep {
    param(
        [string]$Message,
        [string]$Status = "info"
    )
    $icon = switch ($Status) {
        "pass" { "✅" }
        "fail" { "❌" }
        "warn" { "⚠️" }
        "info" { "📋" }
        "run"  { "🔄" }
        default { "•" }
    }
    $color = switch ($Status) {
        "pass" { "Green" }
        "fail" { "Red" }
        "warn" { "Yellow" }
        "info" { "Cyan" }
        "run"  { "Magenta" }
        default { "White" }
    }
    Write-Host "$icon $Message" -ForegroundColor $color
}

function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-CurrentTaskId {
    $taskFile = Join-Path $env:ORCHESTRA_HANDOVER "current-task.md"
    if (-not (Test-Path $taskFile)) {
        return $null
    }
    $content = Get-Content $taskFile -Raw
    if ($content -match '# Task (\d+\.\d+)') {
        return $Matches[1]
    }
    return $null
}

function Write-OrchestraResult {
    param(
        [bool]$Success,
        [string]$SuccessMessage = "All checks passed!",
        [string]$FailMessage = "Some checks failed."
    )
    Write-Host ""
    if ($Success) {
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
        Write-Host " ✅ $SuccessMessage" -ForegroundColor Green
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    } else {
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
        Write-Host " ❌ $FailMessage" -ForegroundColor Red
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
    }
    Write-Host ""
}

# Export functions
Export-ModuleMember -Function * -ErrorAction SilentlyContinue
