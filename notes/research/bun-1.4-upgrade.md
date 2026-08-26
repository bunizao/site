# Bun 1.4 upgrade assessment

Research date: 2026-08-21

## Conclusion

Upgrade from Bun 1.3.14 to **Bun 1.4.0**. Treat it as a runtime and package-manager migration rather than a pin-only change. Bun 1.4.0 is the current official release: GitHub published it on 2026-08-20, and Bun recommends updating because the release includes security fixes. The release also rewrites substantial internals from Zig to Rust and documents a long behavior-change list, so a clean install and the full repository verification surface are warranted. [Bun v1.4 release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.0), [Bun 1.4 announcement](https://bun.com/blog/bun-v1.4), and [Upgrading to 1.4](https://bun.com/blog/bun-v1.4#upgrading-to-14) are the controlling sources.

## Repository verification

The upgrade was validated on a clean worktree with the official Bun 1.4.0 macOS arm64 binary:

- `bun install --frozen-lockfile`: passed without lockfile changes.
- `bun run check`: passed with 0 errors, 0 warnings, and 8 hints.
- `bun run test:unit`: passed all 536 tests.
- `GHOST_MOCK_CONTENT=1 bun run build`: completed the Astro and Cloudflare build.
- `bun run test:registry`: verified all 13 public registry items in a generated Astro consumer.
- `bun run test:ops`: passed all 8 live health checks.

The existing text lockfile remains at version 1 deliberately. Bun 1.4 reads it, and a lockfile format migration is not required by this runtime upgrade.

## Relevant migration points

| Surface | Bun 1.4 behavior | Assessment |
| --- | --- | --- |
| Astro | Bun's current Astro guide runs Astro 7 with Bun tooling. `bunx` respects a CLI's shebang and therefore uses Node for `#!/usr/bin/env node` executables unless `bunx --bun` is explicit. Bun 1.4 lists no Astro-specific breaking change. | Astro's production runtime does not automatically switch to Bun. Verify `check`, build, and Playwright after a clean install because dependency layout and command launching still pass through Bun. [Astro guide](https://bun.com/guides/ecosystem/astro), [bunx documentation](https://bun.com/docs/pm/bunx) |
| Frozen installs and lockfile | `bun install --frozen-lockfile` still installs the locked versions, refuses a `package.json` mismatch, and does not write the lockfile. CI does not enable frozen mode automatically. Bun 1.4 can read existing lockfile versions 0 and 1; new or explicitly migrated lockfiles use version 2. | Existing frozen CI remains valid. Decide deliberately whether to retain the v1 lockfile initially or regenerate it with Bun 1.4; do not rely on a frozen install to migrate it. [Install documentation](https://bun.com/docs/pm/cli/install), [Bun 1.4 lockfile migration](https://bun.com/blog/bun-v1.4#bun-lock-is-now-lockfileversion-2) |
| Isolated linker | Bun 1.4's isolated linker uses a shared global virtual store and symlinks packages into `node_modules/.bun`. The release says this is opt-in for existing projects, but it applies whenever the isolated linker is selected. Existing hoisted projects stay hoisted. | For an isolated workspace, use a newly installed `node_modules` tree as the authoritative Astro/Vite proof; the extra cache/symlink behavior is the most relevant package-manager risk. [Global virtual store](https://bun.com/blog/bun-v1.4#global-virtual-store-up-to-7x-faster-installs), [Upgrade notes](https://bun.com/blog/bun-v1.4#bun-install-defaults-to-the-isolated-linker-for-new-monorepos) |
| `bun test` | Plain `bun test` still runs files in one process and one shared global. Parallel workers and per-file isolation remain opt-in through `--parallel`; `--parallel` implies `--isolate`. Two assertion/mock changes are potentially observable: `resetAllMocks()` now removes implementations, and `toContain()` uses `===`, so it no longer matches `NaN`. | Existing commands do not silently become parallel. Run the complete unit and ops suites because these are runtime tests, not Node-hosted Astro commands. [Test defaults](https://bun.com/docs/test), [Bun 1.4 test changes](https://bun.com/blog/bun-v1.4#bun-test) |
| `bunx` | Normal `bunx` behavior is unchanged in the migration notes: it prefers a local executable, respects its shebang, and only forces Bun with `--bun`. Bun invoked as Node through `bunx --bun` no longer auto-loads `.env` files in 1.4. | Plain `bunx playwright` and `bunx wrangler` do not opt into the Bun runtime. Any future use of `bunx --bun` must provide environment loading explicitly when required. [bunx documentation](https://bun.com/docs/pm/bunx), [Bun-as-Node environment change](https://bun.com/blog/bun-v1.4#bun-invoked-as-node-no-longer-loads-env-files) |
| GitHub Actions | `oven-sh/setup-bun@v2` accepts an exact `bun-version`. Without that input it reads `packageManager` first, then `engines.bun`, then falls back to `latest`. | No setup action major-version change is required. Keep an explicit Bun version synchronized with `packageManager`, or remove the duplicate pin and let the action read `packageManager`. [setup-bun v2 README](https://github.com/oven-sh/setup-bun/tree/v2#usage) |
| Cloudflare Workers | Cloudflare Workers execute on the V8-based `workerd` runtime, not Bun. | Bun 1.4 does not directly change production Worker semantics. The risk boundary is dependency installation, build scripts, tests, Wrangler execution, and the generated upload artifact; verify a Cloudflare build/preview separately. [Cloudflare workerd](https://github.com/cloudflare/workerd), [Workers runtime standards](https://developers.cloudflare.com/workers/runtime-apis/web-standards/) |

## Other breaking changes worth screening

- Bun now reports the Node.js 26 native-module ABI (`NODE_MODULE_VERSION` 147). Native addons that select a binary by that number need a compatible build.
- Bun 1.4 makes `bunfig.toml` parsing stricter; unquoted strings and other previously accepted invalid TOML now fail at startup.
- Network behavior is stricter: several TLS paths now reject unverified certificates, `fetch()` network failures are `TypeError`, duplicate response headers are combined, and cloning a consumed request or response now throws.
- Test expectations can change through the `resetAllMocks()` and `toContain()` semantics described above.
- Normal `bun install` can produce one-time lockfile churn for optional-peer placement, and newer override/catalog features can produce lockfile version 3, which older Bun versions cannot read.

These are all documented in Bun's exhaustive [Every behavior change in 1.4](https://bun.com/blog/bun-v1.4#upgrading-to-14) section. None is a reason to avoid the upgrade, but together they justify exact version pinning and full clean-environment verification.
