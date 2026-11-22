import sys

path = r'C:\dev\Amethyst-Android\app_pojavlauncher\src\main\java\com\tropicaliacraft\launcher\MainActivity.java'
with open(path, 'rb') as f:
    content = f.read()

idx = content.find(b'private void checkHorizonLaunchTrigger()')
assert idx != -1

new_code = """private void checkHorizonLaunchTrigger() {
        File trigger = findTriggerFile("tropicalia-horizon-launch.json");
        if (trigger == null) return;
        String raw = null;
        try {
            raw = Tools.read(trigger);
        } catch (Throwable ignored) {}
        trigger.delete();

        try {
            File filesDir = getFilesDir();
            // 1. Assegurar flag de auto-launch para o motor Horizon entrar direto no jogo
            new File(filesDir, "tropicalia-auto.flag").createNewFile();

            // 2. Configurar android-launcher.json com os dados do launcher
            if (raw != null && !raw.trim().isEmpty()) {
                JSONObject json = new JSONObject(raw);
                String name = json.optString("name", "Player");
                String server = json.optString("server", "");
                JSONObject launcherConfig = new JSONObject();
                launcherConfig.put("name", name);
                launcherConfig.put("server", server);
                File cfgFile = new File(filesDir, "android-launcher.json");
                Tools.write(cfgFile.getAbsolutePath(), launcherConfig.toString(2));
            }

            // 3. Suprimir tela de acessibilidade e avisos para iniciar direto no jogo
            File optionsFile = new File(filesDir, "options.txt");
            if (optionsFile.exists()) {
                String options = Tools.read(optionsFile);
                boolean changed = false;
                if (options.contains("onboardAccessibility:true")) {
                    options = options.replace("onboardAccessibility:true", "onboardAccessibility:false");
                    changed = true;
                } else if (!options.contains("onboardAccessibility:false")) {
                    options = options + "\\nonboardAccessibility:false";
                    changed = true;
                }
                if (options.contains("skipMultiplayerWarning:false")) {
                    options = options.replace("skipMultiplayerWarning:false", "skipMultiplayerWarning:true");
                    changed = true;
                } else if (!options.contains("skipMultiplayerWarning:true")) {
                    options = options + "\\nskipMultiplayerWarning:true";
                    changed = true;
                }
                if (changed) {
                    Tools.write(optionsFile.getAbsolutePath(), options);
                }
            } else {
                Tools.write(optionsFile.getAbsolutePath(), "onboardAccessibility:false\\nskipMultiplayerWarning:true\\n");
            }

            // 4. Iniciar HorizonActivity embutido diretamente no mesmo processo / app
            Intent intent = new Intent(this, dev.horizon.android.HorizonActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Throwable e) {
            Log.e(TAG, "Falha ao iniciar Horizon Rust embutido", e);
            Tools.showError(this, e);
        }
    }
}
"""

with open(path, 'wb') as f:
    f.write(content[:idx] + new_code.encode('utf-8'))

print('Successfully patched MainActivity.java!')
