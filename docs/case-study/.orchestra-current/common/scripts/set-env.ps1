# Orchestra Environment Setup
# Source this script before running other Orchestra scripts
# Usage: . .\.orchestra\common\scripts\set-env.ps1

# Find the .orchestra root
$script:OrchestraRoot = $null

function Find-OrchestraRoot {
    $current = Get-Location
    while ($current) {
        $orchestraPath = Join-Path $current ".orchestra"
        if (Test-Path $orchestraPath) {
            return $current
        }
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) {
            break
        }
        $current = $parent
    }
    return $null
}

$script:OrchestraRoot = Find-OrchestraRoot

if (-not $script:OrchestraRoot) {
    Write-Host "❌ ERROR: Could not find .orchestra directory" -ForegroundColor Red
    Write-Host "   Make sure you're running from within the project" -ForegroundColor Yellow
    return
}

# Set environment variables
$env:ORCHESTRA_ROOT = $script:OrchestraRoot
$env:ORCHESTRA_DIR = Join-Path $script:OrchestraRoot ".orchestra"
$env:ORCHESTRA_ORCHESTRATOR = Join-Path $env:ORCHESTRA_DIR "orchestrator"
$env:ORCHESTRA_IMPLEMENTOR = Join-Path $env:ORCHESTRA_DIR "implementor"
$env:ORCHESTRA_HANDOVER = Join-Path $env:ORCHESTRA_DIR "handover"
$env:ORCHESTRA_COMMON = Join-Path $env:ORCHESTRA_DIR "common"

# Change to project root
Set-Location $script:OrchestraRoot

Write-Host "✅ Orchestra environment loaded" -ForegroundColor Green
Write-Host "   Project root: $env:ORCHESTRA_ROOT" -ForegroundColor Cyan
