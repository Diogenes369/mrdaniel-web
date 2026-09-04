# start-hermes.ps1 — launch a Hermes Agent CLI session in this project's context.
#
#   PS> .\start-hermes.ps1              # interactive session, cwd = project root
#   PS> .\start-hermes.ps1 acp --check  # any args are passed straight through to `hermes`
#
# Adds the Hermes install dir (~/.local/bin) to PATH for THIS session only — nothing global,
# nothing persistent. Run from anywhere; it always drops you into the project root so Hermes
# picks up AGENTS.md.

$ErrorActionPreference = 'Stop'

# 1. Session-only PATH: prepend the standard Hermes per-user bin dir if it isn't already there.
$hermesBin = Join-Path $env:USERPROFILE '.local\bin'
if ((Test-Path $hermesBin) -and ($env:PATH -notlike "*$hermesBin*")) {
  $env:PATH = "$hermesBin;$env:PATH"
}

# 2. Always operate from the project root (this script's own folder).
Set-Location -LiteralPath $PSScriptRoot

# 3. Verify Hermes is actually installed before handing off.
$hermes = Get-Command hermes -ErrorAction SilentlyContinue
if (-not $hermes) {
  Write-Host ''
  Write-Host 'Hermes is not installed (no `hermes` on PATH, no ~/.local/bin/hermes).' -ForegroundColor Yellow
  Write-Host 'Install it, then re-run this script:' -ForegroundColor Yellow
  Write-Host '  iex (irm https://hermes-agent.nousresearch.com/install.ps1)'
  Write-Host '  hermes model      # pick a provider / model (BYO key)'
  Write-Host ''
  exit 1
}

Write-Host "hermes  -> $($hermes.Source)" -ForegroundColor DarkGray
Write-Host "cwd     -> $((Get-Location).Path)" -ForegroundColor DarkGray
Write-Host ''

# 4. Hand off. Any args after the script name go straight to hermes (e.g. `acp`, `--check`).
& hermes @args
