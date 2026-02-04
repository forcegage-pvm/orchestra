param(
  [string]$ElectronVersion = "39.2.7",
  [string]$RepoRoot = "$PSScriptRoot\..",
  [switch]$SkipInstall,
  [switch]$SkipVsixInstall
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host "`n=== $message ===" -ForegroundColor Cyan
}

function Invoke-Step($command, $workingDir) {
  Write-Host "$command" -ForegroundColor DarkGray
  if ($workingDir) {
    Push-Location $workingDir
  }
  try {
    Invoke-Expression $command
  }
  finally {
    if ($workingDir) {
      Pop-Location
    }
  }
}

function Remove-PathWithRetries($path, $retries = 5, $delayMs = 500) {
  for ($i = 1; $i -le $retries; $i++) {
    try {
      if (Test-Path $path) {
        Remove-Item -LiteralPath $path -Recurse -Force
      }
      return
    }
    catch {
      if ($i -eq $retries) {
        throw
      }
      Start-Sleep -Milliseconds ($delayMs * $i)
    }
  }
}

$repoRootResolved = Resolve-Path $RepoRoot
$extensionDir = Join-Path $repoRootResolved "extension"
$extensionArtifacts = Join-Path $extensionDir "artifacts"

Write-Step "Validating prerequisites"
Invoke-Step "code --version" $repoRootResolved

if (-not $SkipInstall) {
  Write-Step "Install dependencies"
  Invoke-Step "npm install" $repoRootResolved
  Invoke-Step "npm install" $extensionDir
}

Write-Step "Build root artifacts"
Invoke-Step "npm run build" $repoRootResolved
Invoke-Step "npm run build:mcp-bundle" $repoRootResolved

Write-Step "Rebuild better-sqlite3 for Electron $ElectronVersion"
$betterSqliteDir = Join-Path $extensionDir "node_modules\better-sqlite3"
Invoke-Step "npx prebuild-install -r electron -t $ElectronVersion --force" $betterSqliteDir

Write-Step "Clear dist/node_modules"
$distNodeModules = Join-Path $extensionDir "dist\node_modules"
Remove-PathWithRetries $distNodeModules

Write-Step "Build extension webviews"
Invoke-Step "npm run build:webview" $extensionDir

Write-Step "Build extension"
Invoke-Step "npm run build" $extensionDir

Write-Step "Package VSIX"
Invoke-Step "npm run package" $extensionDir

$vsix = Get-ChildItem -Path $extensionArtifacts -Filter "orchestra-extension-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $vsix) {
  throw "VSIX not found in $extensionArtifacts"
}

if (-not $SkipVsixInstall) {
  Write-Step "Install VSIX"
  Invoke-Step "code --install-extension `"$($vsix.FullName)`" --force" $extensionDir
}

Write-Step "Done"
Write-Host "VSIX: $($vsix.FullName)" -ForegroundColor Green
