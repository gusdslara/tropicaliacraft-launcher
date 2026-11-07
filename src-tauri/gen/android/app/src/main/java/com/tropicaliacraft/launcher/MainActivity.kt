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

  private fun checkHorizonLaunchTrigger() {
    val trigger = findTriggerFile("tropicalia-horizon-launch.json") ?: return
    try {
      trigger.delete()
    } catch (_: Throwable) {}

    Log.i(tag, "Acionando inicialização do Horizon Rust...")

    // 1. Tentar abrir o Horizon embutido (caso registrado no mesmo APK)
    try {
      val embeddedIntent = Intent().setClassName(packageName, "dev.horizon.android.HorizonActivity")
      if (packageManager.resolveActivity(embeddedIntent, 0) != null) {
        embeddedIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(embeddedIntent)
        return
      }
    } catch (e: Throwable) {
      Log.w(tag, "Embedded HorizonActivity not available: $e")
    }

    // 2. Tentar abrir o Horizon Rust standalone oficial (dev.horizon.android)
    try {
      val extIntent = packageManager.getLaunchIntentForPackage("dev.horizon.android")
      if (extIntent != null) {
        extIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(extIntent)
        return
      }
    } catch (e: Throwable) {
      Log.e(tag, "Falha ao abrir o Horizon standalone: $e")
    }

    // 3. Fallback: avisar na interface que o Horizon Rust precisa estar instalado
    runOnUiThread {
      Toast.makeText(
        this,
        "Horizon (Minecraft Rust) não encontrado. Por favor, instale o Horizon Android.",
        Toast.LENGTH_LONG
      ).show()
    }
  }

  private fun checkJavaLaunchTrigger() {
    val trigger = findTriggerFile("tropicalia-java-launch.json") ?: return
    try {
      trigger.delete()
    } catch (_: Throwable) {}

    Log.i(tag, "Acionando inicialização do Minecraft Java...")

    // 1. Tentar abrir o motor Java embutido (Pojav / Amethyst)
    try {
      val embeddedJava = Intent().setClassName(packageName, "net.kdt.pojavlaunch.MainActivity")
      if (packageManager.resolveActivity(embeddedJava, 0) != null) {
        embeddedJava.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        startActivity(embeddedJava)
        return
      }
    } catch (e: Throwable) {
      Log.w(tag, "Embedded Pojav MainActivity not available: $e")
    }

    // 2. Tentar abrir Amethyst / PojavLauncher externo
    for (pkg in listOf("org.angelauramc.amethyst.debug", "net.kdt.pojavlaunch.debug", "net.kdt.pojavlaunch")) {
      try {
        val extIntent = packageManager.getLaunchIntentForPackage(pkg)
        if (extIntent != null) {
          extIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(extIntent)
          return
        }
      } catch (_: Throwable) {}
    }

    runOnUiThread {
      Toast.makeText(
        this,
        "Motor Java não encontrado. Instale o Amethyst Android ou PojavLauncher.",
        Toast.LENGTH_LONG
      ).show()
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
