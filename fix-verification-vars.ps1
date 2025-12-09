# Fix remaining verification checks variable names in handlers

$handlersPath = "src/mcp-server/handlers"
$filesToFix = @("add-task.ts", "update-verification.ts")

foreach ($fileName in $filesToFix) {
    $filePath = Join-Path $handlersPath $fileName
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw
        
        # Fix variable usage in map functions
        $content = $content -replace '\.\.\.structural_checks\.map', '...structural.map'
        $content = $content -replace '\.\.\.behavioral_checks\.map', '...behavioral.map'
        $content = $content -replace '\.\.\.quality_checks\.map', '...quality.map'
        
        # Add type annotations to map parameters
        $content = $content -replace '\.map\(\(check, idx\) =>', '.map((check: any, idx: number) =>'
        
        # Fix insertedTask undefined checks - wrap in if statement
        $content = $content -replace '(\s+)(const allChecks = \[)', '$1if (!insertedTask) {$1  throw new Error("Failed to create task");$1}$1$2'
        
        Set-Content $filePath -Value $content -NoNewline
        Write-Host "Fixed: $fileName"
    }
}

Write-Host "`nFixed verification checks variables."
