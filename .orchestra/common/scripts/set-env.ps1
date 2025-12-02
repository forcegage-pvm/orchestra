# Orchestra Environment Setup
# ===========================
# Sets environment variables for the current sprint.
# Run this at the start of any orchestrator session.
#
# Usage: . .\.orchestra\common\scripts\set-env.ps1
# (Note the dot-space prefix for sourcing)

param(
    [string]$SprintOverride,  # Override sprint name
    [int]$TaskOverride        # Override current task
)

$ErrorActionPreference = "Stop"

# ============================================================================
# SPRINT CONFIGURATION
# Edit these values when starting a new sprint
# ============================================================================

$script:CONFIG = @{
    # Sprint identification
    SprintName                = "orchestra-cli"
    
    # Project type (typescript|flutter|python|etc)
    ProjectType               = "typescript"
    
    # Paths (relative to project root)
    OrchestraRoot             = ".orchestra"
    SpeckitRoot               = "spec"  # Specifications folder
    SprintTestPath            = "src"  # Test files are co-located with source
    SprintIntegrationTestPath = "test/integration"
    ScreenshotPath            = ".orchestra/orchestrator/results/screenshots"
    
    # File patterns (TypeScript project)
    TestFilePattern           = "**/*.test.ts"
    ImplementationPath        = "src"
    
    # Build/Test commands (TypeScript/Node.js)
    BuildCommand              = "npm run build"
    TestCommand               = "npm test"
    TypeCheckCommand          = "npx tsc --noEmit"
    LintCommand               = "npm run lint"
}

# ============================================================================
# SET ENVIRONMENT VARIABLES
# ============================================================================

# Project type
$env:PROJECT_TYPE = $script:CONFIG.ProjectType

# Sprint-level (static for the sprint)
$env:ORCHESTRA_ROOT = $script:CONFIG.OrchestraRoot
$env:SPECKIT_ROOT = if ($SprintOverride) { "specs/$SprintOverride" } else { $script:CONFIG.SpeckitRoot }
$env:SPRINT_NAME = if ($SprintOverride) { $SprintOverride } else { $script:CONFIG.SprintName }
$env:SPRINT_TEST_PATH = $script:CONFIG.SprintTestPath
$env:SPRINT_INTEGRATION_TEST_PATH = $script:CONFIG.SprintIntegrationTestPath
$env:SCREENSHOT_PATH = $script:CONFIG.ScreenshotPath
$env:IMPLEMENTATION_PATH = $script:CONFIG.ImplementationPath

# Build/Test commands
$env:BUILD_COMMAND = $script:CONFIG.BuildCommand
$env:TEST_COMMAND = $script:CONFIG.TestCommand
$env:TYPECHECK_COMMAND = $script:CONFIG.TypeCheckCommand
$env:LINT_COMMAND = $script:CONFIG.LintCommand

# Task-level (derived from progress.yaml)
$progressPath = "$env:ORCHESTRA_ROOT/orchestrator/.orchestrator-only/progress.yaml"
if (Test-Path $progressPath) {
    $progressContent = Get-Content $progressPath -Raw
    
    if ($TaskOverride) {
        $env:CURRENT_TASK = $TaskOverride
    }
    elseif ($progressContent -match 'current_task:\s*"?(\d+(?:\.\d+)?)"?') {
        $env:CURRENT_TASK = $Matches[1]
    }
    elseif ($progressContent -match 'current_task:\s*(\d+)') {
        $env:CURRENT_TASK = [int]$Matches[1]
    }
    else {
        $env:CURRENT_TASK = "1"
    }
    
    # Handle decimal task IDs (e.g., "2.1" -> previous is "1")
    if ($env:CURRENT_TASK -match '(\d+)\.') {
        $env:PREVIOUS_TASK = [Math]::Max(0, [int]$Matches[1] - 1)
    }
    else {
        $env:PREVIOUS_TASK = [Math]::Max(0, [int]$env:CURRENT_TASK - 1)
    }
}
else {
    Write-Warning "progress.yaml not found - using defaults"
    $env:CURRENT_TASK = if ($TaskOverride) { $TaskOverride } else { "1" }
    $env:PREVIOUS_TASK = 0
}

# Derived paths
$env:MANIFEST_PATH = "$env:ORCHESTRA_ROOT/orchestrator/.orchestrator-only/manifest.yaml"
$env:PROGRESS_PATH = "$env:ORCHESTRA_ROOT/orchestrator/.orchestrator-only/progress.yaml"
$env:SPECKIT_TASKS_PATH = "$env:SPECKIT_ROOT/tasks.md"
$env:HANDOVER_PATH = "$env:ORCHESTRA_ROOT/handover"
$env:VERIFICATION_PATH = "$env:ORCHESTRA_ROOT/orchestrator/.orchestrator-only/verification"
$env:TEMPLATES_PATH = "$env:ORCHESTRA_ROOT/common/templates"

# Legacy aliases (for backward compatibility with some scripts)
$env:ORCHESTRA_COMMON = "$env:ORCHESTRA_ROOT/common"
$env:ORCHESTRA_HANDOVER = "$env:ORCHESTRA_ROOT/handover"
$env:ORCHESTRA_ORCHESTRATOR = "$env:ORCHESTRA_ROOT/orchestrator"
$env:ORCHESTRA_IMPLEMENTOR = "$env:ORCHESTRA_ROOT/implementor"
$env:RESULTS_PATH = "$env:ORCHESTRA_ROOT/orchestrator/results"
$env:ORCHESTRATOR_SCRIPTS = "$env:ORCHESTRA_ROOT/orchestrator/scripts"
$env:IMPLEMENTOR_PATH = "$env:ORCHESTRA_ROOT/implementor"
$env:DOCS_PATH = "$env:ORCHESTRA_ROOT/docs"

# ============================================================================
# DISPLAY CURRENT STATE
# ============================================================================

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              ORCHESTRA ENVIRONMENT LOADED                     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Project Type:  $env:PROJECT_TYPE" -ForegroundColor White
Write-Host "  Sprint:        $env:SPRINT_NAME" -ForegroundColor White
Write-Host "  Current Task:  $env:CURRENT_TASK" -ForegroundColor Green
Write-Host "  Previous Task: $env:PREVIOUS_TASK" -ForegroundColor Gray
Write-Host ""
Write-Host "  Paths:" -ForegroundColor DarkGray
Write-Host "    Orchestra:   $env:ORCHESTRA_ROOT" -ForegroundColor DarkGray
Write-Host "    SpecKit:     $env:SPECKIT_ROOT" -ForegroundColor DarkGray
Write-Host "    Tests:       $env:SPRINT_TEST_PATH" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Commands:" -ForegroundColor DarkGray
Write-Host "    Build:       $env:BUILD_COMMAND" -ForegroundColor DarkGray
Write-Host "    Test:        $env:TEST_COMMAND" -ForegroundColor DarkGray
Write-Host "    TypeCheck:   $env:TYPECHECK_COMMAND" -ForegroundColor DarkGray
Write-Host ""

# ============================================================================
# EXPORT HELPER FUNCTION
# ============================================================================

function global:Get-OrchestraEnv {
    <#
    .SYNOPSIS
    Returns all orchestra environment variables as a hashtable
    #>
    @{
        PROJECT_TYPE          = $env:PROJECT_TYPE
        ORCHESTRA_ROOT        = $env:ORCHESTRA_ROOT
        ORCHESTRA_COMMON      = $env:ORCHESTRA_COMMON
        ORCHESTRA_HANDOVER    = $env:ORCHESTRA_HANDOVER
        ORCHESTRA_ORCHESTRATOR= $env:ORCHESTRA_ORCHESTRATOR
        ORCHESTRA_IMPLEMENTOR = $env:ORCHESTRA_IMPLEMENTOR
        SPECKIT_ROOT          = $env:SPECKIT_ROOT
        SPRINT_NAME           = $env:SPRINT_NAME
        CURRENT_TASK          = $env:CURRENT_TASK
        PREVIOUS_TASK         = $env:PREVIOUS_TASK
        SPRINT_TEST_PATH      = $env:SPRINT_TEST_PATH
        MANIFEST_PATH         = $env:MANIFEST_PATH
        PROGRESS_PATH         = $env:PROGRESS_PATH
        SPECKIT_TASKS_PATH    = $env:SPECKIT_TASKS_PATH
        HANDOVER_PATH         = $env:HANDOVER_PATH
        VERIFICATION_PATH     = $env:VERIFICATION_PATH
        SCREENSHOT_PATH       = $env:SCREENSHOT_PATH
        RESULTS_PATH          = $env:RESULTS_PATH
        ORCHESTRATOR_SCRIPTS  = $env:ORCHESTRATOR_SCRIPTS
        IMPLEMENTOR_PATH      = $env:IMPLEMENTOR_PATH
        DOCS_PATH             = $env:DOCS_PATH
        TEMPLATES_PATH        = $env:TEMPLATES_PATH
        BUILD_COMMAND         = $env:BUILD_COMMAND
        TEST_COMMAND          = $env:TEST_COMMAND
        TYPECHECK_COMMAND     = $env:TYPECHECK_COMMAND
        LINT_COMMAND          = $env:LINT_COMMAND
    }
}
