param(
    [string]$EngineRoot = "$PSScriptRoot/../../tools/pojav-android",
    [string]$SupportLibraries = "C:/dev/Amethyst-Android/app_pojavlauncher/libs",
    [string]$JavaHome = 'C:/Program Files/Android/Android Studio/jbr',
    [switch]$UseBuiltRuntime,
    [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
# Gradle 8 cannot compile a changed Groovy build script under JDK 25.
if (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe')) {
    $env:JAVA_HOME = $JavaHome
    $env:PATH = "$JavaHome/bin;$env:PATH"
}
$launcherRoot = (Resolve-Path "$PSScriptRoot/..").Path
$enginePath = (Resolve-Path $EngineRoot).Path

# Gradle (Pojav) e o Tauri precisam do SDK; sem ANDROID_HOME o build falha com "SDK location not found".
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
if (-not $env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME }
if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw "Android SDK não encontrado em $env:ANDROID_HOME" }
$localProps = Join-Path $enginePath 'local.properties'
if (-not (Test-Path -LiteralPath $localProps)) {
    Set-Content -LiteralPath $localProps -Value ("sdk.dir=" + ($env:ANDROID_HOME -replace '\\', '/')) -Encoding ascii
}

& python "$PSScriptRoot/prepare-pojav.py" --engine $enginePath --support $SupportLibraries
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar a integração Pojav.' }
if ($PrepareOnly) { return }

$native = Join-Path $launcherRoot 'src-tauri/target/aarch64-linux-android/debug/libtropicalia_launcher_lib.so'
if (-not $UseBuiltRuntime) {
    Push-Location $launcherRoot
    try {
        $started = Get-Date
        # PS 5.1: com 'Stop', qualquer linha no stderr do npx vira erro fatal via 2>&1. Avaliamos o exit code nós mesmos.
        $ErrorActionPreference = 'Continue'
        & npx.cmd tauri android build --debug --target aarch64 --apk --split-per-abi 2>&1 | ForEach-Object { "$_" } | Tee-Object -Variable tauriOutput
        $tauriExit = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($tauriExit -ne 0) {
            $symlinkOnly = ($tauriOutput -join "`n") -match 'Creation symbolic link is not allowed'
            $freshLibrary = (Test-Path -LiteralPath $native) -and (Get-Item -LiteralPath $native).LastWriteTime -ge $started
            $cargoFinished = ($tauriOutput -join "`n") -match 'Finished.*profile.*target'
            if (-not ($symlinkOnly -and (Test-Path -LiteralPath $native) -and ($freshLibrary -or $cargoFinished))) { throw 'Falha no build do runtime Tauri.' }
            Write-Host 'Biblioteca compilada; usando cópia direta no lugar do symlink do Tauri.'
        }
    } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath $native)) { throw "Runtime atualizado não encontrado: $native" }
# Tauri serves embedded assets: copying build/ into Android assets does not refresh them.
$latestWebAsset = Get-ChildItem -LiteralPath (Join-Path $launcherRoot 'build') -File -Recurse |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if ($latestWebAsset -and $latestWebAsset.LastWriteTimeUtc -gt (Get-Item -LiteralPath $native).LastWriteTimeUtc) {
    throw 'O frontend é mais recente que o runtime Tauri. Recompile a biblioteca Android após npm run build antes de empacotar o APK.'
}
$module = Join-Path $enginePath 'app_pojavlauncher'
$jni = Join-Path $module 'src/main/jniLibs/arm64-v8a'
New-Item -ItemType Directory -Path $jni -Force | Out-Null
Copy-Item -LiteralPath $native -Destination $jni -Force
# Web output is generated with hashed filenames; replacing index.html selects the current bundle.
Copy-Item -Path "$launcherRoot/build/*" -Destination "$module/src/main/assets" -Recurse -Force

Push-Location $enginePath
try {
    & .\gradlew.bat :app_pojavlauncher:assembleFullDebug '-Pandroid.injected.build.abi=arm64-v8a' '-Pandroid.injected.testOnly=false' --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o APK integrado Pojav.' }
} finally { Pop-Location }
$candidates = @(
    "$module/build/outputs/apk/full/debug/app_pojavlauncher-full-debug.apk",
    "$module/build/intermediates/apk/full/debug/app_pojavlauncher-full-debug.apk"
)
$apk = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $apk) { throw 'O Gradle terminou sem produzir o APK esperado.' }
$artifacts = Join-Path $launcherRoot 'artifacts'
New-Item -ItemType Directory -Path $artifacts -Force | Out-Null
$destination = Join-Path $artifacts 'TropicaliaLauncher-Pojav-Horizon-arm64-debug.apk'
Copy-Item -LiteralPath $apk -Destination $destination -Force
Write-Host "APK gerado: $destination (sem publicar ou instalar no aparelho)."
