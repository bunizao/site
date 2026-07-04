# Plan 004: Clean up Turnstile widget lifecycle in ManagePreferences

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat de572482..HEAD -- src/features/notify/ui/ManagePreferences.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `de572482`, 2026-07-04

## Why this matters

The magic-link gate on `/subscribe/manage` renders a Cloudflare Turnstile widget from a React effect. The effect never removes the widget it rendered, and its double-render guard (`widgetId !== null`) is a local variable that resets on every effect run. When the gate re-enters — user submits (`sent` → true), then clicks "resend"/reset (`sent` → false) — the effect runs again and calls `ts.render()` on the same container, stacking a second widget iframe. The stale `window.onManageTurnstileLoad` global also keeps pointing at the first run's closure. It's an edge path, but it's user-visible (duplicate captchas, confused token state) on the page that gates subscriber preferences.

## Current state

- `src/features/notify/ui/ManagePreferences.tsx:415-449` — the effect, as of `de572482`:

```tsx
React.useEffect(() => {
  if (!requiresTurnstile || sent) return;
  let widgetId: string | null = null;
  const render = () => {
    const ts = (window as unknown as { turnstile?: any }).turnstile;
    if (!ts || !turnstileRef.current || widgetId !== null) return;
    widgetId = ts.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
      action: 'notify_manage',
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      callback: (tok: string) => { tsTokenRef.current = tok || ''; },
      'expired-callback': () => { tsTokenRef.current = ''; },
      'error-callback': () => { tsTokenRef.current = ''; },
    });
  };
  if ((window as unknown as { turnstile?: any }).turnstile) {
    render();
  } else if (!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onManageTurnstileLoad';
    s.async = true;
    (window as unknown as { onManageTurnstileLoad?: () => void }).onManageTurnstileLoad = render;
    document.head.appendChild(s);
  } else {
    const id = window.setInterval(render, 120);
    return () => window.clearInterval(id);
  }
}, [requiresTurnstile, turnstileSiteKey, sent]);
```

Defects, concretely:
1. No cleanup calls `ts.remove(widgetId)` (or `ts.reset`) when the effect
   re-runs or the component unmounts → duplicate widgets on gate re-entry.
2. The script-load branch leaves `window.onManageTurnstileLoad` pointing at a
   stale closure and has no cleanup at all.
3. `tsTokenRef` is not cleared when the effect tears down, so a token from a
   removed widget can linger.

- Turnstile's explicit-render API: `turnstile.render(el, opts)` returns a
  widget id string; `turnstile.remove(widgetId)` removes the widget and its
  iframe. These are stable public APIs.
- A second, *vanilla* Turnstile integration exists in
  `src/features/notify/subscribe-panel.ts:149-197`. It is out of scope here;
  do not try to unify them in this plan.
- Repo conventions: English-only comments; React code in this repo prefers
  direct event-driven updates and minimal effects; conventional commits without
  trailing rationale clauses.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `bun install`        | exit 0              |
| Typecheck | `bun run check`      | exit 0, no errors   |
| Unit tests| `bun run test:unit`  | all pass            |

Note: this repo lives on a Dropbox mount; sandboxed `bun`/`node` can hit
non-deterministic `EPERM`. If a command fails with `EPERM`, ask the operator to
run it in their own terminal instead of retrying.

## Scope

**In scope** (the only files you should modify):
- `src/features/notify/ui/ManagePreferences.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/features/notify/subscribe-panel.ts` — separate vanilla integration; unification is deferred (see Maintenance notes).
- `src/pages/subscribe/manage.astro` — no changes needed here.
- The Turnstile verification flow server-side.

## Git workflow

- Work on the current branch (`plan-new-blog-era`) unless the operator says otherwise.
- One commit, message style: `fix: remove stale Turnstile widgets on manage gate re-entry`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Give the effect a full cleanup

Rework the effect so **every** branch returns a cleanup that:
- calls `ts.remove(widgetId)` (guarded in try/catch — Turnstile throws if the
  id is already gone) when a widget was rendered,
- clears the polling interval if one was started,
- resets `tsTokenRef.current = ''`,
- and drops the global: if `window.onManageTurnstileLoad` is this run's
  `render`, delete it.

Shape (adapt, don't paste blindly):

```tsx
React.useEffect(() => {
  if (!requiresTurnstile || sent) return;
  let widgetId: string | null = null;
  let intervalId: number | null = null;
  const render = () => { /* as today */ };
  // ... existing three branches, but the script-load branch keeps a reference
  // so cleanup can compare window.onManageTurnstileLoad === render ...
  return () => {
    if (intervalId !== null) window.clearInterval(intervalId);
    const w = window as unknown as { turnstile?: any; onManageTurnstileLoad?: () => void };
    if (w.onManageTurnstileLoad === render) delete w.onManageTurnstileLoad;
    if (widgetId !== null) {
      try { w.turnstile?.remove(widgetId); } catch { /* already gone */ }
    }
    tsTokenRef.current = '';
  };
}, [requiresTurnstile, turnstileSiteKey, sent]);
```

Keep behavior otherwise identical: same sitekey, action, theme, and callbacks.

**Verify**: `bun run check` → exit 0.

### Step 2: Manual smoke (operator or preview)

If a dev server is available: open `/subscribe/manage` (no token), submit an
email so the gate flips to "sent", click the reset/resend affordance to return
to the gate, and confirm exactly one Turnstile widget renders (inspect the
container: it must contain a single widget iframe).

If no dev server is available in your environment, note this step as
"needs operator smoke" in your report instead of skipping silently.

**Verify**: one widget iframe in the container after gate re-entry.

## Test plan

- `bun run test:unit` → all pass (no unit harness exists for this component's
  DOM lifecycle; the smoke in Step 2 is the behavioral check).
- Do not add a new test framework or jsdom setup for this — out of proportion.

## Done criteria

- [ ] `bun run check` exits 0
- [ ] `bun run test:unit` exits 0
- [ ] Every branch of the Turnstile effect returns a cleanup (read the diff)
- [ ] `ts.remove` is called with the rendered widget id on cleanup
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The effect no longer matches the excerpt (Turnstile handling may have been extracted or rewritten).
- `turnstile.remove` is unavailable in the loaded API (would indicate a pinned older script variant); report rather than polyfilling.
- Fixing this appears to require touching `subscribe-panel.ts`.

## Maintenance notes

- Deferred (deliberately): extracting one shared Turnstile lifecycle helper
  used by both this React island and `subscribe-panel.ts`. Worth doing the next
  time either integration changes behavior; not worth the churn now, days
  before merge.
- Reviewer should scrutinize: the cleanup must not remove a widget that was
  never created (guard on `widgetId !== null`), and must not clobber a
  `window.onManageTurnstileLoad` set by a newer effect run.
