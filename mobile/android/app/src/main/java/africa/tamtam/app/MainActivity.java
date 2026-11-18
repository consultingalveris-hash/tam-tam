package africa.tamtam.app;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tam-Tam pour Android.
 * - Les zones privées (discussions privées, profil privé, photos et statuts privés, vue unique)
 *   demandent le blocage des captures d'écran : l'écran devient noir sur les captures et enregistrements.
 * - Ailleurs, les captures restent possibles mais sont signalées à l'interlocuteur (Android 14 et plus).
 * - Empreinte ou visage (nov. 2026) : TamTamAndroid.bioAvailable() / bioAuth(raison) ouvrent la fenêtre
 *   biométrique du téléphone ; la réponse revient à la page par l'événement « tt-bio » (detail.ok, detail.err).
 * - Messages sans internet (version 3, nov. 2026) : quand internet coupe, la page appelle pxStart(). Les téléphones proches
 *   qui ont Tam-Tam se trouvent et se relient seuls par « Nearby Connections » de Google (Bluetooth, Bluetooth basse
 *   consommation, Wi-Fi direct, Wi-Fi Aware, réseau Wi-Fi local : le meilleur chemin disponible est choisi automatiquement),
 *   en grappe (chacun relié à plusieurs autres). Les messages, déjà chiffrés de bout en bout par la page, passent tels quels :
 *   ce code ne fait que transporter des octets. Nouvelles vers la page : événement « tt-px ».
 *   L'autorisation « Appareils à proximité » est demandée une seule fois (pxPrepare, au premier lancement de cette version).
 *   Android interdit aux applications d'allumer seules le Bluetooth ou le Wi-Fi : pxAskBt() ouvre la fenêtre système
 *   « Autoriser Tam-Tam à activer le Bluetooth ? » (un seul appui), et la page ne l'appelle que si rien d'autre ne marche.
 */
public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://web.tam-tam.africa";
    private Activity.ScreenCaptureCallback captureCallback;
    private static final String PX_SERVICE = "africa.tamtam.app.proche";
    private static final int PX_PERM = 4721, PX_BT = 4722, PX_MAX = 32768;
    private ConnectionsClient nearby;
    private final Set<String> pxPeers = ConcurrentHashMap.newKeySet();
    private volatile boolean pxRunning = false, pxStartAfterPerm = false;

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

    @Override
    public void onDestroy() {
        pxStopNow();
        super.onDestroy();
    }

    /* ---------- messages sans internet ---------- */
    private String[] pxPermissions() {
        List<String> p = new ArrayList<>();
        p.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (Build.VERSION.SDK_INT >= 31) {
            p.add(Manifest.permission.BLUETOOTH_SCAN);
            p.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            p.add(Manifest.permission.BLUETOOTH_CONNECT);
        }
        if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.NEARBY_WIFI_DEVICES);
        return p.toArray(new String[0]);
    }

    private String[] pxMissing() {
        List<String> m = new ArrayList<>();
        for (String s : pxPermissions()) if (ContextCompat.checkSelfPermission(this, s) != PackageManager.PERMISSION_GRANTED) m.add(s);
        return m.toArray(new String[0]);
    }

    private void pxAskPermissions(boolean thenStart) {
        String[] miss = pxMissing();
        if (miss.length == 0) { if (thenStart) pxStartNow(); return; }
        pxStartAfterPerm = thenStart;
        ActivityCompat.requestPermissions(this, miss, PX_PERM);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != PX_PERM) return;
        boolean ok = pxMissing().length == 0;
        pxEmit(new JSONObjectBuilder().put("k", "perm").put("ok", ok).toString());
        if (ok && pxStartAfterPerm) pxStartNow();
        pxStartAfterPerm = false;
    }

    private final PayloadCallback pxPayload = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String endpointId, Payload payload) {
            if (payload.getType() != Payload.Type.BYTES) return;
            byte[] b = payload.asBytes();
            if (b == null || b.length == 0 || b.length > PX_MAX) return;
            pxEmit(new JSONObjectBuilder().put("k", "data").put("ep", endpointId).put("d", Base64.encodeToString(b, Base64.NO_WRAP)).toString());
        }
        @Override
        public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) { }
    };

    private final ConnectionLifecycleCallback pxLife = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String endpointId, ConnectionInfo info) {
            // Tout téléphone Tam-Tam proche est accepté : il ne peut rien lire (messages chiffrés de bout en bout),
            // il sert seulement de relais. Le tri (contacts, expéditeur vérifié) se fait dans la page.
            if (nearby != null) nearby.acceptConnection(endpointId, pxPayload);
        }
        @Override
        public void onConnectionResult(String endpointId, ConnectionResolution result) {
            if (result.getStatus().isSuccess()) { pxPeers.add(endpointId); pxEmit(new JSONObjectBuilder().put("k", "peer").put("ep", endpointId).toString()); }
        }
        @Override
        public void onDisconnected(String endpointId) {
            pxPeers.remove(endpointId);
            pxEmit(new JSONObjectBuilder().put("k", "gone").put("ep", endpointId).toString());
        }
    };

    private final EndpointDiscoveryCallback pxFound = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(String endpointId, DiscoveredEndpointInfo info) {
            if (nearby == null || !PX_SERVICE.equals(info.getServiceId()) || pxPeers.contains(endpointId)) return;
            nearby.requestConnection("tt", endpointId, pxLife).addOnFailureListener(e -> { });
        }
        @Override
        public void onEndpointLost(String endpointId) { }
    };

    private void pxStartNow() {
        if (pxRunning) { pxEmit("{\"k\":\"up\"}"); return; }
        if (pxMissing().length > 0) { pxAskPermissions(true); return; }
        nearby = Nearby.getConnectionsClient(this);
        pxRunning = true;
        AdvertisingOptions ao = new AdvertisingOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build();
        DiscoveryOptions dop = new DiscoveryOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build();
        nearby.startAdvertising("tt", PX_SERVICE, pxLife, ao).addOnFailureListener(e -> pxError("adv", e));
        nearby.startDiscovery(PX_SERVICE, pxFound, dop).addOnFailureListener(e -> pxError("disc", e));
        pxEmit("{\"k\":\"up\"}");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        // Bluetooth allumé à l'instant : on relance la recherche pour qu'elle passe aussi par lui.
        if (requestCode == PX_BT && pxRunning) { pxStopNow(); pxStartNow(); }
    }

    private void pxError(String where, Exception e) {
        boolean radio = !pxBt() && !pxWifi();
        pxEmit(new JSONObjectBuilder().put("k", radio ? "radio" : "err").put("w", where).put("m", String.valueOf(e.getMessage())).toString());
    }

    private void pxStopNow() {
        if (nearby != null) {
            try { nearby.stopAdvertising(); nearby.stopDiscovery(); nearby.stopAllEndpoints(); } catch (Exception ignored) { }
        }
        pxPeers.clear();
        pxRunning = false;
    }

    private boolean pxBt() {
        try {
            BluetoothManager bm = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter a = bm == null ? null : bm.getAdapter();
            return a != null && a.isEnabled();
        } catch (Exception e) { return false; }
    }

    private boolean pxWifi() {
        try {
            WifiManager w = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            return w != null && w.isWifiEnabled();
        } catch (Exception e) { return false; }
    }

    private void pxEmit(final String json) {
        runOnUiThread(() -> {
            WebView w = getBridge().getWebView();
            if (fromSite(w)) w.evaluateJavascript("window.dispatchEvent(new CustomEvent('tt-px',{detail:" + json + "}))", null);
        });
    }

    /** Petit assistant : un objet JSON sans exceptions vérifiées. */
    private static class JSONObjectBuilder {
        private final JSONObject o = new JSONObject();
        JSONObjectBuilder put(String k, Object v) { try { o.put(k, v); } catch (Exception ignored) { } return this; }
        @Override public String toString() { return o.toString(); }
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
        public int version() { return 3; }

        @JavascriptInterface
        public void pxPrepare() { runOnUiThread(() -> { if (fromSite(getBridge().getWebView())) pxAskPermissions(false); }); }

        @JavascriptInterface
        public void pxStart() { runOnUiThread(() -> { if (fromSite(getBridge().getWebView())) pxStartNow(); }); }

        @JavascriptInterface
        public void pxStop() { runOnUiThread(() -> pxStopNow()); }

        @JavascriptInterface
        public void pxSend(final String endpoint, final String b64) {
            runOnUiThread(() -> {
                if (!pxRunning || nearby == null || !fromSite(getBridge().getWebView())) return;
                byte[] b;
                try { b = Base64.decode(b64, Base64.DEFAULT); } catch (Exception e) { return; }
                if (b.length == 0 || b.length > PX_MAX) return;
                List<String> to = new ArrayList<>();
                if (endpoint == null || endpoint.isEmpty()) to.addAll(pxPeers); else if (pxPeers.contains(endpoint)) to.add(endpoint);
                if (!to.isEmpty()) nearby.sendPayload(to, Payload.fromBytes(b));
            });
        }

        @JavascriptInterface
        public String pxPeers() { return new JSONArray(new ArrayList<>(pxPeers)).toString(); }

        @JavascriptInterface
        public String pxRadios() { return new JSONObjectBuilder().put("bt", pxBt()).put("wifi", pxWifi()).put("on", pxRunning).toString(); }

        @JavascriptInterface
        public void pxAskBt() {
            runOnUiThread(() -> {
                if (!fromSite(getBridge().getWebView()) || pxBt()) return;
                if (Build.VERSION.SDK_INT >= 31 && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) return;
                try { startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), PX_BT); } catch (Exception ignored) { }
            });
        }

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
