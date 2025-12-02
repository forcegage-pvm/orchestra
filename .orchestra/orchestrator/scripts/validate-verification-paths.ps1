# validate-verification-paths.ps1
# Validates that paths in verification YAML actually exist in the project
# Run this AFTER creating verification YAML to catch path errors early

param(
    [Parameter(Mandatory = $false)]
    [int]$TaskId,
    
    [Parameter(Mandatory = $false)]
    [switch]$Fix
)

# Source environment
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$scriptDir\..\..\common\scripts\set-env.ps1"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          VERIFICATION PATH VALIDATOR                         ║" -ForegroundColor Cyan
Write-Host "║   Check verification YAML paths against actual project      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Determine which task to validate
if ($TaskId) {
    $taskToValidate = $TaskId
}
else {
    $taskToValidate = $env:CURRENT_TASK
}

if (-not $taskToValidate) {
    Write-Host "❌ No task specified and CURRENT_TASK not set" -ForegroundColor Red
    Write-Host "   Usage: .\validate-verification-paths.ps1 -TaskId 4" -ForegroundColor Gray
    exit 1
}

$taskIdPadded = $taskToValidate.ToString().PadLeft(3, '0')
$verificationPath = "$env:VERIFICATION_PATH/task-$taskIdPadded.yaml"

if (-not (Test-Path $verificationPath)) {
    Write-Host "❌ Verification YAML not found: $verificationPath" -ForegroundColor Red
    exit 1
}

Write-Host "  Validating: task-$taskIdPadded.yaml" -ForegroundColor Cyan
Write-Host ""

# Load the YAML content
$yamlContent = Get-Content $verificationPath -Raw

# Extract all file paths from YAML (various formats)
$pathPatterns = @(
    'path:\s*["'']?([^"''\s]+)["'']?',           # path: "file.ts"
    'command:\s*["'']?npm test -- ([^"''\s]+)',  # npm test -- file.test.ts
    'pattern_match.*path:\s*["'']?([^"''\s]+)'   # pattern_match with path
)

$foundPaths = @()
foreach ($pattern in $pathPatterns) {
    $matches = [regex]::Matches($yamlContent, $pattern)
    foreach ($match in $matches) {
        if ($match.Groups.Count -gt 1) {
            $foundPaths += $match.Groups[1].Value
        }
    }
}

# Remove duplicates
$foundPaths = $foundPaths | Select-Object -Unique

Write-Host "───────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "  Path Validation" -ForegroundColor White
Write-Host "───────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""

$allValid = $true
$invalidPaths = @()
$corrections = @{}

foreach ($path in $foundPaths) {
    # Skip if not a file path (e.g., URLs, flags)
    if ($path -match '^https?://' -or $path -match '^--') {
        continue
    }
    
    $fullPath = Join-Path $PWD $path
    $exists = Test-Path $fullPath
    
    if ($exists) {
        Write-Host "  ✅ $path" -ForegroundColor Green
    }
    else {
        Write-Host "  ❌ $path" -ForegroundColor Red
        $allValid = $false
        $invalidPaths += $path
        
        # Try to find correct path
        $fileName = Split-Path -Leaf $path
        $searchResults = Get-ChildItem -Path . -Recurse -Filter $fileName -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch 'node_modules|\.git|build|dist' } |
        Select-Object -First 1
        
        if ($searchResults) {
            $correctPath = $searchResults.FullName -replace [regex]::Escape((Get-Location).Path + '\'), ''
            $correctPath = $correctPath -replace '\\', '/'
            Write-Host "     💡 Suggestion: $correctPath" -ForegroundColor Yellow
            $corrections[$path] = $correctPath
        }
        else {
            Write-Host "     ⚠️  File not found anywhere in project" -ForegroundColor Yellow
        }
    }
}

Write-Host ""

if ($allValid) {
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "✅ ALL PATHS VALID - Verification YAML is correct" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host "❌ INVALID PATHS FOUND" -ForegroundColor Red
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host ""
    Write-Host "Issues found:" -ForegroundColor Yellow
    foreach ($path in $invalidPaths) {
        Write-Host "  • $path" -ForegroundColor Red
    }
    Write-Host ""
    
    if ($Fix -and $corrections.Count -gt 0) {
        Write-Host "🔧 Applying fixes..." -ForegroundColor Cyan
        Write-Host ""
        
        $updatedContent = $yamlContent
        foreach ($oldPath in $corrections.Keys) {
            $newPath = $corrections[$oldPath]
            Write-Host "  Replacing: $oldPath" -ForegroundColor Gray
            Write-Host "       with: $newPath" -ForegroundColor Green
            $updatedContent = $updatedContent -replace [regex]::Escape($oldPath), $newPath
        }
        
        Set-Content -Path $verificationPath -Value $updatedContent -NoNewline
        Write-Host ""
        Write-Host "✅ Fixed $($corrections.Count) path(s)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Re-run validation to verify fixes..." -ForegroundColor Cyan
        exit 0
    }
    elseif ($corrections.Count -gt 0) {
        Write-Host "Run with -Fix to automatically correct paths:" -ForegroundColor Cyan
        Write-Host "  .\validate-verification-paths.ps1 -TaskId $taskToValidate -Fix" -ForegroundColor Gray
    }
    
    exit 1
}
