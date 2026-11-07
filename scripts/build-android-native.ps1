$ErrorActionPreference = "Stop"
$ndk = "C:\Users\GUS\AppData\Local\Android\Sdk\ndk\27.3.13750724"
$llvmBin = "$ndk\toolchains\llvm\prebuilt\windows-x86_64\bin"
$mingwBin = "C:\Users\GUS\scoop\apps\mingw\current\bin"

$env:ANDROID_HOME = "C:\Users\GUS\AppData\Local\Android\Sdk"
$env:NDK_HOME = $ndk
$env:ANDROID_NDK_ROOT = $ndk
$env:PATH = "$llvmBin;$mingwBin;" + $env:PATH

$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$llvmBin\clang.exe"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS = "-C link-arg=--target=aarch64-linux-android34 -C link-arg=-Wl,-z,max-page-size=16384"
$env:CC_aarch64_linux_android = "$llvmBin\clang.exe"
$env:CFLAGS_aarch64_linux_android = "--target=aarch64-linux-android34"

Write-Host "1/3 Compilando libjava_exec.so com alinhamento 16KB..."
& "$llvmBin\aarch64-linux-android34-clang.cmd" -pie -fPIE "-Wl,-z,max-page-size=16384" -ldl "$PSScriptRoot\..\src-tauri\native\java_exec.c" -o "$PSScriptRoot\..\src-tauri\native\libjava_exec.so"

$jniDir = "$PSScriptRoot\..\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force -Path $jniDir | Out-Null
Copy-Item "$PSScriptRoot\..\src-tauri\native\libjava_exec.so" "$jniDir\libjava_exec.so" -Force

Write-Host "2/3 Compilando libtropicalia_launcher_lib.so (Rust aarch64) com alinhamento 16KB..."
Set-Location "$PSScriptRoot\..\src-tauri"
cargo build --target aarch64-linux-android

Copy-Item "$PSScriptRoot\..\src-tauri\target\aarch64-linux-android\debug\libtropicalia_launcher_lib.so" "$jniDir\libtropicalia_launcher_lib.so" -Force

Write-Host "3/3 Verificando alinhamento ELF 16KB..."
& "$llvmBin\llvm-readelf.exe" -l "$jniDir\libjava_exec.so" | Select-String "LOAD"
& "$llvmBin\llvm-readelf.exe" -l "$jniDir\libtropicalia_launcher_lib.so" | Select-String "LOAD"
Write-Host "Native build concluída com sucesso!"
