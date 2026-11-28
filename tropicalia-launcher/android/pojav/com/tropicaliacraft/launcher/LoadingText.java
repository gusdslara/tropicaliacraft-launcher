package com.tropicaliacraft.launcher;

import android.view.View;
import android.view.ViewGroup;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ImageView;
import android.graphics.drawable.Drawable;
import android.widget.TextView;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;

/** Loading screen text in the launcher's language; the Rust engine shows the same lines. */
public final class LoadingText {
    private LoadingText() {}

    /** Splash (logo) length; the loading notice follows, as in the Rust engine's boot screen. */
    private static final long SPLASH_MS = 2200;
    /** The notice stays at least this long so the creeper is never a flash. */
    private static final long NOTICE_MIN_MS = 900;
    private static long appliedAt;

    static String lang() {
        return language();
    }

    private static String language() {
        String lang = LauncherPreferences.DEFAULT_PREF == null ? ""
                : LauncherPreferences.DEFAULT_PREF.getString("tropicaliaLanguage", "");
        return lang == null ? "" : lang.toLowerCase();
    }

    public static String title() {
        String lang = language();
        if (lang.startsWith("en")) return "Loading the game...";
        if (lang.startsWith("es")) return "Cargando el juego...";
        return "Carregando o jogo...";
    }

    public static String subtitle() {
        String lang = language();
        if (lang.startsWith("en")) return "Please wait, this can take a moment.";
        if (lang.startsWith("es")) return "Espera, esto puede tardar unos momentos.";
        return "Aguarde, isso pode levar alguns instantes.";
    }

    public static String ready() {
        String lang = language();
        if (lang.startsWith("en")) return "Ready!";
        if (lang.startsWith("es")) return "¡Listo!";
        return "Pronto!";
    }

    private static int dp(View view, int value) {
        return Math.round(value * view.getResources().getDisplayMetrics().density);
    }

    private static ImageView image(View view, String asset) {
        ImageView image = new ImageView(view.getContext());
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        try (java.io.InputStream stream = view.getContext().getAssets().open(asset)) {
            image.setImageDrawable(Drawable.createFromStream(stream, asset));
        } catch (java.io.IOException e) {
            android.util.Log.w("Tropicalia", "Unable to load branding: " + asset, e);
        }
        return image;
    }

    /**
     * Pojav hides the loading screen as soon as the game window exists, which can cut the splash and
     * the creeper notice. Returns true (and re-runs {@code hide} later) while the intro still needs time.
     */
    public static boolean deferHide(View loadingScreen, Runnable hide) {
        if (loadingScreen == null || appliedAt == 0) return false;
        long remaining = appliedAt + SPLASH_MS + NOTICE_MIN_MS - android.os.SystemClock.uptimeMillis();
        if (remaining <= 0) return false;
        loadingScreen.postDelayed(hide, remaining);
        return true;
    }

    public static void apply(View loadingScreen) {
        if (loadingScreen == null) return;
        TextView title = loadingScreen.findViewById(R.id.main_loading_screen_text);
        TextView subtitle = loadingScreen.findViewById(R.id.main_loading_screen_warning);
        if (title != null) title.setText(title());
        if (subtitle != null) subtitle.setText(subtitle());
        if (!(loadingScreen instanceof FrameLayout) || title == null) return;
        FrameLayout screen = (FrameLayout) loadingScreen;
        if (screen.findViewWithTag("tropicalia-splash") != null) return;
        appliedAt = android.os.SystemClock.uptimeMillis();
        screen.setBackgroundColor(android.graphics.Color.BLACK);
        View notice = (View) title.getParent();
        if (notice instanceof LinearLayout) {
            ImageView creeper = image(screen, "images/tropi_creeper.png");
            creeper.setTag("tropicalia-creeper");
            creeper.setContentDescription(null);
            int screenH = screen.getResources().getDisplayMetrics().heightPixels;
            int iconH = Math.max(dp(screen, 48), Math.min(dp(screen, 120), Math.round(screenH * 0.22f)));
            LinearLayout.LayoutParams icon = new LinearLayout.LayoutParams(iconH * 2 / 3, iconH);
            icon.bottomMargin = dp(screen, 16);
            icon.gravity = Gravity.CENTER_HORIZONTAL;
            ((LinearLayout) notice).addView(creeper, 0, icon);
            // Same look as the Rust engine: creeper + two lines, no spinner.
            View spinner = loadingScreen.findViewById(R.id.main_loading_screen_progress);
            if (spinner != null) spinner.setVisibility(View.GONE);
            title.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 20);
            title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            if (subtitle != null) subtitle.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14);
            if (subtitle != null) subtitle.setTextColor(android.graphics.Color.rgb(0x9b, 0xa1, 0xa6));
            ((LinearLayout) notice).setPadding(dp(screen, 20), dp(screen, 12), dp(screen, 20), dp(screen, 12));
        }
        title.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        if (subtitle != null) subtitle.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        notice.setAlpha(0f);
        FrameLayout splash = new FrameLayout(screen.getContext());
        splash.setTag("tropicalia-splash");
        splash.setBackgroundColor(android.graphics.Color.BLACK);
        ImageView logo = image(screen, "images/tropicalia_logo.png");
        logo.setAlpha(0f);
        FrameLayout.LayoutParams logoParams = new FrameLayout.LayoutParams(1, 1, Gravity.CENTER);
        splash.addView(logo, logoParams);
        screen.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        splash.addOnLayoutChangeListener((v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            int width = Math.max(1, Math.min(dp(screen, 560), Math.min((right - left) * 3 / 4, (bottom - top) * 6 / 5)));
            if (logoParams.width != width) {
                logoParams.width = width;
                logoParams.height = width * 466 / 998;
                logo.setLayoutParams(logoParams);
            }
        });
        // Timed with postDelayed (not only animation callbacks) so the notice still appears
        // when the system animator scale is 0 or the logo asset is missing.
        screen.postDelayed(() -> {
            if (splash.getParent() != null) screen.removeView(splash);
            notice.setAlpha(1f);
        }, SPLASH_MS);
        logo.animate().alpha(1f).setDuration(650).withEndAction(() ->
            logo.animate().alpha(0f).setStartDelay(900).setDuration(650).withEndAction(() -> {
                screen.removeView(splash);
                notice.setAlpha(1f);
            }).start()
        ).start();
    }
}
