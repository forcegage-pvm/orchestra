<#
.SYNOPSIS
    Setup script for the Dart TDD test harness.

.DESCRIPTION
    Ensures Dart SDK is available and dependencies are resolved.
    Run this before executing Dart integration tests.

.EXAMPLE
    .\setup.ps1
    
.EXAMPLE
    .\setup.ps1 -RegenerateFixtures
    
.NOTES
    Requires Dart SDK ^3.0.0 to be installed and on PATH.
#>

[CmdletBinding()]
param(
    [switch]$RegenerateFixtures
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot

Write-Host "🎯 Dart TDD Test Harness Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check Dart SDK
Write-Host "`n📋 Checking Dart SDK..." -ForegroundColor Yellow
try {
    $dartVersion = dart --version 2>&1
    Write-Host "✓ $dartVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Dart SDK not found on PATH" -ForegroundColor Red
    Write-Host "  Install Dart SDK ^3.0.0 from https://dart.dev/get-dart" -ForegroundColor Gray
    exit 1
}

# Resolve dependencies
Write-Host "`n📦 Resolving dependencies..." -ForegroundColor Yellow
Push-Location $scriptDir
try {
    dart pub get
    Write-Host "✓ Dependencies resolved" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to resolve dependencies" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Gray
    exit 1
} finally {
    Pop-Location
}

# Verify tests run
Write-Host "`n🧪 Verifying test harness..." -ForegroundColor Yellow
Push-Location $scriptDir
try {
    # Run a quick test to verify setup
    $result = dart test test/category4_normal_passing_test.dart --reporter=expanded 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Test harness verified" -ForegroundColor Green
    } else {
        Write-Host "⚠ Some tests failed (expected for red-phase tests)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Failed to run tests" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Gray
    exit 1
} finally {
    Pop-Location
}

# Regenerate fixtures if requested
if ($RegenerateFixtures) {
    Write-Host "`n📑 Regenerating NDJSON fixtures..." -ForegroundColor Yellow
    Push-Location $scriptDir
    try {
        # Create fixtures directory if needed
        New-Item -ItemType Directory -Path fixtures -Force | Out-Null
        
        # Capture all fixture types
        Write-Host "  Capturing passing-tests.ndjson..." -ForegroundColor Gray
        dart test --reporter=json test/category4_normal_passing_test.dart 2>&1 | 
            Out-File -Encoding utf8 -NoNewline fixtures/passing-tests.ndjson
        
        Write-Host "  Capturing failing-tests.ndjson..." -ForegroundColor Gray
        dart test --reporter=json test/category1_tdd_red_failing_test.dart 2>&1 | 
            Out-File -Encoding utf8 -NoNewline fixtures/failing-tests.ndjson
        
        Write-Host "  Capturing mixed-results.ndjson..." -ForegroundColor Gray
        dart test --reporter=json test/mixed_file_test.dart 2>&1 | 
            Out-File -Encoding utf8 -NoNewline fixtures/mixed-results.ndjson
        
        Write-Host "  Capturing all-tests.ndjson..." -ForegroundColor Gray
        dart test --reporter=json 2>&1 | 
            Out-File -Encoding utf8 -NoNewline fixtures/all-tests.ndjson
        
        Write-Host "✓ Fixtures regenerated" -ForegroundColor Green
        
        # List fixtures
        Write-Host "`n  Generated fixtures:" -ForegroundColor Gray
        Get-ChildItem fixtures/*.ndjson | ForEach-Object {
            Write-Host "    $($_.Name) ($([math]::Round($_.Length / 1KB, 1)) KB)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "✗ Failed to regenerate fixtures" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Gray
        exit 1
    } finally {
        Pop-Location
    }
}

Write-Host "`n✅ Setup complete!" -ForegroundColor Green
Write-Host @"

Next steps:
  - Run all tests:        cd $scriptDir && dart test -r expanded
  - Run tdd-red only:     dart test --tags tdd-red -r expanded
  - Run non-tdd-red:      dart test --exclude-tags tdd-red -r expanded
  - Regenerate fixtures:  .\setup.ps1 -RegenerateFixtures

"@ -ForegroundColor Cyan
