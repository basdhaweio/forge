package io.basdhaweio.forge

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Home-screen widget. The page sends a summary after every change (MainActivity.Bridge.widget), so the widget is drawn
// from what's stored here — no network. The system also asks for a redraw every 30 minutes, which turns yesterday's
// numbers into a fresh day after midnight; a running fast's clock is a Chronometer, so it keeps counting on its own.
// Nothing here writes Forge's data: every button opens the app on an action URL and the page does the logging.
class ForgeWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        render(context)
    }

    // No onAppWidgetOptionsChanged: some launchers (Samsung) fire it after every redraw, and redrawing in response
    // made the Library widget blink. The layout is the same at any size anyway.

    companion object {
        fun render(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, ForgeWidget::class.java))
            if (ids.isEmpty()) return
            val views = build(ctx, WidgetData.load(ctx))
            for (id in ids) mgr.updateAppWidget(id, views)
        }

        private fun build(ctx: Context, s: JSONObject?): RemoteViews {
            val v = RemoteViews(ctx.packageName, R.layout.widget_forge)
            v.setOnClickPendingIntent(R.id.summary, open(ctx, 1, "#/"))
            v.setOnClickPendingIntent(R.id.btn_water, open(ctx, 2, "#/do/water"))
            v.setOnClickPendingIntent(R.id.btn_pt, open(ctx, 3, "#/do/pt"))
            v.setOnClickPendingIntent(R.id.btn_fast, open(ctx, 4, "#/do/fast"))
            v.setOnClickPendingIntent(R.id.btn_log, open(ctx, 5, "#/do/log"))

            if (s == null) {
                v.setTextViewText(R.id.day, "Open Forge once and this fills in")
                v.setViewVisibility(R.id.fast_row, View.GONE)
                return v
            }

            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            val fresh = s.optString("date") == today   // a summary from yesterday shows a fresh day

            val freezes = s.optInt("freezes")
            v.setTextViewText(R.id.streak, "🔥 " + s.optInt("streak") + (if (freezes > 0) "  " + "❄".repeat(freezes) else ""))
            v.setTextViewText(R.id.level, "Lv " + s.optInt("level") + " · " + s.optString("title"))
            v.setProgressBar(R.id.xp_bar, 1000, (s.optDouble("pct", 0.0) * 1000).toInt(), false)

            val quests = s.optJSONObject("quests")
            val done = if (fresh) quests?.optInt("done") ?: 0 else 0
            val total = quests?.optInt("total") ?: 0
            v.setTextViewText(
                R.id.day,
                if (fresh) "Quests $done/$total · " + s.optString("mission")
                else "New day · tap to see today's plan"
            )

            val protein = s.optJSONObject("protein")
            if (protein != null && protein.optBoolean("off") && fresh) {
                v.setTextViewText(R.id.protein, "🍗 fast day")
                v.setProgressBar(R.id.protein_bar, 100, 0, false)
            } else if (protein != null) {
                val g = if (fresh) protein.optInt("g") else 0
                val target = protein.optInt("target").coerceAtLeast(1)
                v.setTextViewText(R.id.protein, "🍗 $g / $target g")
                v.setProgressBar(R.id.protein_bar, target, g.coerceAtMost(target), false)
            }

            val water = s.optJSONObject("water")
            if (water != null) {
                v.setTextViewText(R.id.water, "💧 " + (if (fresh) water.optString("text") else water.optString("empty")))
                v.setProgressBar(R.id.water_bar, 1000, if (fresh) (water.optDouble("pct", 0.0) * 1000).toInt() else 0, false)
                v.setTextViewText(R.id.btn_water, "💧 " + water.optString("cup", "+16 oz"))
            }

            val fast = s.optJSONObject("fast")
            if (fast != null && fast.has("start")) {
                val start = fast.optLong("start")
                val targetH = fast.optInt("targetH", 24)
                val base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - start)
                v.setChronometer(R.id.fast_clock, base, null, true)
                val ends = SimpleDateFormat("EEE h:mm a", Locale.US).format(Date(start + targetH * 3_600_000L))
                v.setTextViewText(R.id.fast_info, "fasting · $targetH h at $ends")
                v.setViewVisibility(R.id.fast_row, View.VISIBLE)
                v.setTextViewText(R.id.btn_fast, "⏳ Fasting")
            } else {
                v.setChronometer(R.id.fast_clock, SystemClock.elapsedRealtime(), null, false)
                v.setViewVisibility(R.id.fast_row, View.GONE)
                v.setTextViewText(R.id.btn_fast, "⏳ Fast")
            }

            val at = s.optLong("at")
            v.setTextViewText(
                R.id.status,
                (if (at > 0) "updated " + SimpleDateFormat("h:mm a", Locale.US).format(Date(at)) + " · " else "") + "tap to open Forge"
            )
            return v
        }

        private fun open(ctx: Context, code: Int, hash: String): PendingIntent {
            val i = Intent(ctx, MainActivity::class.java)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse(LIVE_URL + hash))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
    }
}

// The last summary the page sent (see js/native.js for its shape).
object WidgetData {
    private const val FILE = "widget"
    private const val KEY = "summary"

    fun save(ctx: Context, json: String) {
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
    }

    fun load(ctx: Context): JSONObject? {
        val raw = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
        return try { JSONObject(raw) } catch (e: Exception) { null }
    }
}
