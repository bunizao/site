import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { getOfficeDrawerState } from '@/lib/office-drawer-store';

export const prerender = false;

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.woff2':
      return 'font/woff2';
    case '.js':
      return 'text/javascript; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

export const GET: APIRoute = async ({ params }) => {
  const relativePath = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  if (!relativePath) {
    return new Response('Not Found', { status: 404 });
  }

  const state = getOfficeDrawerState();
  const uploaded = state.uploadedAssets[relativePath];
  if (uploaded) {
    return new Response(Buffer.from(uploaded.base64, 'base64'), {
      headers: {
        'content-type': uploaded.contentType,
        'cache-control': 'no-store',
      },
    });
  }

  const target = path.resolve('/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/public/office-runtime/static', relativePath);
  const root = path.resolve('/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/public/office-runtime/static');
  if (!target.startsWith(root)) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const data = await readFile(target);
    return new Response(data, {
      headers: {
        'content-type': contentTypeFor(target),
        'cache-control': 'public, max-age=0',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
};
