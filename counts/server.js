'use strict';
// Serves the built Counts page. Run: npm start (builds first), then open the printed address.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3001;
const file = path.join(__dirname, 'dist', 'index.html');

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url !== '/' && url !== '/index.html') { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end('Run npm run build first.'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  });
}).listen(PORT, () => console.log('Counts listening on http://localhost:' + PORT));
