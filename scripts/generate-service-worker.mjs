import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const outputDirectory = new URL('../dist/', import.meta.url);
const root = outputDirectory.pathname.replace(/^\/([A-Z]:)/, '$1').replaceAll('/', sep);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await collectFiles(fullPath));
    else if (entry.name !== 'service-worker.js') paths.push(relative(root, fullPath).split(sep).join('/'));
  }
  return paths.sort();
}

const files = await collectFiles(root);
const fingerprint = createHash('sha256');
for (const file of files) {
  fingerprint.update(file);
  fingerprint.update('\0');
  fingerprint.update(await readFile(join(root, file)));
  fingerprint.update('\0');
}
const cacheVersion = fingerprint.digest('hex').slice(0, 12);
const source = [
  "const CACHE_NAME = 'local-message-simulator-" + cacheVersion + "';",
  'const APP_FILES = ' + JSON.stringify(files.map((file) => './' + file)) + ';',
  '',
  "self.addEventListener('install', (event) => {",
  '  event.waitUntil(',
  '    caches.open(CACHE_NAME)',
  '      .then((cache) => cache.addAll(APP_FILES.map((path) => new URL(path, self.registration.scope).href)))',
  '      .then(() => self.skipWaiting())',
  '  );',
  '});',
  '',
  "self.addEventListener('activate', (event) => {",
  '  event.waitUntil(',
  '    caches.keys()',
  "      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('local-message-simulator-') && key !== CACHE_NAME).map((key) => caches.delete(key))))",
  '      .then(() => self.clients.claim())',
  '  );',
  '});',
  '',
  "self.addEventListener('fetch', (event) => {",
  '  const request = event.request;',
  '  const url = new URL(request.url);',
  "  if (request.method !== 'GET' || url.origin !== self.location.origin) return;",
  '  event.respondWith(',
  '    caches.match(request).then((cached) => {',
  '      if (cached) return cached;',
  '      return fetch(request).then((response) => {',
  "        if (response.ok && response.type === 'basic') {",
  '          const copy = response.clone();',
  '          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));',
  '        }',
  '        return response;',
  '      }).catch(async () => {',
  "        if (request.mode === 'navigate') {",
  "          const shell = await caches.match(new URL('./index.html', self.registration.scope));",
  '          if (shell) return shell;',
  '        }',
  "        throw new Error('This item is not cached for offline use.');",
  '      });',
  '    })',
  '  );',
  '});',
  ''
].join('\n');

await writeFile(join(root, 'service-worker.js'), source, 'utf8');
console.log('Generated offline shell cache for ' + files.length + ' static files.');
