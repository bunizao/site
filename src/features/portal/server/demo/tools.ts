/* Demo answers for the tool screens: the Ghost post list behind blog
   previews, the notify preview payload behind email templates, and the mood
   operations reads and writes. Shapes follow site-api main
   (src/pages/admin/mood/*, src/pages/admin/ai/test.ts,
   src/pages/notify/preview.ts) and the site's own ghost-posts route; keep
   them in step when those change.

   Only imported behind `import.meta.env.DEV`, like demo-api.ts. */

import type { MoodAiConfig, MoodIngestHealth, MoodSearchResult, MoodSentimentLabel } from '@bunizao/contracts/mood';
import type { GhostAdminPostSummary } from '@/features/posts/server/ghost-admin';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Portal-Demo': '1' },
  });
}

function fail(status: number, code: string, message = code): Response {
  return json({ error: code, message }, status);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* Ghost posts. The slugs are the mock blog's, so `/blog/<slug>` renders a
   real page in the preview frame; `/dev/blog/<id>` needs a Ghost Admin key
   the demo does not have. */

const GHOST_POSTS: Array<{ slug: string; title: string; status: string; updatedAgo: number; publishedIn?: number }> = [
  { slug: 'search-needs-a-real-decision', title: 'Search needs a real decision', status: 'draft', updatedAgo: 12 * MINUTE },
  { slug: 'members-without-portal-theater', title: 'Members without Portal theater', status: 'draft', updatedAgo: 3 * HOUR },
  { slug: 'the-kg-contract-stays', title: 'The .kg contract stays', status: 'draft', updatedAgo: 2 * DAY },
  { slug: 'archive-pages-deserve-respect', title: 'Archive pages deserve respect', status: 'scheduled', updatedAgo: 5 * HOUR, publishedIn: 2 * DAY },
  { slug: 'quiet-architecture', title: 'Quiet architecture is still architecture', status: 'published', updatedAgo: 4 * DAY, publishedIn: -4 * DAY },
  { slug: 'shell-work-before-polish', title: 'Shell work before polish', status: 'published', updatedAgo: 9 * DAY, publishedIn: -9 * DAY },
  { slug: 'notes-from-the-links-lab', title: 'Notes from the links lab', status: 'published', updatedAgo: 16 * DAY, publishedIn: -16 * DAY },
  { slug: 'on-quiet-architecture', title: 'On quiet architecture', status: 'published', updatedAgo: 31 * DAY, publishedIn: -31 * DAY },
  { slug: 'demo-effects', title: 'Astro migration effect sandbox', status: 'published', updatedAgo: 58 * DAY, publishedIn: -58 * DAY },
];

const startedAt = Date.now();

export function demoGhostPosts(): GhostAdminPostSummary[] {
  return GHOST_POSTS.map((post, index) => {
    const hex = (0x66f1a000 + index * 0x1b3).toString(16);
    return {
      id: `${hex}0000000000000000`.slice(0, 24),
      uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      slug: post.slug,
      title: post.title,
      status: post.status,
      updatedAt: new Date(startedAt - post.updatedAgo).toISOString(),
      publishedAt: post.publishedIn === undefined ? null : new Date(startedAt + post.publishedIn).toISOString(),
    };
  });
}

/* Notify preview. The HTML mirrors site-api's email shell closely enough
   to exercise what the screen does with it: a `prefers-color-scheme: dark`
   block the Dark switch has to reach, a 600px card, and callback pages
   with their own dark rules. */

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function email(options: { preheader: string; heading: string; body: string[]; cta?: string; foot?: string }): string {
  const paragraphs = options.body
    .map((line) => `<p class="email-text" style="margin: 0 0 14px; font-size: 15px; line-height: 1.6; color: #18181b;">${line}</p>`)
    .join('');
  const button = options.cta
    ? `<p style="margin: 22px 0 6px;"><a href="#" class="email-btn-pill" style="display: inline-block; padding: 11px 20px; border-radius: 999px; background: #18181b; color: #fafafa; font-weight: 600; font-size: 14px; text-decoration: none; border: 1px solid #18181b;">${escapeHtml(options.cta)}</a></p>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <style>
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #0a0a0a !important; }
      .email-card { background-color: #161618 !important; }
      .email-text { color: #fafafa !important; }
      .email-muted { color: #a1a1aa !important; }
      .email-soft { color: #6e6e76 !important; }
      .email-divider { border-color: rgba(255,255,255,0.08) !important; }
      .email-btn-pill { background-color: #fafafa !important; color: #0a0a0a !important; border-color: #fafafa !important; }
    }
    @media (max-width: 620px) {
      .email-card { border-radius: 0 !important; padding: 28px 20px !important; }
    }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: ${SANS};">
  <span style="display: none;">${escapeHtml(options.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding: 32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="email-card" style="width: 100%; max-width: 600px; background: #ffffff; border-radius: 16px; padding: 36px 40px;">
        <tr><td>
          <p class="email-muted" style="margin: 0 0 24px; font-size: 13px; font-weight: 600; letter-spacing: 0.02em; color: #52525b;">buxx<span class="email-soft" style="color: #a1a1aa;">.me</span></p>
          <h1 class="email-text" style="margin: 0 0 16px; font-size: 22px; line-height: 1.3; color: #18181b;">${escapeHtml(options.heading)}</h1>
          ${paragraphs}
          ${button}
          <hr class="email-divider" style="margin: 28px 0 16px; border: 0; border-top: 1px solid #e4e4e7;" />
          <p class="email-soft" style="margin: 0; font-size: 12px; line-height: 1.6; color: #a1a1aa;">${options.foot ?? 'You get this because you subscribed at buxx.me · Preferences · Unsubscribe'}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function page(options: { title: string; body: string; tone: 'ok' | 'error'; action?: string }): string {
  const mark = options.tone === 'ok' ? '#16a34a' : '#dc2626';
  const action = options.action
    ? `<form method="post" onsubmit="event.preventDefault()"><button type="submit">${escapeHtml(options.action)}</button></form>`
    : '<a href="#">Back to buxx.me</a>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root { color-scheme: light; --bg: #fafafa; --fg: #18181b; --muted: #52525b; --line: #e4e4e7; }
    @media (prefers-color-scheme: dark) {
      :root { color-scheme: dark; --bg: #0a0a0a; --fg: #fafafa; --muted: #a1a1aa; --line: #27272a; }
    }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font-family: ${SANS}; }
    main { max-width: 26rem; padding: 32px 24px; }
    h1 { font-size: 20px; margin: 0 0 10px; display: flex; gap: 10px; align-items: center; }
    h1::before { content: ''; width: 10px; height: 10px; border-radius: 50%; background: ${mark}; }
    p { color: var(--muted); line-height: 1.6; margin: 0 0 20px; }
    a, button { font: inherit; font-size: 14px; color: var(--fg); background: none; border: 1px solid var(--line); border-radius: 999px; padding: 9px 16px; text-decoration: none; cursor: pointer; }
  </style>
</head>
<body><main><h1>${escapeHtml(options.title)}</h1><p>${escapeHtml(options.body)}</p>${action}</main></body>
</html>`;
}

export function demoNotifyPreview(params: URLSearchParams, siteUrl: string): unknown {
  const mode = params.get('mode') === 'every_5h' ? 'every_5h' : 'daily';
  const sample = params.get('sample') === 'live' ? 'live' : 'rich';
  const timezone = params.get('timezone') || 'UTC';
  const period = mode === 'daily' ? 'today' : 'the last five hours';
  const digestPostIds = sample === 'rich' ? ['4808', '4809', '4810', '4811', '4812'] : ['4811', '4812'];
  const digestLines = digestPostIds.map((id) => `<span class="email-muted" style="color: #52525b;">#${id}</span> A short note from ${period}.`);

  return {
    generatedAt: new Date().toISOString(),
    mode,
    sample,
    timezone,
    siteUrl,
    source: { channelTitle: 'tutu mood', latestPostId: '4812', digestPostIds },
    subjects: {
      subscribe: 'Confirm your subscription to buxx.me',
      welcome: 'You are subscribed to buxx.me',
      blog: 'New on buxx.me: Search needs a real decision',
      mood: 'tutu mood: a new post',
      digest: `tutu mood: ${digestPostIds.length} posts from ${period}`,
      cancel: 'You have unsubscribed from buxx.me',
      changeEmail: 'Confirm your new address for buxx.me',
      emailChanged: 'Your buxx.me address was changed',
      deleteRecord: 'Confirm: erase your buxx.me subscription record',
    },
    html: {
      subscribe: email({ preheader: 'One click to confirm.', heading: 'Confirm your subscription', body: ['Someone, hopefully you, asked to get new posts from buxx.me at this address.', 'Nothing is sent until you confirm. The link works for 24 hours.'], cta: 'Confirm subscription' }),
      welcome: email({ preheader: 'You are in.', heading: 'Welcome aboard', body: ['You will get an email when a new essay goes up, and a mood digest on the schedule you picked.', 'Reply to any email to reach me directly.'], cta: 'Pick what you get' }),
      blog: email({ preheader: 'A new essay.', heading: 'Search needs a real decision', body: ['Every search box on this site was a placeholder for a decision nobody had made yet. This is the decision.', 'Four options, one table, and the reason the boring one won.'], cta: 'Read the essay' }),
      mood: email({ preheader: 'New mood post.', heading: 'A new post in tutu mood', body: ['Rain again. The bus was late, the coffee was not, and the draft finally reads like it means it.'], cta: 'Open the post' }),
      digest: email({ preheader: `${digestPostIds.length} posts.`, heading: `${digestPostIds.length} posts from ${period}`, body: digestLines, cta: 'Open the mood feed' }),
      cancel: email({ preheader: 'You are unsubscribed.', heading: 'You have unsubscribed', body: ['You will not get any more email from buxx.me at this address.', 'Changed your mind? Subscribe again any time from the site.'], foot: 'This is the last email this address will get from buxx.me.' }),
      changeEmail: email({ preheader: 'Confirm the new address.', heading: 'Confirm your new address', body: ['Your subscription is moving to this address. Confirm it and the old one stops getting email.'], cta: 'Confirm new address' }),
      emailChanged: email({ preheader: 'Your address changed.', heading: 'Your address was changed', body: ['Your buxx.me subscription now goes to another address. If that was not you, reply to this email.'] }),
      deleteRecord: email({ preheader: 'One more step.', heading: 'Erase your subscription record?', body: ['This removes your address and every delivery record tied to it. It cannot be undone.'], cta: 'Continue to erase' }),
    },
    callbackPages: {
      confirmSuccess: page({ title: 'Subscription confirmed', body: 'You will hear from buxx.me when something new goes up.', tone: 'ok' }),
      confirmError: page({ title: 'This link has expired', body: 'Confirmation links work for 24 hours. Subscribe again to get a fresh one.', tone: 'error' }),
      unsubscribeSuccess: page({ title: 'You are unsubscribed', body: 'No more email from buxx.me at this address.', tone: 'ok' }),
      unsubscribeError: page({ title: 'That did not work', body: 'The unsubscribe link is invalid or already used. Reply to any email and it will be done by hand.', tone: 'error' }),
      deleteRecordConfirm: page({ title: 'Erase your record', body: 'This removes your address and delivery history. It cannot be undone.', tone: 'error', action: 'Erase my record' }),
      deleteRecordDone: page({ title: 'Your record is erased', body: 'Your address and 14 delivery records were removed.', tone: 'ok' }),
    },
  };
}

/* Mood operations. The config is stateful, like the KV it stands for; the
   rest is computed from one seeded archive. */

const MOOD_POSTS: Array<{ text: string; tags: string[]; sentiment: MoodSentimentLabel | null }> = [
  { text: 'Rain again. The bus was late, the coffee was not, and the draft finally reads like it means it.', tags: ['daily'], sentiment: 'calm' },
  { text: '把博客的搜索又重写了一遍，这次终于不是占位符了。', tags: ['blog', 'dev'], sentiment: 'joy' },
  { text: 'Cloudflare Workers cold start measured at 4ms today. The coffee took longer.', tags: ['dev', 'workers'], sentiment: 'joy' },
  { text: 'Exam week. Everything is a flashcard, including the grocery list.', tags: ['uni'], sentiment: 'anxiety' },
  { text: '今天墨尔本下雨，电车停了半小时。', tags: ['melbourne', 'daily'], sentiment: 'melancholy' },
  { text: 'Deleted 400 lines from the portal and it got faster. Deleting is a feature.', tags: ['dev', 'portal'], sentiment: 'joy' },
  { text: 'The retry budget post is out. Nobody owned the retry policy, so everybody wrote one.', tags: ['blog'], sentiment: 'neutral' },
  { text: 'Stuck on a D1 query plan for two hours. OR pairs scan the index. Row values do not.', tags: ['dev', 'd1'], sentiment: 'anger' },
  { text: '凌晨两点还在调 Safari 的滚动，iOS 26 的顶部色带真的很烦。', tags: ['dev', 'safari'], sentiment: 'anger' },
  { text: 'Long walk along the Yarra. No laptop, no notes, no rain for once.', tags: ['melbourne'], sentiment: 'calm' },
  { text: 'Finally shipped comment moderation as an inbox. j and k all the way down.', tags: ['portal', 'dev'], sentiment: 'joy' },
  { text: 'The mascot learned to dart on hover. It is eleven pixels wide and has more personality than me.', tags: ['mascot'], sentiment: 'joy' },
  { text: '期末考试结束，终于可以睡个好觉。', tags: ['uni'], sentiment: 'calm' },
  { text: 'Coffee number three. The draft about search is now a draft about coffee.', tags: ['daily', 'blog'], sentiment: 'neutral' },
  { text: 'Rain on the tram window, podcast about compilers, perfect Tuesday.', tags: ['melbourne', 'daily'], sentiment: 'calm' },
  { text: 'Someone asked why the site has no dark mode toggle. It is always dark. That is the toggle.', tags: ['blog'], sentiment: 'neutral' },
  { text: 'Telegram flattens forward chains, so the bot cannot tell whose post it is. Matching by date instead.', tags: ['dev', 'telegram'], sentiment: 'melancholy' },
  { text: 'Mood archive passed 4,800 posts. Most of them are about coffee or rain.', tags: ['mood'], sentiment: 'joy' },
  { text: '今天的咖啡太苦了，但代码终于跑通了。', tags: ['daily', 'dev'], sentiment: 'joy' },
  { text: 'Lighthouse says 98. RUM says the CI runner in Virginia is slow. Both are right.', tags: ['dev', 'perf'], sentiment: 'neutral' },
];

const seedConfig = (): MoodAiConfig => ({
  primary: 'task-summarize',
  fallback: 'task-summarize',
  updatedAt: new Date(startedAt - 6 * DAY).toISOString(),
});
const moodStore: { config: MoodAiConfig } = { config: seedConfig() };

/** Back to the seed, for demo-api.ts's reset. */
export function resetToolsDemo(): void {
  moodStore.config = seedConfig();
}

function moodHealth(): MoodIngestHealth {
  const now = Date.now();
  return {
    lastIngested: { id: '4810', datetime: new Date(now - 7 * MINUTE).toISOString() },
    liveLatest: { id: '4812', datetime: new Date(now - 2 * MINUTE).toISOString() },
    drift: { messages: 2, seconds: 5 * 60 },
    coverage: {
      sentiment: { total: 4812, covered: 4790, percent: 99.5 },
      tags: { total: 4812, covered: 4460, percent: 92.7 },
    },
    replyIntegrity: {
      edges: 612,
      unresolvedTargets: 3,
      unresolvedPostIds: ['4577', '4601', '4733'],
      unverifiedPosts: 18,
      oldestVerifiedAt: new Date(now - 5 * DAY).toISOString(),
    },
    snapshotGeneratedAt: new Date(now - 40 * MINUTE).toISOString(),
  };
}

/** FTS5-like: every term must match; the snippet marks each hit. */
function moodSearch(query: string): MoodSearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).map((term) => term.replace(/["*]/g, '')).filter(Boolean);
  if (terms.length === 0) return [];
  const now = Date.now();
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return MOOD_POSTS.flatMap((post, index) => {
    const text = post.text.toLowerCase();
    if (!terms.every((term) => text.includes(term))) return [];
    return [{
      id: String(4812 - index * 37),
      datetime: new Date(now - (index * 3.4 + 0.2) * DAY).toISOString(),
      snippet: post.text.replace(pattern, '<mark>$1</mark>'),
      tags: [...post.tags].sort(),
      sentiment_label: post.sentiment,
    }];
  }).slice(0, 25);
}

/** Answers `admin/mood/*` and `admin/ai/test`, or null for anything else.
    `segments` start after `admin`. */
export async function handleToolsDemo(request: Request, segments: string[], params: URLSearchParams): Promise<Response | null> {
  const method = request.method.toUpperCase();
  const [resource, action] = segments;

  if (resource === 'mood') {
    if (action === 'health' && method === 'GET') return json(moodHealth());
    if (action === 'search' && method === 'GET') return json(moodSearch(params.get('q') ?? ''));
    if (action === 'ai-config' && method === 'GET') return json(moodStore.config);
    if (action === 'ai-config' && method === 'PUT') {
      const input = (await request.json().catch(() => null)) as { primary?: unknown; fallback?: unknown } | null;
      const primary = typeof input?.primary === 'string' ? input.primary.trim() : '';
      const fallback = typeof input?.fallback === 'string' ? input.fallback.trim() : '';
      if (!primary || !fallback) return fail(400, 'invalid_mood_ai_model');
      moodStore.config = { primary, fallback, updatedAt: new Date().toISOString() };
      return json(moodStore.config);
    }
    return null;
  }

  if (resource === 'ai' && action === 'test' && method === 'POST') {
    const input = (await request.json().catch(() => null)) as { model?: unknown } | null;
    const model = typeof input?.model === 'string' ? input.model.trim() : '';
    if (!model) return fail(400, 'invalid_ai_model');
    // A model name the gateway would not know fails the way site-api does.
    if (!/^(task-[a-z-]+|gpt-[\d.]+(-[a-z\d]+)*|claude-[a-z\d.-]+)$/.test(model)) {
      await wait(260);
      return fail(500, 'ai_model_test_failed', `Unknown model: ${model}`);
    }
    await wait(model.startsWith('task-') ? 380 : 720);
    return json({ model, text: 'ok' });
  }

  return null;
}
