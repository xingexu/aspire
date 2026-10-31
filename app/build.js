// Builds the single-file demo (dist/foodlink.html) and the server page (server/public/index.html)
const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const head = src('head.html').trim();
const css = src('styles.css');
const domain = src('domain.js');
const ui = src('ui.js');
const body = `<div id="app"></div>\n<div id="toast" class="toast-wrap" aria-live="polite"></div>`;
// Artifact page: no document skeleton (the host wraps it), everything inline.
const artifact = `${head}\n<style>\n${css}\n</style>\n${body}\n<script>\n${domain}\n</script>\n<script>\n${ui}\n</script>\n`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'foodlink.html'), artifact);
// Server page: full document, talks to the API.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
<style>
${css}
</style>
</head>
<body>
${body}
<script>window.FOODLINK_API = '/api';</script>
<script src="/domain.js"></script>
<script>
${ui}
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(__dirname, 'server', 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'server', 'public', 'index.html'), page);
// Local preview of the artifact page as a full document (for tests).
const preview = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n${artifact}</body></html>`;
fs.writeFileSync(path.join(__dirname, 'dist', 'preview.html'), preview);
console.log('built', (artifact.length / 1024).toFixed(1) + ' KB artifact');
