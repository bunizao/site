/* Demo answers for the comment log: a full fingerprint record on every
   generated comment, live cluster counts, the source profile a pivot line
   reads, and the owner sign-in code.

   Each writer keeps one device, one network and one session (verified
   writers also one email), so a pivot on any key lands on that writer's
   other comments. Spam and promotional rows come from one rented /24 at
   DigitalOcean in Singapore, the same farm as `seo-growth-hub` in
   portal-demo.ts: a fresh session every time, one headless browser, one
   stable fingerprint. Pivot on its fingerprint and the whole wave shows.
   One signed-in reader's device collides with that fingerprint, as device
   fingerprints do: a ban that sweeps it must spare their published comment.

   Imported only behind `import.meta.env.DEV`, like demo-api.ts. */

import type {
  ActorDetail,
  AdminClusterKey,
  AdminCommentActor,
  AdminCommentRecord,
  AdminSourceKeyType,
  AdminSourceProfile,
} from '@bunizao/contracts';
import { DEMO_SOURCE_PROFILE } from '@/features/admin/server/portal-demo';

/** A stable hex digest of a string, as long as asked. Not a real HMAC; it
    only has to be the same on every restart and differ between inputs. */
function digest(input: string, length = 64): string {
  let out = '';
  let seed = 2_166_136_261;
  while (out.length < length) {
    for (const char of `${input}#${out.length}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16_777_619) >>> 0;
    out += seed.toString(16).padStart(8, '0');
  }
  return out.slice(0, length);
}

interface Device {
  browser: string;
  os: string;
  ua: string;
  gpu: string;
  screen: [number, number, number];
  timezone: string;
  languages: string[];
  platform: string;
  colo: string;
  region: string | null;
  email: string | null;
  ipBase: string;
  pointer: 'mouse' | 'touch';
}

const CHROME_UA = (platform: string) => `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36`;

/** One device and network per demo writer, keyed by the names in demo-api.ts. */
const DEVICES: Record<string, Device> = {
  Mira: {
    browser: 'Firefox 131', os: 'macOS', gpu: 'Apple M2', screen: [1512, 982, 200], timezone: 'Europe/Berlin',
    languages: ['de-DE', 'en'], platform: 'MacIntel', colo: 'FRA', region: 'Berlin', email: 'mira@posteo.de', ipBase: '91.64.12', pointer: 'mouse',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0',
  },
  小林: {
    browser: 'Safari 18', os: 'iOS', gpu: 'Apple GPU', screen: [393, 852, 300], timezone: 'Asia/Tokyo',
    languages: ['ja-JP'], platform: 'iPhone', colo: 'NRT', region: 'Tokyo', email: null, ipBase: '106.72.33', pointer: 'touch',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  jonas_k: {
    browser: 'Chrome 129', os: 'Linux', gpu: 'Mesa Intel UHD Graphics 620', screen: [1920, 1080, 100], timezone: 'Europe/Stockholm',
    languages: ['sv-SE', 'en'], platform: 'Linux x86_64', colo: 'ARN', region: 'Stockholm', email: 'jonas@kallstrom.se', ipBase: '81.230.40', pointer: 'mouse',
    ua: CHROME_UA('X11; Linux x86_64'),
  },
  阿杰: {
    browser: 'Chrome 129', os: 'Android', gpu: 'Adreno (TM) 740', screen: [412, 915, 263], timezone: 'Asia/Taipei',
    languages: ['zh-TW', 'en'], platform: 'Linux armv8l', colo: 'TPE', region: 'Taipei City', email: null, ipBase: '114.36.201', pointer: 'touch',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  },
  Priya: {
    browser: 'Edge 129', os: 'Windows', gpu: 'NVIDIA GeForce RTX 3060', screen: [1920, 1080, 125], timezone: 'Asia/Kolkata',
    languages: ['en-IN', 'hi'], platform: 'Win32', colo: 'BLR', region: 'Karnataka', email: 'priya.r@gmail.com', ipBase: '122.171.18', pointer: 'mouse',
    ua: `${CHROME_UA('Windows NT 10.0; Win64; x64')} Edg/129.0.0.0`,
  },
  tomasz: {
    browser: 'Firefox 131', os: 'Windows', gpu: 'AMD Radeon RX 6600', screen: [2560, 1440, 100], timezone: 'Europe/Warsaw',
    languages: ['pl-PL', 'en'], platform: 'Win32', colo: 'WAW', region: 'Mazovia', email: null, ipBase: '83.24.96', pointer: 'mouse',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  },
  南风: {
    browser: 'Chrome 129', os: 'macOS', gpu: 'Apple M3', screen: [1728, 1117, 200], timezone: 'Asia/Shanghai',
    languages: ['zh-CN', 'en'], platform: 'MacIntel', colo: 'HKG', region: 'Zhejiang', email: 'nanfeng@qq.com', ipBase: '115.192.7', pointer: 'mouse',
    ua: CHROME_UA('Macintosh; Intel Mac OS X 10_15_7'),
  },
  'Sam Carter': {
    browser: 'Safari 18', os: 'macOS', gpu: 'Apple M1', screen: [1440, 900, 200], timezone: 'America/Los_Angeles',
    languages: ['en-US'], platform: 'MacIntel', colo: 'SEA', region: 'Oregon', email: null, ipBase: '73.25.140', pointer: 'mouse',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  },
  Léa: {
    browser: 'Safari 18', os: 'iPadOS', gpu: 'Apple GPU', screen: [820, 1180, 200], timezone: 'Europe/Paris',
    languages: ['fr-FR', 'en'], platform: 'MacIntel', colo: 'MRS', region: 'Auvergne-Rhone-Alpes', email: 'lea.martin@orange.fr', ipBase: '90.66.21', pointer: 'touch',
    ua: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  dev_hk: {
    browser: 'Chrome 129', os: 'Windows', gpu: 'Intel(R) Iris(R) Xe Graphics', screen: [1920, 1200, 150], timezone: 'Asia/Hong_Kong',
    languages: ['zh-HK', 'en'], platform: 'Win32', colo: 'HKG', region: null, email: null, ipBase: '219.77.64', pointer: 'mouse',
    ua: CHROME_UA('Windows NT 10.0; Win64; x64'),
  },
};

const FARM_NAMES = ['growth-hub', 'moonpump', 'Anna Smith', 'best_seo_2026', 'Kevin'];
/** The farm's device fingerprint, shared with seo-growth-hub in portal-demo.ts. */
const FARM_FP = 'f00dcafe';
/** The signed-in writer whose second comment was written on a device that
    fingerprints as the farm's. Not the first: comment-admin.ts clones that
    one into the mood comments. */
const COLLIDES = 'jonas_k';
const FARM_REASONS = new Set(['spam', 'promotional']);

function detailFor(device: Pick<Device, 'colo' | 'region' | 'timezone' | 'languages' | 'browser' | 'os'>, rtt: number): ActorDetail {
  const chromium = /Chrome|Edge/.test(device.browser);
  return {
    colo: device.colo,
    region: device.region,
    timezone: device.timezone,
    httpProtocol: 'HTTP/2',
    tlsVersion: 'TLSv1.3',
    tlsCipher: 'AEAD-AES128-GCM-SHA256',
    tlsCiphersSha1: null,
    tlsExtensionsSha1: null,
    tlsHelloLength: null,
    rttMs: rtt,
    asnKind: device.colo === 'SIN' ? 'hosting' : 'other',
    acceptLanguage: device.languages.map((lang, i) => (i === 0 ? lang : `${lang};q=0.${9 - i}`)).join(','),
    acceptEncoding: 'gzip, deflate, br, zstd',
    chUa: chromium ? `"Chromium";v="${device.browser.split(' ')[1]}", "Not=A?Brand";v="8"` : null,
    chPlatform: chromium ? `"${device.os}"` : null,
    chMobile: chromium ? (device.os === 'Android' ? '?1' : '?0') : null,
    secFetch: 'empty/cors/same-origin',
    priority: 'u=1, i',
    referer: null,
    origin: 'https://buxx.me',
    viaWorker: false,
  };
}

/** The farm writer: one rented /24, one headless browser, a new session per post. */
function farmActor(row: AdminCommentRecord, n: number): AdminCommentActor {
  const ip = `198.51.100.${20 + (n % 7)}`;
  const session = digest(`farm-session:${row.id}`);
  return {
    ...row.actor,
    readerId: null,
    authAtWrite: 'anonymous',
    email: null,
    ip,
    ua: CHROME_UA('X11; Linux x86_64').replace('Chrome/129', 'HeadlessChrome/128'),
    browser: 'Chrome 128',
    os: 'Linux',
    country: 'SG',
    city: 'Singapore',
    asn: 14061,
    asOrg: 'DigitalOcean',
    sessionNew: true,
    botHints: 2,
    detail: detailFor({ colo: 'SIN', region: null, timezone: 'Asia/Singapore', languages: ['en-US'], browser: 'Chrome 128', os: 'Linux' }, 3),
    client: {
      components: {
        navigator: { platform: 'Linux x86_64', languages: ['en-US'], hardwareConcurrency: 2, webdriver: false, plugins: 0 },
        screen: { width: 1280, height: 1024, dprPct: 100, colorDepth: 24 },
        timezone: 'America/New_York',
        webgl: { vendor: 'Google Inc. (Google)', renderer: 'SwiftShader' },
      },
      interaction: { keyEvents: 0, inputEvents: 1, pasteEvents: 1, pointerType: 'mouse', pointerMoves: 0, composeMs: 900 },
      botHints: ['webgl renderer is SwiftShader', 'no key events before submit'],
      vpnHints: ['time zone differs from the IP country'],
    },
    behaviour: { ...row.actor.behaviour, dwellMs: 2_000 + (n % 5) * 400, turnstileAgeMs: 400 },
    keys: {
      ...row.actor.keys,
      session,
      ip: digest(`ip:${ip}`),
      ip24: 'c0ffee02',
      fp: 'deadbeef',
      email: null,
      clientFp: n % 3 === 0 ? digest(`farm-fp:${n}`) : FARM_FP,
      clientFpStable: 'f00dcaf0',
      storageId: null,
      emailDomain: null,
    },
  };
}

function writerActor(row: AdminCommentRecord, device: Device, n: number): AdminCommentActor {
  const verified = row.verified;
  // Phones hop between two addresses; desktops keep one.
  const ip = `${device.ipBase}.${device.pointer === 'touch' && n % 2 ? 77 : 14}`;
  const emailDomain = verified && device.email ? device.email.split('@')[1] : null;
  return {
    ...row.actor,
    readerId: verified ? `reader-${digest(`reader:${row.author}`, 10)}` : null,
    authAtWrite: verified ? 'verified' : 'anonymous',
    email: verified ? device.email : null,
    ip,
    ua: device.ua,
    browser: device.browser,
    os: device.os,
    sessionNew: false,
    detail: detailFor(device, 18 + (n % 5) * 9),
    client: {
      components: {
        navigator: { platform: device.platform, languages: device.languages, hardwareConcurrency: 8, webdriver: false },
        screen: { width: device.screen[0], height: device.screen[1], dprPct: device.screen[2], colorDepth: 24 },
        timezone: device.timezone,
        webgl: { renderer: device.gpu },
      },
      interaction: {
        keyEvents: Math.round(row.body.length * 1.2),
        inputEvents: row.body.length,
        pasteEvents: 0,
        pointerType: device.pointer,
        composeMs: row.body.length * 260,
      },
      botHints: [],
      vpnHints: [],
    },
    keys: {
      ...row.actor.keys,
      session: digest(`session:${row.author}`),
      ip: digest(`ip:${ip}`),
      ip24: digest(`ip24:${device.ipBase}`),
      fp: digest(`fp:${device.ua}`),
      email: verified && device.email ? digest(`email:${device.email}`) : null,
      clientFp: row.author === COLLIDES && n === 1 ? FARM_FP : digest(`client-fp:${row.author}:${device.gpu}`),
      clientFpStable: digest(`client-fp-stable:${row.author}`),
      storageId: digest(`storage:${row.author}`),
      emailDomain,
    },
  };
}

/** Gives every generated comment a complete, per-writer fingerprint record.
    Hand-written fixture rows (ids not starting `01J9DEMO`) keep theirs. */
export function enrichComments(rows: AdminCommentRecord[]): AdminCommentRecord[] {
  let farm = 0;
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (!row.id.startsWith('01J9DEMO')) return row;
    if (row.moderationReason && FARM_REASONS.has(row.moderationReason)) {
      const n = farm++;
      return { ...row, author: FARM_NAMES[n % FARM_NAMES.length], verified: false, country: 'SG', actor: farmActor(row, n) };
    }
    const device = DEVICES[row.author];
    if (!device) return row;
    const n = seen.get(row.author) ?? 0;
    seen.set(row.author, n + 1);
    return { ...row, actor: writerActor(row, device, n) };
  });
}

const CLUSTER_KEYS: AdminClusterKey[] = [
  'session', 'ip', 'ip24', 'fp', 'email', 'clientFp', 'clientFpStable', 'storageId', 'emailDomain', 'bodyHash',
];

/** Recomputes each row's cluster counts from the store, so they follow
    moderation: approve a held comment and its siblings' held counts drop. */
export function withClusters(page: AdminCommentRecord[], all: readonly AdminCommentRecord[]): AdminCommentRecord[] {
  const index = new Map<string, { comments: number; held: number }>();
  for (const row of all) {
    for (const key of CLUSTER_KEYS) {
      const value = row.actor.keys[key];
      if (!value) continue;
      const slot = index.get(`${key}:${value}`) ?? { comments: 0, held: 0 };
      slot.comments += 1;
      if (row.status === 'held') slot.held += 1;
      index.set(`${key}:${value}`, slot);
    }
  }
  return page.map((row) => {
    const cluster = { ...row.actor.cluster };
    for (const key of CLUSTER_KEYS) {
      const value = row.actor.keys[key];
      const slot = value ? index.get(`${key}:${value}`) : undefined;
      const self = row.status === 'held' ? 1 : 0;
      cluster[key] = {
        comments: slot ? slot.comments - 1 : 0,
        held: slot ? slot.held - self : 0,
        reactions: row.actor.cluster[key]?.reactions ?? 0,
      };
    }
    return { ...row, actor: { ...row.actor, cluster } };
  });
}

/** `GET admin/sources/:type/:value`, from the rows the key matches. */
export function sourceProfile(type: AdminSourceKeyType, value: string, matching: AdminCommentRecord[]): AdminSourceProfile {
  const byStatus = { held: 0, published: 0, rejected: 0, deleted: 0 };
  for (const row of matching) byStatus[row.status] += 1;
  const times = matching.map((row) => row.createdAt).sort();
  const distinct = (pick: (actor: AdminCommentActor) => string | number | null) =>
    new Set(matching.map((row) => pick(row.actor)).filter((v) => v !== null && v !== '')).size;
  const hints = new Map<string, { hint: string; kind: 'bot' | 'vpn'; count: number }>();
  for (const row of matching) {
    for (const hint of row.actor.client?.botHints ?? []) hints.set(`bot:${hint}`, { hint, kind: 'bot', count: (hints.get(`bot:${hint}`)?.count ?? 0) + 1 });
    for (const hint of row.actor.client?.vpnHints ?? []) hints.set(`vpn:${hint}`, { hint, kind: 'vpn', count: (hints.get(`vpn:${hint}`)?.count ?? 0) + 1 });
  }
  return {
    ...DEMO_SOURCE_PROFILE,
    key: { type, value },
    firstSeenAt: times[0] ?? null,
    lastSeenAt: times.at(-1) ?? null,
    comments: { total: matching.length, byStatus, rows: matching.slice(0, 50) },
    reactions: { total: 0, byTarget: [], rows: [] },
    spread: {
      session: distinct((a) => a.keys.session),
      ip: distinct((a) => a.keys.ip),
      ip24: distinct((a) => a.keys.ip24),
      fp: distinct((a) => a.keys.fp),
      clientFp: distinct((a) => a.keys.clientFp),
      clientFpStable: distinct((a) => a.keys.clientFpStable),
      storageId: distinct((a) => a.keys.storageId),
      email: distinct((a) => a.keys.email),
      asn: distinct((a) => a.asn),
      ua: distinct((a) => a.ua),
    },
    hints: [...hints.values()].sort((a, b) => b.count - a.count),
    // Bans live in the moderation module's store; the pivot line reads
    // "Ban" here even for a banned key, which only the demo gets wrong.
    bans: [],
  };
}

let ownerEmail: string | null = null;

/** Back to the seed, for demo-api.ts's reset: the owner address is named again. */
export function resetOwnerCode(): void {
  ownerEmail = null;
}

/** `POST admin/comments/owner-code`. The first call has to name the owner
    address, like site-api before the owner has a reader row. */
export async function ownerCode(request: Request, json: (body: unknown, status?: number) => Response): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!ownerEmail && !email) return json({ error: 'owner_email_required', message: 'Name the owner address once.' }, 400);
  if (email) ownerEmail = email;
  return json({ code: digest(`owner-code:${Date.now()}`, 32), expiresAt: new Date(Date.now() + 60_000).toISOString() });
}
