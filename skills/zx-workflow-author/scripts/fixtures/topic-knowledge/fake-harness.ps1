param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $HarnessArguments
)

# Forward literal arguments to the cross-platform fixture without evaluating them as PowerShell.
$fixture = Join-Path $PSScriptRoot "fake-harness.mjs"
& (Get-Command node -CommandType Application).Source $fixture @HarnessArguments
exit $LASTEXITCODE
