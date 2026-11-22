import re

# 1. Update src/app/home/home.component.ts
with open(r'src/app/home/home.component.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace carousel item
text = text.replace(
    "{ image: '/images/server-features/amethyst-android.png', label: 'Amethyst Android', href: 'https://github.com/gustavodslara/Amethyst-Android/releases/download/TropicaliaCraft/app-debug.apk', target: '_blank' },",
    "{ image: '/images/server-features/tropicalia-launcher.webp', label: 'Tropicalia Launcher Mobile', href: '/downloads/android/TropicaliaLauncher.apk' },"
)
text = text.replace(
    "{ image: '/images/server-features/amethyst-android.png', label: 'Jogue no Celular' },",
    "{ image: '/images/server-features/tropicalia-launcher.webp', label: 'Launcher Supremo Mobile' },"
)

# Replace launcher card
target_card = """    {
      title: 'AMETHYST ANDROID',
      description: 'Sucessor do PojavLauncher para Android! Jogue Java Mods no celular com modpacks pré-instalados (Java Mods + Visual/Performance). Tudo configurado e pronto para jogar!',
      icon: 'fa-solid fa-mobile-screen',
      downloadUrl: '/downloads/android/TropicaliaAmethyst.apk',
      version: 'v0.1.0 (APK)',
      platform: 'Android • Mobile',
      versions: [
        {
          version: 'Android (APK)',
          downloadUrl: '/downloads/android/TropicaliaAmethyst.apk'
        }
      ],
      info: {
        title: 'TROPICALIAAMETHYST - MINECRAFT JAVA NO MOBILE',
        description: 'Launcher móvel baseado no PojavLauncher, pré-configurado com todos os modpacks necessários para jogar no TropicaliaCraft.',
        features: [
          'Fork otimizado do PojavLauncher para Android',
          'Modpack Java Mods pré-instalado',
          'Modpack Visual/Performance incluído',
          'Configuração automática do servidor',
          'Controles otimizados para touch',
          'Suporte a controles externos (Bluetooth)',
          'Compatível com Android 8.0+',
          'Interface personalizada do TropicaliaCraft',
          'Download direto do APK sem anúncios'
        ]
      }
    }"""

repl_card = """    {
      title: 'TROPICALIA LAUNCHER ANDROID',
      description: 'O Launcher Supremo no celular! Nossa UI oficial em SvelteKit + Tauri v2, com suporte unificado a Minecraft Java (Java 8, 17 e 21), Horizon Rust, gerenciador de servidores e Modrinth integrado.',
      icon: 'fa-solid fa-mobile-screen',
      downloadUrl: '/downloads/android/TropicaliaLauncher.apk',
      version: 'v0.1.0 (APK)',
      platform: 'Android • Mobile',
      versions: [
        {
          version: 'Android (APK Universal ARM64)',
          downloadUrl: '/downloads/android/TropicaliaLauncher.apk'
        }
      ],
      info: {
        title: 'TROPICALIA LAUNCHER - APP SUPREMO MOBILE',
        description: 'Mesmo launcher desktop e mobile com a nossa UI moderna, gerenciador de instâncias, Modrinth, criação de servidores locais e suporte a Java e Horizon Rust.',
        features: [
          'Mesma UI e experiência unificada do Desktop e Mobile',
          'Runtimes Java 8, 17 e 21 integrados para todas as versões do Minecraft',
          'Suporte nativo ao motor Horizon Rust (Vulkan acelerado)',
          'Navegador de Mods, Modpacks, Shaders e Plugins via Modrinth',
          'Gerenciador de instâncias e criação de servidores híbridos locais',
          'Controles otimizados para toque e gamepad Bluetooth',
          'Instalação direta com pacote completo oficial'
        ]
      }
    }"""

if target_card in text:
    text = text.replace(target_card, repl_card)
    with open(r'src/app/home/home.component.ts', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Updated home.component.ts successfully!")
else:
    print("Target card not found in home.component.ts!")
