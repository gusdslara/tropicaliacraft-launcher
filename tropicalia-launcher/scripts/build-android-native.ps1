$ErrorActionPreference = "Stop"
$ndk = "C:\Users\GUS\AppData\Local\Android\Sdk\ndk\27.3.13750724"
$llvmBin = "$ndk\toolchains\llvm\prebuilt\windows-x86_64\bin"
$mingwBin = "C:\Users\GUS\scoop\apps\mingw\current\bin"

$env:ANDROID_HOME = "C:\Users\GUS\AppData\Local\Android\Sdk"
$env:NDK_HOME = $ndk
$env:ANDROID_NDK_ROOT = $ndk
$env:PATH = "$llvmBin;$mingwBin;" + $env:PATH

$env:RUSTC_BOOTSTRAP = '1'
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$llvmBin\clang.exe"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS = "-Z tls-model=global-dynamic -C link-arg=--target=aarch64-linux-android34 -C link-arg=-Wl,-z,max-page-size=16384"
$env:CC_aarch64_linux_android = "$llvmBin\clang.exe"
$env:CFLAGS_aarch64_linux_android = "--target=aarch64-linux-android34"

Write-Host "0/4 Compilando frontend SvelteKit (build estático com adapter-static)..."
Set-Location "$PSScriptRoot\.."
& bun run build

Write-Host "1/4 Compilando libtropicalia_launcher_lib.so (Rust aarch64 RELEASE) com alinhamento 16KB..."
Set-Location "$PSScriptRoot\..\src-tauri"
cargo build --release --target aarch64-linux-android

$releaseSo = "$PSScriptRoot\..\src-tauri\target\aarch64-linux-android\release\libtropicalia_launcher_lib.so"
$amethystJni = "C:\dev\Amethyst-Android\app_pojavlauncher\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force -Path $amethystJni | Out-Null
Copy-Item $releaseSo "$amethystJni\libtropicalia_launcher_lib.so" -Force

$tauriJni = "$PSScriptRoot\..\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force -Path $tauriJni | Out-Null
Copy-Item $releaseSo "$tauriJni\libtropicalia_launcher_lib.so" -Force

Write-Host "2/4 Compilando libhorizon_android.so (Rust aarch64 RELEASE) com alinhamento 16KB..."
Set-Location "$PSScriptRoot\..\..\tools\horizon-android"
cargo build --package horizon-android --release --target aarch64-linux-android

$horizonReleaseSo = "$PSScriptRoot\..\..\tools\horizon-android\target\aarch64-linux-android\release\libhorizon_android.so"
if (Test-Path $horizonReleaseSo) {
    Copy-Item $horizonReleaseSo "$amethystJni\libhorizon_android.so" -Force
    $repoLibDir = "$PSScriptRoot\..\..\lib\arm64-v8a"
    New-Item -ItemType Directory -Force -Path $repoLibDir | Out-Null
    Copy-Item $horizonReleaseSo "$repoLibDir\libhorizon_android.so" -Force
    Write-Host "libhorizon_android.so compilado e sincronizado com sucesso!"
} else {
    Write-Warning "libhorizon_android.so não encontrada em $horizonReleaseSo"
}

Write-Host "3/4 Copiando assets web e engine-data para o Amethyst-Android..."
$webBuild = "$PSScriptRoot\..\build"
$amethystAssets = "C:\dev\Amethyst-Android\app_pojavlauncher\src\main\assets"
if (Test-Path "$amethystAssets\_app") {
    Remove-Item "$amethystAssets\_app" -Recurse -Force
}
if (Test-Path $webBuild) {
    Copy-Item "$webBuild\*" $amethystAssets -Recurse -Force
}
$engineData = "$PSScriptRoot\..\..\assets\engine-data.zip"
if (Test-Path $engineData) {
    Copy-Item $engineData "$amethystAssets\engine-data.zip" -Force
    Write-Host "Sincronizado engine-data.zip nos assets."
}
# Garantir remoção do splash legado e inserção da logo oficial
if (Test-Path "$amethystAssets\amethyst.png") {
    Remove-Item "$amethystAssets\amethyst.png" -Force
}
$logoPath = "$PSScriptRoot\..\..\public\images\tropicaliacraft-logo.png"
if (Test-Path $logoPath) {
    Copy-Item $logoPath "$amethystAssets\tropicalia_logo.png" -Force
}

Write-Host "4/4 Verificando alinhamento ELF 16KB..."
& "$llvmBin\llvm-readelf.exe" -l "$amethystJni\libtropicalia_launcher_lib.so" | Select-String "LOAD"
if (Test-Path "$amethystJni\libhorizon_android.so") {
    & "$llvmBin\llvm-readelf.exe" -l "$amethystJni\libhorizon_android.so" | Select-String "LOAD"
}
Write-Host "Native build concluída com sucesso!"
