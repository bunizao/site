// Apply the blog.buxx.me -> buxx.me/blog redirects to the zone's Single
// Redirect ruleset (phase http_request_dynamic_redirect).
//
// Ghost keeps serving blog.buxx.me because the editor lives at /ghost, so the
// rules match URL shapes instead of a slug list: any single-segment root path
// that is not a Ghost namespace is an article and redirects; nested paths fall
// through to Ghost so admin, members, previews and real 404s keep working.
// The route boundary behind the reserved list is recorded in
// notes/research/ghost-public-url-migration-redirects.md.
//
// Usage: bun scripts/legacy-blog-redirects.ts [--apply] [--snapshot <file>]
//   Dry-run by default: prints the merged ruleset and exits. --apply writes it
//   in one versioned PUT after saving the current ruleset as the rollback file.
// Env:   CLOUDFLARE_API_TOKEN  Zone > Single Redirect > Edit on buxx.me
//        CLOUDFLARE_ZONE_ID    optional, looked up by name otherwise

const LEGACY_HOST = 'blog.buxx.me';
const NEW_SITE = 'https://buxx.me';
const ZONE_NAME = 'buxx.me';
const PHASE = 'http_request_dynamic_redirect';
// Free plan quota for Single Redirects.
const RULE_QUOTA = 10;

// Root segments that belong to Ghost or Cloudflare rather than to an article.
// The bare and trailing-slash forms are excluded from the article rules; nested
// paths under them never match because the article rules allow one segment.
export const RESERVED_ROOT_SEGMENTS = [
  'rss', 'feed', 'links', 'tags', 'amp', 'author', 'page', 'tag',
  'ghost', 'api', 'admin', 'content', 'assets', 'public', 'members', 'email',
  'p', '.ghost', '.well-known', 'r', 'webmentions', 'gift', 'unsubscribe',
  'comments', 'activitypub', 'cdn-cgi',
] as const;

interface RedirectRule {
  ref: string;
  description: string;
  action: 'redirect';
  expression: string;
  action_parameters: {
    from_value: {
      target_url: { value: string } | { expression: string };
      status_code: 301;
      preserve_query_string: boolean;
    };
  };
}

const SCOPE = `http.host eq "${LEGACY_HOST}" and http.request.method in {"GET" "HEAD"}`;
const PATH = 'http.request.uri.path';

function reservedSet(suffix: '' | '/'): string {
  return `{${RESERVED_ROOT_SEGMENTS.map((segment) => `"/${segment}${suffix}"`).join(' ')}}`;
}

function rule(
  ref: string,
  description: string,
  match: string,
  target: { value: string } | { expression: string },
  preserveQueryString = true,
): RedirectRule {
  return {
    ref: `legacy_ghost_${ref}`,
    description,
    action: 'redirect',
    expression: `${SCOPE} and (${match})`,
    action_parameters: {
      from_value: {
        target_url: target,
        status_code: 301,
        preserve_query_string: preserveQueryString,
      },
    },
  };
}

// Ordered most specific first: a redirect is terminating, so the first match
// wins. Targets are slashless because buxx.me 308s the slash form; a redirect
// that lands on another redirect is a hop Google counts against the move.
// Five rules, because the Free plan allows ten per zone and three are taken:
// tag pagination and AMP aliases fall through to Ghost's own 404 instead.
export const LEGACY_BLOG_REDIRECT_RULES: readonly RedirectRule[] = [
  rule(
    'sitemaps',
    'Legacy Ghost sitemaps',
    `lower(${PATH}) eq "/sitemap.xml" or ${PATH} wildcard "/sitemap-*.xml"`,
    { value: `${NEW_SITE}/sitemap.xml` },
    false,
  ),
  rule(
    'feeds',
    'Legacy Ghost feeds',
    [
      `lower(${PATH}) in {"/rss" "/rss/" "/feed" "/feed/"}`,
      ...['tag', 'author'].flatMap((archive) =>
        ['rss', 'feed'].flatMap((feed) => [
          `${PATH} wildcard "/${archive}/*/${feed}"`,
          `${PATH} wildcard "/${archive}/*/${feed}/"`,
        ])),
    ].join(' or '),
    { value: `${NEW_SITE}/blog/rss.xml` },
  ),
  rule(
    'archive_consolidation',
    'Legacy Ghost index, links page, author and pagination archives',
    `lower(${PATH}) in {"/" "/links" "/links/" "/author" "/author/" "/page" "/page/"} or ${PATH} wildcard "/author/*" or ${PATH} wildcard "/page/*"`,
    { value: `${NEW_SITE}/blog` },
  ),
  // /:slug/, /tags/ and /tag/:slug/ all map to /blog + the same path without
  // its trailing slash, so one target expression serves all three shapes.
  rule(
    'trailing_slash',
    'Legacy Ghost articles, tags index and tag archives with trailing slash',
    `(${PATH} ne "/" and ${PATH} wildcard "/*/" and not ${PATH} wildcard "/*/*/" and not (${PATH} contains ".") and not (lower(${PATH}) in ${reservedSet('/')})) or lower(${PATH}) eq "/tags/" or (${PATH} wildcard "/tag/*/" and not ${PATH} wildcard "/tag/*/*/" and len(${PATH}) gt 6)`,
    { expression: 'wildcard_replace(' + PATH + ', "/*/", "' + NEW_SITE + '/blog/${1}")' },
  ),
  rule(
    'no_trailing_slash',
    'Legacy Ghost articles, tags index and tag archives without trailing slash',
    `not ends_with(${PATH}, "/") and ((${PATH} ne "/" and ${PATH} wildcard "/*" and not ${PATH} wildcard "/*/*" and not (${PATH} contains ".") and not (lower(${PATH}) in ${reservedSet('')})) or lower(${PATH}) eq "/tags" or (${PATH} wildcard "/tag/*" and not ${PATH} wildcard "/tag/*/*" and len(${PATH}) gt 5))`,
    { expression: `concat("${NEW_SITE}/blog", ${PATH})` },
  ),
];

interface ExistingRule {
  id?: string;
  ref?: string;
  description?: string;
  expression: string;
  action: string;
  action_parameters?: unknown;
  enabled?: boolean;
}

interface Ruleset {
  id: string;
  version?: string;
  rules?: ExistingRule[];
}

interface ApiEnvelope<T> {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
}

async function cloudflare<T>(token: string, path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  return await response.json() as ApiEnvelope<T>;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function resolveZoneId(token: string): Promise<string> {
  const fromEnv = process.env.CLOUDFLARE_ZONE_ID?.trim();
  if (fromEnv) return fromEnv;
  const zones = await cloudflare<Array<{ id: string }>>(token, `/zones?name=${ZONE_NAME}`);
  const id = zones.result?.[0]?.id;
  if (!zones.success || !id) fail(`Cannot resolve zone ${ZONE_NAME}: ${JSON.stringify(zones.errors)}`);
  return id;
}

// A zone with no dynamic redirect ruleset answers 404 here; that is an empty
// ruleset, and the entrypoint PUT below creates it.
async function readEntrypoint(token: string, zoneId: string): Promise<Ruleset | null> {
  const envelope = await cloudflare<Ruleset>(token, `/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`);
  if (envelope.success) return envelope.result;
  if (envelope.errors.some((error) => error.code === 10000)) {
    fail(
      'Cloudflare answered "Authentication error" for the redirect ruleset. '
      + 'The token needs Zone > Single Redirect > Edit on buxx.me; '
      + 'the analytics token in .env.local does not carry it.',
    );
  }
  if (envelope.errors.some((error) => error.message.toLowerCase().includes('not found'))) return null;
  fail(`Cannot read the ${PHASE} ruleset: ${JSON.stringify(envelope.errors)}`);
}

function mentionsLegacyHost(existing: ExistingRule): boolean {
  return existing.expression.includes(LEGACY_HOST);
}

function describe(existing: { ref?: string; description?: string; expression: string }): string {
  return `${existing.ref ?? existing.description ?? '(unnamed)'}: ${existing.expression.slice(0, 96)}`;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const snapshotIndex = process.argv.indexOf('--snapshot');
  const snapshotPath = snapshotIndex >= 0
    ? process.argv[snapshotIndex + 1]
    : '.tmp/legacy-blog-redirects.before.json';
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) fail('CLOUDFLARE_API_TOKEN is not set.');

  const zoneId = await resolveZoneId(token);
  const current = await readEntrypoint(token, zoneId);
  const existingRules = current?.rules ?? [];

  // Every existing rule that targets the legacy host is subsumed by the shape
  // rules; anything else on the zone is preserved untouched, in its order.
  const dropped = existingRules.filter(mentionsLegacyHost);
  const kept = existingRules.filter((existing) => !mentionsLegacyHost(existing));
  const merged = [...LEGACY_BLOG_REDIRECT_RULES, ...kept];

  console.log(`Zone ${ZONE_NAME} (${zoneId}), ruleset ${current?.id ?? '(none yet)'}`);
  console.log(`\nDropping ${dropped.length} legacy-host rule(s):`);
  for (const existing of dropped) console.log(`  - ${describe(existing)}`);
  console.log(`\nKeeping ${kept.length} unrelated rule(s):`);
  for (const existing of kept) console.log(`  = ${describe(existing)}`);
  console.log(`\nAdding ${LEGACY_BLOG_REDIRECT_RULES.length} shape rule(s):`);
  for (const next of LEGACY_BLOG_REDIRECT_RULES) console.log(`  + ${describe(next)}`);
  console.log(`\nMerged ruleset: ${merged.length} rule(s), quota ${RULE_QUOTA}.`);

  if (merged.length > RULE_QUOTA) {
    fail('The merged ruleset exceeds the Single Redirect quota; nothing was written.');
  }
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }

  await Bun.write(snapshotPath, JSON.stringify(current ?? { rules: [] }, null, 2));
  console.log(`\nRollback snapshot: ${snapshotPath}`);

  const written = await cloudflare<Ruleset>(token, `/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`, {
    method: 'PUT',
    body: JSON.stringify({ rules: merged }),
  });
  if (!written.success) fail(`Update rejected: ${JSON.stringify(written.errors, null, 2)}`);
  console.log(`Wrote ruleset ${written.result.id} version ${written.result.version ?? '?'}.`);
  console.log('Now run: bun test tests/ops/legacy-blog-redirect-health.test.ts');
}

if (import.meta.main) {
  await main();
}
