'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'pwa');

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true });
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
copyDirectory(path.join(root, 'src'), path.join(output, 'src'));
copyDirectory(path.join(root, 'assets'), path.join(output, 'assets'));
copyDirectory(path.join(root, 'database'), path.join(output, 'database'));
copyDirectory(path.join(root, 'vendor'), path.join(output, 'vendor'));

for (const filename of ['manifest.json', 'sw.js', 'app-mode.json']) {
  fs.copyFileSync(path.join(root, filename), path.join(output, filename));
}

const appEntry = fs.readFileSync(path.join(output, 'src', 'index.html'), 'utf8');
fs.writeFileSync(
  path.join(output, 'index.html'),
  appEntry.replace('<head>', '<head>\n    <base href="/src/">')
);

function listFiles(directory, relativeTo) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolute, relativeTo);
    return [`/${path.relative(relativeTo, absolute).split(path.sep).join('/')}`];
  });
}

const files = [
  '/',
  '/index.html',
  '/precache-manifest.json',
  ...['manifest.json', 'sw.js', 'app-mode.json'].map(file => `/${file}`),
  ...['src', 'assets', 'database', 'vendor'].flatMap(directory =>
    listFiles(path.join(output, directory), output)
  )
];
fs.writeFileSync(
  path.join(output, 'precache-manifest.json'),
  `${JSON.stringify({ files: [...new Set(files)] }, null, 2)}\n`
);
fs.writeFileSync(
  path.join(output, '_headers'),
  [
    '/sw.js',
    '  Cache-Control: no-cache',
    '  Content-Type: application/javascript; charset=utf-8',
    '/vendor/*.wasm',
    '  Content-Type: application/wasm',
    ''
  ].join('\n')
);

console.log(`Built offline PWA in ${path.relative(root, output)} (${files.length} cached URLs).`);
