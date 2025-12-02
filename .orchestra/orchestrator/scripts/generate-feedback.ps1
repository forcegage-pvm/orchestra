# Generate Feedback Script
# =========================
# Generates feedback document for failed verification.
# Creates actionable guidance WITHOUT revealing verification criteria.
#
# Usage: .\.orchestra\orchestrator\scripts\generate-feedback.ps1 -TaskId <id>
#
# Reference: Orchestra Bible Section 8.5

param(
    [Parameter(Mandatory=$false)]
    [string]$TaskId,
    [string[]]$Issues = @(),
    [string[]]$Worked = @()
)

$ErrorActionPreference = "Stop"

# Load environment
$scriptRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. "$scriptRoot\common\scripts\set-env.ps1" 2>$null

Write-Host "`n"
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║              GENERATE FEEDBACK                               ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

# Get task ID
if (-not $TaskId) {
    $TaskId = $env:CURRENT_TASK
}

Write-Host "  📋 Task ID: $TaskId" -ForegroundColor White

# Get attempt count from progress
$attemptCount = 1
if (Test-Path $env:PROGRESS_PATH) {
    $progressContent = Get-Content $env:PROGRESS_PATH -Raw
    if ($progressContent -match "(?s)$TaskId[\s\S]*?attempts:\s*(\d+)") {
        $attemptCount = [int]$Matches[1] + 1
    }
}

Write-Host "  📊 Attempt: $attemptCount of 3" -ForegroundColor $(if ($attemptCount -ge 3) { "Red" } else { "Yellow" })
Write-Host ""

# Create feedback directory
$feedbackDir = "$scriptRoot/implementor/feedback"
if (-not (Test-Path $feedbackDir)) {
    New-Item -ItemType Directory -Path $feedbackDir -Force | Out-Null
}

$taskIdClean = $TaskId -replace '\.', '-'
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$feedbackPath = "$feedbackDir/task-$taskIdClean-feedback-attempt$attemptCount.md"

# Read template
$templatePath = "$scriptRoot/common/templates/feedback-template.md"
if (Test-Path $templatePath) {
    $template = Get-Content $templatePath -Raw
} else {
    $template = @"
# Feedback: Task $TaskId - Attempt $attemptCount

## Summary
[Verification did not pass. See issues below.]

## What Went Wrong
[Issues to address]

## What Worked
[Positive aspects]

## Next Steps
[Actions to take]
"@
}

# Substitute placeholders
$feedbackContent = $template `
    -replace '\[Task ID\]', $TaskId `
    -replace '\[task-id\]', $TaskId `
    -replace '\[N\]', $attemptCount `
    -replace '\[sprint-id\]', $env:SPRINT_NAME `
    -replace '\[ISO-8601 timestamp\]', (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")

Set-Content -Path $feedbackPath -Value $feedbackContent -Encoding UTF8

Write-Host "  📝 Feedback template created: $feedbackPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ⚠️  MANUAL STEP REQUIRED:" -ForegroundColor Yellow
Write-Host "     1. Open the feedback file" -ForegroundColor White
Write-Host "     2. Fill in the issues WITHOUT revealing verification criteria" -ForegroundColor White
Write-Host "     3. Add guidance on what to fix" -ForegroundColor White
Write-Host "     4. Notify implementor to retry" -ForegroundColor White
Write-Host ""

# Update progress.yaml attempt count
# TODO: Implement progress update

if ($attemptCount -ge 3) {
    Write-Host "  🚨 MAX ATTEMPTS REACHED" -ForegroundColor Red
    Write-Host "     Consider escalating or providing more specific guidance." -ForegroundColor Yellow
    Write-Host "     Run: escalate-failure.ps1 -TaskId $TaskId" -ForegroundColor Gray
}

exit 0
