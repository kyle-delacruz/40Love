/* Inlines src/styles.css and src/app.js into a single shareable file: dist/40Love.html */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(src, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

// Function replacements: a plain string here would interpret "$'" / "$&" inside the source as
// special replacement patterns and silently corrupt the build.
html = html
  .replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + css + '\n</style>')
  .replace('<script src="app.js" defer></script>', () => '<script>\n' + js + '\n</script>')
  // The single-file build must allow inline code; the split source keeps the stricter 'self'.
  .replace("script-src 'self'", () => "script-src 'unsafe-inline'")
  .replace("style-src 'self'", () => "style-src 'unsafe-inline'");

fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, '40Love.html');
fs.writeFileSync(out, html);

// Sanity check: the inlined script must still parse.
const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
new Function(m ? m[1] : 'throw new Error("no script found")'); // throws on syntax error
console.log('Built ' + path.relative(root, out) + ' (' + Math.round(html.length / 1024) + ' KB), script verified');
