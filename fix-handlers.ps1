# Fix systematic type errors in MCP handlers

$handlersPath = "src/mcp-server/handlers"
$files = Get-ChildItem "$handlersPath/*.ts" -Exclude "configure-sprint.ts"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    
    # Fix 1: Error handling - validation errors
    $content = $content -replace 'return createErrorResponse\(validation\.error\);', 'return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validation.error, null, 2),
        },
      ],
    };'
    
    # Fix 2: Error handling - runtime errors
    $content = $content -replace 'return createErrorResponse\(\s*error instanceof Error \? error : new Error\(String\(error\)\)\s*\);', 'const err = error instanceof Error ? error : new Error(String(error));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: {
              code: "SYSTEM_ERROR",
              message: err.message,
            },
          }, null, 2),
        },
      ],
    };'
    
    # Fix 3: Remove createErrorResponse import, add errorToResponse if needed
    $content = $content -replace 'import \{ createErrorResponse, validateInput \}', 'import { validateInput }'
    $content = $content -replace 'import \{ validateInput, createErrorResponse \}', 'import { validateInput }'
    
    # Fix 4: Verification schema fields
    $content = $content -replace '\.structural(?!\w)', '.structural_checks'
    $content = $content -replace '\.behavioral(?!\w)', '.behavioral_checks'
    $content = $content -replace '\.quality(?!\w)', '.quality_checks'
    
    # Fix 5: Output schema - remove message field where it doesn't belong
    $content = $content -replace 'return \{\s*success: true,\s*message: [^,]+,\s*task_id:', 'return {
    success: true,
    task_id:'
    
    # Save fixed content
    Set-Content $file.FullName -Value $content -NoNewline
    Write-Host "Fixed: $($file.Name)"
}

Write-Host "`nDone! Run npm run typecheck to verify."
