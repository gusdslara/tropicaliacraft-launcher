package com.tropicaliacraft.launcher;

import android.content.Intent;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.AtomicFile;
import android.util.Log;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.NewJREUtil;
import net.kdt.pojavlaunch.authenticator.AuthType;
import net.kdt.pojavlaunch.authenticator.accounts.Account;
import net.kdt.pojavlaunch.authenticator.accounts.Accounts;
import net.kdt.pojavlaunch.game.GameActivity;
import net.kdt.pojavlaunch.instances.Instance;
import net.kdt.pojavlaunch.instances.Instances;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.tasks.AsyncAssetManager;
import net.kdt.pojavlaunch.tasks.MoJsonDownloader;
import net.kdt.pojavlaunch.tasks.MoJsonExtras;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

/** Tropicalia UI entry point. Compiled into the Pojav APK, with no external intent/token handoff. */
public class MainActivity extends TauriActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean destroyed;
    /** Sem esse lock muitos aparelhos descartam o multicast do "Abrir para LAN" (224.0.2.60). */
    private WifiManager.MulticastLock lanLock;
    private final Runnable poll = new Runnable() {
        public void run() {
            if (destroyed) return;
            File transfer = new File(getDataRoot(), "tropicalia-controls-transfer.json");
            if (transfer.isFile()) {
                try {
                    JSONObject request = new JSONObject(Tools.read(transfer));
                    transfer.delete();
                    boolean exporting = "export".equals(request.getString("mode"));
                    transferText = request.optString("text", "");
                    Intent intent = new Intent(exporting ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    if (exporting) intent.putExtra(Intent.EXTRA_TITLE, "tropicalia-controls.json");
                    startActivityForResult(intent, exporting ? 7301 : 7302);
                } catch (Exception e) { transferReply(null, e.toString()); }
            }
            File kill = new File(getDataRoot(), "tropicalia-game-kill.json");
            if (kill.isFile()) {
                kill.delete();
                killHorizon();
                startService(new Intent(MainActivity.this, net.kdt.pojavlaunch.services.GameService.class).putExtra("kill", true));
                try { writeJson(new File(getDataRoot(), "tropicalia-game-exit.json"), new JSONObject().put("code", 0)); }
                catch (Exception e) { Log.e("Tropicalia", "Falha ao informar parada", e); }
            }
            File trigger = new File(getDataRoot(), "tropicalia-java-launch.json");
            if (trigger.isFile()) {
                try {
                    JSONObject payload = new JSONObject(Tools.read(trigger));
                    if (!trigger.delete()) throw new IllegalStateException("Não foi possível consumir o pedido Java.");
                    killHorizon(); // only one game at a time

                    worker.execute(() -> launch(payload));
                } catch (Exception e) { fail(e); }
            }
            // Rust asks for a Java runtime it needs outside the game (local servers, installers).
            File runtimeRequest = new File(getDataRoot(), "tropicalia-java-runtime.json");
            if (runtimeRequest.isFile()) {
                try {
                    int major = new JSONObject(Tools.read(runtimeRequest)).getInt("major");
                    runtimeRequest.delete();
                    worker.execute(() -> installRuntime(major));
                } catch (Exception e) { runtimeRequest.delete(); runtimeReply(null, e.toString()); }
            }
            // The controls editor asks for landscape so it matches the game screen.
            File orientation = new File(getDataRoot(), "tropicalia-orientation.json");
            if (orientation.isFile()) {
                try {
                    boolean landscape = new JSONObject(Tools.read(orientation)).optBoolean("landscape", false);
                    orientation.delete();
                    setRequestedOrientation(landscape
                        ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                        : android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                } catch (Exception e) { orientation.delete(); Log.w("Tropicalia", "Pedido de orientação inválido", e); }
            }
            // Keep the existing embedded Horizon engine available to the same UI.
            File rust = new File(getDataRoot(), "tropicalia-horizon-launch.json");
            if (rust.isFile()) {
                try {
                    // Rust writes a compatibility copy in files/. Consume both once.
                    rust.delete();
                    new File(getFilesDir(), "tropicalia-horizon-launch.json").delete();
                    horizonRetried = false;
                    startHorizon();
                } catch (Exception e) { rust.delete(); fail(e); }
            }
            // A Vulkan device loss leaves the startup marker behind; relaunch once so the
            // engine's own OpenGL ES recovery takes over instead of sending the player back.
            if (horizonStartedAt > 0 && !horizonRetried) {
                long elapsed = System.currentTimeMillis() - horizonStartedAt;
                File panic = new File(getFilesDir(), "performance/last-rust-panic.txt");
                if (elapsed > 60000) horizonRetried = true;
                else if (panic.lastModified() >= horizonStartedAt
                        && new File(getFilesDir(), "vulkan-startup.pending").isFile()) {
                    horizonRetried = true;
                    Log.w("Tropicalia", "Horizon caiu na inicialização Vulkan; relançando em modo de recuperação.");
                    try { startHorizon(); } catch (Exception e) { fail(e); }
                }
            }
            if (horizonActive && System.currentTimeMillis() - horizonStartedAt > 4000) {
                android.app.ActivityManager manager = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
                java.util.List<android.app.ActivityManager.RunningAppProcessInfo> processes = manager.getRunningAppProcesses();
                boolean alive = false;
                if (processes != null) for (android.app.ActivityManager.RunningAppProcessInfo process : processes) {
                    if ((getPackageName() + ":horizon").equals(process.processName)) alive = true;
                }
                if (!alive) {
                    horizonActive = false;
                    try { writeJson(new File(getDataRoot(), "tropicalia-game-exit.json"), new JSONObject().put("code", 0)); }
                    catch (Exception e) { Log.w("Tropicalia", "Could not report Horizon exit", e); }
                }
            }
            handler.postDelayed(this, 350);
        }
    };

    private long horizonStartedAt;
    private boolean horizonRetried;
    private boolean horizonActive;

    /** Starts Horizon in a fresh process: its native event loop cannot be created twice. */
    private void startHorizon() {
        boolean killed = killHorizon();
        horizonStartedAt = System.currentTimeMillis();
        horizonActive = true;
        Runnable start = () -> {
            try {
                startActivity(new Intent().setClassName(getPackageName(), "dev.horizon.android.HorizonActivity"));
                writeJson(new File(getDataRoot(), "tropicalia-game-status.json"), new JSONObject().put("engine", "rust"));
            }
            catch (Exception e) { fail(e); }
        };
        if (killed) handler.postDelayed(start, 600); else start.run();
    }

    /** Ends a running Horizon process; returns whether one was found. */
    private boolean killHorizon() {
        horizonActive = false;
        android.app.ActivityManager manager = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
        java.util.List<android.app.ActivityManager.RunningAppProcessInfo> running = manager.getRunningAppProcesses();
        boolean killed = false;
        if (running != null) for (android.app.ActivityManager.RunningAppProcessInfo info : running) {
            if (info.processName.endsWith(":horizon")) { android.os.Process.killProcess(info.pid); killed = true; }
        }
        return killed;
    }

    private File getDataRoot() { return new File(getApplicationInfo().dataDir); }

    private String transferText;
    private void transferReply(String text, String error) {
        try {
            JSONObject reply = new JSONObject();
            if (text != null) reply.put("text", text);
            if (error != null) reply.put("error", error);
            writeJson(new File(getDataRoot(), "tropicalia-controls-transfer-result.json"), reply);
        } catch (Exception e) { Log.e("Tropicalia", "Layout transfer failed", e); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 7301 && request != 7302) return;
        if (result != RESULT_OK || data == null || data.getData() == null) { transferReply(null, null); return; }
        try {
            if (request == 7301) {
                try (java.io.OutputStream output = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (output == null) throw new java.io.IOException("Cannot open document");
                    output.write(transferText.getBytes(StandardCharsets.UTF_8));
                }
                transferReply("", null);
            } else {
                try (java.io.InputStream input = getContentResolver().openInputStream(data.getData())) {
                    if (input == null) throw new java.io.IOException("Cannot open document");
                    java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                    byte[] buffer = new byte[4096]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (bytes.size() + count > 32000) throw new java.io.IOException("Layout too large");
                        bytes.write(buffer, 0, count);
                    }
                    transferReply(new String(bytes.toByteArray(), StandardCharsets.UTF_8), null);
                }
            }
        } catch (Exception e) { transferReply(null, e.toString()); }
        finally { transferText = null; }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wifi != null) {
                lanLock = wifi.createMulticastLock("tropicalia-lan");
                lanLock.setReferenceCounted(false);
                lanLock.acquire();
            }
        } catch (Exception e) { Log.w("Tropicalia", "Multicast lock indisponível", e); }
        worker.execute(() -> {
            try {
                File target = new File(getFilesDir(), "engine-data.zip");
                if (!target.isFile()) Tools.copyAssetFile(this, "engine-data.zip", getFilesDir().getAbsolutePath(), true);
            } catch (Exception e) { Log.w("Tropicalia", "Recursos Horizon indisponíveis", e); }
        });
        try { Tools.write(new File(getDataRoot(), ".native_lib_dir"), getApplicationInfo().nativeLibraryDir); }
        catch (Exception e) { Log.w("Tropicalia", "Could not save native library path", e); }
        handler.post(poll);
    }
    @Override public void onDestroy() {
        destroyed = true;
        handler.removeCallbacks(poll);
        worker.shutdown();
        try { if (lanLock != null && lanLock.isHeld()) lanLock.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }

    public static void writeJson(File file, JSONObject value) throws Exception {
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream output = atomic.startWrite();
        try {
            output.write(value.toString().getBytes(StandardCharsets.UTF_8));
            atomic.finishWrite(output);
        } catch (Exception e) { atomic.failWrite(output); throw e; }
    }

    public static void reportProgress(String stage, int progress, int resid, Object... args) {
        try {
            boolean runtime = "unpack_runtime".equals(stage);
            String message = runtime ? "Preparando Java" : "download_minecraft".equals(stage) ? "Baixando Minecraft" : "Preparando recursos";
            if (args != null && args.length > 0) message += ": " + String.valueOf(args[0]);
            writeJson(new File(Tools.DIR_DATA, "tropicalia-progress.json"), new JSONObject()
                .put("stage", runtime ? "java" : "libraries").put("current", Math.max(0, progress)).put("total", 100).put("message", message));
        } catch (Exception e) { Log.w("Tropicalia", "Falha ao informar progresso", e); }
    }

    public static void reportGameState(String filename, int code) {
        try { writeJson(new File(Tools.DIR_DATA, filename), new JSONObject().put("code", code)); }
        catch (Exception e) { Log.w("Tropicalia", "Falha ao informar estado", e); }
    }

    private void launch(JSONObject request) {
        boolean prepare = "prepare".equals(request.optString("phase"));
        try {
            String id = request.getString("instanceId");
            if (!id.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException("ID de instância inválido.");
            File game = new File(request.getString("gameDir")).getCanonicalFile();
            File expected = new File(getDataRoot(), "instances/" + id).getCanonicalFile();
            if (!game.equals(expected)) throw new IllegalArgumentException("Pasta da instância inválida.");
            File shared = new File(request.getString("sharedDir")).getCanonicalFile();
            if (!shared.equals(new File(getDataRoot(), "shared").getCanonicalFile()))
                throw new IllegalArgumentException("Pasta de recursos inválida.");
            game.mkdirs();
            new File(getDataRoot(), "tropicalia-auto.flag").delete();
            new File(getFilesDir(), "tropicalia-auto.flag").delete();
            LauncherPreferences.loadPreferences(this);
            String version = request.getString("versionId");
            JSONObject metadata = new JSONObject();
            metadata.put("name", id);
            metadata.put("versionId", version);
            metadata.put("sharedData", false);
            String renderer = request.optString("javaRenderer", "opengles_mobileglues");
            // Minecraft 26.2+ ships its own Vulkan backend, and the bundled GL translators cannot
            // compile its shaders. GL4ES makes the OpenGL probe fail cleanly so the game picks Vulkan.
            boolean nativeVulkan = hasVulkanBackend(request.optString("gameVersion", ""))
                && ("opengles_mobileglues".equals(renderer) || "opengles2".equals(renderer) || "null".equals(renderer) || renderer.isEmpty());
            if (nativeVulkan) renderer = "opengles2";
            metadata.put("renderer", renderer);
            metadata.put("argsMode", Instance.ARGS_MODE_REPLACE);
            metadata.put("jvmArgs", request.optString("jvmArgs", ""));
            // The launcher's shared touch layout (same images and positions as the Rust engine).
            if (new File(Tools.CTRLMAP_PATH, "tropicalia.json").isFile()) metadata.put("controlLayout", "tropicalia.json");
            String runtime = request.optString("javaRuntime", "");
            if (!runtime.isEmpty() && !"null".equals(runtime)) metadata.put("selectedRuntime", runtime);
            writeJson(new File(game, "mojo_instance.json"), metadata);
            LauncherPreferences.DEFAULT_PREF.edit()
                .putString(LauncherPreferences.PREF_KEY_CURRENT_INSTANCE, id)
                .putInt("allocation", request.optInt("memoryMb", 1536))
                .putInt("tropicaliaMemoryMin", Math.min(request.optInt("memoryMb", 1536), Math.max(256, request.optInt("memoryMinMb", 512))))
                .putBoolean("tropicaliaNativeVulkan", nativeVulkan)
                .putString("tropicaliaLanguage", request.optString("language", "pt_br"))
                // Draw under the camera cutout like Horizon does, so both games use the full screen.
                .putBoolean("ignoreNotch", true)
                .putBoolean("use_angle", request.optBoolean("useAngle", false)).commit();
            LauncherPreferences.loadPreferences(this);

            if (prepare) {
                // Runs before Forge/NeoForge's headless installer is invoked by Rust.
                NewJREUtil.installNewJreIfNeeded(getAssets(), Tools.getVersionInfo(version));
                writeJson(new File(getDataRoot(), "tropicalia-java-ready.json"), new JSONObject().put("ok", true));
                return;
            }

            String uuid = request.getString("uuid");
            Account account = null;
            for (Account existing : Accounts.load().accounts) {
                if (uuid.equals(existing.profileId)) { account = existing; break; }
            }
            if (account == null) account = Accounts.create(a -> a.profileId = uuid);
            account.username = request.getString("username");
            account.isMicrosoft = "msa".equals(request.getString("userType"));
            account.authType = account.isMicrosoft ? AuthType.MICROSOFT : AuthType.LOCAL;
            account.accessToken = account.isMicrosoft ? request.getString("accessToken") : "0";
            account.xuid = request.optString("xuid", "");
            account.save();
            // The game starts in another process, so persist the selection before starting it.
            LauncherPreferences.DEFAULT_PREF.edit().putString("selected_account_file", account.mSaveLocation.getName()).commit();
            writeJson(new File(getDataRoot(), "tropicalia-game-paths.json"), new JSONObject()
                .put("latestLog", new File(Tools.DIR_GAME_HOME, "latestlog.txt").getAbsolutePath()));
            MoJsonDownloader.prepareSubstitutionMap(getAssets());
            AsyncAssetManager.unpackSingleFiles(this);
            AsyncAssetManager.unpackComponents(this);
            new MoJsonDownloader().start(getAssets(), null, version, new MoJsonExtras.DoneListener() {
                public void onDownloadDone(File[] classpath) {
                    net.kdt.pojavlaunch.progresskeeper.ProgressKeeper.waitUntilDone(() -> runOnUiThread(() -> {
                        try {
                            Intent intent = new Intent(MainActivity.this, GameActivity.class);
                            intent.putExtra(GameActivity.INTENT_LAUNCH_VERSION, version);
                            intent.putExtra(GameActivity.INTENT_LAUNCH_CLASSPATH, classpath);
                            writeJson(new File(getDataRoot(), "tropicalia-game-starting.json"),
                                new JSONObject().put("engine", "java").put("time", System.currentTimeMillis()));
                            startActivity(intent);
                        } catch (Exception e) { fail(e); }
                    }));
                }
                public void onDownloadFailed(Throwable e) { fail(e); }
            });
        } catch (Throwable e) {
            if (prepare) {
                try { writeJson(new File(getDataRoot(), "tropicalia-java-ready.json"), new JSONObject().put("error", e.toString())); }
                catch (Exception ignored) { Log.e("Tropicalia", "Falha ao confirmar preparação", ignored); }
            } else fail(e);
        }
    }

    /**
     * Downloads and unpacks the Pojav runtime for a Java major version (17, 21 or 25) using the same
     * signed source the game uses. Answers in tropicalia-java-runtime-ready.json.
     */
    private void installRuntime(int major) {
        try {
            NewJREUtil.ExternalRuntime selected = null;
            for (NewJREUtil.ExternalRuntime candidate : NewJREUtil.ExternalRuntime.values()) {
                if (candidate.majorVersion == major) { selected = candidate; break; }
            }
            if (selected == null) throw new IllegalArgumentException("Java " + major + " não está disponível para Android.");
            if (!new File(getDataRoot(), "runtimes/" + selected.name + "/release").isFile()) {
                selected.downloadRuntime(getAssets());
            }
            runtimeReply(selected.name, null);
        } catch (Throwable e) {
            Log.e("Tropicalia", "Falha ao instalar Java " + major, e);
            runtimeReply(null, e.getCause() != null ? e.getCause().toString() : e.toString());
        }
    }

    private void runtimeReply(String name, String error) {
        try {
            JSONObject reply = new JSONObject();
            if (name != null) reply.put("ok", true).put("name", name);
            if (error != null) reply.put("error", error);
            writeJson(new File(getDataRoot(), "tropicalia-java-runtime-ready.json"), reply);
        } catch (Exception e) { Log.e("Tropicalia", "Falha ao responder pedido de Java", e); }
    }

    /** True for the year-based releases that include the Vulkan backend (26.2 and newer). */
    private static boolean hasVulkanBackend(String gameVersion) {
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("^(\\d+)\\.(\\d+)").matcher(gameVersion);
        if (!match.find()) return false;
        int major = Integer.parseInt(match.group(1)), minor = Integer.parseInt(match.group(2));
        return major > 26 || (major == 26 && minor >= 2);
    }

    private void fail(Throwable error) {
        Log.e("Tropicalia", "Falha no motor Java", error);
        try {
            Tools.write(new File(getDataRoot(), "tropicalia-latestlog.txt"), error.toString());
            writeJson(new File(getDataRoot(), "tropicalia-game-exit.json"), new JSONObject().put("code", -1));
        } catch (Exception e) { Log.e("Tropicalia", "Falha ao informar encerramento", e); }
    }
}
