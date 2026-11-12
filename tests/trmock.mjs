import http from 'node:http';
let n = 0;
http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { n++; const j = JSON.parse(b || '{}');
  if (/ECHEC/.test(j.q) && !globalThis.failed) { globalThis.failed = 1; r.writeHead(500, {'Content-Type': 'application/json'}); return r.end('{"error":{"message":"occupé"}}'); }
  r.writeHead(200, {'Content-Type': 'application/json'}); r.end(JSON.stringify({data: {translations: [{translatedText: j.target === 'en' ? '[EN] ' + j.q : j.q, detectedSourceLanguage: j.target === 'en' ? 'fr' : j.target}]}})); }); }).listen(3666);
