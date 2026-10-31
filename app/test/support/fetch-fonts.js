'use strict';
// test/ui.test.js serves Google Fonts from test/fonts/<first 16 hex of md5(url)>.bin so the browser test runs
// offline. Those files are not committed; this downloads any that are missing (URLs in urls.txt).
// It never fails the run: offline, the UI test still runs and only its "no console errors" checks fail.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = path.join(__dirname, '..', 'fonts');

(async () => {
  const urls = fs.readFileSync(path.join(dir, 'urls.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  let fetched = 0;
  for (const url of urls) {
    const file = path.join(dir, crypto.createHash('md5').update(url).digest('hex').slice(0, 16) + '.bin');
    if (fs.existsSync(file)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    fetched++;
  }
  if (fetched) console.log('fetched ' + fetched + ' font file(s) into test/fonts');
})().catch((err) => console.warn('could not fetch the test fonts (' + err.message + '); the UI test will report font 404s'));
