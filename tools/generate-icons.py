"""Generate every launcher icon from the canonical transparent Tropicalia creeper.

Run from any directory: python tools/generate-icons.py (requires Pillow).
"""
from pathlib import Path
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / 'tropicalia-launcher'
SOURCE = ROOT / 'public/images/tropi_creeper.png'
creeper = Image.open(SOURCE).convert('RGBA')

def square(size, fraction=0.88):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    artwork = creeper.copy()
    artwork.thumbnail((int(size * fraction), int(size * fraction)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(artwork, ((size - artwork.width) // 2, (size - artwork.height) // 2))
    return canvas

shutil.copyfile(SOURCE, LAUNCHER / 'static/images/tropi_creeper.png')
square(1024).save(LAUNCHER / 'app-icon.png')
square(192).save(LAUNCHER / 'static/favicon.png')
icons = LAUNCHER / 'src-tauri/icons'
for path in icons.rglob('*.png'):
    with Image.open(path) as old:
        size = old.width
    square(size, 0.60 if path.stem == 'ic_launcher_foreground' else 0.88).save(path)
square(1024).save(icons / 'icon.icns', format='ICNS')
square(256).save(icons / 'icon.ico', format='ICO', sizes=[(s, s) for s in [16, 24, 32, 48, 64, 128, 256]])
android = icons / 'android'
(android / 'values/ic_launcher_background.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#00000000</color></resources>
''')
shutil.copyfile(android / 'mipmap-anydpi-v26/ic_launcher.xml', android / 'mipmap-anydpi-v26/ic_launcher_round.xml')
# Keep both Android packaging routes aligned with the source icon set.
for res in [LAUNCHER / 'src-tauri/gen/android/app/src/main/res', ROOT / 'tools/pojav-android/app_pojavlauncher/src/main/res']:
    if res.is_dir():
        for path in android.rglob('*'):
            if path.is_file():
                dest = res / path.relative_to(android)
                dest.parent.mkdir(parents=True, exist_ok=True)
                # A stale WebP with the same resource name conflicts with the PNG.
                if dest.suffix == '.png':
                    dest.with_suffix('.webp').unlink(missing_ok=True)
                shutil.copyfile(path, dest)
print('Generated transparent desktop, Android, iOS and web launcher icons.')

# Engine windows and packaged executables use the same transparent artwork.
for engine in ['horizon-android', 'horizon-desktop']:
    base = ROOT / 'tools' / engine
    if not base.is_dir():
        continue
    square(64).save(base / 'crates/horizon-theme/icons/horizon-64.png')
    packaging = base / 'packaging/icons'
    if packaging.is_dir():
        shutil.copyfile(icons / 'icon.ico', packaging / 'horizon.ico')
        shutil.copyfile(icons / 'icon.icns', packaging / 'horizon.icns')
        for png in packaging.rglob('*.png'):
            with Image.open(png) as old:
                size = old.width
            square(size).save(png)
    branding = base / 'crates/horizon-client/src/branding'
    branding.mkdir(exist_ok=True)
    art = creeper.copy()
    art.thumbnail((80, 120), Image.Resampling.LANCZOS)
    art.save(branding / 'creeper.png')
    logo = Image.open(LAUNCHER / 'static/images/tropicalia_logo.png').convert('RGBA')
    logo.thumbnail((500, 234), Image.Resampling.LANCZOS)
    logo.save(branding / 'logo.png')
