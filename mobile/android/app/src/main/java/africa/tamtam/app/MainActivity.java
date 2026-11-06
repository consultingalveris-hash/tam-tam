package africa.tamtam.app;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * Tam-Tam pour Android.
 * - Les zones privées (discussions privées, profil privé, photos et statuts privés, vue unique)
 *   demandent le blocage des captures d'écran : l'écran devient noir sur les captures et enregistrements.
 * - Ailleurs, les captures restent possibles mais sont signalées à l'interlocuteur (Android 14 et plus).
 */
public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://tam-tam.alveris-consulting.com";
    private Activity.ScreenCaptureCallback captureCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView web = getBridge().getWebView();
        web.addJavascriptInterface(new NativeBridge(), "TamTamAndroid");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = getBridge().getWebView();
                if (w.canGoBack()) w.goBack(); else moveTaskToBack(true);
            }
        });

        if (Build.VERSION.SDK_INT >= 34) {
            captureCallback = () -> runOnUiThread(() -> {
                WebView w = getBridge().getWebView();
                if (fromSite(w)) w.evaluateJavascript("window.dispatchEvent(new Event('tt-shot'))", null);
            });
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (Build.VERSION.SDK_INT >= 34 && captureCallback != null) registerScreenCaptureCallback(getMainExecutor(), captureCallback);
    }

    @Override
    public void onStop() {
        if (Build.VERSION.SDK_INT >= 34 && captureCallback != null) unregisterScreenCaptureCallback(captureCallback);
        super.onStop();
    }

    private static boolean fromSite(WebView w) {
        String u = w.getUrl();
        return u != null && (u.equals(SITE) || u.startsWith(SITE + "/"));
    }

    private class NativeBridge {
        @JavascriptInterface
        public void setSecure(final boolean on) {
            runOnUiThread(() -> {
                if (!fromSite(getBridge().getWebView())) return;
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            });
        }

        @JavascriptInterface
        public int version() { return 1; }
    }
}
