/* tam-tam — sur le téléphone : notifications même quand l'application est fermée, et installation comme une vraie application. */
'use strict';
const Device = {
  reg: null, prompt: null, sub: false,
  ios: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  standalone: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  pushOk: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,

  async init() {
    if (!('serviceWorker' in navigator)) return;
    try { this.reg = await navigator.serviceWorker.register('/sw.js'); } catch { return; }
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) this.openUrl(e.data.open); });
    // déjà autorisé sur cet appareil : on renouvelle l'abonnement en silence
    if (this.pushOk() && Notification.permission === 'granted') this.subscribe(true);
  },
  openUrl(url) { const m = /[?&]chat=(\d+)/.exec(url || ''); if (m && S.me && S.chats.has(+m[1])) { S.tab = 'chats'; renderTabs && renderTabs(); openChat(+m[1]); } },
  key(b64) { const p = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); },
  async subscribe(silent) {
    try {
      const reg = this.reg || await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) { const {key} = await api('/api/push/key'); sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: this.key(key)}); }
      await api('/api/push/sub', {sub: sub.toJSON()}); this.sub = true; return true;
    } catch (e) { if (!silent) toast('Impossible d’activer les notifications sur cet appareil.'); return false; }
  },
  async enable() {
    if (this.ios && !this.standalone()) return this.iosSheet(true);
    if (!this.pushOk()) return toast('Ce navigateur ne permet pas les notifications. Essayez Chrome ou Brave à jour.');
    const p = await Notification.requestPermission();
    if (p !== 'granted') { renderBody(); return toast('Notifications refusées. Autorisez-les dans les réglages du navigateur (icône à gauche de l’adresse).'); }
    if (await this.subscribe()) { await api('/api/push/test', {}).catch(() => {}); toast('Notifications activées : une notification d’essai arrive.'); }
    renderBody();
  },
  async disableHere() { try { const reg = this.reg || await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) { await api('/api/push/unsub', {endpoint: sub.endpoint}).catch(() => {}); await sub.unsubscribe(); } } catch {} this.sub = false; },

  /* ---------- installation ---------- */
  async install() {
    if (this.standalone()) return toast('tam-tam est déjà installé sur cet appareil.');
    if (this.prompt) { this.prompt.prompt(); const r = await this.prompt.userChoice.catch(() => ({})); this.prompt = null; if (r.outcome === 'accepted') toast('tam-tam s’installe sur votre écran d’accueil.'); renderBody(); return; }
    if (this.ios) return this.iosSheet(false);
    sheet(`${head('Installer tam-tam')}<div class="sheet-body"><ol class="steps"><li>Ouvrez le <b>menu du navigateur</b> (les trois points <b>⋮</b> en haut à droite).</li><li>Touchez <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>.</li><li>Confirmez : l’icône tam-tam apparaît avec vos autres applications.</li></ol></div>`, 'Installer tam-tam');
  },
  iosSheet(forPush) {
    sheet(`${head('Installer tam-tam sur iPhone')}<div class="sheet-body">${forPush ? '<p class="hint">Sur iPhone, les notifications ne fonctionnent que si tam-tam est installé sur l’écran d’accueil.</p>' : ''}
      <ol class="steps"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut, en bas de l’écran).</li><li>Choisissez <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li><li>Ouvrez tam-tam depuis sa nouvelle icône${forPush ? ', puis revenez ici activer les notifications' : ''}.</li></ol></div>`, 'Installer tam-tam');
  },
  canInstall() { return !this.standalone() && (!!this.prompt || this.ios || /android/i.test(navigator.userAgent)); },
  banner() {
    let hid = false; try { hid = localStorage.getItem('tt:instHide') === '1'; } catch {}
    if (hid || !this.canInstall()) return '';
    return `<div class="inst"><img src="/icon-192.png" alt="" width="40" height="40"><div><b>Installez tam-tam</b><span>Une icône sur votre écran d’accueil, comme une vraie application.</span></div><button class="btn sm" type="button" data-act="devInstall">Installer</button><button class="ib" type="button" data-act="devInstHide" aria-label="Masquer">${I.close}</button></div>`;
  },
  settingsHtml() {
    const perm = 'Notification' in window ? Notification.permission : 'unsupported', on = perm === 'granted';
    return `<div class="set-block"><h2>Notifications</h2>
      <p class="hint">Recevez une alerte pour chaque message et chaque appel, même quand tam-tam est fermé. Par respect de votre vie privée, la notification dit seulement <b>qui</b> vous écrit, jamais le contenu.</p>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn sm${on ? ' ghost' : ''}" type="button" data-act="devPush">${on ? '✅ Notifications activées · tester' : '🔔 Activer les notifications'}</button>
        <button class="btn sm ghost" type="button" data-act="soundToggle">${Sound.on() ? '🔔 Son des messages : activé' : '🔕 Son des messages : coupé'}</button></div>
      ${perm === 'denied' ? '<p class="err">Les notifications sont bloquées pour ce site. Touchez l’icône à gauche de l’adresse, puis Autorisations → Notifications → Autoriser.</p>' : ''}</div>
    <div class="set-block"><h2>Application</h2>
      <p class="hint">${this.standalone() ? 'tam-tam est installé sur cet appareil. ✅' : 'Ajoutez tam-tam à votre écran d’accueil : il s’ouvre en plein écran, comme WhatsApp.'}</p>
      ${this.standalone() ? '' : '<div><button class="btn sm" type="button" data-act="devInstall">📲 Installer tam-tam</button></div>'}</div>`;
  },
};
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); Device.prompt = e; if (S.me && (S.tab === 'chats' || S.tab === 'settings')) renderBody(); });
window.addEventListener('appinstalled', () => { Device.prompt = null; toast('tam-tam est installé ✅'); });
Object.assign(ACT, {
  devPush() { Device.enable(); },
  devInstall() { Device.install(); },
  devInstHide() { try { localStorage.setItem('tt:instHide', '1'); } catch {} renderBody(); },
});
Device.init();
