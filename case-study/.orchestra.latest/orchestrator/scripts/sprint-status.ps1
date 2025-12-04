# Sprint Status Script
# =====================
# Displays current sprint status, task progress, and health indicators.
#
# Usage: .\.orchestra\orchestrator\scripts\sprint-status.ps1
#        .\.orchestra\orchestrator\scripts\sprint-status.ps1 -Json
#
# Reference: Orchestra Bible Section 8.1

param(
    [switch]$Json,      # Output as JSON
    [switch]$Verbose    # Show detailed task info
)

$ErrorActionPreference = "Stop"

# Load environment
$scriptRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. "$scriptRoot\common\scripts\set-env.ps1" 2>$null

if (-not $Json) {
    Write-Host "`n"
    Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║              SPRINT STATUS                                   ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

# Read progress.yaml
if (-not (Test-Path $env:PROGRESS_PATH)) {
    if ($Json) {
        Write-Output '{"error": "progress.yaml not found", "initialized": false}'
    } else {
        Write-Host "❌ Sprint not initialized (progress.yaml not found)" -ForegroundColor Red
    }
    exit 1
}

$progressContent = Get-Content $env:PROGRESS_PATH -Raw

# Parse progress data
$sprintName = if ($progressContent -match 'sprint:\s*"?([^"\n]+)"?') { $Matches[1] } else { "unknown" }
$status = if ($progressContent -match 'status:\s*"?([^"\n]+)"?') { $Matches[1] } else { "unknown" }
$currentTask = if ($progressContent -match 'current_task:\s*(\d+)') { [int]$Matches[1] } else { 0 }

# Parse summary
$total = if ($progressContent -match 'total:\s*(\d+)') { [int]$Matches[1] } else { 0 }
$completed = if ($progressContent -match 'completed:\s*(\d+)') { [int]$Matches[1] } else { 0 }
$inProgress = if ($progressContent -match 'in_progress:\s*(\d+)') { [int]$Matches[1] } else { 0 }
$pending = if ($progressContent -match 'pending:\s*(\d+)') { [int]$Matches[1] } else { 0 }
$failed = if ($progressContent -match 'failed:\s*(\d+)') { [int]$Matches[1] } else { 0 }

if ($Json) {
    $output = @{
        sprint = $sprintName
        status = $status
        current_task = $currentTask
        summary = @{
            total = $total
            completed = $completed
            in_progress = $inProgress
            pending = $pending
            failed = $failed
        }
        progress_percent = if ($total -gt 0) { [math]::Round(($completed / $total) * 100, 1) } else { 0 }
    }
    Write-Output ($output | ConvertTo-Json -Depth 3)
} else {
    Write-Host "  Sprint:       $sprintName" -ForegroundColor White
    Write-Host "  Status:       $status" -ForegroundColor $(if ($status -eq "in-progress") { "Green" } else { "Yellow" })
    Write-Host "  Current Task: $currentTask" -ForegroundColor Green
    Write-Host ""
    
    # Progress bar
    $progressPercent = if ($total -gt 0) { [math]::Round(($completed / $total) * 100) } else { 0 }
    $barWidth = 40
    $filledWidth = [math]::Round(($progressPercent / 100) * $barWidth)
    $emptyWidth = $barWidth - $filledWidth
    $bar = ("█" * $filledWidth) + ("░" * $emptyWidth)
    
    Write-Host "  Progress: [$bar] $progressPercent%" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  ✅ Completed:   $completed" -ForegroundColor Green
    Write-Host "  🔄 In Progress: $inProgress" -ForegroundColor Yellow
    Write-Host "  ⏳ Pending:     $pending" -ForegroundColor Gray
    if ($failed -gt 0) {
        Write-Host "  ❌ Failed:      $failed" -ForegroundColor Red
    }
    Write-Host ""
}

exit 0
