package com.tropicaliacraft.launcher

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class MainActivity : TauriActivity() {
  private val tag = "TropicaliaLauncher"
  private val pollHandler = Handler(Looper.getMainLooper())
  private var isDestroyedActivity = false

  private val launchPoller = object : Runnable {
    override fun run() {
      if (isDestroyedActivity) return
      try {
        checkHorizonLaunchTrigger()
        checkJavaLaunchTrigger()
      } catch (t: Throwable) {
        Log.e(tag, "Error checking launch triggers", t)
      }
      if (!isDestroyedActivity) {
        pollHandler.postDelayed(this, 350)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    isDestroyedActivity = false
    requestLauncherPermissions()
    unpackBundledAssets()
    pollHandler.postDelayed(launchPoller, 400)
  }

  override fun onResume() {
    super.onResume()
    isDestroyedActivity = false
    pollHandler.removeCallbacks(launchPoller)
    pollHandler.post(launchPoller)
  }

  override fun onDestroy() {
    isDestroyedActivity = true
    pollHandler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  private fun findTriggerFile(filename: String): File? {
    try {
      val f = File(applicationInfo.dataDir, filename)
      if (f.exists()) return f
    } catch (_: Throwable) {}
    try {
      val f = File(filesDir, filename)
      if (f.exists()) return f
    } catch (_: Throwable) {}
    return null
  }

  private fun syncPojavProfileAndAccount(payload: JSONObject) {
    try {
      val versionId = payload.optString("versionId", "1.21.4")
      val username = payload.optString("username", "Jogador")
      val uuid = payload.optString("uuid", "00000000-0000-0000-0000-000000000000")
      val accessToken = payload.optString("accessToken", "0")
      val userType = payload.optString("userType", "legacy")
      val memoryMb = payload.optInt("memoryMb", 4096)
      val jvmArgs = payload.optString("jvmArgs", "")
      val gameDir = payload.optString("gameDir", "")
      val isMicrosoft = userType == "msa"

      val candidateRoots = listOf(
        filesDir,
        File(Environment.getExternalStorageDirectory(), "Android/data/net.kdt.pojavlaunch/files"),
        File(Environment.getExternalStorageDirectory(), "games/PojavLauncher"),
        File("/storage/emulated/0/Android/data/net.kdt.pojavlaunch/files"),
        File(Environment.getExternalStorageDirectory(), "Android/data/org.angelauramc.amethyst.debug/files"),
        File(Environment.getExternalStorageDirectory(), "games/Amethyst")
      )

      for (root in candidateRoots) {
        try {
          if (!root.exists()) root.mkdirs()
        } catch (_: Throwable) {}
        if (!root.exists() && !root.canWrite()) continue

        val dotMinecraft = File(root, ".minecraft").apply { if (!exists()) mkdirs() }
        val accountsDir = File(root, "accounts").apply { if (!exists()) mkdirs() }
        val dotAccountsDir = File(dotMinecraft, "accounts").apply { if (!exists()) mkdirs() }

        // 1. Escreve / atualiza launcher_profiles.json
        val profileJson = JSONObject().apply {
          put("name", "TropicaliaCraft $versionId")
          put("lastVersionId", versionId)
          put("icon", "default")
          val memArgs = "-Xms1024M -Xmx${memoryMb}M -XX:+UseG1GC $jvmArgs".trim()
          put("javaArgs", memArgs)
          if (gameDir.isNotEmpty()) {
            put("gameDir", gameDir)
          }
        }

        for (targetFile in listOf(File(root, "launcher_profiles.json"), File(dotMinecraft, "launcher_profiles.json"))) {
          try {
            val rootObj = if (targetFile.exists()) {
              try { JSONObject(targetFile.readText()) } catch (_: Throwable) { JSONObject() }
            } else {
              JSONObject()
            }
            val profiles = rootObj.optJSONObject("profiles") ?: JSONObject().also { rootObj.put("profiles", it) }
            profiles.put("TropicaliaCraft", profileJson)
            rootObj.put("selectedProfile", "TropicaliaCraft")
            targetFile.writeText(rootObj.toString(2))
          } catch (e: Throwable) {
            Log.w(tag, "Falha ao gravar launcher_profiles.json em $targetFile: $e")
          }
        }

        // 2. Escreve conta Pojav: accounts/<username>.json
        val accountObj = JSONObject().apply {
          put("username", username)
          put("profileId", uuid)
          put("accessToken", accessToken)
          put("clientToken", "0")
          put("isMicrosoft", isMicrosoft)
          put("selectedVersion", versionId)
          put("expiresAt", System.currentTimeMillis() + 86400000L)
        }

        for (dir in listOf(accountsDir, dotAccountsDir)) {
          try {
            val accFile = File(dir, "$username.json")
            accFile.writeText(accountObj.toString(2))
          } catch (e: Throwable) {
            Log.w(tag, "Falha ao gravar conta em $dir: $e")
          }
        }

        // 3. user_cache.json
        val userCacheObj = JSONObject().apply {
          put("selectedUser", username)
          val users = JSONObject()
          users.put(username, accountObj)
          put("users", users)
        }
        for (f in listOf(File(root, "user_cache.json"), File(dotMinecraft, "user_cache.json"))) {
          try {
            f.writeText(userCacheObj.toString(2))
          } catch (_: Throwable) {}
        }
      }
    } catch (e: Throwable) {
      Log.e(tag, "Erro ao sincronizar perfil Java", e)
    }
  }

  private fun checkHorizonLaunchTrigger() {
    val trigger = findTriggerFile("tropicalia-horizon-launch.json") ?: return
    var username = "Player"
    var server = ""
    var gameDir = ""
    var sessionFile = ""
    var lang = "pt_br"
    var extraArgs = JSONArray()
    try {
      val text = trigger.readText()
      val obj = JSONObject(text)
      username = obj.optString("name", "Player")
      server = obj.optString("server", "")
      gameDir = obj.optString("game_dir", "")
      sessionFile = obj.optString("session_file", "")
      lang = obj.optString("lang", "pt_br")
      extraArgs = obj.optJSONArray("extra_arguments") ?: JSONArray()
      trigger.delete()
    } catch (_: Throwable) {
      try { trigger.delete() } catch (_: Throwable) {}
    }

    // Remove eventual duplicate trigger in filesDir
    try {
      File(filesDir, "tropicalia-horizon-launch.json").delete()
    } catch (_: Throwable) {}

    Log.i(tag, "Acionando inicialização do Horizon Rust (user=$username, gameDir=$gameDir)...")

    try {
      if (!filesDir.exists()) filesDir.mkdirs()

      // Garantir que engine-data.zip esteja disponível em filesDir
      val zipFile = File(filesDir, "engine-data.zip")
      if (!zipFile.exists() || zipFile.length() == 0L) {
        copyAssetFile("engine-data.zip", zipFile)
      }

      // Atualizar android-launcher.json preservando opções existentes de tela/renderizador
      val launcherFile = File(filesDir, "android-launcher.json")
      val launcherCfg = if (launcherFile.exists()) {
        try { JSONObject(launcherFile.readText()) } catch (_: Throwable) { JSONObject() }
      } else {
        JSONObject()
      }
      launcherCfg.put("name", username)
      launcherCfg.put("server", server)
      if (gameDir.isNotEmpty()) {
        launcherCfg.put("game_dir", gameDir)
      } else {
        launcherCfg.remove("game_dir")
      }
      if (sessionFile.isNotEmpty()) {
        launcherCfg.put("session_file", sessionFile)
      } else {
        launcherCfg.remove("session_file")
      }
      launcherFile.writeText(launcherCfg.toString(2))

      // Gravar argumentos extras em android-launch.json
      File(filesDir, "android-launch.json").writeText(extraArgs.toString())

      // Flag de auto-start imediato
      File(filesDir, "tropicalia-auto.flag").writeText("1")
      try { File(filesDir, "android-error.txt").delete() } catch (_: Throwable) {}

      // Garantir idioma e opções em filesDir e em gameDir
      val targetDirs = mutableListOf(filesDir)
      if (gameDir.isNotEmpty()) {
        val gd = File(gameDir)
        if (!gd.exists()) gd.mkdirs()
        targetDirs.add(gd)
      }
      for (dir in targetDirs) {
        val optFile = File(dir, "options.txt")
        val text = if (optFile.exists()) optFile.readText() else ""
        if (!text.contains("lang:")) {
          optFile.writeText((text.trimEnd() + "\nlang:$lang\nonboardAccessibility:false\nskipMultiplayerWarning:true\n").trimStart())
        }
      }
    } catch (e: Throwable) {
      Log.w(tag, "Erro ao preparar arquivos do Horizon em filesDir: $e")
    }

    // Iniciar HorizonActivity embutida em processo dedicado (:horizon)
    try {
      val embeddedIntent = Intent(this, dev.horizon.android.HorizonActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra("username", username)
        if (server.isNotEmpty()) putExtra("server", server)
      }
      startActivity(embeddedIntent)
      runOnUiThread {
        Toast.makeText(this, "Iniciando TropicaliaCraft (Minecraft 26.3)...", Toast.LENGTH_SHORT).show()
      }
      return
    } catch (e: Throwable) {
      Log.e(tag, "Falha ao iniciar HorizonActivity embutida: $e")
    }
  }

  private fun checkJavaLaunchTrigger() {
    val trigger = findTriggerFile("tropicalia-java-launch.json") ?: return
    var payload: JSONObject? = null
    try {
      val text = trigger.readText()
      payload = JSONObject(text)
      trigger.delete()
    } catch (e: Throwable) {
      Log.e(tag, "Falha ao ler trigger java launch: $e")
      try { trigger.delete() } catch (_: Throwable) {}
    }

    Log.i(tag, "Acionando inicialização do Minecraft Java...")

    if (payload != null) {
      syncPojavProfileAndAccount(payload)
    }

    val versionId = payload?.optString("versionId", "") ?: ""
    val username = payload?.optString("username", "") ?: ""
    val serverAddress = payload?.optString("serverAddress", "") ?: ""

    // 1. Tentar abrir o motor Java embutido
    try {
      val embeddedJava = Intent().setClassName(packageName, "net.kdt.pojavlaunch.MainActivity")
      if (packageManager.resolveActivity(embeddedJava, 0) != null) {
        embeddedJava.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (versionId.isNotEmpty()) {
          embeddedJava.putExtra("intent_version", versionId)
          embeddedJava.putExtra("version", versionId)
        }
        embeddedJava.putExtra("profile", "TropicaliaCraft")
        if (username.isNotEmpty()) embeddedJava.putExtra("username", username)
        if (serverAddress.isNotEmpty()) embeddedJava.putExtra("server", serverAddress)
        startActivity(embeddedJava)
        return
      }
    } catch (e: Throwable) {
      Log.w(tag, "Embedded Java MainActivity not available: $e")
    }

    // 2. Fallback para runtime Java instalado no sistema
    for (pkg in listOf("net.kdt.pojavlaunch", "net.kdt.pojavlaunch.debug", "org.angelauramc.amethyst.debug", "org.angelauramc.amethyst")) {
      try {
        val extIntent = packageManager.getLaunchIntentForPackage(pkg)
        if (extIntent != null) {
          extIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
          if (versionId.isNotEmpty()) {
            extIntent.putExtra("intent_version", versionId)
            extIntent.putExtra("version", versionId)
          }
          extIntent.putExtra("profile", "TropicaliaCraft")
          if (username.isNotEmpty()) extIntent.putExtra("username", username)
          if (serverAddress.isNotEmpty()) extIntent.putExtra("server", serverAddress)
          startActivity(extIntent)
          return
        }
      } catch (e: Throwable) {
        Log.w(tag, "Erro ao disparar $pkg: $e")
      }
    }
  }

  private fun requestLauncherPermissions() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      if (!Environment.isExternalStorageManager()) {
        try {
          val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
          intent.data = Uri.parse("package:$packageName")
          startActivity(intent)
        } catch (e: Exception) {
          val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
          startActivity(intent)
        }
      }
    } else {
      val permissions = arrayOf(
        Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.WRITE_EXTERNAL_STORAGE
      )
      val needed = permissions.filter {
        ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
      }
      if (needed.isNotEmpty()) {
        ActivityCompat.requestPermissions(this, needed.toTypedArray(), 1001)
      }
    }
  }

  private fun unpackBundledAssets() {
    Thread {
      try {
        val destDir = File(filesDir, "components")
        if (!destDir.exists()) destDir.mkdirs()
        copyAssetFolder("components", filesDir)
        copyAssetFile("engine-data.zip", File(filesDir, "engine-data.zip"))
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }.start()
  }

  private fun copyAssetFolder(srcName: String, dstDir: File) {
    val fileList = assets.list(srcName) ?: return
    if (fileList.isEmpty()) {
      val dstFile = File(dstDir, srcName)
      dstFile.parentFile?.mkdirs()
      copyAssetFile(srcName, dstFile)
    } else {
      for (filename in fileList) {
        copyAssetFolder("$srcName/$filename", dstDir)
      }
    }
  }

  private fun copyAssetFile(srcPath: String, dstFile: File) {
    if (dstFile.exists() && dstFile.length() > 0) return
    try {
      assets.open(srcPath).use { input ->
        FileOutputStream(dstFile).use { output ->
          input.copyTo(output)
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }
}
