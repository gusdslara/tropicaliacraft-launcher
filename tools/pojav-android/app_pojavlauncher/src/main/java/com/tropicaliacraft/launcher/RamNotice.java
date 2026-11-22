package com.tropicaliacraft.launcher;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import net.kdt.pojavlaunch.prefs.LauncherPreferences;

import java.util.Locale;

/**
 * The low-RAM warning as a game-style "pickup" notification in the top corner instead of Pojav's
 * blocking dialog: the game keeps launching, the notice slides in, says what matters in two short
 * lines and offers the same choices (OK / don't warn again) before hiding by itself.
 */
public final class RamNotice {
    private static final String TAG = "tropicalia-ram-notice";
    private static final long VISIBLE_MS = 9000;

    private RamNotice() {}

    /**
     * @param freeMb      free device RAM (or free address space on 32-bit devices)
     * @param allocatedMb RAM the instance asks for
     * @param addressSpace true when the limit is the 32-bit address space (will crash; no "don't warn again")
     */
    public static void show(Activity activity, int freeMb, int allocatedMb, boolean addressSpace) {
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            try {
                attach(activity, freeMb, allocatedMb, addressSpace);
            } catch (RuntimeException e) {
                android.util.Log.w("Tropicalia", "RAM notice not shown", e);
            }
        });
    }

    private static void attach(Activity activity, int freeMb, int allocatedMb, boolean addressSpace) {
        ViewGroup root = activity.findViewById(android.R.id.content);
        if (root == null || root.findViewWithTag(TAG) != null) return;
        String lang = LoadingText.lang();

        LinearLayout card = new LinearLayout(activity);
        card.setTag(TAG);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(activity, 12), dp(activity, 10), dp(activity, 8), dp(activity, 10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.argb(235, 13, 22, 18));
        bg.setCornerRadius(dp(activity, 10));
        bg.setStroke(dp(activity, 1), addressSpace ? Color.rgb(248, 113, 113) : Color.rgb(251, 191, 36));
        card.setBackground(bg);
        card.setElevation(dp(activity, 8));
        card.setClickable(true);
        card.setContentDescription(title(lang, addressSpace));

        // Badge: "RAM" in a coloured chip, like an item icon in a pickup toast.
        TextView badge = new TextView(activity);
        badge.setText("RAM");
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        badge.setTextColor(Color.BLACK);
        badge.setGravity(Gravity.CENTER);
        GradientDrawable chip = new GradientDrawable();
        chip.setColor(addressSpace ? Color.rgb(248, 113, 113) : Color.rgb(251, 191, 36));
        chip.setCornerRadius(dp(activity, 6));
        badge.setBackground(chip);
        LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(dp(activity, 40), dp(activity, 40));
        badgeLp.rightMargin = dp(activity, 10);
        card.addView(badge, badgeLp);

        LinearLayout texts = new LinearLayout(activity);
        texts.setOrientation(LinearLayout.VERTICAL);
        TextView head = new TextView(activity);
        head.setText(title(lang, addressSpace));
        head.setTextColor(Color.WHITE);
        head.setTypeface(Typeface.DEFAULT_BOLD);
        head.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        head.setSingleLine(true);
        head.setEllipsize(TextUtils.TruncateAt.END);
        texts.addView(head);
        TextView body = new TextView(activity);
        body.setText(body(lang, freeMb, allocatedMb, addressSpace));
        body.setTextColor(Color.rgb(199, 213, 204));
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        body.setMaxLines(3);
        body.setEllipsize(TextUtils.TruncateAt.END);
        texts.addView(body);

        LinearLayout actions = new LinearLayout(activity);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams actionsLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        actionsLp.topMargin = dp(activity, 4);
        texts.addView(actions, actionsLp);
        card.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                Math.min(dp(activity, 360), Math.round(root.getWidth() > 0 ? root.getWidth() * 0.9f : dp(activity, 360))),
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        lp.topMargin = dp(activity, 12);
        lp.rightMargin = dp(activity, 12);

        Runnable hide = () -> card.animate().translationX(card.getWidth() + dp(activity, 24)).alpha(0f).setDuration(220)
                .withEndAction(() -> { if (card.getParent() != null) root.removeView(card); }).start();

        actions.addView(action(activity, ok(lang), Color.rgb(190, 242, 100), hide));
        if (!addressSpace) {
            actions.addView(action(activity, dontWarn(lang), Color.rgb(155, 161, 166), () -> {
                LauncherPreferences.DEFAULT_PREF.edit().putBoolean("showMemoryWarning", false).apply();
                LauncherPreferences.PREF_SHOW_MEMORY_WARNING_DIALOG = false;
                hide.run();
            }));
        }
        card.setOnClickListener(v -> hide.run());

        root.addView(card, lp);
        card.setAlpha(0f);
        card.setTranslationX(dp(activity, 120));
        card.animate().translationX(0f).alpha(1f).setDuration(260).start();
        card.postDelayed(hide, addressSpace ? VISIBLE_MS + 4000 : VISIBLE_MS);
    }

    private static TextView action(Activity activity, String label, int color, Runnable onClick) {
        TextView b = new TextView(activity);
        b.setText(label);
        b.setTextColor(color);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        b.setAllCaps(true);
        b.setMinHeight(dp(activity, 36));
        b.setGravity(Gravity.CENTER_VERTICAL);
        b.setPadding(0, 0, dp(activity, 16), 0);
        b.setClickable(true);
        b.setFocusable(true);
        b.setOnClickListener(v -> onClick.run());
        return b;
    }

    private static String gb(int mb, String lang) {
        String v = String.format(Locale.ROOT, "%.1f", mb / 1024f);
        return (lang.startsWith("en") ? v : v.replace('.', ',')) + " GB";
    }

    private static String title(String lang, boolean addressSpace) {
        if (addressSpace) {
            if (lang.startsWith("en")) return "Too much RAM for this device";
            if (lang.startsWith("es")) return "Demasiada RAM para este equipo";
            return "RAM acima do limite do aparelho";
        }
        if (lang.startsWith("en")) return "Low free RAM";
        if (lang.startsWith("es")) return "Poca RAM libre";
        return "Pouca RAM livre";
    }

    private static String body(String lang, int freeMb, int allocatedMb, boolean addressSpace) {
        String free = gb(freeMb, lang);
        String alloc = gb(allocatedMb, lang);
        if (addressSpace) {
            if (lang.startsWith("en")) return "Instance asks " + alloc + ", the app can address " + free + ". It will crash: lower the instance RAM.";
            if (lang.startsWith("es")) return "La instancia pide " + alloc + ", la app direcciona " + free + ". Va a cerrarse: baja la RAM de la instancia.";
            return "Instância pede " + alloc + ", o app endereça " + free + ". Vai fechar: reduza a RAM da instância.";
        }
        if (lang.startsWith("en")) return "Instance uses " + alloc + ", " + free + " free. If it closes, lower the instance RAM or close other apps.";
        if (lang.startsWith("es")) return "La instancia usa " + alloc + ", " + free + " libres. Si se cierra, baja la RAM o cierra otras apps.";
        return "Instância usa " + alloc + ", " + free + " livres. Se fechar, reduza a RAM ou feche outros apps.";
    }

    private static String ok(String lang) {
        return lang.startsWith("es") ? "Entendido" : lang.startsWith("en") ? "Got it" : "Entendi";
    }

    private static String dontWarn(String lang) {
        if (lang.startsWith("en")) return "Don't warn again";
        if (lang.startsWith("es")) return "No avisar más";
        return "Não avisar mais";
    }

    private static int dp(Activity activity, int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
