'use strict';
// Builds dist/counts.html (the page as published, without a document shell) and dist/index.html
// (the same page wrapped in the minimal shell the published version runs inside), for local use and tests.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'src', 'counts.html'), 'utf8');
const shell = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}' +
  'body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>' +
  '</head><body>' + src + '</body></html>';

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'counts.html'), src);
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), shell);
console.log('built dist/index.html (' + (Buffer.byteLength(shell) / 1024).toFixed(1) + ' KB)');
