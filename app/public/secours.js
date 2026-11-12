/* ---------- adresses de secours ----------
   Si l'adresse principale ne répond plus (panne d'un fournisseur, coupure d'un chemin réseau),
   Tam-Tam vérifie ses autres adresses — même serveur, autre chemin — et propose d'y passer.
   La liste vient du serveur et reste gardée sur l'appareil pour servir justement quand il ne répond plus. */
const Secours = {
  K: 'tt:alt', KU: 'tt:relais', fails: 0, t0: 0, busy: false, shown: false, backT: 0,
  get(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch { return d; } },
  list() { return this.get(this.K, {primary: location.origin, alt: []}); },
  mine() { return this.get(this.KU, []); },
  all() { const l = this.list(); return [...new Set([l.primary, ...(l.alt || []), ...this.mine()])].filter(o => o && o !== location.origin); },
  onPrimary() { return location.origin === this.list().primary; },
  async load() {
    try { const r = await fetch('/api/alt', {cache: 'no-store', credentials: 'same-origin'}); if (r.ok) localStorage.setItem(this.K, JSON.stringify(await r.json())); } catch {}
    if (!this.onPrimary()) { clearInterval(this.backT); this.backT = setInterval(() => this.backCheck(), 5 * 60_000); }
  },
  async ping(o, ms = 5000) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try { const r = await fetch(o + '/api/ping', {mode: 'cors', cache: 'no-store', credentials: 'omit', signal: ac.signal}); return r.ok; } catch { return false; } finally { clearTimeout(t); }
  },
  // Appelé à chaque échec réseau : trois échecs en 30 secondes, avec un téléphone qui se dit connecté, déclenchent la vérification.
  fail() { if (!navigator.onLine) return; const n = Date.now(); if (n - this.t0 > 30_000) { this.fails = 0; this.t0 = n; } if (++this.fails >= 3) this.check(); },
  ok() { this.fails = 0; },
  async check() {
    if (this.busy || this.shown) return; this.busy = true;
    try {
      if (await this.ping(location.origin, 6000)) return; // l'adresse actuelle répond : simple lenteur
      for (const o of this.all()) if (await this.ping(o)) { this.offer(o, false); return; }
    } finally { this.busy = false; }
  },
  async backCheck() { const p = this.list().primary; if (!this.shown && p && p !== location.origin && await this.ping(p)) this.offer(p, true); },
  offer(o, back) {
    this.shown = true; document.querySelector('.secours')?.remove();
    const el = document.createElement('div'); el.className = 'secours'; el.setAttribute('role', 'alert');
    el.innerHTML = back
      ? `<p><b>L’adresse principale de Tam-Tam fonctionne de nouveau.</b></p><div class="actions"><button class="btn sm ghost" type="button" data-x>Rester ici</button><a class="btn sm" href="${esc(o)}/">Revenir</a></div>`
      : `<p><b>Tam-Tam ne répond pas par son adresse habituelle.</b> Une adresse de secours fonctionne : vos messages restent chiffrés. Vous devrez peut-être vous reconnecter une fois.</p><div class="actions"><button class="btn sm ghost" type="button" data-x>Plus tard</button><a class="btn sm" href="${esc(o)}/">Passer par l’adresse de secours</a></div>`;
    el.querySelector('[data-x]').onclick = () => { el.remove(); setTimeout(() => { this.shown = false; }, back ? 6 * 3600_000 : 120_000); };
    document.body.appendChild(el);
  },
  host(o) { try { return new URL(o).host; } catch { return o; } },
  settingsHtml() {
    const l = this.list(), mine = this.mine(), here = location.origin;
    const row = (o, lab, rm) => `<div class="adm-row"><span><b>${esc(this.host(o))}</b><small>${lab}${o === here ? ' · vous êtes ici' : ''}</small></span>${o === here ? '' : `<a class="btn sm ghost" href="${esc(o)}/">Ouvrir</a>`}${rm ? `<button class="btn sm ghost" type="button" data-act="relaisDel" data-o="${esc(o)}">Retirer</button>` : ''}</div>`;
    return `<div class="set-block" id="secSet"><h2>🛟 Adresses de secours</h2><p class="hint">Si Tam-Tam ne répond plus par son adresse habituelle, il vous propose tout seul de passer par une adresse de secours. Vos messages restent chiffrés de la même façon.</p>
      ${row(l.primary || here, 'Adresse principale')}${(l.alt || []).map(o => row(o, 'Adresse de secours')).join('')}${mine.map(o => row(o, 'Relais ajouté par vous', true)).join('')}
      <form class="relais-add" data-form="relais"><label class="lbl" for="relaisIn">Ajouter un relais donné par un proche</label><div class="row"><input id="relaisIn" name="o" type="url" inputmode="url" placeholder="https://…" autocomplete="off"><button class="btn sm" type="submit">Ajouter</button></div></form></div>`;
  },
  add(v) {
    let o; try { const u = new URL(String(v).trim()); if (u.protocol !== 'https:') throw 0; o = u.origin; } catch { toast('Adresse invalide : elle doit commencer par https://'); return false; }
    const m = this.mine(); if (!m.includes(o) && o !== this.list().primary && !(this.list().alt || []).includes(o)) { m.push(o); try { localStorage.setItem(this.KU, JSON.stringify(m.slice(-5))); } catch {} }
    toast('Relais ajouté sur cet appareil'); return true;
  },
};
Object.assign(ACT, {
  relaisDel(d) { try { localStorage.setItem(Secours.KU, JSON.stringify(Secours.mine().filter(o => o !== d.o))); } catch {} renderBody(); },
});
FORMS.relais = f => { if (Secours.add(f.o.value)) renderBody(); };
window.addEventListener('online', () => { Secours.fails = 0; });
