package io.basdhaweio.forge

import android.annotation.SuppressLint
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

// Forge is the published site, loaded live so every push reaches the app without an APK update. All of John's data
// lives in this WebView's own storage; the page hands the widget a small summary through window.ForgeAndroid after
// each change, and the widget's buttons open the app on an action URL such as …/#/do/water.
const val LIVE_HOST = "basdhaweio.github.io"
const val LIVE_URL = "https://$LIVE_HOST/forge/"

private const val DARK_BG = "#0D0E11"    // the page's --bg in dark and light, so the system bars blend in
private const val LIGHT_BG = "#F5F3EF"

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var root: FrameLayout
    private var pageReady = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: String? = null

    // <input type=file> in the page (Settings → Import / Restore, and the welcome screen's "restore a backup")
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    // "Download backup": a WebView can't save a blob, so the page hands the text over and the user picks where it goes
    private val createFile = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val text = pendingSave
        pendingSave = null
        if (uri == null || text == null) return@registerForActivityResult
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
            Toast.makeText(this, "Backup saved", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Couldn't save the backup", Toast.LENGTH_LONG).show()
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true          // every log, setting and the sync token live here
            settings.setSupportZoom(false)
            addJavascriptInterface(Bridge(), "ForgeAndroid")

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (!request.isForMainFrame) return false
                    if (request.url.host == LIVE_HOST && request.url.path?.startsWith("/forge") == true) return false
                    return openExternally(request.url)   // GitHub token page, anything off-site
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    pageReady = url?.startsWith(LIVE_URL) == true
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame && request.url.host == LIVE_HOST) showOffline(view)
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView,
                    callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams
                ): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    return try {
                        pickFile.launch("*/*")   // .json isn't typed the same way by every file app
                        true
                    } catch (e: Exception) {
                        fileCallback = null
                        false
                    }
                }
            }
        }

        // Target SDK 35 draws edge to edge: pad for the status bar, cutout and navigation bar so the page's own
        // top bar and bottom menu sit clear of them. The padding shows the page's background colour.
        root = FrameLayout(this).apply {
            addView(webView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        }
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        applyBars(systemDark())

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }

        if (savedInstanceState != null) webView.restoreState(savedInstanceState) else webView.loadUrl(targetUrl(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val url = targetUrl(intent)
        val hash = url.substringAfter('#', "")
        if (pageReady && hash.isNotEmpty()) {
            // same document: just move the hash — the page listens for hashchange
            webView.evaluateJavascript("location.hash=${jsString("#$hash")}", null)
        } else if (!pageReady || url != LIVE_URL) {
            webView.loadUrl(url)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    // A widget tap or shortcut carries the page URL as the intent data; anything off-site is ignored.
    private fun targetUrl(intent: Intent?): String {
        val data = intent?.data?.toString() ?: return LIVE_URL
        return if (data.startsWith(LIVE_URL)) data else LIVE_URL
    }

    private fun systemDark() =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    // The bars take the page's background; the page reports its theme (it can differ from the system's).
    private fun applyBars(dark: Boolean) {
        val color = Color.parseColor(if (dark) DARK_BG else LIGHT_BG)
        root.setBackgroundColor(color)
        webView.setBackgroundColor(color)
        window.decorView.setBackgroundColor(color)
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    private fun openExternally(url: Uri): Boolean {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, url))
        } catch (e: Exception) {
            Toast.makeText(this, "No app can open ${url.host}", Toast.LENGTH_SHORT).show()
        }
        return true
    }

    private fun showOffline(view: WebView) {
        pageReady = false
        val html = """
            <!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
            <body style="font-family:sans-serif;background:$DARK_BG;color:#eef0f4;padding:32px 20px;text-align:center">
            <h2 style="font-weight:600">Forge is unreachable</h2>
            <p style="color:#8e95a3">No connection, and this phone hasn't kept a copy yet.</p>
            <p><a href="$LIVE_URL" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#ff7a1a;color:#1a0d02;text-decoration:none;font-weight:700">Try again</a></p>
            </body>
        """.trimIndent()
        view.loadDataWithBaseURL(LIVE_URL, html, "text/html", "utf-8", null)
    }

    private fun jsString(s: String): String = "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

    // window.ForgeAndroid in the page. These run on a WebView thread, not the main thread.
    inner class Bridge {
        @JavascriptInterface
        fun widget(json: String) {
            WidgetData.save(applicationContext, json)
            ForgeWidget.render(applicationContext)
        }

        @JavascriptInterface
        fun saveFile(name: String, text: String) {
            runOnUiThread {
                pendingSave = text
                try {
                    createFile.launch(name)
                } catch (e: Exception) {
                    pendingSave = null
                    Toast.makeText(this@MainActivity, "Couldn't open the save dialog", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun theme(dark: Boolean) {
            runOnUiThread { applyBars(dark) }
        }
    }
}
