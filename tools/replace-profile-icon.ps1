Add-Type -AssemblyName System.Drawing

$srcPath = "C:\dev\projetos\git-repos\public\ng-tropicaliacraft-landing-page\tropicalia-launcher\static\images\tropi_creeper.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

$bmp = New-Object System.Drawing.Bitmap(256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

$padY = 16
$availH = 256 - 32
$scale = $availH / $src.Height
$destW = [int]($src.Width * $scale)
$destX = [int]((256 - $destW) / 2)

$g.DrawImage($src, $destX, $padY, $destW, $availH)
$g.Dispose()

# Remove the old webp fallback icon so the PNG is picked up
$oldWebp = "C:\dev\Amethyst-Android\app_pojavlauncher\src\main\res\drawable\ic_pojav_full.webp"
if (Test-Path $oldWebp) {
    Remove-Item $oldWebp -Force
}

$destPng = "C:\dev\Amethyst-Android\app_pojavlauncher\src\main\res\drawable\ic_pojav_full.png"
$bmp.Save($destPng, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$src.Dispose()

Write-Host "Replaced ic_pojav_full with Tropi-Creeper successfully!"
