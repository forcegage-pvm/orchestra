# Environment Check Script
# =========================
# Validates the Orchestra environment is correctly configured.
# Checks: paths, scripts, dependencies, permissions.
#
# Usage: .\.orchestra\common\scripts\environment-check.ps1
#
# Reference: Orchestra Bible Section 8.6

param(
    [switch]$Fix  # Attempt to fix issues
)

$ErrorActionPreference = "Stop"

Write-Host "`n"
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              ENVIRONMENT CHECK                               ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true
$checks = @()

# ============================================================================
# CHECK 1: Orchestra Root Exists
# ============================================================================

Write-Host "  📁 Checking directory structure..." -ForegroundColor Gray

$orchestraRoot = ".orchestra"
if (Test-Path $orchestraRoot) {
    Write-Host "    ✅ .orchestra directory exists" -ForegroundColor Green
    $checks += @{ name = ".orchestra exists"; passed = $true }
} else {
    Write-Host "    ❌ .orchestra directory not found" -ForegroundColor Red
    $checks += @{ name = ".orchestra exists"; passed = $false }
    $allPassed = $false
}

# Required subdirectories
$requiredDirs = @(
    "common/scripts",
    "common/templates",
    "orchestrator/scripts",
    "orchestrator/.orchestrator-only",
    "implementor"
)

foreach ($dir in $requiredDirs) {
    $path = "$orchestraRoot/$dir"
    if (Test-Path $path) {
        Write-Host "    ✅ $dir" -ForegroundColor Green
    } else {
        Write-Host "    ❌ $dir missing" -ForegroundColor Red
        $allPassed = $false
        
        if ($Fix) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
            Write-Host "       → Created" -ForegroundColor Yellow
        }
    }
}

# ============================================================================
# CHECK 2: Required Scripts
# ============================================================================

Write-Host ""
Write-Host "  📜 Checking scripts..." -ForegroundColor Gray

$requiredScripts = @(
    "common/scripts/set-env.ps1",
    "common/scripts/check-utils.ps1",
    "orchestrator/scripts/task-closeout-check.ps1",
    "orchestrator/scripts/prepare-handover.ps1",
    "orchestrator/scripts/verification-audit.ps1",
    "orchestrator/scripts/accept-signal-check.ps1",
    "implementor/.implementor-only/scripts/pre-signal-check.ps1"
)

foreach ($script in $requiredScripts) {
    $path = "$orchestraRoot/$script"
    if (Test-Path $path) {
        Write-Host "    ✅ $script" -ForegroundColor Green
    } else {
        Write-Host "    ❌ $script missing" -ForegroundColor Red
        $allPassed = $false
    }
}

# ============================================================================
# CHECK 3: Templates
# ============================================================================

Write-Host ""
Write-Host "  📄 Checking templates..." -ForegroundColor Gray

$requiredTemplates = @(
    "common/templates/handover-template.md",
    "common/templates/signal-template.md",
    "common/templates/feedback-template.md",
    "common/templates/verification-criteria-template.yaml"
)

foreach ($template in $requiredTemplates) {
    $path = "$orchestraRoot/$template"
    if (Test-Path $path) {
        Write-Host "    ✅ $template" -ForegroundColor Green
    } else {
        Write-Host "    ⚠️ $template missing" -ForegroundColor Yellow
    }
}

# ============================================================================
# CHECK 4: Configuration Files
# ============================================================================

Write-Host ""
Write-Host "  ⚙️ Checking configuration..." -ForegroundColor Gray

$configFiles = @(
    "orchestrator/.orchestrator-only/manifest.yaml",
    "orchestrator/.orchestrator-only/progress.yaml"
)

foreach ($config in $configFiles) {
    $path = "$orchestraRoot/$config"
    if (Test-Path $path) {
        Write-Host "    ✅ $config" -ForegroundColor Green
    } else {
        Write-Host "    ⚠️ $config not found (run sprint-init)" -ForegroundColor Yellow
    }
}

# ============================================================================
# CHECK 5: Node.js / TypeScript (Platform-specific)
# ============================================================================

Write-Host ""
Write-Host "  🔧 Checking platform dependencies..." -ForegroundColor Gray

try {
    $nodeVersion = node --version 2>$null
    Write-Host "    ✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "    ❌ Node.js not found" -ForegroundColor Red
    $allPassed = $false
}

try {
    $npmVersion = npm --version 2>$null
    Write-Host "    ✅ npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "    ❌ npm not found" -ForegroundColor Red
    $allPassed = $false
}

# Check if node_modules exists
if (Test-Path "node_modules") {
    Write-Host "    ✅ node_modules installed" -ForegroundColor Green
} else {
    Write-Host "    ⚠️ node_modules not found (run npm install)" -ForegroundColor Yellow
}

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

if ($allPassed) {
    Write-Host "✅ ENVIRONMENT CHECK PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ ENVIRONMENT CHECK FAILED - Fix issues above" -ForegroundColor Red
    if (-not $Fix) {
        Write-Host "   Run with -Fix to auto-fix some issues" -ForegroundColor Yellow
    }
    exit 1
}
