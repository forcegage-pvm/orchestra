#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build and install Orchestra CLI globally

.DESCRIPTION
    Compiles TypeScript and installs the Orchestra CLI globally using npm link.
    After installation, you can use 'orchestra' command from anywhere.

.EXAMPLE
    .\install.ps1
    
.EXAMPLE
    # Uninstall
    npm unlink -g orchestra
#>

param(
    [switch]$SkipBuild,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Orchestra CLI - Build & Install" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$scriptDir = $PSScriptRoot
Push-Location $scriptDir

try {
    # Uninstall if requested
    if ($Uninstall) {
        Write-Host "🗑️  Uninstalling Orchestra CLI..." -ForegroundColor Yellow
        npm unlink -g orchestra 2>$null
        Write-Host "✅ Orchestra CLI uninstalled" -ForegroundColor Green
        Write-Host ""
        exit 0
    }

    # Clean build directory
    Write-Host "🧹 Cleaning build directory..." -ForegroundColor Yellow
    if (Test-Path "dist") {
        Remove-Item -Path "dist" -Recurse -Force
    }
    Write-Host "✅ Clean complete" -ForegroundColor Green
    Write-Host ""

    # Build TypeScript
    if (-not $SkipBuild) {
        Write-Host "🔨 Compiling TypeScript..." -ForegroundColor Yellow
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "TypeScript compilation failed"
        }
        Write-Host "✅ Build complete" -ForegroundColor Green
        Write-Host ""
    }

    # Verify dist/cli.js exists
    if (-not (Test-Path "dist/cli.js")) {
        throw "Build failed: dist/cli.js not found"
    }

    # Install globally
    Write-Host "📦 Installing globally..." -ForegroundColor Yellow
    npm link
    if ($LASTEXITCODE -ne 0) {
        throw "npm link failed"
    }
    Write-Host "✅ Installation complete" -ForegroundColor Green
    Write-Host ""

    # Test installation
    Write-Host "🧪 Testing installation..." -ForegroundColor Yellow
    $version = orchestra --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Installation test failed"
    }
    Write-Host "✅ Orchestra CLI v$version installed successfully!" -ForegroundColor Green
    Write-Host ""

    # Show usage
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Quick Start" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Try these commands:" -ForegroundColor White
    Write-Host "    orchestra --help" -ForegroundColor Gray
    Write-Host "    orchestra closeout --help" -ForegroundColor Gray
    Write-Host "    orchestra closeout" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  To uninstall:" -ForegroundColor White
    Write-Host "    .\install.ps1 -Uninstall" -ForegroundColor Gray
    Write-Host ""

}
catch {
    Write-Host ""
    Write-Host "❌ Error: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
}
finally {
    Pop-Location
}
