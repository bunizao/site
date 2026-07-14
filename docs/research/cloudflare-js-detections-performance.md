# Cloudflare JavaScript Detections performance reports

Research date: 2026-07-15

## Question

Are other sites reporting mobile performance problems from Cloudflare's injected `/cdn-cgi/challenge-platform/.../main.js`, and is the `no-transform` compression tradeoff documented?

## Conclusion

Yes, public reports and at least one committed raw Lighthouse result show material JavaScript execution cost from the injected script on mobile profiles. This is consistent with the local `/mood/3653` trace, but Cloudflare has not acknowledged a general multi-second TBT defect. Its documentation instead calls the script lightweight, deferred, and moved to a separate thread where available.

The behavior behind the proposed mitigation is official, not a workaround discovered by users: `Cache-Control: no-transform` disables JavaScript Detections injection and also disables Cloudflare's edge compression transformation. It does **not** require sending uncompressed HTML; Cloudflare says an origin response that is already compressed remains compressed.

Google Tag Gateway has a separate cost profile. It changes an existing Google tag into a first-party request path; it does not make the Google tag's download, parse, and execution work disappear. Neither Cloudflare nor Google publishes Lighthouse, TBT, or CPU measurements for the gateway.

## Officially documented behavior

### JavaScript Detections

Cloudflare's [JavaScript Detections documentation](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/) (updated 2026-07-06) says:

- Cloudflare injects JavaScript into HTML page responses, with source paths beginning `/cdn-cgi/challenge-platform/...`.
- The script is deferred and uses a separate thread "where available" so that the performance impact is minimal.
- `Cache-Control: no-transform` prevents the injection and leaves `cf.bot_management.js_detection.passed` as `missing`.
- A manual JSD API can limit execution to selected pages if the zone-wide toggle can be disabled.

Confidence: high for product behavior; this page contains no payload, CPU, Lighthouse, or field-performance data supporting the "minimal" performance claim.

Cloudflare's [free Bot Fight Mode documentation](https://developers.cloudflare.com/bots/get-started/free/) (updated 2026-04-30) says JavaScript Detections is automatically enabled and cannot be disabled for Bot Fight Mode customers. Bot Fight Mode protects the entire domain, has no endpoint restrictions, and cannot be skipped with WAF custom rules. Super Bot Fight Mode is the documented route when exceptions are required.

Confidence: high.

### `no-transform` and compression

Cloudflare's [Cache-Control documentation](https://developers.cloudflare.com/cache/concepts/cache-control/#interaction-with-other-cloudflare-features) (updated 2026-06-30) states both sides of the tradeoff explicitly:

> Compression is disabled when the `no-transform` directive is present. If the original asset fetched from the origin is compressed, it is served compressed to the visitor. If the original asset is uncompressed, compression is not applied.

The next section says JavaScript Detections injection is disabled when `no-transform` is present. Cloudflare's [compression documentation](https://developers.cloudflare.com/speed/optimization/content/compression/) (updated 2026-04-17) also lists JavaScript Detections among features that can cause Cloudflare to decompress and recompress a response.

Cloudflare formalized this behavior in the merged documentation PR [cloudflare/cloudflare-docs#30392](https://github.com/cloudflare/cloudflare-docs/pull/30392) on 2026-04-28. The PR added the JSD and compression wording to both documentation pages. This is a merged Cloudflare-owned documentation change, not an unmerged product bug report.

Confidence: high.

If the Worker generates a compressed body itself, Cloudflare's [Workers `Response` documentation](https://developers.cloudflare.com/workers/runtime-apis/response/#the-encodebody-option) (updated 2026-04-23) documents `encodeBody: "manual"` for serving pre-compressed data without automatic compression. Therefore, compressed HTML plus `no-transform` plus no JSD is technically supported, but the application must correctly negotiate `Accept-Encoding` and produce/cache the variants.

Confidence: high for capability; no claim is made here that the extra implementation is worthwhile.

### Google Tag Gateway

Cloudflare's [Google Tag Gateway documentation](https://developers.cloudflare.com/google-tag-gateway/) (updated 2026-04-17) says the gateway loads an existing Google tag from a path on the site's own domain and forwards measurement events to Google. If a GTM script already exists, the first-party tag overrides it. Configuration is zone-level, covers all hostnames and subdomains, and cannot be disabled for an individual subdomain with Configuration Rules.

The [Cloudflare launch post](https://blog.cloudflare.com/google-tag-gateway-for-advertisers/) (2025-05-08) describes the same proxy mechanism and claims performance benefits, but publishes no transfer-size, main-thread, Lighthouse, or Core Web Vitals measurements. Google's [setup guide](https://developers.google.com/tag-platform/tag-manager/gateway/setup-guide?setup=auto) (updated 2026-06-10) confirms that a Google tag must already be configured and that the gateway changes its serving and measurement path.

Confidence: high for mechanism; low for any claim that the gateway improves page-load CPU because neither vendor provides measurements.

## Public measurements and reports

These sources are useful corroboration, not Cloudflare acknowledgements.

### Raw Lighthouse result: BrandForge

A committed [Lighthouse 13.3.0 mobile report](https://github.com/mxstermindhq/BrandForge/blob/79f52dbea7062fd85b0d51f587d231e9ce6b5b4a/audit/lh-bf-all/home.json), captured 2026-06-03 with DevTools throttling, records:

| Item | Result |
| --- | ---: |
| Performance | 28 |
| TBT | 3,071 ms |
| LCP | 8,627 ms |
| Cloudflare `jsd/main.js` boot-up time | 923 ms |
| Cloudflare `jsd/main.js` scripting | 896 ms |
| Google `gtag.js` boot-up time | 1,398 ms |
| Google `gtag.js` scripting | 1,140 ms |

This is the strongest external evidence found because the raw Lighthouse JSON is public and attributes execution time by URL. It does not prove that JSD caused all 3,071 ms of TBT, and it measures standard Google `gtag.js`, not Google Tag Gateway.

Confidence: high for the recorded run; medium for generalization to other sites.

### Cloudflare Community

A [Cloudflare Community thread](https://community.cloudflare.com/t/detecting-javascript-detections-complete/776150) from 2025-03-05 reports browser-dependent JavaScript Detection completion times of up to five seconds. No Cloudflare staff measurement or raw trace is attached.

Another [Cloudflare Community report](https://community.cloudflare.com/t/cloudflare-challenge-platform-script-triggers-deprecated-browser-api-warnings-in-ch/921992) from 2026-04-21 supplies reproduction steps and a screenshot showing Chrome DevTools/Lighthouse deprecated-API warnings attributed to `/cdn-cgi/challenge-platform/scripts/jsd/main.js`. This supports the script attribution and Lighthouse Best Practices impact, not TBT severity.

Confidence: low to medium; both are user reports.

### Third-party GitHub reports

- [Monferrina/vetreriamonferrina.com#75](https://github.com/Monferrina/vetreriamonferrina.com/pull/75) (2026-04-01) attributes 2,829 ms mobile TBT and Lighthouse deprecated-API warnings to the Cloudflare challenge script. It does not link raw Lighthouse JSON.
- [Iamrushabhshahh/iamrushabhshahh.github.io#3](https://github.com/Iamrushabhshahh/iamrushabhshahh.github.io/pull/3) (2026-07-10) reports roughly three seconds of throttled-mobile main-thread work from Bot Fight Mode and says production differs from the optimized local result. It does not link the trace artifact.
- [google/site-kit-wp#12504](https://github.com/google/site-kit-wp/issues/12504) (opened 2026-04-14) reports an orphaned Google Tag Gateway registration loading an additional approximately 183 KiB tag after plugin deletion, with claimed mobile Lighthouse/Core Web Vitals impact. The issue is open and is a user report in a Google-owned repository, not an accepted Google finding. Its duplicate-load edge case must not be generalized to a normal gateway setup.

Confidence: low to medium. These are third-party claims or open issues, not merged upstream fixes or vendor-confirmed defects.

## Interpretation for `buxx.me`

The internet evidence supports the local diagnosis but does not replace it:

1. Cloudflare officially confirms the exact injection and `no-transform` behavior observed locally.
2. A public raw mobile Lighthouse report independently records nearly one second of JSD script work and more than one second of Google tag work.
3. Several sites report approximately 2.8-3 seconds of mobile TBT associated with the same challenge path, but their public write-ups lack raw trace artifacts.
4. No official source confirms that multi-second JSD blocking is universal. The measured `/mood/3653` A/B result remains the best evidence for this site.

The narrowest supported mitigation remains route-scoped `no-transform` on public Mood HTML. Pre-compressing Worker HTML can technically preserve compression, but it adds negotiation and caching complexity. Google Tag Gateway should be evaluated separately: first-party routing may improve delivery or measurement, but it does not erase Google tag CPU cost.
