<#
.SYNOPSIS
  Restricted resumable LVPT local-agent loop (dry-run safe by default).

.DESCRIPTION
  Extends the discovered .orchestrator harness and T4 policy
  (scripts/local-agent-policy.mjs). Does not create a competing loop.

  -DryRun selects the next eligible task from orchestrator/progress state
  without AI usage, API calls, or CLI authentication.

  Paid worker launch stays fail-closed until enforceable workspace and
  credential isolation plus verifiable budget accounting exist. Inspected
  CLI flags (--sandbox, --worktree) alone are insufficient; policy text and
  post-execution diffs never authorize launch.

  Arbitrary model-generated shell is denied by the policy allowlist.
  Pre-existing dirty files are preserved via baseline hashes; unexpected
  protected-file changes stop the loop without restoring files.
  Git commit/push/deploy are never performed by this script.

.PARAMETER DryRun
  Select next task and report readiness; exit 0 on successful selection path.

.PARAMETER Json
  Emit machine-readable JSON from the Node loop core.
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
Set-Location -LiteralPath $RepoRoot

$LoopCore = Join-Path $RepoRoot 'scripts\local-agent-loop.mjs'
if (-not (Test-Path -LiteralPath $LoopCore)) {
  throw "Missing loop core: scripts/local-agent-loop.mjs"
}

$PolicyEnforcer = Join-Path $RepoRoot 'scripts\local-agent-policy.mjs'
if (-not (Test-Path -LiteralPath $PolicyEnforcer)) {
  throw "Missing policy enforcer: scripts/local-agent-policy.mjs"
}

function Write-Loop {
  param([string]$Message)
  Write-Host ("[local-agent-loop] {0}" -f $Message)
}

# Never pass secrets into Node argv or prompt material.
$nodeArgs = @($LoopCore)
if ($DryRun) {
  $nodeArgs += '--dry-run'
} else {
  Write-Loop 'Non-dry-run path evaluates worker launch gate (fail-closed while isolation inadequate).'
}
if ($Json) {
  $nodeArgs += '--json'
}

Write-Loop ("repoRoot={0}" -f $RepoRoot)
Write-Loop 'Inspected CLI help before design: agent --help (sandbox/worktree/force/yolo/api-key); agent worker --help (auth-token-file).'
Write-Loop 'Denied launch args: --force --yolo --api-key'
Write-Loop 'Authorization boundary: scripts/local-agent-policy.mjs'

& node @nodeArgs
$exit = $LASTEXITCODE
if ($null -eq $exit) {
  $exit = 0
}

if ($DryRun -and $exit -eq 0) {
  Write-Loop 'Dry-run complete: next task selected without AI/API/CLI auth.'
  Write-Loop 'Paid execution remains disabled until owner budget + trusted isolation executor.'
}

exit $exit
