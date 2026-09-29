param(
    [ValidateSet('start', 'check', 'test-api', 'db-status', 'migrate')]
    [string]$Action = 'start',
    [ValidateRange(1024, 65535)]
    [int]$Port = 8890
)

$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodeExecutable = $nodeCommand.Source
} else {
    $nodeExecutable = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodeExecutable)) {
    throw 'Node.js 24 or newer is required.'
}

$netlifyCli = Join-Path $PSScriptRoot '.netlify\tools\runtime\node_modules\netlify-cli\bin\run.js'
if ($Action -ne 'check' -and -not (Test-Path -LiteralPath $netlifyCli)) {
    throw 'The local Netlify CLI is missing. See LOKALNO.md.'
}

$originalPath = $env:PATH
$originalTestDatabase = $env:TEST_DATABASE_URL
$originalDatabase = $env:NETLIFY_DB_URL
$originalCI = $env:CI
$originalUpdateNotifier = $env:NO_UPDATE_NOTIFIER
$exitCode = 0
Push-Location -LiteralPath $PSScriptRoot
try {
    $env:PATH = (Split-Path -Parent $nodeExecutable) + ';' + (Join-Path $PSScriptRoot '.netlify\tools\npm\bin') + ';' + $env:PATH
    $env:CI = 'true'
    $env:NO_UPDATE_NOTIFIER = '1'
    Remove-Item Env:NETLIFY_DB_URL -ErrorAction SilentlyContinue
    switch ($Action) {
        'start' {
            Write-Host "FM Lighthouse local: http://localhost:$Port"
            Write-Host 'Stop with Ctrl+C. Data is stored in .netlify; production is not used.'
            & $nodeExecutable $netlifyCli dev --offline --no-open --framework '#static' --dir . --functions netlify/functions --port $Port --geo mock
            $exitCode = $LASTEXITCODE
        }
        'check' {
            # The API suite truncates its database. This action intentionally runs only
            # the checks that do not need a database, regardless of inherited settings.
            Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
            & $nodeExecutable 'node_modules/typescript/bin/tsc' --noEmit -p .
            $exitCode = $LASTEXITCODE
            if ($exitCode -eq 0) {
                & $nodeExecutable --test 'tests/*.test.*'
                $exitCode = $LASTEXITCODE
            }
        }
        'db-status' {
            & $nodeExecutable $netlifyCli database status
            $exitCode = $LASTEXITCODE
        }
        'test-api' {
            & $nodeExecutable '.netlify/run-api-tests.mjs'
            $exitCode = $LASTEXITCODE
        }
        'migrate' {
            & $nodeExecutable $netlifyCli database migrations apply
            $exitCode = $LASTEXITCODE
        }
    }
} finally {
    $env:PATH = $originalPath
    $env:TEST_DATABASE_URL = $originalTestDatabase
    $env:NETLIFY_DB_URL = $originalDatabase
    $env:CI = $originalCI
    $env:NO_UPDATE_NOTIFIER = $originalUpdateNotifier
    Pop-Location
}
if ($exitCode -ne 0) { throw "FM Lighthouse command failed (exit $exitCode)." }
