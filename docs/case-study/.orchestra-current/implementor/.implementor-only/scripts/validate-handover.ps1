# Implementor Handover Validation
# Run this BEFORE starting work to verify the handover is complete

# Load environment
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path (Split-Path (Split-Path (Split-Path $scriptDir -Parent) -Parent) -Parent) "common\scripts\set-env.ps1")
. (Join-Path $env:ORCHESTRA_COMMON "scripts\check-utils.ps1")

Write-OrchestraHeader "Handover Validation"

$allPassed = $true

# Check 1: current-task.md exists
$taskFile = Join-Path $env:ORCHESTRA_HANDOVER "current-task.md"
if (Test-Path $taskFile) {
    Write-OrchestraStep "current-task.md exists" "pass"
} else {
    Write-OrchestraStep "current-task.md is MISSING" "fail"
    $allPassed = $false
}

# Check 2: task-context.md exists
$contextFile = Join-Path $env:ORCHESTRA_HANDOVER "task-context.md"
if (Test-Path $contextFile) {
    Write-OrchestraStep "task-context.md exists" "pass"
} else {
    Write-OrchestraStep "task-context.md is MISSING" "fail"
    $allPassed = $false
}

# Check 3: Task ID is valid
$taskId = Get-CurrentTaskId
if ($taskId) {
    Write-OrchestraStep "Task ID found: $taskId" "pass"
} else {
    Write-OrchestraStep "Could not parse Task ID from current-task.md" "fail"
    $allPassed = $false
}

# Check 4: Task has acceptance criteria
$taskContent = Get-Content $taskFile -Raw -ErrorAction SilentlyContinue
if ($taskContent -match '## Acceptance Criteria') {
    Write-OrchestraStep "Acceptance criteria section found" "pass"
} else {
    Write-OrchestraStep "Missing acceptance criteria section" "fail"
    $allPassed = $false
}

# Check 5: Spec file referenced and exists
if ($taskContent -match '`([^`]+\.md)`') {
    $specFile = $Matches[1]
    $specPath = Join-Path $env:ORCHESTRA_ROOT $specFile
    if (Test-Path $specPath) {
        Write-OrchestraStep "Spec file exists: $specFile" "pass"
    } else {
        Write-OrchestraStep "Spec file NOT FOUND: $specFile" "warn"
    }
} else {
    Write-OrchestraStep "No spec file reference found" "info"
}

Write-OrchestraResult -Success $allPassed -SuccessMessage "Handover is valid - proceed with implementation" -FailMessage "Handover is incomplete - notify orchestrator"

if (-not $allPassed) {
    Write-Host "Write the failure details to completion-signal.md and say 'Task validation failed'" -ForegroundColor Yellow
    exit 1
}
