import { BASE_URL, E, J, OWNER, Rfor, clean, cookies, getUser, inviteValid, ipOf, now, q1, rnd, run, secure, setSession, sha, tooMany } from './core.mjs';
const R = Rfor(5);

/* ---------- connexion avec Google ---------- */
export function googleSettings() { const r = q1(`SELECT v FROM settings WHERE k='google'`); const g = r ? J(r.v, null) : null; return g && g.id && g.secret ? g : null; }
export const G_REDIRECT = () => `${BASE_URL}/api/oauth/google/callback`;
export function redirect(res, to, cookie) { const h = { Location: to, 'Cache-Control': 'no-store' }; if (cookie) h['Set-Cookie'] = cookie; res.writeHead(302, h); res.end(); return null; }
R('GET', /^\/api\/oauth\/google\/start$/, async ({ req, res, url }) => {
  const g = googleSettings(); if (!g) return redirect(res, '/?g_err=' + encodeURIComponent('La connexion Google n’est pas encore activée.'));
  if (tooMany('gstart:' + ipOf(req), 30)) return redirect(res, '/?g_err=' + encodeURIComponent('Trop de tentatives. Réessayez plus tard.'));
  const state = rnd(24), invite = clean(url.searchParams.get('invite'), 60).replace(/[^A-Za-z0-9_-]/g, '');
  const q = new URLSearchParams({ client_id: g.id, redirect_uri: G_REDIRECT(), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  return redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + q, `tt_g=${state}.${invite}; Path=/api/oauth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`);
}, false);
R('GET', /^\/api\/oauth\/google\/callback$/, async ({ req, res, url }) => {
  const bad = msg => redirect(res, '/?g_err=' + encodeURIComponent(msg), 'tt_g=; Path=/api/oauth/google; Max-Age=0');
  const g = googleSettings(); if (!g) return bad('La connexion Google n’est pas encore activée.');
  const [state, invite] = String(cookies(req).tt_g || '').split('.');
  if (!state || state !== url.searchParams.get('state')) return bad('La connexion Google a expiré. Réessayez.');
  if (url.searchParams.get('error') || !url.searchParams.get('code')) return bad('Connexion Google annulée.');
  let info;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: g.id, client_secret: g.secret, redirect_uri: G_REDIRECT(), grant_type: 'authorization_code' }) });
    const t = await r.json(); if (!r.ok || !t.id_token) throw new Error(t.error_description || t.error || 'réponse vide');
    info = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString('utf8'));
    if (info.aud !== g.id || !/^(https:\/\/)?accounts\.google\.com$/.test(info.iss) || info.exp * 1000 < now()) throw new Error('jeton refusé');
  } catch (e) { console.error('google', e.message); return bad('Google n’a pas pu confirmer votre compte. Réessayez.'); }
  const email = String(info.email || '').toLowerCase(), sub = String(info.sub || '');
  if (!email || !sub || info.email_verified === false) return bad('Ce compte Google n’a pas d’adresse e-mail confirmée.');
  let u = q1(`SELECT * FROM users WHERE google_sub=?`, sub) || q1(`SELECT * FROM users WHERE email=?`, email);
  if (u) { if (!u.google_sub) run(`UPDATE users SET google_sub=? WHERE id=?`, sub, u.id); setSession(res, u.id); const c = res.getHeader('Set-Cookie'); return redirect(res, '/', [c, 'tt_g=; Path=/api/oauth/google; Max-Age=0']); }
  const first = q1(`SELECT COUNT(*) n FROM users`).n === 0;
  if (first ? (OWNER && email !== OWNER) : !inviteValid(invite)) return bad(first ? 'Le premier compte est réservé au propriétaire de tam-tam.' : 'Aucun compte tam-tam n’existe pour ' + email + '. Pour vous inscrire, ouvrez d’abord le lien d’invitation reçu d’un membre.');
  const tok = rnd(24); run(`INSERT INTO gpending(token,email,name,sub,invite,expires) VALUES(?,?,?,?,?,?)`, sha(tok), email, clean(info.name || email.split('@')[0], 40), sub, invite || null, now() + 30 * 60_000);
  return redirect(res, '/?g=' + tok, 'tt_g=; Path=/api/oauth/google; Max-Age=0');
}, false);
R('GET', /^\/api\/oauth\/google\/pending$/, async ({ url }) => {
  const gp = q1(`SELECT email,name,invite FROM gpending WHERE token=? AND expires>?`, sha(String(url.searchParams.get('t') || '')), now()); if (!gp) E(404, 'La connexion Google a expiré. Recommencez.');
  const inv = inviteValid(gp.invite);
  return { email: gp.email, name: gp.name, invite: gp.invite, by: inv ? (u => u ? (inv.qr || !u.name ? '@' + u.handle : u.name) : '')(getUser(inv.by_user)) : '' };
}, false);

export function adminOnly(me) { if (!me.admin) E(403, 'Réservé au propriétaire.'); }
