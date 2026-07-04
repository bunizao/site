// Minimal static file server for previewing the built dist/client output.
// astro dev hangs under Bun, so we serve the production build instead.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/client/', import.meta.url).pathname;
const port = Number(process.env.PORT) || 4399;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const serve = async (res, path) => {
  const body = await readFile(path);
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
  res.end(body);
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = normalize(url).replace(/^(\.\.[/\\])+/, '');
    if (rel.endsWith('/')) rel += 'index.html';
    let path = join(root, rel);
    try {
      await serve(res, path);
    } catch {
      // SPA-ish fallback: try directory index, then 404 page.
      try {
        await serve(res, join(root, rel, 'index.html'));
      } catch {
        await serve(res, join(root, '404.html')).catch(() => {
          res.writeHead(404);
          res.end('Not found');
        });
      }
    }
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`static preview on http://127.0.0.1:${port}`);
});
