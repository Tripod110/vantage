// Development-only static server. Never part of the browser script bundle.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep) || relative.split('/').some((p) => p.startsWith('.')) || !types[path.extname(file)]) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
    if (url.pathname === '/' && url.searchParams.get('fixture') === 'coaching') {
      body = body.toString().replace('<script src="app.js?v=9"></script>', '<script src="tests/browser-fixture.js"></script><script src="app.js?v=9"></script>');
    }
    res.end(body);
  });
}).listen(8765, '127.0.0.1', () => console.log('Vantage preview: http://127.0.0.1:8765'));
