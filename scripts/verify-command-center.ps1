<#
.SYNOPSIS
  Fail-fast local verification for the LVPT Event Command Center.

.DESCRIPTION
  Offline-only runner. Supports:
    -Mode Targeted -TestFiles <paths...>
    -Mode Full

  Targeted runs only the listed Node test files.
  Full runs the explicit inventory: CI syntax checks, CI regressions,
  local-phase offline tests, staging-safety, acceptance, browser
  (desktop+mobile coverage inside the browser harness), TypeScript, and build.

  Never deploys, never mutates Git, never loads production credentials,
  and never invokes live provider dry-runs (for example clasp/Calendar).

.PARAMETER Mode
  Targeted or Full.

.PARAMETER TestFiles
  Required for Targeted. One or more offline Node test file paths.

.PARAMETER InventoryOnly
  Print the selected mode inventory as JSON and exit 0 without running checks.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Targeted', 'Full')]
  [string]$Mode,

  [Parameter(Mandatory = $false)]
  [string[]]$TestFiles = @(),

  [switch]$InventoryOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
Set-Location -LiteralPath $RepoRoot

function Write-Step {
  param([string]$Message)
  Write-Host ("[verify] {0}" -f $Message)
}

function Write-InventoryLine {
  param(
    [string]$Kind,
    [string]$Command,
    [string]$Path = ''
  )
  [pscustomobject]@{
    kind = $Kind
    command = $Command
    path = $Path
  }
}

# CI workflow syntax inventory (.github/workflows/sms-intelligence-review-ci.yml)
$Script:SyntaxFiles = @(
  'public/sms-review/review-engine.js'
  'public/sms-review/app.js'
  'public/sms-review/case-engine.js'
  'public/sms-review/reconciliation.js'
  'public/sms-review/evidence-overlap.js'
  'public/sms-review/gmail-thread-triage.js'
  'public/sms-review/gmail-intelligence.js'
  'public/sms-review/action-queue.js'
  'public/sms-review/reply-qualification.js'
  'public/sms-review/message-preview.js'
  'lib/lvpt-diagnostic-selection.mjs'
  'lib/lvpt-diagnostic-message.mjs'
  'public/sms-review/reply-workflow.js'
  'public/sms-review/reply-review-controls.js'
  'public/sms-review/draft-helper.js'
  'lib/sms-intelligence.mjs'
  'lib/lvpt-personalized-policy.mjs'
  'lib/sms-review-session.mjs'
)

$Script:GasSyntaxFiles = @(
  'apps-script/GmailEvidence.gs'
  'apps-script/GmailDraftContext.gs'
  'apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs'
)

# Exact CI regression inventory from sms-intelligence-review-ci.yml
$Script:CiRegressionFiles = @(
  'tests/sms-review.test.js'
  'tests/sms-intelligence.test.mjs'
  'tests/sms-reconciliation.test.cjs'
  'tests/sms-evidence.test.cjs'
  'tests/sms-action-queue.test.cjs'
  'tests/sms-reply-qualification.test.cjs'
  'tests/sms-message-preview.test.cjs'
  'tests/sms-inbox-diagnostics.test.cjs'
  'tests/sms-inbox-diagnostics-autoselect.test.mjs'
  'tests/sms-diagnostic-message.test.mjs'
  'tests/sms-negative-gmail-canary.test.mjs'
  'tests/sms-gas-long-thread-preview.test.cjs'
  'tests/sms-gas-recipient-verification.test.cjs'
  'tests/sms-reply-review.test.cjs'
  'tests/sms-reply-send.test.cjs'
  'tests/sms-reply-send-runtime.test.cjs'
  'tests/sms-reply-send-ui.test.cjs'
  'tests/sms-reply-ai.test.cjs'
  'tests/sms-draft-preview.test.cjs'
  'tests/sms-personalized-draft.test.cjs'
  'tests/sms-ai-smoke-test.test.cjs'
  'tests/sms-ai-oidc-auth.test.cjs'
  'tests/gmail-thread-triage.test.cjs'
  'tests/sms-gmail-intelligence.test.cjs'
  'tests/sms-gmail-scope-static.test.cjs'
  'tests/sms-review-audit-static.test.cjs'
  'tests/sms-review-session.test.mjs'
)

# Offline local-phase / calendar fixture suite (synthetic adapters only)
$Script:LocalPhaseFiles = @(
  'tests/calendar-safe-sync.test.cjs'
  'tests/calendar-safe-review.test.cjs'
  'tests/calendar-safe-integrate.test.cjs'
  'tests/calendar-safe-live-verify.test.cjs'
  'tests/calendar-staging-readonly.test.cjs'
  'tests/calendar-production-candidate.test.cjs'
  'tests/calendar-task-reconcile.test.cjs'
  'tests/command-hub-finance.test.cjs'
  'tests/rcs-live.test.mjs'
)

# Forbidden live / credential-bearing commands (never included)
$Script:ForbiddenCommandFragments = @(
  'clasp push'
  'clasp deploy'
  'vercel deploy'
  'git commit'
  'git push'
  'lvpt-safe-readonly-dry-run'
  'googleapis.com/calendar'
  'oauth2.googleapis.com/token'
)

function Assert-OfflineSafeCommand {
  param([string]$Command)
  foreach ($fragment in $Script:ForbiddenCommandFragments) {
    if ($Command -match [regex]::Escape($fragment)) {
      throw ("Refusing to schedule live/mutating command containing '{0}': {1}" -f $fragment, $Command)
    }
  }
}

function Resolve-TestPath {
  param([string]$RelativePath)
  $normalized = $RelativePath -replace '/', '\'
  $full = Join-Path $RepoRoot $normalized
  if (-not (Test-Path -LiteralPath $full)) {
    throw ("Test file not found: {0}" -f $RelativePath)
  }
  return (Resolve-Path -LiteralPath $full).Path
}

function Test-BlockedEnvName {
  param([string]$Name)
  $blockedNamePatterns = @(
    '^GOOGLE_'
    '^GCLOUD_'
    '^CLASPRC'
    '^CLASP_'
    '^SUPABASE_'
    '^VERCEL_'
    '^OPENAI_'
    '^ANTHROPIC_'
    '^AWS_'
    '^AZURE_'
    '(_|^)(API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|SERVICE_ROLE|PRIVATE_KEY|CLIENT_SECRET|SESSION_SECRET|ENCRYPTION_KEY)(_|$)'
    '^LVPT_.*_(KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS?)$'
    '^LVPT_SMS_STAGING_SUPABASE_'
    '^LVPT_RCS_STAGING_TOKEN'
    '^LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND$'
  )
  foreach ($pattern in $blockedNamePatterns) {
    if ($Name -match $pattern) { return $true }
  }
  return $false
}

function Invoke-TrackedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,

    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList
  )

  Assert-OfflineSafeCommand ("{0} {1}" -f $FilePath, ($ArgumentList -join ' '))
  Write-Step ("START {0}" -f $Label)

  # Sanitize the current process environment around the child invocation.
  # ProcessStartInfo.EnvironmentVariables.Clear() is unsupported on Windows PowerShell 5.1.
  $removed = @{}
  foreach ($entry in Get-ChildItem Env:) {
    if (Test-BlockedEnvName -Name $entry.Name) {
      $removed[$entry.Name] = $entry.Value
      Remove-Item -LiteralPath ("Env:{0}" -f $entry.Name) -ErrorAction SilentlyContinue
    }
  }
  $previousOffline = $env:LVPT_VERIFY_OFFLINE
  $previousCi = $env:CI
  $env:LVPT_VERIFY_OFFLINE = '1'
  $env:CI = '1'

  $code = 1
  try {
    & $FilePath @ArgumentList
    if ($null -eq $LASTEXITCODE) {
      $code = 0
    }
    else {
      $code = [int]$LASTEXITCODE
    }
  }
  finally {
    if ($null -eq $previousOffline) { Remove-Item Env:LVPT_VERIFY_OFFLINE -ErrorAction SilentlyContinue }
    else { $env:LVPT_VERIFY_OFFLINE = $previousOffline }
    if ($null -eq $previousCi) { Remove-Item Env:CI -ErrorAction SilentlyContinue }
    else { $env:CI = $previousCi }
    foreach ($key in $removed.Keys) {
      Set-Item -Path ("Env:{0}" -f $key) -Value $removed[$key]
    }
  }

  Write-Step ("EXIT {0} code={1}" -f $Label, $code)
  if ($code -ne 0) {
    throw ("Verification failed at '{0}' with exit code {1}." -f $Label, $code)
  }
}

function Get-NodeExecutable {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'node is not available on PATH.' }
  return $cmd.Source
}

function Get-NpmCmd {
  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'npm.cmd is not available on PATH.' }
  return $cmd.Source
}

function Get-NpxCmd {
  $cmd = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'npx.cmd is not available on PATH.' }
  return $cmd.Source
}

function Expand-TestFileArgs {
  param([object]$Files)
  $expanded = New-Object System.Collections.Generic.List[string]
  $entries = @()
  if ($null -eq $Files) {
    $entries = @()
  }
  elseif ($Files -is [System.Array]) {
    $entries = @($Files)
  }
  else {
    $entries = @([string]$Files)
  }

  foreach ($entry in $entries) {
    if ($null -eq $entry) { continue }
    # Accept comma-separated lists and PowerShell's space-joined stringification of arrays.
    foreach ($piece in ([string]$entry -split '[,;]+')) {
      $chunk = $piece.Trim().Trim('"').Trim("'")
      if (-not $chunk) { continue }
      if ($chunk -match '\s+tests/') {
        foreach ($part in ($chunk -split '\s+(?=tests/)')) {
          $rel = ($part -replace '\\', '/').Trim().Trim('"').Trim("'")
          if ($rel) { $expanded.Add($rel) }
        }
      }
      else {
        $rel = ($chunk -replace '\\', '/').Trim()
        if ($rel) { $expanded.Add($rel) }
      }
    }
  }
  return $expanded.ToArray()
}

function Build-TargetedInventory {
  param([object]$Files)
  $normalized = @(Expand-TestFileArgs -Files $Files)
  if ($normalized.Count -eq 0) {
    throw 'Targeted mode requires -TestFiles with at least one offline Node test path.'
  }
  $items = New-Object System.Collections.Generic.List[object]
  foreach ($rel in $normalized) {
    if ($rel -notmatch '^tests/') {
      throw ("Targeted mode only accepts paths under tests/: {0}" -f $rel)
    }
    Resolve-TestPath $rel | Out-Null
    $items.Add((Write-InventoryLine -Kind 'node-test' -Command ("node {0}" -f $rel) -Path $rel))
  }
  return $items.ToArray()
}

function Build-FullInventory {
  $items = @()
  foreach ($file in $Script:SyntaxFiles) {
    $rel = $file -replace '\\', '/'
    Resolve-TestPath $rel | Out-Null
    $items += Write-InventoryLine -Kind 'syntax' -Command ("node --check {0}" -f $rel) -Path $rel
  }
  foreach ($file in $Script:GasSyntaxFiles) {
    $rel = $file -replace '\\', '/'
    Resolve-TestPath $rel | Out-Null
    $items += Write-InventoryLine -Kind 'gas-syntax' -Command ("Get-Content -Raw {0} | node --check" -f $rel) -Path $rel
  }
  foreach ($file in $Script:CiRegressionFiles) {
    $rel = $file -replace '\\', '/'
    Resolve-TestPath $rel | Out-Null
    $items += Write-InventoryLine -Kind 'ci-regression' -Command ("node {0}" -f $rel) -Path $rel
  }
  foreach ($file in $Script:LocalPhaseFiles) {
    $rel = $file -replace '\\', '/'
    Resolve-TestPath $rel | Out-Null
    $items += Write-InventoryLine -Kind 'local-phase' -Command ("node {0}" -f $rel) -Path $rel
  }
  $items += Write-InventoryLine -Kind 'staging-safety' -Command 'npm.cmd run test:staging-safety' -Path 'package.json'
  $items += Write-InventoryLine -Kind 'acceptance' -Command 'node tests/command-center-acceptance.test.mjs' -Path 'tests/command-center-acceptance.test.mjs'
  $items += Write-InventoryLine -Kind 'browser' -Command 'node tests/command-center-browser.test.mjs' -Path 'tests/command-center-browser.test.mjs'
  $items += Write-InventoryLine -Kind 'typescript' -Command 'npx.cmd --no-install tsc --noEmit' -Path 'tsconfig.json'
  $items += Write-InventoryLine -Kind 'build' -Command 'npm.cmd run build' -Path 'package.json'
  return $items
}

function Invoke-Inventory {
  param([object[]]$Items)

  $node = Get-NodeExecutable
  $npm = $null
  $npx = $null

  foreach ($item in $Items) {
    Assert-OfflineSafeCommand $item.command
    switch ($item.kind) {
      'syntax' {
        Invoke-TrackedCommand -Label $item.command -FilePath $node -ArgumentList @('--check', (Resolve-TestPath $item.path))
      }
      'gas-syntax' {
        $gasPath = Resolve-TestPath $item.path
        $raw = Get-Content -LiteralPath $gasPath -Raw
        $temp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), ('lvpt-gas-syntax-{0}.js' -f [guid]::NewGuid().ToString('N')))
        try {
          # node --check requires a .js path; pipe equivalent for Apps Script sources.
          Set-Content -LiteralPath $temp -Value $raw -Encoding UTF8
          Invoke-TrackedCommand -Label $item.command -FilePath $node -ArgumentList @('--check', $temp)
        }
        finally {
          Remove-Item -LiteralPath $temp -ErrorAction SilentlyContinue
        }
      }
      'node-test' {
        Invoke-TrackedCommand -Label $item.command -FilePath $node -ArgumentList @((Resolve-TestPath $item.path))
      }
      'ci-regression' {
        Invoke-TrackedCommand -Label $item.command -FilePath $node -ArgumentList @((Resolve-TestPath $item.path))
      }
      'local-phase' {
        Invoke-TrackedCommand -Label $item.command -FilePath $node -ArgumentList @((Resolve-TestPath $item.path))
      }
      'staging-safety' {
        if (-not $npm) { $npm = Get-NpmCmd }
        Invoke-TrackedCommand -Label $item.command -FilePath $npm -ArgumentList @('run', 'test:staging-safety')
      }
      'acceptance' {
        Invoke-TrackedCommand -Label $item.command -FilePath $node -ArgumentList @((Resolve-TestPath $item.path))
      }
      'browser' {
        Invoke-TrackedCommand -Label $item.command -FilePath $node -ArgumentList @((Resolve-TestPath $item.path))
      }
      'typescript' {
        if (-not $npx) { $npx = Get-NpxCmd }
        Invoke-TrackedCommand -Label $item.command -FilePath $npx -ArgumentList @('--no-install', 'tsc', '--noEmit')
      }
      'build' {
        if (-not $npm) { $npm = Get-NpmCmd }
        Invoke-TrackedCommand -Label $item.command -FilePath $npm -ArgumentList @('run', 'build')
      }
      default {
        throw ("Unknown inventory kind: {0}" -f $item.kind)
      }
    }
  }
}

# --- main ---

if ($Mode -eq 'Targeted') {
  $inventory = @(Build-TargetedInventory -Files $TestFiles)
}
else {
  if ($TestFiles -and $TestFiles.Count -gt 0) {
    throw 'Full mode does not accept -TestFiles. Use -Mode Targeted for explicit file lists.'
  }
  $inventory = @(Build-FullInventory)
}

Write-Step ("Mode={0} steps={1}" -f $Mode, $inventory.Count)
# Force array JSON even when a mode yields a single step.
# Markers keep log lines like "[verify] ..." from breaking machine parsers.
Write-Host '[verify-inventory-json]'
Write-Host (ConvertTo-Json -InputObject @($inventory) -Depth 4)
Write-Host '[/verify-inventory-json]'

if ($InventoryOnly) {
  Write-Step 'InventoryOnly complete'
  exit 0
}

try {
  Invoke-Inventory -Items $inventory
  Write-Step ("PASS Mode={0}" -f $Mode)
  exit 0
}
catch {
  Write-Host ("[verify] FAIL: {0}" -f $_.Exception.Message)
  exit 1
}
