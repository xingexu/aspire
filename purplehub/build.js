'use strict';
// Builds dist/purplehub.html (the page without a document shell) and dist/index.html (the page in its shell), for local
// use and tests, and PurpleHub.html (the same self-contained page, tracked in git, to send as a file attachment).
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, ...p));
const logo = 'data:image/png;base64,' + read('assets', 'usc-logo.png').toString('base64');
// A function replacement, because the bundle contains $ sequences String.replace would otherwise expand.
const western = 'data:image/jpeg;base64,' + read('assets', 'western.jpg').toString('base64');
const data = JSON.parse(read('src', 'data.json').toString('utf8'));
const eventImages = {};
fs.readdirSync(path.join(__dirname, 'assets', 'events')).filter((f) => f.endsWith('.jpg')).forEach((f) => {
  eventImages[f.replace('.jpg', '')] = 'data:image/jpeg;base64,' + read('assets', 'events', f).toString('base64');
});
const bundle = read('src', 'glass.bundle.js').toString('utf8').replace(/<\/script/gi, '<\\/script');
const src = read('src', 'purplehub.html').toString('utf8')
  .replace('{{USC_LOGO}}', () => logo)
  .replace('{{WESTERN_BG}}', () => western)
  .replace('{{EVENT_IMAGES}}', () => JSON.stringify(eventImages))
  .replace('{{DATA}}', () => JSON.stringify(data))
  .replace('<!--GLASS_BUNDLE-->', () => '<script>' + bundle + '</script>');

const shell = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<meta name="theme-color" content="#F5F5F7">' +
  '<meta name="apple-mobile-web-app-capable" content="yes">' +
  '<meta name="mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">' +
  '<meta name="apple-mobile-web-app-title" content="Purple Hub">' +
  '<link rel="icon" type="image/png" href="' + logo + '">' +
  '<link rel="apple-touch-icon" href="' + logo + '">' +
  '<style>:root{color-scheme:light}' +
  'body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>' +
  '</head><body>' + src + '</body></html>';

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'purplehub.html'), src);
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), shell);
fs.writeFileSync(path.join(__dirname, 'PurpleHub.html'), shell);
console.log('built dist/index.html and PurpleHub.html (' + (Buffer.byteLength(shell) / 1024).toFixed(1) + ' KB)');
