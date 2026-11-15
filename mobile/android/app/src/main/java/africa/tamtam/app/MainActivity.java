package africa.tamtam.app;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Tam-Tam pour Android.
 * - Les zones privées (discussions privées, profil privé, photos et statuts privés, vue unique)
 *   demandent le blocage des captures d'écran : l'écran devient noir sur les captures et enregistrements.
 * - Ailleurs, les captures restent possibles mais sont signalées à l'interlocuteur (Android 14 et plus).
 * - Empreinte ou visage (nov. 2026) : TamTamAndroid.bioAvailable() / bioAuth(raison) ouvrent la fenêtre
 *   biométrique du téléphone ; la réponse revient à la page par l'événement « tt-bio » (detail.ok, detail.err).
 */
public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://web.tam-tam.africa";
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
        public int version() { return 2; }

        @JavascriptInterface
        public boolean bioAvailable() {
            return BiometricManager.from(MainActivity.this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS;
        }

        @JavascriptInterface
        public void bioAuth(final String reason) {
            runOnUiThread(() -> {
                if (!fromSite(getBridge().getWebView())) return;
                BiometricPrompt prompt = new BiometricPrompt(MainActivity.this, ContextCompat.getMainExecutor(MainActivity.this), new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { bioResult(true, ""); }
                    @Override public void onAuthenticationError(int code, CharSequence msg) { bioResult(false, String.valueOf(code)); }
                });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Tam-Tam")
                    .setSubtitle(reason == null || reason.isEmpty() ? "Ouvrir Tam-Tam" : reason)
                    .setNegativeButtonText("Utiliser mon schéma")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                    .build();
                prompt.authenticate(info);
            });
        }
    }

    private void bioResult(boolean ok, String err) {
        runOnUiThread(() -> {
            WebView w = getBridge().getWebView();
            if (fromSite(w)) w.evaluateJavascript("window.dispatchEvent(new CustomEvent('tt-bio',{detail:{ok:" + ok + ",err:'" + err.replaceAll("[^0-9]", "") + "'}}))", null);
        });
    }
}
