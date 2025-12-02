# Gate Check Script
# ==================
# Runs basic verification gates before hidden verification.
# Checks: artifacts exist, builds succeed, tests pass.
#
# Usage: .\.orchestra\orchestrator\scripts\gate-check.ps1 -TaskId <id>
#
# Reference: Orchestra Bible Section 8.4

param(
    [Parameter(Mandatory = $false)]
    [string]$TaskId
)

$ErrorActionPreference = "Stop"

# Load environment
$scriptRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. "$scriptRoot\common\scripts\set-env.ps1" 2>$null
. "$scriptRoot\common\scripts\check-utils.ps1"

Write-Host "`n"
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║              GATE CHECK                                      ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# Get task ID
if (-not $TaskId) {
    $TaskId = $env:CURRENT_TASK
}

Write-Host "  📋 Task ID: $TaskId" -ForegroundColor White
Write-Host ""

$checks = New-CheckCollector

# ============================================================================
# GATE 1: Signal File Exists
# ============================================================================

Write-Section "Signal Verification"

$signalDir = "$scriptRoot/implementor/signals"
$taskIdClean = $TaskId -replace '\.', '-'
$signals = Get-ChildItem -Path $signalDir -Filter "task-$taskIdClean-signal-*.yaml" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending

# Also check for markdown completion signal as fallback
$handoverDir = "$scriptRoot/handover"
$completionSignalPath = "$handoverDir/completion-signal.md"
$hasMarkdownSignal = $false

if (Test-Path $completionSignalPath) {
    $signalContent = Get-Content $completionSignalPath -Raw
    # Check if status is COMPLETE and task ID matches
    if ($signalContent -match 'Status[:\s]+COMPLETE' -and $signalContent -match "Task ID[:\s#]*$TaskId") {
        $hasMarkdownSignal = $true
    }
}

if ($signals) {
    Add-CheckResult $checks "Signal file exists" $true $signals[0].Name
}
elseif ($hasMarkdownSignal) {
    Add-CheckResult $checks "Signal file exists" $true "completion-signal.md (markdown fallback)"
}
else {
    Add-CheckResult $checks "Signal file exists" $false `
        "No signal found for task $TaskId" `
        "Implementor must run signal-complete.ps1" `
        $signalDir
}

# ============================================================================
# GATE 2: Pre-Signal Artifact Exists
# ============================================================================

Write-Section "Pre-Signal Artifact"

$artifactDir = "$scriptRoot/implementor/artifacts/pre-signal"
$artifacts = Get-ChildItem -Path $artifactDir -Filter "task-$taskIdClean-*.txt" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending

if ($artifacts) {
    $artifactContent = Get-Content $artifacts[0].FullName -Raw
    $passed = $artifactContent -match 'status:\s*PASSED'
    Add-CheckResult $checks "Pre-signal check passed" $passed `
    $(if ($passed) { $artifacts[0].Name } else { "Pre-signal check failed" }) `
        "Implementor must fix issues and re-run pre-signal-check.ps1"
}
else {
    Add-CheckResult $checks "Pre-signal artifact exists" $false `
        "No pre-signal artifact found" `
        "Implementor should run pre-signal-check.ps1 before signaling" `
        $artifactDir
}

# ============================================================================
# GATE 3: Build Succeeds
# ============================================================================

Write-Section "Build Check"

try {
    $buildResult = Invoke-Expression "$env:BUILD_COMMAND 2>&1" | Out-String
    $buildSuccess = $LASTEXITCODE -eq 0
    
    # Check for Dropbox EBUSY (false negative)
    if (-not $buildSuccess -and $buildResult -match "EBUSY|resource busy") {
        Write-Host "  ⚠️ Build failed due to Dropbox lock (not a code issue)" -ForegroundColor Yellow
        $buildSuccess = $true
    }
    
    Add-CheckResult $checks "Build succeeds" $buildSuccess `
    $(if ($buildSuccess) { "Build completed" } else { "Build failed" }) `
        "Fix build errors before verification"
}
catch {
    Add-CheckResult $checks "Build succeeds" $false `
        "Build command failed: $_" `
        "Check $env:BUILD_COMMAND"
}

# ============================================================================
# GATE 4: Tests Pass
# ============================================================================

Write-Section "Test Check"

try {
    $testResult = Invoke-Expression "$env:TEST_COMMAND 2>&1" | Out-String
    $testSuccess = $LASTEXITCODE -eq 0
    
    Add-CheckResult $checks "Tests pass" $testSuccess `
    $(if ($testSuccess) { "All tests passed" } else { "Tests failed" }) `
        "Fix failing tests before verification"
}
catch {
    Add-CheckResult $checks "Tests pass" $false `
        "Test command failed: $_" `
        "Check $env:TEST_COMMAND"
}

# ============================================================================
# GATE 5: TypeScript Compiles
# ============================================================================

Write-Section "Type Check"

try {
    $typeResult = Invoke-Expression "$env:TYPECHECK_COMMAND 2>&1" | Out-String
    $typeSuccess = $LASTEXITCODE -eq 0
    
    Add-CheckResult $checks "TypeScript compiles" $typeSuccess `
    $(if ($typeSuccess) { "No type errors" } else { "Type errors found" }) `
        "Fix TypeScript errors before verification"
}
catch {
    Add-CheckResult $checks "TypeScript compiles" $false `
        "Type check failed: $_" `
        "Check $env:TYPECHECK_COMMAND"
}

# ============================================================================
# SUMMARY
# ============================================================================

$summary = Get-CheckSummary $checks

Write-Host "`n"
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta

if ($summary.AllPassed) {
    Write-Host "✅ ALL GATES PASSED - Ready for hidden verification" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
    Write-Host "`nNext: Run verification-audit.ps1 -TaskId $TaskId" -ForegroundColor Cyan
    exit 0
}
else {
    Write-Host "❌ GATE CHECK FAILED - $($summary.Failed) gate(s) did not pass" -ForegroundColor Red
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
    
    foreach ($failure in $checks.Failures) {
        Write-Host "`n   Check:   $($failure.Name)" -ForegroundColor Red
        Write-Host "   Problem: $($failure.Details)" -ForegroundColor Yellow
        Write-Host "   Fix:     $($failure.Fix)" -ForegroundColor Green
    }
    
    exit 1
}
