import re

with open(r'src/app/home/home.component.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace any occurrence of TropicaliaAmethyst.apk with TropicaliaLauncher.apk
text = text.replace('/downloads/android/TropicaliaAmethyst.apk', '/downloads/android/TropicaliaLauncher.apk')

# Replace titles
text = re.sub(r"title:\s*'AMETHYST ANDROID'", "title: 'TROPICALIA LAUNCHER ANDROID'", text)
text = re.sub(r"title:\s*'TROPICALIAAMETHYST - MINECRAFT JAVA NO MOBILE'", "title: 'TROPICALIA LAUNCHER - APP SUPREMO MOBILE'", text)
text = text.replace("Sucessor do PojavLauncher para Android! Jogue Java Mods no celular com modpacks pré-instalados (Java Mods + Visual/Performance). Tudo configurado e pronto para jogar!",
                    "O Launcher Supremo no celular! Nossa UI oficial, suporte unificado a Minecraft Java (todas as versões), Horizon Rust, gerenciador de servidores e Modrinth integrado.")
text = text.replace("Launcher móvel baseado no PojavLauncher, pré-configurado com todos os modpacks necessários para jogar no TropicaliaCraft.",
                    "Mesmo launcher desktop e mobile: interface unificada, gerenciador de instâncias, Modrinth, criação de servidores locais e suporte a Java e Horizon Rust.")

with open(r'src/app/home/home.component.ts', 'w', encoding='utf-8') as f:
    f.write(text)
print("home.component.ts updated successfully!")

# 2. Update downloads-modal.component.ts
with open(r'src/app/shared/components/downloads-modal/downloads-modal.component.ts', 'r', encoding='utf-8') as f:
    modal_text = f.read()

modal_text = modal_text.replace("androidTitle: 'TropicaliaAmethyst (Android):'", "androidTitle: 'Tropicalia Launcher (Android):'")
modal_text = modal_text.replace("androidText: 'Download the APK directly to your phone.", "androidText: 'Download the official unified Launcher APK directly to your phone.")
modal_text = modal_text.replace("androidText: 'Descarga el APK directamente en el móvil.", "androidText: 'Descarga el APK del Launcher unificado directamente en el móvil.")
modal_text = modal_text.replace("androidText: 'Baixe o APK diretamente no celular.", "androidText: 'Baixe o APK do Launcher Supremo unificado diretamente no celular.")
modal_text = modal_text.replace("// Mobile: Focus on TropicaliaAmethyst (index 1 - Android launcher)", "// Mobile: Focus on Tropicalia Launcher Android")

with open(r'src/app/shared/components/downloads-modal/downloads-modal.component.ts', 'w', encoding='utf-8') as f:
    f.write(modal_text)
print("downloads-modal.component.ts updated successfully!")

# 3. Update updates.json
import json
for up_path in ['public/downloads/updates.json', 'docs/downloads/updates.json']:
    with open(up_path, 'r', encoding='utf-8') as f:
        up = json.load(f)
    if 'android-arm64' in up['platforms']:
        up['platforms']['android-arm64']['url'] = 'https://tropicaliacraft.online/downloads/android/TropicaliaLauncher.apk'
        up['platforms']['android-arm64']['binary'] = 'TropicaliaLauncher.apk'
    with open(up_path, 'w', encoding='utf-8') as f:
        json.dump(up, f, indent=2, ensure_ascii=False)
    print("Updated", up_path)
