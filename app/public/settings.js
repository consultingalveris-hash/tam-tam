/* tam-tam — Réglages : profil, chiffrement, localisation, sonneries, administration.
   Extrait de app.js (nov. 2026) : chargé après app.js, partage ses variables globales. */
'use strict';
/* ---------- réglages ---------- */
function mailBox() {
  const m = S.mail;
  if (!m) return `<div class="set-block" id="mailBox"><h2>E-mails « mot de passe oublié »</h2><p class="hint">Réglez l’adresse qui envoie les codes de réinitialisation.</p><div><button class="btn sm" type="button" data-act="mailLoad">Afficher le réglage</button></div></div>`;
  return `<form class="set-block" id="mailBox" data-form="mail" autocomplete="off"><h2>E-mails « mot de passe oublié »</h2>
    <p class="hint">Créez d’abord l’adresse dans votre espace LWS (par exemple ne-pas-repondre@alveris-consulting.com), puis entrez ici ses informations d’envoi. Le mot de passe de cette adresse n’est jamais affiché.</p>
    <div class="field"><label for="mlHost">Serveur d’envoi (SMTP)</label><input id="mlHost" value="${esc(m.host || 'mail.alveris-consulting.com')}"></div>
    <div class="field"><label for="mlPort">Port</label><input id="mlPort" inputmode="numeric" value="${esc(m.port || 465)}"></div>
    <div class="field"><label for="mlUser">Identifiant (l’adresse e-mail)</label><input id="mlUser" type="email" value="${esc(m.user || '')}" placeholder="ne-pas-repondre@alveris-consulting.com"></div>
    <div class="field"><label for="mlPass">Mot de passe de cette adresse${m.hasPass ? ' (laisser vide pour garder l’actuel)' : ''}</label><input id="mlPass" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="mlFrom">Nom et adresse d’expéditeur</label><input id="mlFrom" value="${esc(m.from || 'tam-tam <ne-pas-repondre@alveris-consulting.com>')}"></div>
    <p class="err" id="mlErr" role="alert" hidden></p><p class="hint" id="mlOk" role="status" hidden></p>
    <div><button class="btn sm" type="submit">Enregistrer et envoyer un test</button></div></form>`;
}
function googleBox() {
  const g = S.gset;
  if (!g) return `<div class="set-block" id="gBox"><h2>${gIcon()} Connexion avec Google</h2><p class="hint">Permet aux membres de se connecter avec leur compte Google, sans mot de passe.</p><div><button class="btn sm" type="button" data-act="gLoad">Afficher le réglage</button></div></div>`;
  return `<form class="set-block" id="gBox" data-form="gset" autocomplete="off"><h2>${gIcon()} Connexion avec Google</h2>
    <p class="hint">${g.id && g.hasSecret ? '<b>Activée.</b> Le bouton « Continuer avec Google » apparaît sur la page de connexion.' : 'Collez ici les deux codes affichés par Google Cloud quand vous avez créé le client « tam-tam ».'} Le code secret n’est jamais réaffiché.</p>
    <div class="field"><label for="gId">ID client</label><input id="gId" value="${esc(g.id)}" placeholder="…apps.googleusercontent.com" spellcheck="false"></div>
    <div class="field"><label for="gSecret">Code secret du client${g.hasSecret ? ' (laisser vide pour garder l’actuel)' : ''}</label><input id="gSecret" type="password" autocomplete="off" spellcheck="false"></div>
    <p class="hint">Adresse de retour à déclarer chez Google : <b>${esc(g.redirect)}</b></p>
    <p class="err" id="gErr" role="alert" hidden></p><p class="hint" id="gOk" role="status" hidden></p>
    <div class="actions" style="justify-content:flex-start"><button class="btn sm" type="submit">Enregistrer</button>${g.id ? '<button class="btn sm ghost" type="button" data-act="gOff">Désactiver</button>' : ''}</div></form>`;
}
function picsEdit(set) {
  const me = S.me, list = (set === 'pub' ? me.pics : me.privPics) || [null, null, null], vids = Prof.vids(me, set), ids = Prof.ids(me, set);
  const cell = (inner, i, kind) => `<div class="pf-cell">${inner}${Prof.bar(me.id, kind === 'v' ? (vids[i] || {}).id : ids[i])}</div>`;
  return `<span class="lbl">${set === 'pub' ? 'Mes 3 photos publiques' : 'Mes 3 photos privées'}</span>
    <p class="hint" style="margin:0">${set === 'pub' ? 'Tous les membres de Tam-Tam peuvent les voir, par exemple avant de vous demander en ami.' : 'Seules les personnes autorisées à voir votre profil privé peuvent les voir.'}</p>
    <div class="ph3">${[0, 1, 2].map(i => list[i]
      ? cell(`<div class="ph3-it"><button class="ph3-img" type="button" data-act="picView" data-src="${esc(list[i])}" aria-label="Agrandir la photo ${i + 1}"><img src="${esc(list[i])}" alt=""></button><button class="ph3-x" type="button" data-act="picDel" data-set="${set}" data-i="${i}" aria-label="Retirer la photo ${i + 1}">${I.close}</button></div>`, i, 'p')
      : `<button class="ph3-add" type="button" data-act="picAdd" data-set="${set}" data-i="${i}"><span aria-hidden="true">+</span>Photo ${i + 1}</button>`).join('')}</div>
    <span class="lbl">${set === 'pub' ? 'Mes 3 vidéos publiques' : 'Mes 3 vidéos privées'}</span>
    <p class="hint" style="margin:0">Une courte vidéo par case (40 Mo au maximum, environ une minute).${set === 'priv' ? ' Elles sont chiffrées pour les seules personnes autorisées.' : ''}</p>
    <p class="note" style="margin:0">🔥 Sur vos photos comme sur vos vidéos, publiques ou privées, ceux qui les regardent peuvent vous envoyer une flamme. Vous voyez combien vous en avez reçu et, avec « Voir qui », qui les a envoyées.</p>
    <div class="ph3">${[0, 1, 2].map(i => vids[i]
      ? cell(`<div class="ph3-it">${Prof.vidTile(vids[i], i)}<button class="ph3-x" type="button" data-act="vidDel" data-set="${set}" data-i="${i}" aria-label="Retirer la vidéo ${i + 1}">${I.close}</button></div>`, i, 'v')
      : `<button class="ph3-add" type="button" data-act="vidAdd" data-set="${set}" data-i="${i}"><span aria-hidden="true">▶</span>Vidéo ${i + 1}</button>`).join('')}</div>
    <input type="file" id="picIn" accept="image/*" hidden><input type="file" id="vidIn" accept="video/*" hidden>`;
}
function closeSummary() {
  const n = (S.me.close || []).length;
  return `<div class="grp-box"><b>${I.users} Mon groupe privé</b><p class="hint" style="margin:0">${n ? `${n} ami${n > 1 ? 's' : ''} dans votre groupe privé.` : 'Personne pour l’instant.'} Ces amis voient vos statuts privés${S.me.privTo === 'grp' ? ' et votre profil privé verrouillé' : ''}.</p><div><button class="btn sm ghost" type="button" data-act="cgOpen">Choisir les amis</button></div></div>`;
}
function closePicker(ok) {
  const cs = S.contacts.contacts, close = new Set(S.me.close || []);
  return `<div class="grp-box"><b>${I.users} Mon groupe privé</b><p class="hint" style="margin:0">Ces amis voient vos statuts privés${S.me.privTo === 'grp' ? ' et votre profil privé verrouillé' : ''}.</p>
    ${cs.length ? `<div class="cg-tools"><label class="pick cg-all"><input type="checkbox" name="closeAll"${cs.every(u => close.has(u.id)) ? ' checked' : ''}><span><b>Tout cocher</b></span></label><span class="hint" id="cgCount">${cs.filter(u => close.has(u.id)).length} sur ${cs.length}</span>${ok ? `<button class="btn sm" type="button" data-act="${ok === 'prof' ? 'cgClose' : 'stGrpOk'}">Valider</button>` : ''}</div>
    ${cs.length > 8 ? `<label class="search" style="margin:0">${I.search}<span class="sr">Chercher un ami</span><input id="cgq" type="search" placeholder="Chercher un ami" autocomplete="off"></label>` : ''}
    <p class="hint" style="margin:0">Astuce : cochez tout, puis décochez seulement les personnes qui ne doivent pas voir.</p>` : ''}
    ${cs.length ? `<div class="picks">${cs.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(u => `<label class="pick"><input type="checkbox" name="close" value="${u.id}"${close.has(u.id) ? ' checked' : ''}>${avatar(u, 'sm')}<span>${esc(u.name)}</span></label>`).join('')}</div>` : '<p class="hint" style="margin:0">Ajoutez d’abord des amis.</p>'}${ok && !cs.length ? `<div><button class="btn sm" type="button" data-act="${ok === 'prof' ? 'cgClose' : 'stGrpOk'}">Fermer</button></div>` : ''}</div>`;
}
function profileEditor() {
  const me = S.me, p = me.pub || {}, pv = me.priv || {}, t = S.profTab || 'pub';
  const f = (set, k, l, ph = '', type = 'text', max = 80) => `<div class="field"><label for="p-${k}">${l}</label>${k === 'bio' ? `<textarea id="p-${k}" data-set="${set}" data-k="${k}" rows="2" maxlength="200" placeholder="${ph}">${esc((set === 'pub' ? p : pv)[k] || '')}</textarea>` : `<input id="p-${k}" data-set="${set}" data-k="${k}" type="${type}" maxlength="${max}" placeholder="${ph}" value="${esc((set === 'pub' ? p : pv)[k] || '')}">`}</div>`;
  const LOCKS = [['contacts', I.globe, 'Ouvert', 'Tous mes amis le voient'], ['grp', I.lock, 'Verrouillé', 'Seulement mon groupe privé'], ['me', I.lock, 'Fermé', 'Personne, sauf moi']];
  return `<div class="set myprof">
    <div class="set-top">${avatar(me, 'lg')}<div><b>${esc(me.name)}</b>${subH(me) ? `<span>${esc(subH(me))}</span>` : ''}</div></div>
    <div class="seg" role="tablist"><button type="button" role="tab" data-act="profTab" data-t="pub" aria-selected="${t === 'pub'}">${I.globe}Profil public</button><button type="button" role="tab" data-act="profTab" data-t="priv" aria-selected="${t === 'priv'}">${I.lock}Profil privé</button></div>
    ${t === 'pub' ? `<p class="note">${I.globe}Visible par tous les membres de Tam-Tam, notamment quand quelqu’un veut vous ajouter. Il l’aide à savoir qui vous êtes.</p>
    <div class="set-block">
      <div class="field"><label for="p-handle">Pseudo</label><div class="at-in"><span>@</span><input id="p-handle" data-set="handle" maxlength="20" autocapitalize="none" spellcheck="false" value="${esc(me.handle)}"></div><small class="hint">Visible par tous. Vous pouvez le changer quand vous voulez, une fois par mois au maximum.</small></div>
      <div class="field"><label for="p-name">Prénom et nom</label><input id="p-name" data-set="name" maxlength="40" value="${esc(me.rawName != null ? me.rawName : me.name)}"><small class="hint">Visible seulement par vos contacts.</small></div>
      ${f('pub', 'bio', 'Qui suis-je', 'Quelques mots sur vous')}${f('pub', 'metier', 'Métier ou études')}${f('pub', 'ville', 'Ville', 'Ex. : Dakar, Sénégal')}${f('pub', 'langues', 'Langues parlées', 'Ex. : Français, Wolof')}${f('pub', 'interets', 'Centres d’intérêt')}
      <div class="field"><span class="lbl">Jour et mois de naissance</span><div class="bd-row"><select id="p-bd" data-set="pub" data-k="bd" aria-label="Jour"><option value="">Jour</option>${Array.from({length: 31}, (_, i) => `<option value="${i + 1}"${+p.bd === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select><select id="p-bm" data-set="pub" data-k="bm" aria-label="Mois"><option value="">Mois</option>${MOIS.map((m, i) => `<option value="${i + 1}"${+p.bm === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select></div></div>
      ${picsEdit('pub')}
      <label class="pick chk"><input type="checkbox" data-act="listedTog"${me.listed !== false ? ' checked' : ''}><span>Apparaître dans la liste « Membres de Tam-Tam » (le + en haut). Décoché, on peut toujours vous trouver par votre pseudo exact.</span></label>
      <div><button class="btn sm ghost" type="button" data-act="prof" data-id="${me.id}">${I.eye}Voir mon profil public comme les autres</button></div></div>
` : `<p class="note">${I.lock}<span>Votre profil privé n’est jamais visible par des inconnus. Votre <b>numéro de téléphone</b> reste caché, même pour vos amis : vous le montrez seulement à qui vous voulez, depuis son profil (« Lui montrer mon numéro »).</span></p>
    <div class="set-block">
      <span class="lbl">Qui peut voir mon profil privé</span>
      <div class="locks">${LOCKS.map(([v, ic, l, h]) => `<button class="lockopt" type="button" data-act="privTo" data-v="${v}" aria-pressed="${me.privTo === v}">${ic}<b>${l}</b><small>${h}</small></button>`).join('')}</div>
      ${S.cgOpen ? closePicker('prof') : closeSummary()}
    </div>
    <div class="set-block">
      ${f('priv', 'tel', 'Téléphone (caché sauf accord)', '+221 …', 'tel')}${f('priv', 'annee', 'Année de naissance', 'Ex. : 1985', 'number')}${f('priv', 'mail', 'E-mail de contact', '', 'email')}${f('priv', 'adresse', 'Quartier ou adresse')}${f('priv', 'travail', 'Lieu de travail')}${f('priv', 'famille', 'Famille')}
      ${picsEdit('priv')}
      <div><button class="btn sm ghost" type="button" data-act="prof" data-id="${me.id}">${I.eye}Voir mon profil privé comme mes amis le voient</button></div></div>
`}
  </div>`;
}
function pendAvatar() {
  const P = S.pp; if (!P) return avatar(S.me, 'xl');
  return P.kind === 'photo' ? `<span class="av xl"><img src="${esc(P.url)}" alt=""></span>` : `<span class="av xl" aria-hidden="true">${avFace(P.av)}</span>`;
}
function profMedia(u, set) {
  const pics = (set === 'pub' ? u.pics : u.privPics) || [], ids = Prof.ids(u, set), vids = Prof.vids(u, set);
  const ph = [0, 1, 2].filter(i => pics[i]).map(i => `<div class="pf-cell"><button class="ph3-img" type="button" data-act="picView" data-src="${esc(pics[i])}" aria-label="Agrandir la photo ${i + 1}"><img src="${esc(pics[i])}" alt=""></button>${Prof.bar(u.id, ids[i])}</div>`);
  const vd = [0, 1, 2].filter(i => vids[i]).map(i => `<div class="pf-cell">${Prof.vidTile(vids[i], i)}${Prof.bar(u.id, vids[i].id)}</div>`);
  return (ph.length ? `<span class="lbl">${set === 'pub' ? 'Photos publiques' : 'Photos privées'}</span><div class="ph3">${ph.join('')}</div>` : '') + (vd.length ? `<span class="lbl">${set === 'pub' ? 'Vidéos publiques' : 'Vidéos privées'}</span><div class="ph3">${vd.join('')}</div>` : '');
}
function trConsentAsk(open) {
  sheet(`${head('Activer la traduction')}<div class="sheet-body"><p>La traduction de Tam-Tam s’améliore grâce à ses utilisateurs, notamment pour les <b>langues africaines</b>.</p>
    <p class="hint">En l’activant, vous acceptez que vos messages traduits et vos corrections soient gardés <b>sans votre nom ni identifiant</b> (numéros, e-mails et liens retirés) pour enrichir la base de traduction de Tam-Tam (article 13 des <a href="/conditions" target="_blank" rel="noopener">Conditions générales</a>). Vos autres messages restent chiffrés et illisibles pour Tam-Tam.</p>
    <p class="hint">Si vous refusez, vous ne recevez aucune traduction : les messages s’affichent tels qu’ils ont été écrits. Vous pouvez changer d’avis à tout moment dans Réglages → Traduction.</p>
    <div class="actions"><button class="btn ghost" type="button" data-act="trConsentNo">Non, pas de traduction</button><button class="btn" type="button" data-act="trConsentYes"${open ? ' data-open="1"' : ''}>J’accepte et j’active</button></div></div>`, 'Traduction');
}
// Qui a choisi la langue : moi, ou mon contact (proposition) ; et s'il a choisi lui-même, lui seul la change.
// Menu d'un message traduit : voir le message d'origine (une fois), ou le toujours / ne jamais l'afficher dans la discussion.
function trMenu(m, id) {
  if (!m.text || m.once || m.locked || !Tr.st || !Tr.st.on || !S.me.trConsent) return '';
  const cid = m.chatId || S.chatId, c = S.chats.get(cid) || {}, mine = m.from === S.me.id;
  if (mine) return m.orig != null && m.tlang ? `<button type="button" data-act="trOrigOnce" data-id="${id}">${I.translate}${Tr.once.has(id) ? 'Masquer ce qu’il a reçu' : `Voir ce que ${esc(c.type === 'direct' ? first(chatTitle(c)) : 'le groupe')} a reçu`}</button>` : '';
  if (!Tr.translated(m)) return !Tr.inL(cid) ? `<button type="button" data-act="trMsg" data-id="${id}">${I.translate}Traduire</button>` : '';
  const all = Tr.origAll(cid), dot = on => `<span class="mdot${on ? ' on' : ''}" aria-hidden="true"></span>`;
  return `<button type="button" data-act="trOrigOnce" data-id="${id}">${I.translate}${Tr.once.has(id) ? 'Masquer le message d’origine' : 'Voir le message d’origine'}</button>
    <button type="button" role="menuitemradio" aria-checked="${all}" data-act="trOrigAll" data-v="1">${I.translate}<span class="grow">Toujours afficher les messages d’origine</span>${dot(all)}</button>
    <button type="button" role="menuitemradio" aria-checked="${!all}" data-act="trOrigAll" data-v="">${I.translate}<span class="grow">Masquer les messages d’origine</span>${dot(!all)}</button>`;
}
function trNote(c, side, L) {
  if (c.type !== 'direct') return '';
  const me = Tr.row(c.id, true), peer = Tr.row(c.id, false), nm = esc(first(chatTitle(c)));
  if (side === 'in' && me && me.trIn && me.trBy && me.trBy !== S.me.id) return `<div class="tr-note">${nm} a choisi pour vous : vous recevez ses messages en <b>${esc(L(me.trIn))}</b>. Gardez ce choix ou touchez une autre langue.<button class="btn sm" type="button" data-act="trKeep">Garder</button></div>`;
  if (side === 'out' && peer && peer.trBy === peer.id) return `<div class="tr-note">${nm} a choisi sa propre langue : réception en <b>${peer.trIn ? esc(L(peer.trIn)) : 'sa langue d’origine, sans traduction'}</b>. Vous ne pouvez plus la changer.</div>`;
  if (side === 'out' && peer && peer.trBy === S.me.id && peer.trIn) return `<div class="tr-note">C’est votre proposition : ${nm} la voit et peut la garder ou choisir une autre langue.</div>`;
  return '';
}
function trSheet() {
  const c = S.chats.get(S.chatId); if (!c || !Tr.st) return;
  const side = S.trSide || 'in', cur = side === 'out' ? Tr.outL(c.id) : Tr.inL(c.id), L = l => (LANG_FR[l] || l).replace(/^./, x => x.toUpperCase());
  const top = ['fr', 'en', 'wo', 'ff', 'ar', 'pt', 'es', 'sw', 'ln', 'bm', 'ha', 'yo'].filter(l => Tr.st.langs.includes(l)), rest = Tr.st.langs.filter(l => !top.includes(l)).sort((a, b) => L(a).localeCompare(L(b), 'fr'));
  const lockOut = side === 'out' && (r => r && r.trBy === r.id)(Tr.row(c.id, false));
  const btn = l => `<button type="button" class="lang-opt" data-act="trPick" data-v="${l}" aria-pressed="${l === cur}"${lockOut ? ' disabled' : ''}>${esc(L(l))}<small>${l.toUpperCase()}</small></button>`;
  const who = c.type === 'group' ? 'les membres du groupe reçoivent' : `${esc(first(chatTitle(c)))} reçoit`;
  const keep = layer.querySelector('.tr-scroll'), y = keep ? keep.scrollTop : 0;
  sheet(`${head('Langues de cette discussion')}<div class="sheet-body tr-body"><div class="tr-fixed">
    <div class="seg tr-seg" role="tablist"><button type="button" role="tab" data-act="trSide" data-v="in" aria-selected="${side === 'in'}"><small>Je reçois en</small><b>${Tr.inL(c.id) ? esc(L(Tr.inL(c.id))) : 'pas de traduction'}</b></button><button type="button" role="tab" data-act="trSide" data-v="out" aria-selected="${side === 'out'}"><small>Mon contact reçoit en</small><b>${Tr.outL(c.id) ? esc(L(Tr.outL(c.id))) : 'pas de traduction'}</b></button></div>
    ${trNote(c, side, L)}
    <div class="tr-hint"><p class="hint">${side === 'in' ? 'Choisissez la langue dans laquelle <b>vous recevez</b> les messages de cette discussion. Ils seront traduits automatiquement.' : `Choisissez la langue dans laquelle <b>${who}</b> vos messages. Vous écrivez dans votre langue, Tam-Tam envoie la traduction.`}</p><button class="btn sm" type="button" data-act="close">Terminé</button></div>
    <div class="tr-none"><button type="button" class="lang-opt none" data-act="trNone" data-side="in" aria-pressed="${!Tr.inL(c.id)}"><span>Pas de traduction<small>je reçois</small></span>—</button><button type="button" class="lang-opt none" data-act="trNone" data-side="out" aria-pressed="${!Tr.outL(c.id)}"><span>Pas de traduction<small>mon contact reçoit</small></span>—</button></div></div>
    <div class="tr-scroll"><span class="lbl">Langues les plus utilisées</span><div class="lang-grid">${top.map(btn).join('')}</div>
    <span class="lbl">Autres langues</span><div class="lang-grid">${rest.map(btn).join('')}</div></div></div>`, 'Langues');
  const sc = layer.querySelector('.tr-scroll'); if (sc) sc.scrollTop = y;
}
// Propriétaire : la vitesse réelle chez les utilisateurs, version par version (alerte si la nouvelle est plus lente).
const PERF_L = {open: 'Ouverture de l’appli', chat: 'Ouverture d’une discussion', send: 'Envoi d’un message', recv: 'Réception d’un message', img: 'Chargement d’une photo', vid: 'Chargement d’une vidéo', call: 'Connexion d’un appel'};
function perfBox() {
  const p = S.perf, f = ms => ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString('fr-FR', {maximumFractionDigits: 1})} s`;
  if (!p) return `<div class="set-block" id="perfBox"><h2>⏱ Vitesse chez les utilisateurs</h2><p class="hint">Temps mesurés sur les téléphones et ordinateurs des membres (aucun contenu, seulement des durées).</p><div><button class="btn sm ghost" type="button" data-act="perfLoad">Afficher les mesures</button></div></div>`;
  const rows = p.metrics.filter(x => PERF_L[x.k]);
  return `<div class="set-block" id="perfBox"><h2>⏱ Vitesse chez les utilisateurs</h2><p class="hint">Version ${esc(p.version || '—')}${p.previous ? ` comparée à la ${esc(p.previous)}` : ''}, 14 derniers jours. « Habituel » : la moitié des cas sont plus rapides. « Lent » : 9 cas sur 10 sont plus rapides.</p>
    ${rows.some(x => x.slower) ? `<p class="err">⚠ Cette version est plus lente que la précédente sur : ${rows.filter(x => x.slower).map(x => PERF_L[x.k]).join(', ')}.</p>` : ''}
    <table class="perf-t"><thead><tr><th>Mesure</th><th>Habituel</th><th>Lent</th><th>Avant</th><th>Cas</th></tr></thead><tbody>${rows.map(x => `<tr${x.slower ? ' class="bad"' : ''}><td>${PERF_L[x.k]}</td><td>${f(x.med)}</td><td>${f(x.p90)}</td><td>${f(x.prev)}</td><td>${x.n}</td></tr>`).join('')}</tbody></table>
    <div><button class="btn sm ghost" type="button" data-act="perfLoad">Actualiser</button></div></div>`;
}
function trBox() {
  const t = S.trset;
  if (!t) return `<div class="set-block" id="trBox"><h2>${I.translate} Traduction</h2><p class="hint">Google traduit d’abord, gratuitement jusqu’à 450 000 caractères par mois ; Claude prend le relais ensuite, et pour les langues que Google ne connaît pas, dans la limite de son budget.</p><div><button class="btn sm ghost" type="button" data-act="trLoad">Afficher les réglages</button></div></div>`;
  const n = v => (v || 0).toLocaleString('fr-FR'), d = v => (v || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const gp = Math.min(100, Math.round((t.used || 0) / (t.cap || 1) * 100)), cp = Math.min(100, Math.round((t.spent || 0) / (t.budget || 1) * 100));
  return `<form class="set-block" id="trBox" data-form="trset" autocomplete="off"><h2>${I.translate} Traduction</h2>
    <p class="hint">1. <b>Google</b> traduit d’abord : ${t.g ? `<b>activé</b> · ce mois-ci ${n(t.used)} caractères sur ${n(t.cap)} gratuits (${gp} %).` : 'pas encore activé.'} Au plafond, Google s’arrête jusqu’au 1er du mois : rien n’est jamais prélevé.<br>2. <b>Claude</b> prend le relais : ${t.c ? `<b>activé</b> · ce mois-ci ${d(t.spent)} $ sur ${d(t.budget)} $ (${cp} %).` : 'pas encore activé.'}</p>
    <div class="field"><label for="trG">Clé Google${t.g ? ' (pour la changer)' : ''}</label><input id="trG" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…"></div>
    <div class="field"><label for="trC">Clé Anthropic (Claude)${t.c ? ' (pour la changer)' : ''}</label><input id="trC" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…"></div>
    <div class="field"><label for="trBudget">Budget maximum de Claude par mois (en dollars)</label><input id="trBudget" type="number" min="0.1" max="100" step="0.05" value="${t.budget || 1.65}"></div>
    ${t.lastErr ? `<p class="hint">Dernier incident : ${esc(t.lastErr)}</p>` : ''}
    <p class="hint">Base : ${(t.corpus && t.corpus.mt) || 0} traductions, ${(t.corpus && t.corpus.fix) || 0} corrections.</p>
    <p class="err" id="trErr" role="alert" hidden></p><div class="actions" style="justify-content:flex-start"><button class="btn sm" type="submit">Enregistrer</button>${t.g ? '<button class="btn sm ghost" type="button" data-act="trOff" data-v="google">Retirer Google</button>' : ''}${t.c ? '<button class="btn sm ghost" type="button" data-act="trOff" data-v="claude">Retirer Claude</button>' : ''}</div></form>`;
}
// Blocs des Réglages repliés : le titre seul, les choix apparaissent quand on touche dessus.
S.fold = S.fold || new Set();
function fold(key, html, st) {
  const m = /^\s*<div class="set-block"([^>]*)><h2>([\s\S]*?)<\/h2>([\s\S]*)<\/div>\s*$/.exec(html); if (!m) return html;
  return `<div class="set-block"${m[1]}><details class="loc-det" data-fold="${key}"${S.fold.has(key) ? ' open' : ''}><summary><h2>${m[2]}</h2>${st ? `<span class="loc-st">${st}</span>` : ''}</summary>${m[3]}</details></div>`;
}
document.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.fold) d.open ? S.fold.add(d.dataset.fold) : S.fold.delete(d.dataset.fold); }, true);
function availPicker() {
  const a = (S.me && S.me.avail) || 'on';
  return `<div class="avail" role="radiogroup" aria-label="Ma disponibilité">${[['off', 'Hors ligne'], ['busy', 'Occupé'], ['on', 'En ligne']].map(([v, l]) => `<button type="button" role="radio" class="av-opt ${v}" data-act="availSet" data-v="${v}" aria-checked="${a === v}"><i aria-hidden="true"></i><span>${l}</span></button>`).join('')}</div>`;
}
function settingsBody() {
  const me = S.me, p = me.pub || {}, pv = me.priv || {};
  return `<div class="set">
    <div class="set-block" id="phBlock"><h2 class="ph-h"><span>Photo de profil</span><b class="me-first">${esc(me.name.split(' ')[0])}</b></h2>
      <div class="ph-pick"><span class="pp-prev">${pendAvatar()}</span><p class="hint" style="margin:0">${S.pp ? 'Aperçu de votre nouveau choix. Il ne remplace votre photo actuelle qu’après « Valider ».' : 'Choisissez une photo ou un portrait. Rien ne change tant que vous n’avez pas validé.'}</p></div>
      <div class="actions" style="justify-content:flex-start"><button class="btn sm" type="button" data-act="mePhoto">${I.camera}Prendre ou choisir une photo</button><button class="btn sm ghost" type="button" data-act="avShow" aria-pressed="${!!S.showAv}">Utiliser un avatar</button><input type="file" id="meIn" accept="image/*" hidden></div>
      ${S.showAv ? `${avGallery(S.pp && S.pp.kind === 'av' ? S.pp.av : me.avatar, 'me')}` : ''}
      ${S.pp ? `<div class="actions"><button class="btn ghost" type="button" data-act="pendCancel">Annuler</button><button class="btn" type="button" data-act="pendOk">Valider et changer ma photo de profil</button></div>` : ''}</div>
    <div class="set-block"><h2>${I.globe} Profil public et privé</h2><p class="hint">Ils se règlent dans <b>Discussions → Mon profil</b>.</p><div><button class="btn sm ghost" type="button" data-act="goProfile">Ouvrir mon profil</button></div></div>
    <div class="set-block"><h2>${I.shield} Chiffrement de bout en bout</h2><p class="hint">Vos messages et vos photos sont chiffrés sur votre appareil : seules les personnes de la discussion peuvent les lire, pas même le serveur (sauf les textes que vous faites traduire : voir les conditions).</p>
      <p>Votre code de sécurité : <b class="fp" id="myFp">…</b></p><p class="hint">Comparez-le avec celui qu’un proche voit sur votre profil pour vérifier que personne ne s’est glissé entre vous.</p>
      <div><button class="btn sm ghost" type="button" data-act="keyCode">${I.key}Changer le code de sauvegarde</button></div></div>
    <div class="set-block" id="locSet"><details class="loc-det"><summary><h2>📍 Partager ma localisation</h2><span class="loc-st${(me.locTo || []).length ? ' on' : ''}">${(me.locTo || []).length ? `Activé · ${(me.locTo || []).length}` : 'Désactivé'}</span></summary><p class="hint">Les personnes que vous cochez peuvent voir où vous êtes, en permanence : dans votre discussion, le point en haut à droite, puis « Suivre la localisation ». Pratique entre conjoints, ou pour des parents avec leurs enfants. Votre position est chiffrée : même le serveur ne peut pas la lire.</p>
      ${(S.contacts.contacts || []).length ? `<div class="picks">${S.contacts.contacts.slice().sort((x, y) => x.name.localeCompare(y.name, 'fr')).map(u => `<label class="pick"><input type="checkbox" name="locTo" value="${u.id}"${(me.locTo || []).includes(u.id) ? ' checked' : ''}>${avatar(u, 'sm')}<span>${esc(u.name)}</span></label>`).join('')}</div>` : '<p class="hint">Ajoutez d’abord des contacts.</p>'}
      <p class="hint">${(me.locTo || []).length ? `✅ Partagée avec ${(me.locTo || []).length} personne${(me.locTo || []).length > 1 ? 's' : ''}. Sur ordinateur et dans le navigateur, la position est envoyée tant que Tam-Tam est ouvert.` : 'Partage désactivé : cochez une personne pour l’activer.'}</p></details></div>
    ${fold('tones', Tones.settingsHtml(), esc(Tones.name(Tones.get('call'))))}
    <div class="set-block"><h2>🌍 Ambassadeurs des langues</h2><p class="hint">Des bénévoles font vivre leur langue maternelle sur Tam-Tam en corrigeant les traductions. Ils portent le badge « Ambassadeur » sur leur profil.</p><div class="actions"><button class="btn sm ghost" type="button" data-act="ambList">Voir les ambassadeurs</button><a class="btn sm ghost" href="/ambassadeurs" target="_blank" rel="noopener">Devenir ambassadeur</a></div></div>
    <div class="set-block"><h2>${I.download || ''} Stockage sur cet appareil</h2><p class="hint">Photos, vidéos et messages gardés sur cet appareil pour s’ouvrir tout de suite, même sans réseau.</p><div><button class="btn sm ghost" type="button" data-act="stoOpen">Gérer le stockage</button></div></div>
    <div class="set-block"><details class="loc-det" data-fold="hd"${S.fold.has('hd') ? ' open' : ''}><summary><h2>${I.image} Qualité des photos et vidéos envoyées</h2><span class="loc-st${hdOn() ? ' on' : ''}">${hdOn() ? 'HD' : 'Standard'}</span></summary><p class="hint">Standard : photos et vidéos allégées avant l’envoi, comme sur WhatsApp. Elles partent et arrivent beaucoup plus vite. HD : meilleure qualité, mais plus lourd et plus lent.</p>
      <div class="seg"><button type="button" data-act="hdSet" data-v="" aria-pressed="${!hdOn()}">Standard (conseillé)</button><button type="button" data-act="hdSet" data-v="1" aria-pressed="${hdOn()}">HD</button></div>${dataSaver() ? '<p class="hint">L’économie de données est activée : les envois restent allégés.</p>' : ''}</details></div>
    <div class="set-block"><details class="loc-det" data-fold="eco"${S.fold.has('eco') ? ' open' : ''}><summary><h2>${I.download || ''} Économie de données</h2><span class="loc-st${dataSaver() ? ' on' : ''}">${dataSaver() ? 'Activée' : 'Désactivée'}</span></summary><p class="hint">Pour les petits forfaits : photos et vidéos envoyées plus légères, et Tam-Tam ne télécharge rien à l’avance (le statut suivant se charge quand vous y arrivez).</p>
      <label class="pick chk"><input type="checkbox" data-act="saverTog"${dataSaver() ? ' checked' : ''}><span>Activer l’économie de données sur cet appareil</span></label></details></div>
    ${fold('lock', lockSettingsHtml(), (S.lock || {}).type === 'off' ? 'Désactivé' : 'Actif')}
    ${Priv.settingsHtml()}
    ${Device.settingsHtml()}
    ${fold('sec', Secours.settingsHtml(), Secours.onPrimary() ? '' : 'Adresse de secours')}
    <div class="set-block"><h2>Personnes bloquées</h2>${(me.blocked || []).length ? me.blocked.map(u => `<div class="adm-row">${avatar(u, 'xs')}<span>${esc(u.name)}</span><button class="btn sm ghost" type="button" data-act="unblock" data-id="${u.id}">Débloquer</button></div>`).join('') : '<p class="hint">Personne n’est bloqué.</p>'}</div>
    <div class="set-block"><h2>${I.shield} Appareils connectés</h2><p class="hint">Un téléphone perdu ou prêté ? Déconnectez-le à distance. Changer votre mot de passe déconnecte aussi tous les autres appareils.</p><div><button class="btn sm ghost" type="button" data-act="devList">Voir mes appareils connectés</button></div></div>
    <div class="set-block"><h2>Compte</h2><div class="actions" style="justify-content:flex-start"><button class="btn sm ghost" type="button" data-act="pwSheet">${I.key}Changer le mot de passe</button><a class="btn sm ghost" href="/conditions" target="_blank" rel="noopener">Conditions et confidentialité</a><button class="btn sm ghost" type="button" data-act="logout">Se déconnecter</button></div></div>
    ${Tr.settingsHtml()}
    <p class="hint set-mail">Connecté avec ${esc(me.email)} · @${esc(me.handle)}</p>
    ${me.admin ? mailBox() : ''}
    ${me.admin ? trBox() + perfBox() : ''}
    ${me.admin ? googleBox() : ''}
    ${me.admin ? `<div class="set-block" id="adm"><h2>${I.shield} Administration</h2><div><button class="btn sm" type="button" data-act="admLoad">Afficher les membres et les signalements</button></div></div>` : ''}
    <div class="set-block danger-zone"><h2>Supprimer mon compte</h2><p class="hint">Efface définitivement votre compte, votre profil, vos photos et vos statuts. Votre mot de passe vous sera demandé pour confirmer.</p><div><button class="btn sm danger" type="button" data-act="delSheet">Supprimer mon compte…</button></div></div>
    <p class="hint" style="text-align:center">Tam-Tam · version 2.01</p></div>`;
}
let saveT, pending = {};
function queueSave(patch) {
  for (const k of Object.keys(patch)) { if (typeof patch[k] === 'object' && patch[k] && !Array.isArray(patch[k])) pending[k] = Object.assign(pending[k] || {}, patch[k]); else pending[k] = patch[k]; }
  clearTimeout(saveT); saveT = setTimeout(async () => { const body = pending; pending = {}; try { const r = await api('/api/me', body); S.me = r.me; keepUsers([r.me]); } catch (e) { toast(e.message); } }, 700);
}
async function saveNow(body, msg) { try { const r = await api('/api/me', body); S.me = r.me; keepUsers([r.me]); renderBody(); renderHead(); if ('trConsent' in body && S.chatId) { renderComposer(); renderMessages(true); } if (msg) toast(msg); } catch (e) { toast(e.message); renderBody(); } }
async function adminLoad() {
  try {
    const r = await api('/api/admin'), el = $('#adm');
    el.innerHTML = `<h2>${I.shield} Administration</h2><p class="hint">${r.counts.users} membres · ${r.counts.chats} discussions · ${r.counts.messages} messages</p>
      <span class="lbl">Signalements à traiter</span>${r.reports.length ? r.reports.map(x => `<div class="adm-row"><span><b>${esc(x.reason)}</b><small>par ${esc(x.by)}${x.target ? ' · contre ' + esc(x.target) : ''}${x.chat ? ' · discussion ' + esc(x.chat.name || 'à deux') : ''} · ${listTime(x.created_at)}${x.note ? ' · « ' + esc(x.note) + ' »' : ''}</small></span><button class="btn sm ghost" type="button" data-act="admDone" data-id="${x.id}">Traité</button></div>`).join('') : '<p class="hint">Aucun signalement.</p>'}
      <span class="lbl">Membres</span>${r.users.map(u => `<div class="adm-row"><span><b>${esc(u.name)}</b>${u.online ? ' · en ligne' : ''}<small>@${esc(u.handle)} · ${esc(u.email)} · inscrit le ${new Date(u.created_at).toLocaleDateString('fr-FR')}</small></span><span class="adm-acts"><button class="btn sm ghost" type="button" data-act="admAmb" data-id="${u.id}" data-l="${esc(u.amb || '')}">${u.amb ? '🌍 ' + esc(u.amb) : 'Ambassadeur'}</button>${u.id !== S.me.id ? `<button class="btn sm ghost" type="button" data-act="admReset" data-id="${u.id}">Lien mot de passe</button>` : ''}</span></div>`).join('')}`;
  } catch (e) { toast(e.message); }
}

