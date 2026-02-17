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
        # Clear read-only attributes which can cause Remove-Item to fail even with -Force
        Get-ChildItem -Path $path -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
          if ($_.Attributes -match "ReadOnly") {
            $_.Attributes = "Normal"
          }
        }
        Remove-Item -LiteralPath $path -Recurse -Force
      }
      return
    }
    catch {
      if ($i -eq $retries) {
        # Last attempt: try renaming to a temp name then deleting (works better with locked files)
        $tempPath = "$path.deleting.$([guid]::NewGuid().ToString('N').Substring(0,8))"
        try {
          Rename-Item -LiteralPath $path -NewName (Split-Path $tempPath -Leaf) -Force
          Remove-Item -LiteralPath $tempPath -Recurse -Force -ErrorAction SilentlyContinue
          return
        }
        catch {
          # If rename also fails, file is truly locked by another process
          throw "Cannot remove '$path': file is locked. Please close VS Code and try again."
        }
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
  
  # Uninstall existing extension - remove ALL installed versions
  # code --uninstall-extension only removes the active version and can
  # fail with "restart VS Code" if the extension is loaded. Instead,
  # we also nuke the extension directory directly so a fresh install
  # always succeeds regardless of version mismatch.
  $extensionId = "forcegage.orchestra-extension"
  Write-Host "Uninstalling existing extension ($extensionId)..." -ForegroundColor DarkGray
  try { & code --uninstall-extension $extensionId 2>&1 | Out-Null } catch { <# ignore - may not be installed #> }

  # Remove extension directories for ALL versions from the VS Code extensions folder
  $vsCodeExtDir = Join-Path $env:USERPROFILE ".vscode\extensions"
  if (Test-Path $vsCodeExtDir) {
    $installedDirs = Get-ChildItem -Path $vsCodeExtDir -Directory -Filter "$extensionId-*" -ErrorAction SilentlyContinue
    foreach ($dir in $installedDirs) {
      Write-Host "  Removing $($dir.Name)" -ForegroundColor DarkGray
      Remove-PathWithRetries $dir.FullName
    }
    if (-not $installedDirs) {
      Write-Host "  No installed versions found" -ForegroundColor DarkGray
    }
  }
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
