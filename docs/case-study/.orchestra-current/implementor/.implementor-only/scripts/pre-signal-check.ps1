# Implementor Pre-Signal Check
# Run this BEFORE signaling completion
# Creates a verification artifact that the orchestrator checks

# Load environment
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path (Split-Path (Split-Path (Split-Path $scriptDir -Parent) -Parent) -Parent) "common\scripts\set-env.ps1")
. (Join-Path $env:ORCHESTRA_COMMON "scripts\check-utils.ps1")

Write-OrchestraHeader "Pre-Signal Check"

$allPassed = $true
$results = @()

# Check 1: TypeScript compiles
Write-OrchestraStep "Checking TypeScript compilation..." "run"
$buildResult = npm run build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-OrchestraStep "TypeScript builds successfully" "pass"
    $results += @{ check = "build"; status = "PASS" }
} else {
    Write-OrchestraStep "TypeScript build failed" "fail"
    Write-Host $buildResult -ForegroundColor Red
    $results += @{ check = "build"; status = "FAIL"; output = $buildResult }
    $allPassed = $false
}

# Check 2: Tests pass
Write-OrchestraStep "Running tests..." "run"
$testResult = npm test 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-OrchestraStep "All tests pass" "pass"
    $results += @{ check = "tests"; status = "PASS" }
} else {
    Write-OrchestraStep "Tests failed" "fail"
    Write-Host $testResult -ForegroundColor Red
    $results += @{ check = "tests"; status = "FAIL"; output = $testResult }
    $allPassed = $false
}

# Check 3: Lint passes (if eslint is configured)
if (Test-Path (Join-Path $env:ORCHESTRA_ROOT ".eslintrc*") -or (Get-Content (Join-Path $env:ORCHESTRA_ROOT "package.json") -Raw | Select-String "eslint")) {
    Write-OrchestraStep "Running linter..." "run"
    $lintResult = npm run lint 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-OrchestraStep "Linting passes" "pass"
        $results += @{ check = "lint"; status = "PASS" }
    } else {
        Write-OrchestraStep "Linting failed" "fail"
        Write-Host $lintResult -ForegroundColor Red
        $results += @{ check = "lint"; status = "FAIL"; output = $lintResult }
        $allPassed = $false
    }
} else {
    Write-OrchestraStep "No linter configured, skipping" "info"
    $results += @{ check = "lint"; status = "SKIP" }
}

# Check 4: Changes are staged
Write-OrchestraStep "Checking git status..." "run"
$gitStatus = git status --porcelain
if ($gitStatus) {
    $unstagedCount = ($gitStatus | Where-Object { $_ -match '^\s*[MADRCU\?]' }).Count
    if ($unstagedCount -gt 0) {
        Write-OrchestraStep "Unstaged changes detected - run 'git add .'" "warn"
        $results += @{ check = "git"; status = "WARN"; output = "Unstaged changes" }
    } else {
        Write-OrchestraStep "All changes are staged" "pass"
        $results += @{ check = "git"; status = "PASS" }
    }
} else {
    Write-OrchestraStep "No changes detected" "info"
    $results += @{ check = "git"; status = "INFO" }
}

# Create verification artifact
$artifactDir = Join-Path $env:ORCHESTRA_IMPLEMENTOR "artifacts\pre-signal"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$taskId = Get-CurrentTaskId
$artifactFile = Join-Path $artifactDir "pre-signal-$taskId-$timestamp.json"

$artifact = @{
    task_id = $taskId
    timestamp = (Get-Date -Format "o")
    status = if ($allPassed) { "PASSED" } else { "FAILED" }
    checks = $results
}

$artifact | ConvertTo-Json -Depth 10 | Out-File $artifactFile -Encoding UTF8

Write-Host ""
Write-Host "Artifact created: $artifactFile" -ForegroundColor Cyan

Write-OrchestraResult -Success $allPassed -SuccessMessage "All pre-signal checks passed!" -FailMessage "Fix issues before signaling completion"

if (-not $allPassed) {
    exit 1
}
