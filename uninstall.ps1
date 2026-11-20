# Remove agy-hud-plus (and legacy agy-hud) from this machine (Windows).
# 1. Run runtime\uninstall.js (clears settings.statusLine, timer hook, runtime dir, tmp tokens)
# 2. Run `agy plugin uninstall agy-hud-plus`
$ErrorActionPreference = 'Continue'

$Runtime = Join-Path $env:USERPROFILE '.gemini\antigravity-cli\agy-hud-runtime\runtime\uninstall.js'

if ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path $Runtime)) {
    node $Runtime
} else {
    Write-Error "agy-hud-plus uninstall: runtime not found at $Runtime - skipping settings cleanup"
}

foreach ($PluginName in @('agy-hud-plus', 'agy-hud')) {
    $PluginDir = Join-Path $env:USERPROFILE ".gemini\config\plugins\$PluginName"
    if (Get-Command agy -ErrorAction SilentlyContinue) {
        agy plugin uninstall $PluginName 2>$null
        if ($LASTEXITCODE -ne 0) {
            Remove-Item $PluginDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    } else {
        Remove-Item $PluginDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "agy-hud-plus uninstall complete"
