param(
    [string]$SupportLibraries = "C:/dev/Amethyst-Android/app_pojavlauncher/libs"
)
$ErrorActionPreference = 'Stop'
Write-Host 'O build integrado agora usa TeamPojavLauncher. Gerando APK de teste sem alterar dados no aparelho.'
& "$PSScriptRoot/build-pojav.ps1" -SupportLibraries $SupportLibraries
