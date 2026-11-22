$ErrorActionPreference = "Stop"
$androidRes = "C:\dev\Amethyst-Android\app_pojavlauncher\src\main\res"
$tauriAndroid = "C:\dev\projetos\git-repos\public\ng-tropicaliacraft-landing-page\tropicalia-launcher\src-tauri\icons\android"

if (-not (Test-Path $androidRes)) {
    throw "Amethyst-Android res not found at $androidRes"
}

# 1. Set background color to transparent #00000000 in values/ic_launcher_background.xml
$bgXml = Join-Path $androidRes "values\ic_launcher_background.xml"
@"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#00000000</color>
</resources>
"@ | Set-Content -Encoding UTF8 $bgXml
Write-Host "Updated ic_launcher_background.xml to #00000000"

# 2. Copy mipmap-anydpi-v26/ic_launcher.xml
Copy-Item (Join-Path $tauriAndroid "mipmap-anydpi-v26\ic_launcher.xml") (Join-Path $androidRes "mipmap-anydpi-v26\ic_launcher.xml") -Force
# Also copy for ic_launcher_round.xml
Copy-Item (Join-Path $tauriAndroid "mipmap-anydpi-v26\ic_launcher.xml") (Join-Path $androidRes "mipmap-anydpi-v26\ic_launcher_round.xml") -Force

# 3. Copy density mipmaps
$densities = @("mipmap-hdpi", "mipmap-mdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi")
foreach ($d in $densities) {
    $srcDir = Join-Path $tauriAndroid $d
    $dstDir = Join-Path $androidRes $d
    if (Test-Path $srcDir) {
        Copy-Item (Join-Path $srcDir "*") $dstDir -Force
        # Remove old webp background so it doesn't conflict
        $oldWebp = Join-Path $dstDir "ic_launcher_background.webp"
        if (Test-Path $oldWebp) { Remove-Item $oldWebp -Force }
    }
}
Write-Host "Updated Android mipmap folders"

# 4. Replace ic_pojav_full.png and delete any ic_pojav_full.webp
$oldWebpFull = Join-Path $androidRes "drawable\ic_pojav_full.webp"
if (Test-Path $oldWebpFull) { Remove-Item $oldWebpFull -Force }
Copy-Item "C:\dev\projetos\git-repos\public\ng-tropicaliacraft-landing-page\tropicalia-launcher\src-tauri\icons\128x128@2x.png" (Join-Path $androidRes "drawable\ic_pojav_full.png") -Force
Write-Host "Updated ic_pojav_full.png"
