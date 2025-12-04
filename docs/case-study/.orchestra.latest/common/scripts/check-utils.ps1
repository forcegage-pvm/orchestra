# Orchestra Check Utilities
# Common functions for validation scripts

# ============================================================================
# GIT UTILITY FUNCTIONS
# ============================================================================

function Get-UncommittedFiles {
    <#
    .SYNOPSIS
    Returns a list of uncommitted files (staged + unstaged + untracked)
    #>
    $files = @()
    
    # Staged changes
    $staged = git diff --staged --name-only 2>$null
    if ($staged) { $files += $staged }
    
    # Unstaged changes
    $unstaged = git diff --name-only 2>$null
    if ($unstaged) { $files += $unstaged }
    
    # Untracked files
    $untracked = git ls-files --others --exclude-standard 2>$null
    if ($untracked) { $files += $untracked }
    
    return $files | Select-Object -Unique
}

function Get-CurrentBranch {
    <#
    .SYNOPSIS
    Returns the current git branch name
    #>
    $branch = git branch --show-current 2>$null
    if (-not $branch) {
        $branch = git rev-parse --abbrev-ref HEAD 2>$null
    }
    return $branch
}

function Get-ProgressTaskStatus {
    <#
    .SYNOPSIS
    Gets the status of a specific task from progress.yaml
    #>
    param(
        [string]$ProgressPath,
        [int]$TaskId
    )
    
    if (-not (Test-Path $ProgressPath)) {
        return "unknown"
    }
    
    $content = Get-Content $ProgressPath -Raw
    
    # Look for task entry in the tasks section
    # Pattern: N:\n    status: "completed"
    if ($content -match "(?m)^\s*$TaskId`:\s*\n\s*status:\s*[`"']?(\w+)[`"']?") {
        return $Matches[1]
    }
    
    # Fallback: task may not be in tasks section yet
    return "not-started"
}

function Write-CheckPass {
    <#
    .SYNOPSIS
    Write a passing check message (standalone, not using collector)
    #>
    param([string]$Message)
    Write-Host "  ✅ $Message" -ForegroundColor Green
}

# ============================================================================
# OUTPUT FORMATTING FUNCTIONS
# ============================================================================

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
        "run" { "🔄" }
        default { "•" }
    }
    $color = switch ($Status) {
        "pass" { "Green" }
        "fail" { "Red" }
        "warn" { "Yellow" }
        "info" { "Cyan" }
        "run" { "Magenta" }
        default { "White" }
    }
    Write-Host "$icon $Message" -ForegroundColor $color
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "───────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  $Title" -ForegroundColor White
    Write-Host "───────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
}

function Write-CheckWarning {
    param(
        [string]$Message,
        [string]$Suggestion = ""
    )
    Write-Host "  ⚠️ $Message" -ForegroundColor Yellow
    if ($Suggestion) {
        Write-Host "     Suggestion: $Suggestion" -ForegroundColor DarkGray
    }
}

function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-CurrentTaskId {
    $taskFile = Join-Path $env:HANDOVER_PATH "current-task.md"
    if (-not (Test-Path $taskFile)) {
        # Fallback to ORCHESTRA_HANDOVER if HANDOVER_PATH not set
        $taskFile = Join-Path $env:ORCHESTRA_HANDOVER "current-task.md"
    }
    if (-not (Test-Path $taskFile)) {
        return $env:CURRENT_TASK
    }
    $content = Get-Content $taskFile -Raw
    if ($content -match '# Task (\d+(?:\.\d+)?)') {
        return $Matches[1]
    }
    return $env:CURRENT_TASK
}

function Test-FileHasContent {
    param(
        [string]$Path,
        [int]$MinSize = 50
    )
    if (-not (Test-Path $Path)) {
        return $false
    }
    $file = Get-Item $Path
    return $file.Length -ge $MinSize
}

function Test-FileModified {
    param([string]$Path)
    # Check if file is in git changes
    $gitChanges = git diff --name-only HEAD 2>$null
    $stagedChanges = git diff --staged --name-only 2>$null
    $allChanges = @()
    if ($gitChanges) { $allChanges += $gitChanges }
    if ($stagedChanges) { $allChanges += $stagedChanges }
    
    # Normalize path for comparison
    $normalizedPath = $Path.Replace('\', '/').TrimStart('./')
    foreach ($change in $allChanges) {
        if ($change -like "*$normalizedPath*") {
            return $true
        }
    }
    return $false
}

function New-CheckCollector {
    return @{
        Passed   = 0
        Failed   = 0
        Warnings = 0
        Failures = @()
        All      = @()
    }
}

function Add-CheckResult {
    param(
        [hashtable]$Collector,
        [string]$Name,
        [bool]$Passed,
        [string]$Details = "",
        [string]$Fix = "",
        [string]$Location = ""
    )
    
    $result = @{
        Name     = $Name
        Passed   = $Passed
        Details  = $Details
        Fix      = $Fix
        Location = $Location
    }
    
    $Collector.All += $result
    
    if ($Passed) {
        $Collector.Passed++
        Write-Host "  ✅ $Name" -ForegroundColor Green
    }
    else {
        $Collector.Failed++
        $Collector.Failures += $result
        Write-Host "  ❌ $Name" -ForegroundColor Red
        if ($Details) {
            Write-Host "     └─ $Details" -ForegroundColor Yellow
        }
    }
}

function Get-CheckSummary {
    param([hashtable]$Collector)
    
    return @{
        AllPassed = ($Collector.Failed -eq 0)
        Passed    = $Collector.Passed
        Failed    = $Collector.Failed
        Failures  = $Collector.Failures
        Total     = $Collector.Passed + $Collector.Failed
    }
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
    }
    else {
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
        Write-Host " ❌ $FailMessage" -ForegroundColor Red
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
    }
    Write-Host ""
}

# Note: Export-ModuleMember is only used when this file is loaded as a module
# When sourced with dot-sourcing (. script.ps1), functions are already available
