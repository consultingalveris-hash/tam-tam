import http from 'node:http';
const [from, to] = process.argv.slice(2).map(Number);
http.createServer((req, res) => {
  const p = http.request({host: '127.0.0.1', port: to, path: req.url, method: req.method, headers: req.headers}, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on('error', () => { try { res.writeHead(502); res.end(); } catch {} }); req.pipe(p);
}).listen(from);
