# Edge Cache Consolidation — September 2026

Implementation record for `site` and the separate private `site-api` Worker.
The original proposal was revised against current Cloudflare documentation,
current main-branch code, isolated deployments, and production traffic.

## Final architecture

- Workers Cache owns ready Mood feed and detail HTML. Those routes perform no
  native Cache API match, put, response clone, or background cache task.
- Content varies by Accept; Mood HTML also varies by Cookie and Accept-Language.
  The public Worker applies Host variance at its outer response boundary,
  including redirects, Markdown and cached responses. Workers Cache honors all
  listed headers; its base key does not include the hostname.
- Existing language precedence is preserved: query, blog_lang cookie, then
  Accept-Language. Exact Cookie strings create distinct platform variants.
  There is no additional gateway Worker or language redirect.
- Unsupported query shapes and fresh/refresh/probe overrides remain no-store.
  Raw accepted anchor URLs replace the former native ten-post cache buckets.
- Empty feeds, unavailable anchor windows and pending detail previews declare
  readiness before streaming. An incomplete response cannot enter either cache.
- Home/blog and Markdown retain their existing native cache where configured.
  Native writes stream bytes without materializing or scanning the whole HTML
  string. Build-backed entries retain deployment version isolation.
- Conditional 304 responses preserve freshness and every negotiation dimension,
  even without Content-Type. Static Assets cannot replace the policy with
  must-revalidate, or reduce Vary to Host alone. CSP remains on asset responses.
- The private Worker defaults missing cache policies to no-store at both Astro
  and direct fetch dispatch. Its platform cache is enabled only after an actual
  route sweep. Host-sensitive oEmbed validation and output also vary by Host.
- Public JSON/badge policies separate browser freshness from CDN freshness.
  Existing immutable and replaceable image policies are preserved.

## Freshness

| Surface | CDN TTL | SWR | Stale-if-error |
| --- | ---: | ---: | ---: |
| Mood feed/detail HTML | 300 s | 1800 s | 1800 s |
| Other public content | Route TTL | 86400 s | 86400 s |
| Mood feed/detail JSON | 60 s | 600 s | 600 s |
| status.svg | 10 s | 3600 s | 3600 s |
| site-badge.svg | 86400 s | 3600 s | 3600 s |
| project.svg, tech-stack.svg | 3600 s | 3600 s | 3600 s |
| oEmbed | 300 s | 3600 s | 3600 s |

Browser policies retain their existing values. Stale-if-error is explicit:
Cloudflare otherwise permits unbounded stale-on-error, so SWR alone is not an
absolute staleness cap. Cross-version caching stays disabled. No paid-plan,
Smart Placement, WAF, zone-cache or image-quality changes are included.

## Deployment and regression protection

Routine private Worker updates use the existing permanent Flood Gate fence,
without repeating first-install backfill, migrations, secret rotation, queue
changes or webhook setup. An incremental update pins the active base, verifies
readiness and inherited secret bindings, uploads one owner-tagged candidate,
activates that owned candidate, then verifies before releasing the lock.
Uncertain uploads can be recovered by immutable owner tag without reuploading.

A synthetic active-A / pending-B / ordinary-upload-C experiment proved that C
inherits B's secret value, not A's. Consequently unrelated pending versions
remain a release blocker. An explicitly reviewed prebuilt direct successor can
be adopted without another upload, but requires a pinned base and the same
activation checks. Metadata name equality alone does not prove secret values.

Workers Builds uses the fenced incremental path for production. Private
non-production builds validate the bundle with a dry run instead of uploading
unused versions; this Worker has public preview URLs disabled. Existing GitHub
CI remains enabled. Three additional tests use the existing hourly Ops job to
check HTML/JSON platform caching and private/error/fresh no-store contracts.
They create no new schedule or credentials.

## Evidence

- A 62-request isolated platform matrix verified anonymous/cookie orderings,
  language/content-type/host isolation, HEAD behavior and 14 uncacheable cases.
  A TTL-3-second cycle produced MISS, UPDATING with the old render ID, then HIT
  with a refreshed ID. Ten simultaneous cold requests shared one render ID.
- The isolated API sweep covered 178 paths and 2208 responses. A separate
  36-request service-binding matrix verified authenticated admin HTML/session
  bypass and public cache hits. oEmbed wrong-host requests changed from an
  incorrect cached 200 to the correct uncached 403 in both request orderings.
- Production Mood feed, detail and tag pages demonstrated MISS then HIT.
  The three HIT probes had no matching Worker invocation; their corresponding
  MISS probes did. Cookie/language responses retained the intended language.
- Real API JSON responses completed MISS, HIT, UPDATING, HIT after their actual
  60-second TTL. The blog's 120-second expiry retained the corrected browser
  policy without must-revalidate. Final Mood validation uses its actual
  300-second TTL after the redundant native layer is removed.
- Illustrative same-route warm-request pairs: Mood TTFB 426.965 to 55.531 ms;
  tag TTFB 576.821 to 53.144 ms. These are individual observed pairs, not
  statistically representative latency estimates.
- The retained cache writer was benchmarked with real 151560-byte HTML, nine
  alternated process pairs and 2000 writes per process. CPU median fell from
  865.584 to 283.042 ms per batch (67.3%); CPU IQR was 17.492 and 4.880 ms.
  Full-body string materializations fell from one to zero. All 36000 writes
  preserved bytes. Separate actual workerd Cache API checks preserved hashes
  through MISS, HIT, HIT. This is a helper benchmark, not whole-page CPU/RSS.
- Source checks include unit tests, Astro checks, real-content production
  builds, deployment guards and Chromium regression coverage. The full local
  browser run passed 265 tests with two configured skips; one title-transition
  timing failure passed its isolated rerun. Final CI status is recorded below.

## Release records and measurement limits

The permanent review/validation records are
[site PR 211](https://github.com/bunizao/site/pull/211) and the corresponding
private API PR. They record the final merged revisions, active versions, exact
one-hour capture window, checks and live results. Raw local evidence is retained
under `notes/debug/edge-cache-evidence` and `notes/debug/edge-cache-live-evidence`;
private implementation/audit evidence stays in the private repository.

One-hour telemetry is split by immutable script version. Mixed invocation
medians include expensive renders and cheap requests; platform hits never run
the Worker. The production route sweep also creates deliberate test traffic,
so its counts cannot be presented as organic traffic or billing reductions.
Five initial confirmed render probes used 16–27 ms CPU (median 19 ms), which
alone cannot establish the hourly render distribution or resolve the Free-plan
CPU ceiling.

The original multi-day wait was replaced as an implementation gate by isolated
full-route/authorization tests, production variant checks, trace-correlated
hits, and real TTL expiry cycles. Multi-day hit ratios remain operational
observations and are not fabricated from the short release window. The
replaceable image policy still requires revalidation, so an 80% HIT target for
all image traffic would be misleading; immutable images, JSON, and replaceable
image revalidation/R2 reads must be evaluated separately.

## Authoritative references

- https://developers.cloudflare.com/workers/cache/
- https://developers.cloudflare.com/workers/cache/configuration/
- https://developers.cloudflare.com/workers/cache/cache-keys/
- https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code
