"""Apply the Tropicalia overlay to TeamPojavLauncher pojav-legacy-v2 (917a026).

Does not publish an APK or install/uninstall anything on a device.
"""
import argparse
import hashlib
import shutil
import os
import subprocess
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--engine', type=Path, required=True)
parser.add_argument('--support', type=Path, required=True, help='Directory containing existing Tauri Android support jars')
parser.add_argument('--skip-pumpkin', action='store_true',
                    help='Do not bundle the Pumpkin (Rust) server; the app then downloads it on first use')
args = parser.parse_args()
launcher = Path(__file__).resolve().parents[1]
engine = args.engine.resolve()
app = engine / 'app_pojavlauncher'
java = app / 'src/main/java'

def patch(path, old, new):
    source = path.read_text(encoding='utf-8')
    if new in source:
        return
    if old not in source:
        raise RuntimeError(f'Upstream incompatible: expected patch not found in {path}')
    path.write_text(source.replace(old, new, 1), encoding='utf-8')

# Keep this integrated APK newer than the initial Tauri 0.1.0 package (10000001).
patch(app / 'build.gradle', 'versionCode getDateSeconds()',
      'versionCode((project.findProperty("tropicaliaVersionCode") ?: "10000002").toInteger())')
patch(app / 'build.gradle', 'versionName getVersionName()', 'versionName "0.1.0"')

for name in ['tauri-android.jar', 'tauri-launcher-support.jar', 'tauri-plugin-dialog.jar', 'tauri-plugin-opener.jar']:
    source = args.support / name
    if not source.is_file():
        raise RuntimeError(f'Missing Tauri support library: {source}')
    (app / 'libs').mkdir(exist_ok=True)
    shutil.copy2(source, app / 'libs' / name)

shutil.copytree(launcher / 'android/pojav', java, dirs_exist_ok=True)
horizon_source = args.support.parent / 'src/main/java/dev/horizon/android'
horizon_library = args.support.parent / 'src/main/jniLibs/arm64-v8a/libhorizon_android.so'
# Prefer the engine built from this repository (tools/horizon-android) when it is newer.
horizon_built = launcher.parent / 'tools/horizon-android/target/aarch64-linux-android/release/libhorizon_android.so'
if horizon_built.is_file() and (not horizon_library.is_file() or horizon_built.stat().st_mtime > horizon_library.stat().st_mtime):
    horizon_library = horizon_built
if horizon_source.is_dir() and horizon_library.is_file():
    shutil.copytree(horizon_source, java / 'dev/horizon/android', dirs_exist_ok=True)
    horizon_target = app / 'src/main/jniLibs/arm64-v8a'
    horizon_target.mkdir(parents=True, exist_ok=True)
    shutil.copy2(horizon_library, horizon_target / horizon_library.name)
    horizon_manifest = '''<activity android:name="dev.horizon.android.HorizonActivity"
        android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboardHidden|keyboard|navigation|uiMode|density"
        android:exported="false" android:launchMode="singleTask" android:process=":horizon"
        android:screenOrientation="sensorLandscape" android:theme="@android:style/Theme.NoTitleBar.Fullscreen">
        <meta-data android:name="android.app.lib_name" android:value="horizon_android" />
    </activity>
    </application>'''
    patch(app / 'src/main/AndroidManifest.xml', '</application>', horizon_manifest)
else:
    raise RuntimeError('Missing existing Horizon engine: provide the libs directory from the integrated Android module.')
engine_data = launcher.parent / 'assets/engine-data.zip'
if engine_data.is_file():
    shutil.copy2(engine_data, app / 'src/main/assets/engine-data.zip')
icons = launcher / 'src-tauri/icons/android'
for resource in icons.rglob('*'):
    if resource.is_file():
        destination = app / 'src/main/res' / resource.relative_to(icons)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.suffix == ".png":
            destination.with_suffix(".webp").unlink(missing_ok=True)
        shutil.copy2(resource, destination)
shutil.copy2(icons / 'mipmap-anydpi-v26/ic_launcher.xml', app / 'src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml')
alias = java / 'com/tropicaliacraft/launcher/BuildConfig.java'
alias.write_text('''package com.tropicaliacraft.launcher;
public final class BuildConfig {
    public static final boolean DEBUG = net.kdt.pojavlaunch.BuildConfig.DEBUG;
    public static final String APPLICATION_ID = net.kdt.pojavlaunch.BuildConfig.APPLICATION_ID;
    public static final String BUILD_TYPE = net.kdt.pojavlaunch.BuildConfig.BUILD_TYPE;
    public static final int VERSION_CODE = net.kdt.pojavlaunch.BuildConfig.VERSION_CODE;
    public static final String VERSION_NAME = net.kdt.pojavlaunch.BuildConfig.VERSION_NAME;
}
''', encoding='utf-8')

tools = java / 'net/kdt/pojavlaunch/Tools.java'
# Remove the previous overlay's root override before inserting the canonical one.
source = tools.read_text(encoding='utf-8')
source = source.replace('        if (ctx.getPackageName().startsWith("com.tropicaliacraft.launcher")) return ctx.getFilesDir();\n', '')
tools.write_text(source, encoding='utf-8')
patch(tools, 'if(SDK_INT >= 29) {\n            return ctx.getExternalFilesDir(null);\n        }',
      'if (ctx.getPackageName().startsWith("com.tropicaliacraft.launcher")) return new File(ctx.getApplicationInfo().dataDir);\n        if(SDK_INT >= 29) {\n            return ctx.getExternalFilesDir(null);\n        }')
patch(tools, 'DIR_GAME_NEW = DIR_GAME_HOME + "/.minecraft";', 'DIR_GAME_NEW = DIR_GAME_HOME + "/shared";')
patch(tools, 'Intent intent = new Intent(context, LauncherActivity.class);', 'Intent intent = new Intent(context, com.tropicaliacraft.launcher.MainActivity.class);')
patch(tools, 'intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);', 'intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);')
progress = java / 'net/kdt/pojavlaunch/progresskeeper/ProgressKeeper.java'
patch(progress, 'public static synchronized void submitProgress(String progressRecord, int progress, int resid, Object... va) {',
      'public static synchronized void submitProgress(String progressRecord, int progress, int resid, Object... va) {\n        com.tropicaliacraft.launcher.MainActivity.reportProgress(progressRecord, progress, resid, va);')
game = java / 'net/kdt/pojavlaunch/game/GameActivity.java'
patch(game, 'public void hideLoadingScreen(){', 'public void hideLoadingScreen(){\n        com.tropicaliacraft.launcher.MainActivity.reportGameState("tropicalia-game-status.json", 0);')
# Loading screen text follows the launcher's language instead of Pojav's English strings.
patch(game, 'mLoadingScreen = findViewById(R.id.main_loading_screen);',
      'mLoadingScreen = findViewById(R.id.main_loading_screen);\n        com.tropicaliacraft.launcher.LoadingText.apply(mLoadingScreen);')
patch(game, '.setText(getString(R.string.loading_screen_booted, PLATFORM.backendName()));',
      '.setText(com.tropicaliacraft.launcher.LoadingText.ready());')
# The joystick knob takes the layout's border colour so it matches the themed buttons.
joystick = java / 'net/kdt/pojavlaunch/customcontrols/buttons/ControlJoystick.java'
patch(joystick, 'setBackgroundColor(getProperties().bgColor);',
      'setBackgroundColor(getProperties().bgColor);\n        setButtonColor(getProperties().strokeColor);')
service = java / 'net/kdt/pojavlaunch/services/GameService.java'
patch(service, 'Process.killProcess(Process.myPid());', 'com.tropicaliacraft.launcher.MainActivity.reportGameState("tropicalia-game-exit.json", 0);\n            Process.killProcess(Process.myPid());')
application = java / 'net/kdt/pojavlaunch/PojavApplication.java'
patch(application, 'Thread.setDefaultUncaughtExceptionHandler((thread, th) -> {', 'Thread.setDefaultUncaughtExceptionHandler((thread, th) -> {\n            com.tropicaliacraft.launcher.MainActivity.reportGameState("tropicalia-game-exit.json", -1);')
runner = java / 'net/kdt/pojavlaunch/utils/jre/GameRunner.java'
patch(runner, 'Tools.restartLauncherActivity(activity);', 'com.tropicaliacraft.launcher.MainActivity.reportGameState("tropicalia-game-exit.json", 0);\n        Tools.restartLauncherActivity(activity);')
patch(runner, 'Log.i("GameRunner", "Running with "+ launchArgs.toString());', 'Log.i("GameRunner", "Starting Minecraft " + versionId);')
# Skip the GL4ES compatibility prompts when the game is going to render with its own Vulkan backend.
patch(runner, 'boolean isGl4es = renderer instanceof GLESRenderSpec.GL4ESRenderSpec;',
      'boolean isGl4es = renderer instanceof GLESRenderSpec.GL4ESRenderSpec\n                && !LauncherPreferences.DEFAULT_PREF.getBoolean("tropicaliaNativeVulkan", false);')
# The splash + creeper notice always get their time before Pojav fades the loading screen.
patch(game, '''public void hideLoadingScreen(){
        com.tropicaliacraft.launcher.MainActivity.reportGameState("tropicalia-game-status.json", 0);
        if(mLoadingScreen == null) return;''',
      '''public void hideLoadingScreen(){
        com.tropicaliacraft.launcher.MainActivity.reportGameState("tropicalia-game-status.json", 0);
        if(mLoadingScreen == null) return;
        if(com.tropicaliacraft.launcher.LoadingText.deferHide(mLoadingScreen, this::hideLoadingScreen)) return;''')
# Low-RAM warning: a non-blocking "pickup" notice in the top corner instead of a modal dialog.
patch(runner, '''                if (LifecycleAwareAlertDialog.haltOnDialog(activity.getLifecycle(), activity, dialogCreator)) {
                    return; // If the dialog's lifecycle has ended, return without
                    // actually launching the game, thus giving us the opportunity
                    // to start after the activity is shown again
                }''', '''                com.tropicaliacraft.launcher.RamNotice.show(activity, finalDeviceMemory,
                        LauncherPreferences.PREF_RAM_ALLOCATION, showAddressMemoryWarning);''')
java_runner = java / 'net/kdt/pojavlaunch/utils/jre/JavaRunner.java'
patch(java_runner, '"-Xms"+LauncherPreferences.PREF_RAM_ALLOCATION+"M"', '"-Xms"+LauncherPreferences.DEFAULT_PREF.getInt("tropicaliaMemoryMin", 512)+"M"')

manifest = app / 'src/main/AndroidManifest.xml'
patch(manifest, 'android:name="net.kdt.pojavlaunch.TestStorageActivity"', 'android:name="com.tropicaliacraft.launcher.MainActivity"')
# Rotating (the controls editor asks for landscape) must not recreate the WebView.
patch(manifest, 'android:name="com.tropicaliacraft.launcher.MainActivity"\n            android:exported="true"',
      'android:name="com.tropicaliacraft.launcher.MainActivity"\n            android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboardHidden|keyboard|uiMode|density"\n            android:exported="true"')
patch(manifest, 'android:allowBackup="true"', 'android:allowBackup="false"')
patch(manifest, '<application', '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n    <application')
# LAN discovery (MainActivity holds a MulticastLock so "Open to LAN" announcements reach the launcher).
patch(manifest, '<application', '<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />\n    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />\n    <application')
cmake = app / 'src/main/jni/CMakeLists.txt'
for module in ['mojoexec', 'glfw', 'sdl']:
    patch(cmake, f'add_subdirectory({module})', f'add_subdirectory("${{CMAKE_CURRENT_SOURCE_DIR}}/../../../../{module}" "${{CMAKE_CURRENT_BINARY_DIR}}/{module}")')
# Vulkan shim: keeps Minecraft's own Vulkan backend upright on Android (see vulkan_shim.c).
shutil.copy2(launcher / 'android/pojav-native/mojoexec/vulkan_shim.c', engine / 'mojoexec/vulkan_shim.c')
mojoexec_cmake = engine / 'mojoexec/CMakeLists.txt'
source = mojoexec_cmake.read_text(encoding='utf-8')
if 'tropicalia_vulkan' not in source:
    mojoexec_cmake.write_text(source + '''

add_library(tropicalia_vulkan SHARED vulkan_shim.c)
target_link_options(tropicalia_vulkan PRIVATE "-Wl,-z,max-page-size=16384")
''', encoding='utf-8')
patch(engine / 'mojoexec/vulkan_loader.c', '    void* vulkan_ptr = dlopen("libvulkan.so", flags);',
      '    void* vulkan_ptr = dlopen("libtropicalia_vulkan.so", flags);\n    if(vulkan_ptr == NULL) vulkan_ptr = dlopen("libvulkan.so", flags);')
native_source = app / 'src/main/jni/tropicalia_java_exec.c'
shutil.copy2(launcher / 'src-tauri/native/java_exec.c', native_source)
source = cmake.read_text(encoding='utf-8')
old_executor = '''
add_executable(tropicalia_java_exec tropicalia_java_exec.c)
target_link_libraries(tropicalia_java_exec PRIVATE dl log)
set_target_properties(tropicalia_java_exec PROPERTIES OUTPUT_NAME "libjava_exec.so")
'''
if old_executor in source:
    cmake.write_text(source.replace(old_executor, ''), encoding='utf-8')
# AGP only packages shared-library targets; package the PIE executable explicitly as a JNI file.
ndk = os.environ.get('NDK_HOME') or os.environ.get('ANDROID_NDK_HOME')
if not ndk:
    sdk = Path(os.environ.get('ANDROID_HOME', Path.home() / 'AppData/Local/Android/Sdk'))
    candidates = list((sdk / 'ndk').glob('*'))
    if not candidates:
        raise RuntimeError('Set NDK_HOME to an installed Android NDK.')
    ndk = max(candidates, key=lambda p: tuple(int(n) for n in p.name.split('.')))
_host = {'win32': 'windows-x86_64', 'darwin': 'darwin-x86_64'}.get(__import__('sys').platform, 'linux-x86_64')
clang = Path(ndk) / f"toolchains/llvm/prebuilt/{_host}/bin/clang{'.exe' if _host.startswith('windows') else ''}"
subprocess.run([str(clang), '--target=aarch64-linux-android24', '-fPIE', '-pie',
                '-Wl,-z,max-page-size=16384', str(native_source), '-ldl', '-llog',
                '-o', str(app / 'src/main/jniLibs/arm64-v8a/libjava_exec.so')], check=True)

# Pumpkin (servidor Minecraft em Rust): empacotado como o libjava_exec.so, porque o Android só executa
# programas a partir da pasta de bibliotecas nativas do APK. Release oficial fixo, conferido por SHA-256
# (o mesmo digest publicado pelo GitHub). Ao atualizar a versão, troque a tag e o hash juntos.
PUMPKIN_TAG = '0.2.2+26.3-26.60'
PUMPKIN_SHA256 = '77a0fc7f2ec01646b849524509043ba884a246a7687a838c78a7bfb40b171ab1'
PUMPKIN_URL = ('https://github.com/Pumpkin-MC/Pumpkin/releases/download/'
               + PUMPKIN_TAG.replace('+', '%2B') + '/pumpkin-aarch64-android')

def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()

pumpkin_target = app / 'src/main/jniLibs/arm64-v8a/libpumpkin.so'
if args.skip_pumpkin:
    pumpkin_target.unlink(missing_ok=True)
elif not (pumpkin_target.is_file() and sha256_of(pumpkin_target) == PUMPKIN_SHA256):
    cached = launcher / 'src-tauri/target' / f'pumpkin-aarch64-android-{PUMPKIN_SHA256[:12]}'
    if not (cached.is_file() and sha256_of(cached) == PUMPKIN_SHA256):
        cached.parent.mkdir(parents=True, exist_ok=True)
        print(f'Baixando Pumpkin {PUMPKIN_TAG} para Android (cerca de 125 MB)...')
        partial = cached.with_suffix('.part')
        urllib.request.urlretrieve(PUMPKIN_URL, partial)
        got = sha256_of(partial)
        if got != PUMPKIN_SHA256:
            partial.unlink()
            raise RuntimeError(f'Pumpkin: SHA-256 inesperado ({got}); o download foi descartado.')
        partial.replace(cached)
    pumpkin_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(cached, pumpkin_target)

gradle = app / 'build.gradle'
patch(gradle, '    buildFeatures {', '''    androidResources {
        ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
    }

    buildFeatures {''')
patch(gradle, 'android.applicationVariants.configureEach', 'project.extensions.getByName("android").applicationVariants.configureEach')
patch(gradle, 'project.android.sourceSets', 'project.extensions.getByName("android").sourceSets')
patch(gradle, "applicationId \"net.kdt.pojavlaunch\"", "applicationId \"com.tropicaliacraft.launcher\"")
patch(gradle, 'minSdkVersion 23', 'minSdkVersion 24')
patch(gradle, "applicationIdSuffix '.debug'", "applicationIdSuffix ''")
patch(gradle, "resValue 'string', 'application_package', 'net.kdt.pojavlaunch.debug'", "resValue 'string', 'application_package', 'com.tropicaliacraft.launcher'")
patch(gradle, "resValue 'string', 'storageProviderAuthorities', 'net.kdt.pojavlaunch.scoped.gamefolder.debug'", "resValue 'string', 'storageProviderAuthorities', 'com.tropicaliacraft.launcher.scoped.gamefolder'")
APP_NAME = 'TropicaliaLauncher'
source = gradle.read_text(encoding='utf-8')
for key in ['app_name', 'app_short_name']:
    for old in ['PojavLauncher (Debug)', 'Tropicalia Launcher']:
        source = source.replace(f'resValue "string", "{key}", "{old}"', f'resValue "string", "{key}", "{APP_NAME}"')
if f'resValue "string", "app_name", "{APP_NAME}"' not in source:
    raise RuntimeError('Upstream incompatible: debug app_name resValue not found')
gradle.write_text(source, encoding='utf-8')
# Pojav's translations define app_name/app_short_name per locale, which beat the resValue above:
# devices in pt-BR, es, de... showed "PojavLauncher". Drop them so every locale uses APP_NAME,
# and rebrand the remaining user-visible mentions (crash dialog, notifications, storage notice).
import re
for strings in (app / 'src/main/res').glob('values*/strings.xml'):
    text = strings.read_text(encoding='utf-8')
    updated = re.sub(r'[ \t]*<string name="app_(?:short_)?name"[^>]*>.*?</string>\r?\n', '', text)
    updated = re.sub(r'(?i)pojavlauncher', APP_NAME, updated)
    updated = re.sub(r'\bPojav\b', APP_NAME, updated)
    if updated != text:
        strings.write_text(updated, encoding='utf-8')
source = gradle.read_text(encoding='utf-8')
if '// Tropicalia runtime dependencies' not in source:
    gradle.write_text(source + '''
// Tropicalia runtime dependencies
dependencies {
    implementation 'androidx.webkit:webkit:1.14.0'
    implementation 'com.fasterxml.jackson.core:jackson-core:2.15.3'
    implementation 'com.fasterxml.jackson.core:jackson-databind:2.15.3'
    implementation 'com.fasterxml.jackson.core:jackson-annotations:2.15.3'
    implementation('com.fasterxml.jackson.datatype:jackson-datatype-json-org:2.15.3') {
        exclude group: 'org.json', module: 'json'
    }
}
''', encoding='utf-8')
print(f'Tropicalia overlay prepared at {engine}')
