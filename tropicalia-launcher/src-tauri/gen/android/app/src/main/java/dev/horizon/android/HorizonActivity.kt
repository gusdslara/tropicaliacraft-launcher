package dev.horizon.android

import android.app.NativeActivity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.WindowManager

class HorizonActivity : NativeActivity() {
    companion object {
        init {
            System.loadLibrary("horizon_android")
        }
    }

    private external fun nativeDocumentResult(requestCode: Int, resultCode: Int, uriString: String?)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUI()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 4101) { // 0x1005 (ACTION_OPEN_DOCUMENT_TREE / SELECT)
            val uriStr = data?.data?.toString()
            nativeDocumentResult(requestCode, resultCode, uriStr)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUI()
        }
    }

    private fun hideSystemUI() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
        )
    }
}
