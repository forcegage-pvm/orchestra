# Escalate Failure Script
# ========================
# Escalates a task failure to human supervisor.
# Used when max retries exceeded or task is blocked.
#
# Usage: .\.orchestra\orchestrator\scripts\escalate-failure.ps1 -TaskId <id> -Reason <reason>
#
# Reference: Orchestra Bible Section 8.5

param(
    [Parameter(Mandatory=$false)]
    [string]$TaskId,
    [string]$Reason = "Max retry attempts exceeded"
)

$ErrorActionPreference = "Stop"

# Load environment
$scriptRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. "$scriptRoot\common\scripts\set-env.ps1" 2>$null

Write-Host "`n"
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "║              ESCALATE FAILURE                                ║" -ForegroundColor Red
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Red
Write-Host ""

# Get task ID
if (-not $TaskId) {
    $TaskId = $env:CURRENT_TASK
}

Write-Host "  📋 Task ID: $TaskId" -ForegroundColor White
Write-Host "  📝 Reason:  $Reason" -ForegroundColor Yellow
Write-Host ""

# Create escalation record
$escalationDir = "$scriptRoot/orchestrator/results/escalations"
if (-not (Test-Path $escalationDir)) {
    New-Item -ItemType Directory -Path $escalationDir -Force | Out-Null
}

$taskIdClean = $TaskId -replace '\.', '-'
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$escalationPath = "$escalationDir/task-$taskIdClean-escalation-$timestamp.yaml"

$escalationContent = @"
# Task Escalation Record
# ======================

task_id: "$TaskId"
escalated_at: "$(Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")"
reason: "$Reason"
sprint: "$env:SPRINT_NAME"

# Escalation context
context:
  previous_attempts: 3
  last_feedback: "See feedback folder"
  current_state: "blocked"

# Human supervisor actions (See Bible Section 4.3.1):
#
# Option 1: Fix manually & complete
#   - Make code changes yourself
#   - Run verification
#   - Update progress.yaml: status: completed, completed_by: human
#
# Option 2: Modify task spec
#   - Edit manifest.yaml task definition
#   - Reset progress.yaml: status: pending, attempts: 0
#
# Option 3: Skip task
#   - Update progress.yaml: status: skipped, skip_reason: "..."
#
# Option 4: Abort sprint
#   - Update progress.yaml: status: aborted, abort_reason: "..."
#
# Option 5: Provide detailed clarification
#   - Create detailed feedback with more guidance
#   - Allow more attempts

status: "pending_human_action"
"@

Set-Content -Path $escalationPath -Value $escalationContent -Encoding UTF8

Write-Host "  🚨 ESCALATION CREATED" -ForegroundColor Red
Write-Host ""
Write-Host "  📁 File: $escalationPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ═══════════════════════════════════════════════════════════" -ForegroundColor Red
Write-Host "  HUMAN SUPERVISOR ACTION REQUIRED" -ForegroundColor Red
Write-Host "  ═══════════════════════════════════════════════════════════" -ForegroundColor Red
Write-Host ""
Write-Host "  Review the escalation file for options." -ForegroundColor White
Write-Host "  See Orchestra Bible Section 4.3.1 for intervention actions." -ForegroundColor Gray
Write-Host ""

# Update progress.yaml to mark task as escalated
# TODO: Implement progress update

exit 0
