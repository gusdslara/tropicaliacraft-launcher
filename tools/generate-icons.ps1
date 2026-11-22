$ErrorActionPreference = 'Stop'
& python (Join-Path $PSScriptRoot 'generate-icons.py')
if ($LASTEXITCODE -ne 0) { throw 'Failed to generate launcher icons.' }
