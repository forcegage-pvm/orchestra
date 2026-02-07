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

if (-not $SkipVsixInstall) {
  Write-Step "Uninstall VSIX"
  
  # Uninstall existing extension first to avoid "restart VS Code" error
  $extensionId = "forcegage.orchestra-extension"
  Write-Host "Uninstalling existing extension..." -ForegroundColor DarkGray
  & code --uninstall-extension $extensionId 2>&1 | Out-Null
}

Write-Step "Validating prerequisites"
Invoke-Step "code --version" $repoRootResolved

if (-not $SkipInstall) {
  Write-Step "Install dependencies"
  Invoke-Step "npm install" $repoRootResolved
  Invoke-Step "npm install" $extensionDir

  Write-Step "Rebuild better-sqlite3 for Node (native test runtime)"
  Invoke-Step "npm rebuild better-sqlite3 --update-binary" $extensionDir
}

Write-Step "Build root artifacts"
Invoke-Step "npm run build" $repoRootResolved
Invoke-Step "npm run build:mcp-bundle" $repoRootResolved

Write-Step "Rebuild better-sqlite3 for Electron $ElectronVersion"
$betterSqliteDir = Join-Path $extensionDir "node_modules\better-sqlite3"
Invoke-Step "npx prebuild-install -r electron -t $ElectronVersion --force" $betterSqliteDir

Write-Step "Verify @vscode/ripgrep binary"
$rgBin = Join-Path $extensionDir "node_modules\@vscode\ripgrep\bin\rg*"
$rgFiles = Get-ChildItem -Path $rgBin -ErrorAction SilentlyContinue
if (-not $rgFiles) {
  throw "ripgrep binary not found at $rgBin. Run 'npm install' in extension/ to download it."
}
Write-Host "Found ripgrep binary: $($rgFiles[0].Name) ($([math]::Round($rgFiles[0].Length / 1MB, 1)) MB)" -ForegroundColor Green

Write-Step "Clear dist/node_modules"
$distNodeModules = Join-Path $extensionDir "dist\node_modules"
Remove-PathWithRetries $distNodeModules

Write-Step "Build webview"
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
  
  
  try {
    $output = & code --install-extension "$($vsix.FullName)" --force 2>&1
    if ($LASTEXITCODE -ne 0) {
      $outputStr = $output -join "`n"
      if ($outputStr -match "restart VS Code") {
        Write-Host "`nVSIX built successfully but cannot auto-install:" -ForegroundColor Yellow
        Write-Host "  The extension is currently active. Please restart VS Code then run:" -ForegroundColor Yellow
        Write-Host "  code --install-extension `"$($vsix.FullName)`"" -ForegroundColor Cyan
      }
      else {
        Write-Host "Installation failed: $outputStr" -ForegroundColor Red
      }
    }
    else {
      Write-Host "Extension installed successfully" -ForegroundColor Green
    }
  }
  catch {
    Write-Host "Installation failed: $_" -ForegroundColor Yellow
  }
}

Write-Step "Done"
Write-Host "VSIX: $($vsix.FullName)" -ForegroundColor Green
