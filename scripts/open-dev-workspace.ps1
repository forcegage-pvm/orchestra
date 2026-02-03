# Opens the Orchestra workspace with the dev extension loaded
# This replaces the installed extension with the local dev build for THIS session

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$extensionPath = Join-Path $workspaceRoot "extension"

# Launch VS Code with the dev extension
code --extensionDevelopmentPath="$extensionPath" "$workspaceRoot"
