interface OfficeGeminiConfig {
  apiKey: string;
  model: string;
}

interface OfficeAssetState {
  authed: boolean;
  gemini: OfficeGeminiConfig;
  positions: Record<string, { x: number; y: number; scale: number; updated_at: string }>;
  defaults: Record<string, { x: number; y: number; scale: number; updated_at: string }>;
  favorites: Array<{
    id: string;
    path: string;
    url: string;
    thumb_url: string;
    created_at: string;
  }>;
}

declare global {
  var __officeDrawerState: OfficeAssetState | undefined;
}

const STATIC_ASSET_ITEMS = [
  ['btn-back-home-sprite.png', 480, 160],
  ['btn-broker-sprite.png', 480, 160],
  ['btn-diy-sprite.png', 480, 160],
  ['btn-move-house-sprite.png', 480, 160],
  ['btn-open-drawer-sprite.png', 720, 160],
  ['btn-state-sprite.png', 480, 160],
  ['cats-spritesheet.webp', 1600, 160],
  ['coffee-machine-shadow-v1.png', 230, 230],
  ['coffee-machine-v3-grid.webp', 2760, 1840],
  ['desk-v3.webp', 276, 214],
  ['error-bug-spritesheet-grid.webp', 1760, 1980],
  ['flowers-bloom-v2.webp', 1040, 1040],
  ['guest_anim_1.webp', 128, 64],
  ['guest_anim_2.webp', 128, 64],
  ['guest_anim_3.webp', 128, 64],
  ['guest_anim_4.webp', 128, 64],
  ['guest_anim_5.webp', 128, 64],
  ['guest_anim_6.webp', 128, 64],
  ['guest_role_1.png', 32, 32],
  ['guest_role_2.png', 32, 32],
  ['guest_role_3.png', 32, 32],
  ['guest_role_4.png', 32, 32],
  ['guest_role_5.png', 32, 32],
  ['guest_role_6.png', 32, 32],
  ['memo-bg.webp', 400, 300],
  ['office_bg.webp', 1280, 720],
  ['office_bg_small.webp', 1280, 720],
  ['plants-spritesheet.webp', 480, 160],
  ['posters-spritesheet.webp', 5120, 160],
  ['serverroom-spritesheet.webp', 7200, 251],
  ['sofa-idle-v3.png', 256, 256],
  ['sofa-shadow-v1.png', 256, 256],
  ['star-idle-v5.png', 2048, 1536],
  ['star-working-spritesheet-grid.webp', 2400, 1500],
  ['sync-animation-v3-grid.webp', 2048, 1792],
].map(([path, width, height]) => ({
  path,
  width,
  height,
  ext: `.${String(path).split('.').pop()}`,
  size: 0,
  mtime: '',
}));

function getInitialState(): OfficeAssetState {
  return {
    authed: false,
    gemini: {
      apiKey: '',
      model: 'nanobanana-pro',
    },
    positions: {},
    defaults: {},
    favorites: [],
  };
}

export function getOfficeDrawerState(): OfficeAssetState {
  if (!globalThis.__officeDrawerState) {
    globalThis.__officeDrawerState = getInitialState();
  }

  return globalThis.__officeDrawerState;
}

export function maskOfficeApiKey(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export function getOfficeStaticAssetItems() {
  return STATIC_ASSET_ITEMS;
}
