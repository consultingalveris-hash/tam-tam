import http from 'node:http';
http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { const j = JSON.parse(b || '{}'); const t = j.messages[0].content;
  r.writeHead(200, {'Content-Type': 'application/json'}); r.end(JSON.stringify({content: [{type: 'text', text: JSON.stringify({text: '[CL] ' + t, from: 'fr'})}], usage: {input_tokens: 100, output_tokens: 50}})); }); }).listen(3667);
