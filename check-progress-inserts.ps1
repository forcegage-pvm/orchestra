# Fix progress table inserts across all handlers

$handlersPath = "src/mcp-server/handlers"
$files = Get-ChildItem "$handlersPath/*.ts"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    
    # Pattern 1: Simple progress insert with status field
    # Need to replace with: sprint_id, from_status (null for first), to_status, workflow_step
    # This is complex, so let's identify files that need manual fixes
    
    if ($content -match 'db\.insert\(progress\)\.values\(\{[^}]*\bstatus:') {
        Write-Host "NEEDS FIX: $($file.Name) - has progress insert with 'status' field"
    }
}

Write-Host "`nAll files checked. Manual fixes needed for progress inserts."
Write-Host "Progress table requires: sprint_id, task_id, from_status, to_status, workflow_step, triggered_by, notes, changed_at"
