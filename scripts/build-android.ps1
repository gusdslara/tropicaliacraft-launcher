$ErrorActionPreference = "Stop"
$env:PATH = "C:\Users\GUS\scoop\apps\mingw\current\bin;" + $env:PATH
$env:ANDROID_HOME = "C:\Users\GUS\AppData\Local\Android\Sdk"
$env:NDK_HOME = "C:\Users\GUS\AppData\Local\Android\Sdk\ndk\27.3.13750724"

Set-Location "$PSScriptRoot\.."
Write-Host "Iniciando Tauri Android Build (aarch64)..."
npx.cmd tauri android build --debug --target aarch64 --apk --split-per-abi
