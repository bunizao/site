import { beforeEach, describe, expect, test } from 'bun:test';
import { getOfficeDrawerState } from '@/lib/office-drawer-store';
import { POST as authPost } from '@/pages/assets/auth';
import { GET as authStatusGet } from '@/pages/assets/auth/status';
import { GET as assetsListGet } from '@/pages/assets/list';
import { POST as positionsPost, GET as positionsGet } from '@/pages/assets/positions';
import { POST as uploadPost } from '@/pages/assets/upload';
import { POST as restorePrevPost } from '@/pages/assets/restore-prev';
import { POST as restoreDefaultPost } from '@/pages/assets/restore-default';
import { POST as saveCurrentFavoritePost } from '@/pages/assets/home-favorites/save-current';
import { GET as listFavoritesGet } from '@/pages/assets/home-favorites/list';
import { POST as deleteFavoritePost } from '@/pages/assets/home-favorites/delete';

function createContext(request: Request) {
  return { request } as any;
}

describe('office drawer compat routes', () => {
  beforeEach(() => {
    const state = getOfficeDrawerState();
    state.authed = false;
    state.gemini = { apiKey: '', model: 'nanobanana-pro' };
    state.positions = {};
    state.defaults = {};
    state.uploadedAssets = {};
    state.favorites = [];
  });

  test('authenticates and serves asset metadata', async () => {
    const badAuth = await authPost(createContext(new Request('http://example.test/assets/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    })));
    expect(badAuth.status).toBe(401);

    const okAuth = await authPost(createContext(new Request('http://example.test/assets/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: '1234' }),
    })));
    expect(okAuth.status).toBe(200);

    const authStatus = await (await authStatusGet(createContext(new Request('http://example.test/assets/auth/status')))).json() as { authed: boolean };
    expect(authStatus.authed).toBe(true);

    const assetsList = await (await assetsListGet(createContext(new Request('http://example.test/assets/list')))).json() as { items: Array<{ path: string }> };
    expect(assetsList.items.some((item) => item.path === 'office_bg_small.webp')).toBe(true);
  });

  test('stores positions and favorites after auth', async () => {
    await authPost(createContext(new Request('http://example.test/assets/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: '1234' }),
    })));

    const setPosition = await positionsPost(createContext(new Request('http://example.test/assets/positions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'office_bg_small.webp', x: 10, y: 20, scale: 1.2 }),
    })));
    expect(setPosition.status).toBe(200);

    const positions = await (await positionsGet(createContext(new Request('http://example.test/assets/positions')))).json() as { items: Record<string, { x: number }> };
    expect(positions.items['office_bg_small.webp']?.x).toBe(10);

    await saveCurrentFavoritePost(createContext(new Request('http://example.test/assets/home-favorites/save-current', {
      method: 'POST',
    })));
    const favorites = await (await listFavoritesGet(createContext(new Request('http://example.test/assets/home-favorites/list')))).json() as { items: Array<{ id: string }> };
    expect(favorites.items.length).toBe(1);

    await deleteFavoritePost(createContext(new Request('http://example.test/assets/home-favorites/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: favorites.items[0]?.id }),
    })));
    const afterDelete = await (await listFavoritesGet(createContext(new Request('http://example.test/assets/home-favorites/list')))).json() as { items: unknown[] };
    expect(afterDelete.items.length).toBe(0);
  });

  test('uploads and restores asset versions', async () => {
    await authPost(createContext(new Request('http://example.test/assets/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: '1234' }),
    })));

    const form = new FormData();
    form.set('path', 'office_bg_small.webp');
    form.set('file', new File(['new-data'], 'office_bg_small.webp', { type: 'image/webp' }));

    const uploadResponse = await uploadPost(createContext(new Request('http://example.test/assets/upload', {
      method: 'POST',
      body: form,
    })));
    expect(uploadResponse.status).toBe(200);

    const state = getOfficeDrawerState();
    expect(Boolean(state.uploadedAssets['office_bg_small.webp'])).toBe(true);
    expect(Boolean(state.uploadedAssets['office_bg_small.webp']?.defaultAsset)).toBe(true);

    await restorePrevPost(createContext(new Request('http://example.test/assets/restore-prev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'office_bg_small.webp' }),
    })));
    await restoreDefaultPost(createContext(new Request('http://example.test/assets/restore-default', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'office_bg_small.webp' }),
    })));

    const uploaded = state.uploadedAssets['office_bg_small.webp'];
    expect(uploaded).toBeDefined();
    expect(uploaded?.defaultAsset).toBeDefined();
    const currentBase64 = uploaded?.base64 ?? '';
    const defaultBase64 = uploaded?.defaultAsset?.base64 ?? '';
    expect(currentBase64).toBe(defaultBase64);
  });
});
