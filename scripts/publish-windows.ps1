<#
  Compila o Tropicalia Launcher para Windows e publica os downloads da landing page.

  Uso (na pasta tropicalia-launcher):
    npm run publish:windows              # compila e publica
    npm run publish:windows -- -SkipBuild  # so publica o que ja foi compilado
#>
param(
  [switch]$SkipBuild,
  [switch]$ForceGnu
)

$ErrorActionPreference = 'Stop'

$mingwBin = Join-Path $env:USERPROFILE 'scoop\apps\mingw\current\bin'
if ((Test-Path $mingwBin) -and ($env:PATH -notlike "*$mingwBin*")) {
  $env:PATH = "$mingwBin;$env:PATH"
}

$launcher = Split-Path -Parent $PSScriptRoot
$repo     = Split-Path -Parent $launcher
$tauri    = Join-Path $launcher 'src-tauri'
$outDirs  = @((Join-Path $repo 'public\downloads\windows'))
$docsDir  = Join-Path $repo 'docs\downloads\windows'
if (Test-Path $docsDir) { $outDirs += $docsDir }

function Test-Msvc {
  if ($ForceGnu) { return $false }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $installed = (& rustup target list --installed 2>$null) -join "`n"
    if ($installed -notmatch 'x86_64-pc-windows-msvc') { return $false }
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path $vswhere)) { return $false }
    $vc = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    return [bool]$vc
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Test-NeedsLoaderDll([string]$exe) {
  $bytes = [System.IO.File]::ReadAllBytes($exe)
  $text  = [System.Text.Encoding]::ASCII.GetString($bytes)
  return $text.Contains('WebView2Loader.dll')
}

$target = $null
if (Test-Msvc) { $target = 'x86_64-pc-windows-msvc' }

if (-not $SkipBuild) {
  Push-Location $launcher
  $ErrorActionPreference = 'Continue'
  try {
    if ($target) {
      Write-Host "==> Compilando com MSVC ($target)" -ForegroundColor Green
      & npx tauri build --target $target
    } else {
      Write-Host '==> Compilando com toolchain padrao GNU/MinGW' -ForegroundColor Yellow
      & npx tauri build
    }
    if ($LASTEXITCODE -ne 0) { throw "tauri build falhou (codigo $LASTEXITCODE)" }
  } finally { Pop-Location; $ErrorActionPreference = 'Stop' }
}

$release = Join-Path $tauri 'target\release'
$msvcRelease = Join-Path $tauri 'target\x86_64-pc-windows-msvc\release'
if ((Test-Path (Join-Path $msvcRelease 'tropicalia-launcher.exe')) -and
    (-not (Test-Path (Join-Path $release 'tropicalia-launcher.exe')) -or
     (Get-Item (Join-Path $msvcRelease 'tropicalia-launcher.exe')).LastWriteTime -gt (Get-Item (Join-Path $release 'tropicalia-launcher.exe')).LastWriteTime)) {
  $release = $msvcRelease
}

$exe = Join-Path $release 'tropicalia-launcher.exe'
$dll = Join-Path $release 'WebView2Loader.dll'
$nsis = Get-ChildItem (Join-Path $release 'bundle\nsis') -Filter '*-setup.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$msi  = Get-ChildItem (Join-Path $release 'bundle\msi') -Filter '*.msi' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not (Test-Path $exe)) { throw "Nao achei $exe - rode sem -SkipBuild." }
if (-not $nsis) { throw 'Nao achei o instalador NSIS em bundle\nsis.' }

$needsDll = Test-NeedsLoaderDll $exe
if ($needsDll -and -not (Test-Path $dll)) {
  throw "O .exe precisa do WebView2Loader.dll, mas nao esta em $release. Recompile."
}

$stage = Join-Path $env:TEMP ('tropicalia-portable-' + [guid]::NewGuid())
New-Item -ItemType Directory $stage | Out-Null
Copy-Item $exe (Join-Path $stage 'TropicaliaLauncher.exe')
if ($needsDll) { Copy-Item $dll (Join-Path $stage 'WebView2Loader.dll') }

$readmeText = @"
Tropicalia Launcher (portatil)

Extraia TODOS os arquivos para a mesma pasta e abra TropicaliaLauncher.exe.
$(if ($needsDll) { 'Nao separe o WebView2Loader.dll do .exe: sem ele o launcher nao abre.' })
Precisa do Microsoft Edge WebView2 Runtime (ja vem no Windows 10/11 atualizado).
Se nao abrir, baixe em: https://go.microsoft.com/fwlink/p/?LinkId=2124703
Prefere nao se preocupar com isso? Use o TropicaliaLauncher-setup.exe.
"@
$readmeText | Set-Content -Encoding UTF8 (Join-Path $stage 'LEIA-ME.txt')

$zip = Join-Path $env:TEMP 'TropicaliaLauncher-portable.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item $stage -Recurse -Force

foreach ($out in $outDirs) {
  New-Item -ItemType Directory -Force $out | Out-Null
  Copy-Item $nsis.FullName (Join-Path $out 'TropicaliaLauncher-setup.exe') -Force
  if ($msi) { Copy-Item $msi.FullName (Join-Path $out 'TropicaliaLauncher.msi') -Force }
  Copy-Item $zip (Join-Path $out 'TropicaliaLauncher-portable.zip') -Force
  if ($needsDll) {
    Copy-Item $nsis.FullName (Join-Path $out 'TropicaliaLauncher.exe') -Force
  } else {
    Copy-Item $exe (Join-Path $out 'TropicaliaLauncher.exe') -Force
  }
  Write-Host "==> Publicado em $out" -ForegroundColor Green
}
Remove-Item $zip

if ($needsDll) {
  Write-Host 'OK: o .exe depende do WebView2Loader.dll; o portatil foi publicado como .zip e TropicaliaLauncher.exe agora e o instalador.' -ForegroundColor Yellow
} else {
  Write-Host 'OK: .exe autonomo (sem DLL extra) publicado.' -ForegroundColor Green
}
