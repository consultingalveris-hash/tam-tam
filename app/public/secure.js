/* tam-tam — sécurité sur l'appareil : chiffrement de bout en bout, verrouillage par schéma ou empreinte.
   Les clés privées ne quittent jamais l'appareil, sauf dans la sauvegarde chiffrée par le code du membre. */
'use strict';
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const te = new TextEncoder(), td = new TextDecoder();
const subtle = crypto.subtle;

/* ---------- petit stockage local (IndexedDB, avec repli) ---------- */
const Store = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise(res => {
      try { const r = indexedDB.open('tamtam', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => res(null); }
      catch { res(null); }
    });
  },
  async get(k) { const db = await this.open(); if (!db) { try { return JSON.parse(localStorage.getItem('tt:' + k)); } catch { return null; } }
    return new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); }); },
  async set(k, v) { const db = await this.open(); if (!db) { try { localStorage.setItem('tt:' + k, JSON.stringify(v)); } catch {} return; }
    return new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); },
  async del(k) { const db = await this.open(); if (!db) { try { localStorage.removeItem('tt:' + k); } catch {} return; }
    return new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = res; }); },
};

/* ---------- chiffrement de bout en bout ---------- */
const E2E = {
  priv: null, pubJwk: null, shared: new Map(), plain: new Map(), imgs: new Map(), auds: new Map(),
  ready() { return !!this.priv; },
  async load(uid) {
    const k = await Store.get('key:' + uid); if (!k) return false;
    try { this.priv = await subtle.importKey('jwk', k.priv, {name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveKey']); this.pubJwk = k.pub; return true; } catch { return false; }
  },
  async create(uid) {
    const kp = await subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveKey']);
    const priv = await subtle.exportKey('jwk', kp.privateKey), pub = await subtle.exportKey('jwk', kp.publicKey);
    this.priv = kp.privateKey; this.pubJwk = {kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y}; this.shared.clear();
    await Store.set('key:' + uid, {priv, pub: this.pubJwk});
    return priv;
  },
  async codeKey(code, salt, iter) {
    const base = await subtle.importKey('raw', te.encode(String(code)), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  },
  async backup(code) {
    const priv = await subtle.exportKey('jwk', this.priv), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 600000;
    const ct = await subtle.encrypt({name: 'AES-GCM', iv}, await this.codeKey(code, salt, iter), te.encode(JSON.stringify(priv)));
    return {ct: b64(ct), iv: b64(iv), salt: b64(salt), iter};
  },
  async restore(uid, code, bk) {
    const k = await this.codeKey(code, unb64(bk.salt), bk.iter);
    let priv; try { priv = JSON.parse(td.decode(await subtle.decrypt({name: 'AES-GCM', iv: unb64(bk.iv)}, k, unb64(bk.ct)))); } catch { return false; }
    this.priv = await subtle.importKey('jwk', priv, {name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveKey']);
    this.pubJwk = {kty: 'EC', crv: 'P-256', x: priv.x, y: priv.y}; this.shared.clear();
    await Store.set('key:' + uid, {priv, pub: this.pubJwk}); return true;
  },
  async forget(uid) { await Store.del('key:' + uid); this.priv = null; this.pubJwk = null; this.shared.clear(); },
  async sharedWith(pub) {
    const id = pub.x + pub.y; if (this.shared.has(id)) return this.shared.get(id);
    const pk = await subtle.importKey('jwk', {kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y, ext: true}, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
    const key = await subtle.deriveKey({name: 'ECDH', public: pk}, this.priv, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    this.shared.set(id, key); return key;
  },
  /* chiffre un message pour tous les membres (dont soi-même) ; renvoie l'enveloppe et la clé du message */
  async seal(payload, recipients, bytes) {
    const raw = crypto.getRandomValues(new Uint8Array(32)), k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    let blob = null; if (bytes) { const e = await this.encBytes(k, bytes); payload.miv = e.iv; blob = new Blob([e.data], {type: 'application/octet-stream'}); }
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = await subtle.encrypt({name: 'AES-GCM', iv}, k, te.encode(JSON.stringify(payload)));
    const keys = {};
    for (const [uid, pub] of recipients) { const wiv = crypto.getRandomValues(new Uint8Array(12)); keys[uid] = {iv: b64(wiv), wk: b64(await subtle.encrypt({name: 'AES-GCM', iv: wiv}, await this.sharedWith(pub), raw))}; }
    return {env: {iv: b64(iv), ct: b64(ct), keys, from: {x: this.pubJwk.x, y: this.pubJwk.y}}, key: k, blob};
  },
  async open(env, myId) {
    const w = env.keys && env.keys[myId]; if (!w) return {err: 'absent'};
    try {
      const raw = await subtle.decrypt({name: 'AES-GCM', iv: unb64(w.iv)}, await this.sharedWith(env.from), unb64(w.wk));
      const k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      return {payload: JSON.parse(td.decode(await subtle.decrypt({name: 'AES-GCM', iv: unb64(env.iv)}, k, unb64(env.ct)))), key: k};
    } catch { return {err: 'illisible'}; }
  },
  async encBytes(k, bytes) { const iv = crypto.getRandomValues(new Uint8Array(12)); return {iv: b64(iv), data: await subtle.encrypt({name: 'AES-GCM', iv}, k, bytes)}; },
  async decBytes(k, iv, bytes) { return subtle.decrypt({name: 'AES-GCM', iv: unb64(iv)}, k, bytes); },
  async fingerprint(pub) {
    if (!pub) return '';
    const h = new Uint8Array(await subtle.digest('SHA-256', te.encode(pub.x + '.' + pub.y)));
    let n = ''; for (let i = 0; i < 12; i++) n += String(((h[2 * i] << 8) | h[2 * i + 1]) % 100000).padStart(5, '0').slice(-4);
    return n.match(/.{4}/g).join(' ');
  },
};

/* ---------- verrouillage de l'appareil ---------- */
const Lock = {
  key: uid => 'lock:' + uid,
  async get(uid) { return (await Store.get(this.key(uid))) || {type: 'off', delay: 60}; },
  async set(uid, v) { await Store.set(this.key(uid), v); },
  async hashPattern(seq, salt) {
    const base = await subtle.importKey('raw', te.encode(seq.join('-')), 'PBKDF2', false, ['deriveBits']);
    return b64(await subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: 200000}, base, 256));
  },
  bioAvailable() { return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable); },
  async bioCheck() { try { return this.bioAvailable() && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; } },
  async bioRegister(user) {
    const cred = await navigator.credentials.create({publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), rp: {name: 'tam-tam', id: location.hostname},
      user: {id: crypto.getRandomValues(new Uint8Array(16)), name: user.email || user.handle, displayName: user.name},
      pubKeyCredParams: [{type: 'public-key', alg: -7}, {type: 'public-key', alg: -257}],
      authenticatorSelection: {authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged'}, timeout: 60000, attestation: 'none'}});
    return b64(cred.rawId);
  },
  async bioVerify(credId) {
    const a = await navigator.credentials.get({publicKey: {challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{type: 'public-key', id: unb64(credId)}], userVerification: 'required', timeout: 60000}});
    return !!a;
  },
};
