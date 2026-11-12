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
    try { this.priv = await subtle.importKey('jwk', k.priv, {name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveKey', 'deriveBits']); this.pubJwk = k.pub; return true; } catch { return false; }
  },
  async create(uid) {
    const kp = await subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveKey', 'deriveBits']);
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
    this.priv = await subtle.importKey('jwk', priv, {name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveKey', 'deriveBits']);
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
  /* Version 2 de l'enveloppe (novembre 2026) : pour chaque message, une paire de clés jetable (« éphémère ») est créée
     puis oubliée. La clé qui protège le message pour un destinataire est tirée (HKDF-SHA256) de DEUX secrets :
     clé jetable × clé du destinataire, et clé de l'expéditeur × clé du destinataire (ce second secret prouve l'expéditeur).
     Le contexte (version, identifiant du destinataire, sel aléatoire du message) est lié à la dérivation.
     Conséquence : si la clé de l'expéditeur est volée plus tard, ses anciens messages restent illisibles sans la clé du destinataire.
     Les anciennes enveloppes (sans « v ») restent lisibles. */
  pubKey(pub) { return subtle.importKey('jwk', {kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y, ext: true}, {name: 'ECDH', namedCurve: 'P-256'}, false, []); },
  async wrapKeyV2(dh1, dh2, salt, uid) {
    const ikm = new Uint8Array(64); ikm.set(new Uint8Array(dh1), 0); ikm.set(new Uint8Array(dh2), 32);
    const base = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('tamtam-e2e-v2|wrap|' + uid)}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  },
  /* chiffre un message pour tous les membres (dont soi-même) ; renvoie l'enveloppe et la clé du message */
  // Chiffre un fichier tout de suite (avant de savoir à qui il ira) : la clé reste sur l'appareil et sera remise plus tard aux destinataires dans seal().
  async preSeal(bytes) {
    const raw = crypto.getRandomValues(new Uint8Array(32)), k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const e = await this.encBytes(k, bytes); return {raw, iv: e.iv, blob: new Blob([e.data], {type: 'application/octet-stream'})};
  },
  async seal(payload, recipients, bytes, bytes2, pre) {
    // Envoyé depuis un ordinateur (souris, pas d'écran tactile, hors application Android) : le destinataire en est informé.
    if (payload && typeof payload === 'object' && !window.TamTamAndroid && window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) payload.pc = 1;
    const raw = pre ? pre.raw : crypto.getRandomValues(new Uint8Array(32)), k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    let blob = null, blob2 = null; if (pre) payload.miv = pre.iv; else if (bytes) { const e = await this.encBytes(k, bytes); payload.miv = e.iv; blob = new Blob([e.data], {type: 'application/octet-stream'}); }
    if (bytes2) { const e = await this.encBytes(k, bytes2); payload.mmiv = e.iv; blob2 = new Blob([e.data], {type: 'application/octet-stream'}); }
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = await subtle.encrypt({name: 'AES-GCM', iv}, k, te.encode(JSON.stringify(payload)));
    const keys = {}, eph = await subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']), epub = await subtle.exportKey('jwk', eph.publicKey), salt = crypto.getRandomValues(new Uint8Array(16));
    for (const [uid, pub] of recipients) {
      const pk = await this.pubKey(pub), dh1 = await subtle.deriveBits({name: 'ECDH', public: pk}, eph.privateKey, 256), dh2 = await subtle.deriveBits({name: 'ECDH', public: pk}, this.priv, 256);
      const wiv = crypto.getRandomValues(new Uint8Array(12)); keys[uid] = {iv: b64(wiv), wk: b64(await subtle.encrypt({name: 'AES-GCM', iv: wiv}, await this.wrapKeyV2(dh1, dh2, salt, uid), raw))};
    }
    return {env: {v: 2, iv: b64(iv), ct: b64(ct), keys, salt: b64(salt), eph: {x: epub.x, y: epub.y}, from: {x: this.pubJwk.x, y: this.pubJwk.y}}, key: k, blob, blob2};
  },
  async open(env, myId) {
    const w = env.keys && env.keys[myId]; if (!w) return {err: 'absent'};
    try {
      let wk;
      if (env.v === 2) {
        const dh1 = await subtle.deriveBits({name: 'ECDH', public: await this.pubKey(env.eph)}, this.priv, 256), dh2 = await subtle.deriveBits({name: 'ECDH', public: await this.pubKey(env.from)}, this.priv, 256);
        wk = await this.wrapKeyV2(dh1, dh2, unb64(env.salt), String(myId));
      } else wk = await this.sharedWith(env.from);
      const raw = await subtle.decrypt({name: 'AES-GCM', iv: unb64(w.iv)}, wk, unb64(w.wk));
      const k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      return {payload: JSON.parse(td.decode(await subtle.decrypt({name: 'AES-GCM', iv: unb64(env.iv)}, k, unb64(env.ct)))), key: k};
    } catch { return {err: 'illisible'}; }
  },
  // Gros fichiers (vidéos…) : chiffrés par morceaux de 256 Ko, chacun avec son propre numéro.
  // On peut ainsi lire une vidéo pendant qu'elle se télécharge (les morceaux se déchiffrent un par un).
  CK: 262144,
  ivAt(base, i) { const v = new Uint8Array(base); const d = new DataView(v.buffer); d.setUint32(8, d.getUint32(8) ^ i); return v; },
  async encBytes(k, bytes) {
    const u = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    if (u.byteLength > this.CK * 6) {
      const base = crypto.getRandomValues(new Uint8Array(12)), parts = [];
      for (let i = 0, off = 0; off < u.byteLength; i++, off += this.CK) parts.push(await subtle.encrypt({name: 'AES-GCM', iv: this.ivAt(base, i)}, k, u.subarray(off, off + this.CK)));
      return {iv: 'c' + this.CK + ':' + b64(base), data: await new Blob(parts).arrayBuffer()};
    }
    const iv = crypto.getRandomValues(new Uint8Array(12)); return {iv: b64(iv), data: await subtle.encrypt({name: 'AES-GCM', iv}, k, u)};
  },
  async decBytes(k, iv, bytes) {
    const m = /^c(\d+):(.+)$/.exec(iv || '');
    if (!m) return subtle.decrypt({name: 'AES-GCM', iv: unb64(iv)}, k, bytes);
    const CK = +m[1], E = CK + 16, base = unb64(m[2]), u = new Uint8Array(bytes), n = Math.ceil(u.byteLength / E), out = new Uint8Array(u.byteLength - 16 * n);
    for (let i = 0, len = 0; i < n; i++) { const p = new Uint8Array(await subtle.decrypt({name: 'AES-GCM', iv: this.ivAt(base, i)}, k, u.subarray(i * E, (i + 1) * E))); out.set(p, len); len += p.length; }
    return out.buffer;
  },
  async fingerprint(pub) {
    if (!pub) return '';
    const h = new Uint8Array(await subtle.digest('SHA-256', te.encode(pub.x + '.' + pub.y)));
    let n = ''; for (let i = 0; i < 12; i++) n += String(((h[2 * i] << 8) | h[2 * i + 1]) % 100000).padStart(5, '0').slice(-4);
    return n.match(/.{4}/g).join(' ');
  },
};

/* ---------- clés des contacts : alerte si elle change ----------
   La première clé vue pour un contact est mémorisée sur l'appareil. Si le serveur en présente une autre plus tard
   (nouveau téléphone, réinstallation… ou tentative d'interception), l'appareil le signale, comme WhatsApp. */
const KeyPin = {
  m: null, uid: 0, changed: new Set(), onChange: null,
  async load(uid) { this.uid = uid; this.m = (await Store.get('pins:' + uid)) || {}; },
  fp: pub => pub ? pub.x + '.' + pub.y : '',
  check(u) {
    if (!this.m || !u || !u.id || !u.pubkey || u.id === this.uid) return;
    const f = this.fp(u.pubkey), old = this.m[u.id]; if (old === f) return;
    this.m[u.id] = f; Store.set('pins:' + this.uid, this.m);
    if (old) { this.changed.add(u.id); if (this.onChange) this.onChange(u); }
  },
  ack(id) { this.changed.delete(id); },
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
