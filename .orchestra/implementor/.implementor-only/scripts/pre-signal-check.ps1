# Implementor Pre-Signal Check
# ============================
# Run this BEFORE signaling completion to the orchestrator.
# Creates a verification artifact that the orchestrator checks.
#
# Usage: .\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1

$ErrorActionPreference = "Stop"

# Load environment
$orchestraRoot = (Get-Item "$PSScriptRoot\..\..\..").FullName
. "$orchestraRoot\common\scripts\set-env.ps1" 2>$null
. "$orchestraRoot\common\scripts\check-utils.ps1"

Write-OrchestraHeader "Implementor Pre-Signal Check"

$allPassed = $true
$results = @()

# Get current task ID
$taskId = Get-CurrentTaskId
if (-not $taskId) {
    $taskId = $env:CURRENT_TASK
}
Write-Host "  Checking deliverables for Task $taskId" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# CHECK 1: TypeScript Compilation / Type Check
# ============================================================================

Write-Section "Type Checking"
Write-OrchestraStep "Running TypeScript type check..." "run"

try {
    $typeCheckCmd = if ($env:TYPECHECK_COMMAND) { $env:TYPECHECK_COMMAND } else { "npx tsc --noEmit" }
    $typeCheckResult = Invoke-Expression "$typeCheckCmd 2>&1" | Out-String
    if ($LASTEXITCODE -eq 0) {
        Write-OrchestraStep "TypeScript compiles without errors" "pass"
        $results += @{ check = "typecheck"; status = "PASS" }
    } else {
        Write-OrchestraStep "TypeScript compilation errors found" "fail"
        Write-Host $typeCheckResult -ForegroundColor Red
        $results += @{ check = "typecheck"; status = "FAIL"; output = $typeCheckResult }
        $allPassed = $false
    }
} catch {
    Write-OrchestraStep "TypeScript check failed: $_" "fail"
    $results += @{ check = "typecheck"; status = "FAIL"; output = $_.ToString() }
    $allPassed = $false
}

# ============================================================================
# CHECK 2: Build (optional - may fail due to Dropbox locks)
# ============================================================================

Write-Section "Build Check"
Write-OrchestraStep "Running build..." "run"

try {
    $buildCmd = if ($env:BUILD_COMMAND) { $env:BUILD_COMMAND } else { "npm run build" }
    $buildResult = Invoke-Expression "$buildCmd 2>&1" | Out-String
    if ($LASTEXITCODE -eq 0) {
        Write-OrchestraStep "Build successful" "pass"
        $results += @{ check = "build"; status = "PASS" }
    } else {
        # Check if it's a Dropbox EBUSY error (false failure)
        if ($buildResult -match "EBUSY|resource busy|locked") {
            Write-OrchestraStep "Build failed due to Dropbox file lock (not a code issue)" "warn"
            $results += @{ check = "build"; status = "WARN"; output = "Dropbox EBUSY - not a code issue" }
        } else {
            Write-OrchestraStep "Build failed" "fail"
            Write-Host $buildResult -ForegroundColor Red
            $results += @{ check = "build"; status = "FAIL"; output = $buildResult }
            $allPassed = $false
        }
    }
} catch {
    Write-OrchestraStep "Build check failed: $_" "fail"
    $results += @{ check = "build"; status = "FAIL"; output = $_.ToString() }
    $allPassed = $false
}

# ============================================================================
# CHECK 3: Tests Pass
# ============================================================================

Write-Section "Test Execution"
Write-OrchestraStep "Running tests..." "run"

try {
    $testCmd = if ($env:TEST_COMMAND) { $env:TEST_COMMAND } else { "npm test" }
    $testResult = Invoke-Expression "$testCmd 2>&1" | Out-String
    if ($LASTEXITCODE -eq 0) {
        # Try to extract test count
        $testCount = "?"
        if ($testResult -match "(\d+)\s+pass") {
            $testCount = $Matches[1]
        } elseif ($testResult -match "Tests:\s*(\d+)\s+passed") {
            $testCount = $Matches[1]
        }
        Write-OrchestraStep "All tests pass ($testCount tests)" "pass"
        $results += @{ check = "tests"; status = "PASS"; count = $testCount }
    } else {
        Write-OrchestraStep "Tests failed" "fail"
        Write-Host $testResult -ForegroundColor Red
        $results += @{ check = "tests"; status = "FAIL"; output = $testResult }
        $allPassed = $false
    }
} catch {
    Write-OrchestraStep "Test execution failed: $_" "fail"
    $results += @{ check = "tests"; status = "FAIL"; output = $_.ToString() }
    $allPassed = $false
}

# ============================================================================
# CHECK 4: Lint (if configured)
# ============================================================================

$packageJsonPath = Join-Path (Get-Location) "package.json"
$hasLint = $false
if (Test-Path $packageJsonPath) {
    $packageJson = Get-Content $packageJsonPath -Raw
    $hasLint = $packageJson -match '"lint":'
}

if ($hasLint) {
    Write-Section "Linting"
    Write-OrchestraStep "Running linter..." "run"
    
    try {
        $lintCmd = if ($env:LINT_COMMAND) { $env:LINT_COMMAND } else { "npm run lint" }
        $lintResult = Invoke-Expression "$lintCmd 2>&1" | Out-String
        if ($LASTEXITCODE -eq 0) {
            Write-OrchestraStep "Linting passes" "pass"
            $results += @{ check = "lint"; status = "PASS" }
        } else {
            Write-OrchestraStep "Linting failed" "fail"
            Write-Host $lintResult -ForegroundColor Red
            $results += @{ check = "lint"; status = "FAIL"; output = $lintResult }
            $allPassed = $false
        }
    } catch {
        Write-OrchestraStep "Lint check failed: $_" "fail"
        $results += @{ check = "lint"; status = "FAIL"; output = $_.ToString() }
        $allPassed = $false
    }
} else {
    Write-OrchestraStep "No lint script in package.json, skipping" "info"
    $results += @{ check = "lint"; status = "SKIP" }
}

# ============================================================================
# CHECK 5: Git Status
# ============================================================================

Write-Section "Git Status"
Write-OrchestraStep "Checking git status..." "run"

$stagedChanges = git diff --staged --name-only 2>$null
$unstagedChanges = git diff --name-only 2>$null
$untrackedFiles = git ls-files --others --exclude-standard 2>$null

$hasChanges = ($stagedChanges -or $unstagedChanges -or $untrackedFiles)

if ($hasChanges) {
    if ($stagedChanges) {
        Write-Host "  Staged: $($stagedChanges.Count) file(s)" -ForegroundColor Green
    }
    if ($unstagedChanges) {
        Write-Host "  Unstaged: $($unstagedChanges.Count) file(s)" -ForegroundColor Yellow
        Write-CheckWarning "Some changes not staged" "Run: git add -A"
    }
    if ($untrackedFiles) {
        Write-Host "  Untracked: $($untrackedFiles.Count) file(s)" -ForegroundColor Yellow
    }
    $results += @{ check = "git"; status = "PASS" }
} else {
    Write-OrchestraStep "No changes detected" "warn"
    $results += @{ check = "git"; status = "WARN"; output = "No changes" }
}

# ============================================================================
# CREATE ARTIFACT
# ============================================================================

# Ensure artifact directory exists
$artifactDir = "$orchestraRoot/implementor/artifacts/pre-signal"
if (-not (Test-Path $artifactDir)) {
    New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
}

# Generate artifact filename (using task-X-timestamp.txt format for compatibility)
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$taskIdClean = $taskId -replace '\.', '-'  # Replace dots with dashes
$artifactPath = "$artifactDir/task-$taskIdClean-$timestamp.txt"

# Create artifact content
$status = if ($allPassed) { "PASSED" } else { "FAILED" }
$checksContent = ($results | ForEach-Object {
    "  - $($_.check): $($_.status)"
}) -join "`n"

$artifactContent = @"
# Pre-Signal Check Artifact
# =========================
# This file proves the implementor ran pre-signal-check.ps1

task_id: $taskId
status: $status
timestamp: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
checks_passed: $(($results | Where-Object { $_.status -eq "PASS" }).Count)
checks_failed: $(($results | Where-Object { $_.status -eq "FAIL" }).Count)

checks:
$checksContent

# Orchestrator: Verify this file exists before accepting completion
"@

Set-Content -Path $artifactPath -Value $artifactContent -Encoding UTF8

Write-Host ""
Write-Host "  📝 Artifact written: $artifactPath" -ForegroundColor Cyan

# ============================================================================
# SUMMARY
# ============================================================================

Write-OrchestraResult -Success $allPassed -SuccessMessage "PRE-SIGNAL CHECK PASSED - Ready to signal completion" -FailMessage "PRE-SIGNAL CHECK FAILED - Fix issues before signaling"

if ($allPassed) {
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Stage all changes: git add -A" -ForegroundColor White
    Write-Host "  2. Write to completion-signal.md" -ForegroundColor White
    Write-Host "  3. Say 'ready for review'" -ForegroundColor White
    exit 0
} else {
    Write-Host "Fix the issues above before signaling completion." -ForegroundColor Yellow
    exit 1
}
