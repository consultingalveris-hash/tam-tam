// Charge du serveur seul : 20 membres connectés en temps réel, qui écrivent en même temps dans le même groupe.
// À lancer après t-20-simultanes.mjs (mêmes comptes). Usage : node t-20-serveur.mjs [messages par personne]
const B = 'http://localhost:3555', PER = +process.argv[2] || 5;
const NAMES = ['desire.tt', 'awa.tt', 'moussa.tt', 'fatou.tt', 'ibrahima.tt', 'aminata.tt', 'cheikh.tt', 'mariama.tt', 'ousmane.tt', 'khady.tt', 'pape.tt', 'ndeye.tt', 'samba.tt', 'coumba.tt', 'lamine.tt', 'adja.tt', 'babacar.tt', 'rokhaya.tt', 'modou.tt', 'bineta.tt'];
const users = [];
for (const [i, h] of NAMES.entries()) {
  const email = i ? h + '@exemple.org' : 'owner@exemple.org';
  const r = await fetch(B + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json', 'x-forwarded-for': '10.30.0.' + (i + 1)}, body: JSON.stringify({email, pass: 'Baobab#mdp1'})});
  if (!r.ok) throw new Error('connexion ' + h + ' : ' + r.status);
  users.push({h, ip: '10.30.0.' + (i + 1), cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), seen: new Map()});
}
const H = u => ({'Content-Type': 'application/json', cookie: u.cookie, 'x-forwarded-for': u.ip});
const gid = (await (await fetch(B + '/api/chats', {headers: H(users[0])})).json()).chats.find(c => c.type === 'group').id;
// flux temps réel de chacun
const ac = new AbortController();
for (const u of users) (async () => {
  const r = await fetch(B + '/api/stream', {headers: H(u), signal: ac.signal}); const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  try { for (;;) { const {value, done} = await rd.read(); if (done) break; buf += dec.decode(value, {stream: true}); let k; while ((k = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, k); buf = buf.slice(k + 2); const d = ev.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join(''); if (!d) continue; try { const o = JSON.parse(d); if (o.t === 'msg' && o.msg && o.msg.chatId === gid) { const e = typeof o.msg.enc === 'object' ? o.msg.enc : null, c = e && /^charge-(\d+)$/.exec(e.cid || ''); const tag = e && e.iv; if (tag && tag.startsWith('L') && !u.seen.has(tag)) u.seen.set(tag, Date.now() - +tag.split('-')[1]); } } catch {} } } } catch {}
})();
await new Promise(r => setTimeout(r, 1500));
// tout le monde écrit en même temps (enveloppes au bon format ; le contenu n'est pas lisible par le serveur de toute façon)
const t0 = Date.now(); let ok = 0, ko = 0;
await Promise.all(users.map(async (u, i) => { for (let k = 0; k < PER; k++) { const tag = `L${i}x${k}-${Date.now()}`; const r = await fetch(`${B}/api/chats/${gid}/messages`, {method: 'POST', headers: H(u), body: JSON.stringify({enc: {v: 2, iv: tag, ct: 'Y2hpZmZyZQ==', keys: {}, salt: 'c2Vs', eph: {x: 'a', y: 'b'}}})}); r.ok ? ok++ : ko++; await new Promise(r => setTimeout(r, 250)); } }));
const tSend = Date.now() - t0;
await new Promise(r => setTimeout(r, 3000)); ac.abort();
const lat = users.flatMap(u => [...u.seen.values()]).sort((a, b) => a - b), exp = users.length * PER;
const q = p => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))];
console.log(JSON.stringify({personnes: users.length, messages_envoyes: exp, acceptes: ok, refuses: ko, duree_envoi_s: +(tSend / 1000).toFixed(1), livraisons_attendues: exp * users.length, livraisons_recues: lat.length, recu_par_chacun: users.map(u => u.seen.size), delai_median_ms: q(.5), delai_95pc_ms: q(.95), delai_max_ms: lat[lat.length - 1]}));
process.exit(0);
