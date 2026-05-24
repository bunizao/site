function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type PageStatus = 'success' | 'error' | 'info';

const PEEK_LOGO_SVG = `<svg viewBox="0 0 12 9" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
  <g fill="currentColor">
    <rect x="2" y="1" width="2" height="1"/><rect x="8" y="1" width="2" height="1"/>
    <rect x="1" y="2" width="3" height="1"/><rect x="8" y="2" width="3" height="1"/>
    <rect x="1" y="3" width="10" height="1"/>
    <rect x="1" y="4" width="10" height="1"/>
    <rect x="1" y="5" width="2" height="1"/><rect x="4" y="5" width="4" height="1"/><rect x="9" y="5" width="2" height="1"/>
    <rect x="1" y="6" width="2" height="1"/><rect x="4" y="6" width="2" height="1"/><rect x="7" y="6" width="1" height="1"/><rect x="9" y="6" width="2" height="1"/>
    <rect x="6" y="6" width="1" height="1" fill="var(--peek-accent)"/>
    <rect x="1" y="7" width="10" height="1"/>
  </g>
</svg>`;

export function buildNotifyPageHtml(options: {
  label: string;
  title: string;
  message: string;
  status: PageStatus;
  enableCongratsFx?: boolean;
  actionsHtml?: string;
}): string {
  // Label is intentionally unused in v2 layout — kept in API for backward-compat.
  void options.label;
  const safeTitle = escapeHtml(options.title);
  const safeMessage = escapeHtml(options.message);
  const enableCongratsFx = options.enableCongratsFx === true;
  const defaultAction = `<a href="/mood" class="button"><span>Open mood feed</span><span class="button-arrow" aria-hidden="true">&rarr;</span></a>`;
  const actionsHtml = options.actionsHtml ?? defaultAction;

  const statusModifier = options.status === 'success'
    ? 'is-success'
    : options.status === 'error'
      ? 'is-error'
      : 'is-info';

  // Hero treatment is reserved for the confirm-success moment: editorial typography + receipt strip.
  // Confetti carries the celebration; the layout stays confident and quiet.
  const heroTreatment = enableCongratsFx;

  const titleHtml = safeTitle;

  const receiptHtml = heroTreatment
    ? `<div class="receipt animate delay-3" aria-hidden="true">
            <div class="receipt-row">
              <span class="receipt-key">Status</span>
              <span class="receipt-value">
                <span class="receipt-pulse"></span>
                Active
              </span>
            </div>
            <div class="receipt-row">
              <span class="receipt-key">Confirmed</span>
              <span class="receipt-value receipt-mono" data-notify-confirmed-at>just now</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-key">Reference</span>
              <span class="receipt-value receipt-mono">${generateStampId()}</span>
            </div>
          </div>`
    : '';

  const cardModifier = `${statusModifier}${heroTreatment ? ' is-hero' : ''}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle} — buxx.me</title>
    <link rel="icon" type="image/svg+xml" href="/logo/peek.svg?v=3" />
    <link rel="alternate icon" href="/favicon.ico" />
    <link rel="preload" as="font" href="/fonts/geist-sans-variable.woff2" type="font/woff2" crossorigin />
    <link rel="preload" as="font" href="/fonts/jetbrains-mono-variable.woff2" type="font/woff2" crossorigin />
    <style>
      @font-face {
        font-family: 'Geist';
        src:
          url('/fonts/geist-sans-variable.woff2') format('woff2-variations'),
          url('/fonts/geist-sans-variable.woff2') format('woff2');
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'JetBrains Mono';
        src:
          url('/fonts/jetbrains-mono-variable.woff2') format('woff2-variations'),
          url('/fonts/jetbrains-mono-variable.woff2') format('woff2');
        font-weight: 100 800;
        font-style: normal;
        font-display: swap;
      }

      :root {
        --bg: #f7f7f5;
        --card: #ffffff;
        --fg: #0a0a0a;
        --muted: #6b6b6b;
        --soft: #94949b;
        --hairline: rgba(10, 10, 10, 0.08);
        --hairline-strong: rgba(10, 10, 10, 0.14);
        --grid: rgba(10, 10, 10, 0.07);
        --peek-accent: #c44848;
        --accent-error: #c44848;
        --accent-success: #16a34a;
        --halo-a: rgba(196, 72, 72, 0.32);
        --halo-b: rgba(245, 158, 11, 0.22);
        --halo-c: rgba(34, 197, 94, 0.20);
        --shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 18px 60px -28px rgba(20, 20, 30, 0.16);
        color-scheme: light;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0a0a0a;
          --card: #131313;
          --fg: #fafafa;
          --muted: #9b9b9b;
          --soft: #6c6c70;
          --hairline: rgba(255, 255, 255, 0.07);
          --hairline-strong: rgba(255, 255, 255, 0.13);
          --grid: rgba(255, 255, 255, 0.06);
          --peek-accent: #f87171;
          --accent-error: #f87171;
          --accent-success: #22c55e;
          --halo-a: rgba(248, 113, 113, 0.28);
          --halo-b: rgba(251, 191, 36, 0.20);
          --halo-c: rgba(34, 197, 94, 0.20);
          --shadow: 0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 24px 60px -28px rgba(0, 0, 0, 0.6);
          color-scheme: dark;
        }
      }

      *, *::before, *::after {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }

      html, body {
        height: 100%;
      }

      body {
        font-family: 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        background: var(--bg);
        color: var(--fg);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1.55;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
        position: relative;
        overflow-x: hidden;
      }

      .grid-bg {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        background-image: radial-gradient(circle, var(--grid) 1px, transparent 1px);
        background-size: 28px 28px;
        mask-image: radial-gradient(ellipse at center, #000 32%, transparent 75%);
        -webkit-mask-image: radial-gradient(ellipse at center, #000 32%, transparent 75%);
      }

      .halo {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        background:
          radial-gradient(48vmin 48vmin at 18% 22%, var(--halo-a), transparent 62%),
          radial-gradient(58vmin 58vmin at 82% 30%, var(--halo-b), transparent 68%),
          radial-gradient(60vmin 60vmin at 50% 110%, var(--halo-c), transparent 64%);
        opacity: 0;
        transition: opacity 0.8s ease-out;
        animation: halo-drift 16s ease-in-out infinite alternate;
      }

      .is-success ~ .halo,
      body:has(.is-success) .halo {
        opacity: 0.7;
      }

      @keyframes halo-drift {
        0% { transform: translate3d(0, 0, 0) scale(1); }
        100% { transform: translate3d(-2%, 1.4%, 0) scale(1.05); }
      }

      .congrats-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 1;
        overflow: hidden;
      }

      .congrats-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }

      .container {
        position: relative;
        z-index: 2;
        width: 100%;
        max-width: 480px;
        padding: 32px 20px;
      }

      .card {
        position: relative;
        background: var(--card);
        border: 1px solid var(--hairline);
        border-radius: 20px;
        padding: 32px 36px 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      /* Brand row */
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 36px;
        color: var(--fg);
        text-decoration: none;
      }

      .brand svg {
        width: 24px;
        height: 18px;
        display: block;
      }

      .brand-mark {
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0;
      }

      /* Eyebrow + title */
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        font-size: 13px;
        font-weight: 500;
        color: var(--fg);
        letter-spacing: -0.005em;
      }

      .eyebrow-dot {
        position: relative;
        width: 7px;
        height: 7px;
        border-radius: 999px;
      }

      .is-info .eyebrow-dot { background: var(--fg); }
      .is-success .eyebrow-dot { background: var(--accent-success); }
      .is-error .eyebrow-dot { background: var(--accent-error); }

      .eyebrow-dot::before {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.18;
        animation: pulse 2.6s ease-out infinite;
      }

      .is-info .eyebrow-dot::before { color: var(--fg); }
      .is-success .eyebrow-dot::before { color: var(--accent-success); }
      .is-error .eyebrow-dot::before { color: var(--accent-error); }

      @keyframes pulse {
        0% { transform: scale(0.6); opacity: 0.32; }
        70% { transform: scale(1.7); opacity: 0; }
        100% { transform: scale(1.7); opacity: 0; }
      }

      h1 {
        font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
        font-size: 30px;
        font-weight: 600;
        letter-spacing: -0.025em;
        line-height: 1.15;
        color: var(--fg);
        margin-bottom: 14px;
      }

      .is-hero h1 {
        font-size: 44px;
        line-height: 1.05;
        letter-spacing: -0.035em;
        margin-bottom: 16px;
      }

      @media (max-width: 480px) {
        .is-hero h1 { font-size: 32px; }
      }

      /* Receipt strip — quiet authenticity for the confirm-success moment */
      .receipt {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 6px 18px;
        margin: 22px 0 28px;
        padding: 14px 16px;
        border: 1px solid var(--hairline);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(10,10,10,0.02), transparent);
      }

      @media (prefers-color-scheme: dark) {
        .receipt {
          background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent);
        }
      }

      .receipt-row {
        display: contents;
      }

      .receipt-key {
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--soft);
        align-self: center;
      }

      .receipt-value {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--fg);
        line-height: 1.5;
      }

      .receipt-mono {
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }

      .receipt-pulse {
        position: relative;
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--accent-success);
      }

      .receipt-pulse::after {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 999px;
        background: var(--accent-success);
        opacity: 0.22;
        animation: pulse 2.4s ease-out infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .receipt-pulse::after { animation: none; }
      }

      .message {
        font-size: 15px;
        color: var(--muted);
        line-height: 1.65;
        margin-bottom: 28px;
        max-width: 36ch;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-bottom: 28px;
      }

      .button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: -0.005em;
        line-height: 1;
        height: 42px;
        padding: 0 18px;
        background: var(--fg);
        color: var(--card);
        border: 1px solid var(--fg);
        border-radius: 10px;
        cursor: pointer;
        text-decoration: none;
        transition: transform 0.15s ease, opacity 0.15s ease, background 0.15s ease;
      }

      .button:hover {
        opacity: 0.88;
      }

      .button:active {
        transform: translateY(1px);
      }

      .button-arrow {
        display: inline-block;
        transition: transform 0.18s ease;
      }

      .button:hover .button-arrow {
        transform: translateX(3px);
      }

      .button--ghost {
        background: transparent;
        color: var(--fg);
        border-color: var(--hairline-strong);
      }

      .button--ghost:hover {
        background: rgba(10, 10, 10, 0.04);
        opacity: 1;
      }

      @media (prefers-color-scheme: dark) {
        .button--ghost:hover {
          background: rgba(255, 255, 255, 0.06);
        }
      }

      /* Fallback link block */
      .fallback {
        margin-top: -8px;
        margin-bottom: 28px;
      }

      .fallback-label {
        display: block;
        font-size: 12px;
        color: var(--soft);
        margin-bottom: 6px;
      }

      .fallback-url {
        display: inline-block;
        max-width: 100%;
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: var(--fg);
        text-decoration: none;
        word-break: break-all;
        background: rgba(10, 10, 10, 0.04);
        border: 1px solid var(--hairline);
        border-radius: 8px;
        padding: 8px 11px;
        line-height: 1.5;
        transition: background 0.15s ease, border-color 0.15s ease;
      }

      @media (prefers-color-scheme: dark) {
        .fallback-url {
          background: rgba(255, 255, 255, 0.04);
        }
      }

      .fallback-url:hover {
        background: rgba(10, 10, 10, 0.06);
        border-color: var(--hairline-strong);
      }

      @media (prefers-color-scheme: dark) {
        .fallback-url:hover {
          background: rgba(255, 255, 255, 0.07);
        }
      }

      /* Footer */
      .footer-line {
        height: 1px;
        background: var(--hairline);
        margin: 0 0 16px;
      }

      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        color: var(--soft);
      }

      .footer a {
        color: var(--soft);
        text-decoration: none;
        transition: color 0.15s ease;
      }

      .footer a:hover {
        color: var(--fg);
      }

      .footer-meta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .footer-meta-sep {
        opacity: 0.6;
      }

      /* Animations */
      @keyframes rise {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .animate {
        animation: rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .delay-1 { animation-delay: 0.05s; }
      .delay-2 { animation-delay: 0.10s; }
      .delay-3 { animation-delay: 0.16s; }
      .delay-4 { animation-delay: 0.22s; }
      .delay-5 { animation-delay: 0.28s; }

      @media (prefers-reduced-motion: reduce) {
        .animate { animation: none; }
        .eyebrow-dot::before { animation: none; }
      }

      @media (max-width: 480px) {
        .container { padding: 20px 14px; }
        .card { padding: 26px 22px 22px; border-radius: 18px; }
        h1 { font-size: 25px; }
        .message { font-size: 14px; }
      }

      /* Inline form (used by unsubscribe confirm) */
      form {
        display: inline-flex;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div class="halo" aria-hidden="true"></div>
    <div class="grid-bg" aria-hidden="true"></div>
    ${enableCongratsFx ? '<div class="congrats-layer" aria-hidden="true"><canvas class="congrats-canvas" data-notify-congrats-fx></canvas></div>' : ''}
    <div class="container">
      <div class="card ${cardModifier}">
        <a class="brand animate" href="/" aria-label="bunizao home">
          ${PEEK_LOGO_SVG}
          <span class="brand-mark">bunizao</span>
        </a>
        <div class="eyebrow animate delay-1">
          <span class="eyebrow-dot" aria-hidden="true"></span>
          <span>${escapeEyebrow(options.status, heroTreatment)}</span>
        </div>
        <h1 class="animate delay-2">${titleHtml}</h1>
        <p class="message animate delay-3">${safeMessage}</p>
        ${receiptHtml}
        <div class="actions animate delay-4">${actionsHtml}</div>
        <div class="footer-line animate delay-5" aria-hidden="true"></div>
        <div class="footer animate delay-5">
          <span class="footer-meta">
            <span>&copy; 2023&ndash;2026 bunizao</span>
            <span class="footer-meta-sep">&middot;</span>
            <a href="/privacy">Privacy</a>
          </span>
          <a href="/mood">mood feed &rarr;</a>
        </div>
      </div>
    </div>
    ${enableCongratsFx ? buildConfettiScript() : ''}
    ${heroTreatment ? buildReceiptTimestampScript() : ''}
  </body>
</html>`;
}

export function renderNotifyPage(options: {
  label: string;
  title: string;
  message: string;
  status: PageStatus;
  enableCongratsFx?: boolean;
  actionsHtml?: string;
  rateLimitHeaders?: Headers;
}): Response {
  const html = buildNotifyPageHtml(options);
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
  if (options.rateLimitHeaders) {
    options.rateLimitHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return new Response(html, { headers });
}

function escapeEyebrow(status: PageStatus, hero: boolean): string {
  if (status === 'success') return hero ? 'Subscription confirmed' : 'Quiet hours';
  if (status === 'error') return 'Something went off';
  return 'Confirm to continue';
}

function generateStampId(): string {
  // Short, base36-like reference identifier. Pure ornamental — adds tactile authenticity to the success page.
  const seed = Date.now().toString(36).toUpperCase().slice(-4);
  const tail = Math.floor(Math.random() * 0xfff).toString(16).toUpperCase().padStart(3, '0');
  return `${seed}-${tail}`;
}

function buildReceiptTimestampScript(): string {
  return `<script>
      (() => {
        const target = document.querySelector('[data-notify-confirmed-at]');
        if (!target) return;
        try {
          const now = new Date();
          const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
          const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(now);
          target.textContent = date + ' · ' + time;
        } catch {}
      })();
    </script>`;
}

function buildConfettiScript(): string {
  return `<script>
      (() => {
        const canvas = document.querySelector('[data-notify-congrats-fx]');
        if (!(canvas instanceof HTMLCanvasElement)) return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (reduceMotion.matches) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
        const palette = () => darkScheme.matches
          ? ['#fafafa', '#d4d4d8', '#9ca3af', '#f87171', '#fbbf24']
          : ['#0a0a0a', '#404040', '#737373', '#c44848', '#f59e0b'];

        const confetti = [];
        const sparks = [];
        const rings = [];
        let width = 0;
        let height = 0;
        let dpr = 1;
        let started = false;
        let lastBurstAt = 0;
        let lastPointerBurstAt = 0;
        let rafId = 0;

        const random = (min, max) => Math.random() * (max - min) + min;
        const pickColor = () => {
          const p = palette();
          return p[(Math.random() * p.length) | 0];
        };

        function resize() {
          dpr = Math.min(window.devicePixelRatio || 1, 1.5);
          width = window.innerWidth;
          height = window.innerHeight;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
        }

        function makeConfetti(ySeed) {
          return {
            x: random(0, width),
            y: ySeed ?? random(-height, -16),
            vx: random(-0.4, 0.4),
            vy: random(0.9, 2.1),
            spin: random(-0.09, 0.09),
            rotation: random(0, Math.PI * 2),
            size: random(2.4, 6.0),
            phase: random(0, Math.PI * 2),
            shape: Math.random() > 0.5 ? 'rect' : 'dot',
            color: pickColor(),
          };
        }

        function makeSpark(x, y, power) {
          const angle = random(0, Math.PI * 2);
          const speed = random(1.6, 6.4) * power;
          return {
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - random(0.6, 1.8),
            life: random(38, 78),
            maxLife: random(38, 78),
            size: random(1, 2.4),
            drag: random(0.96, 0.985),
            gravity: random(0.024, 0.05),
            color: pickColor(),
          };
        }

        function makeRing(x, y) {
          return {
            x, y,
            radius: 0,
            maxRadius: random(180, 260),
            life: 0,
            maxLife: 60,
            color: darkScheme.matches ? 'rgba(250,250,250,1)' : 'rgba(10,10,10,1)',
          };
        }

        function emitBurst(x, y, power) {
          const count = Math.floor(28 + power * 56);
          for (let i = 0; i < count; i += 1) sparks.push(makeSpark(x, y, power));
        }

        function drawConfetti(time) {
          for (let i = 0; i < confetti.length; i += 1) {
            const p = confetti[i];
            p.x += p.vx + Math.sin(time * 0.001 + p.phase) * 0.36;
            p.y += p.vy;
            p.rotation += p.spin;
            if (p.y > height + 16) {
              confetti[i] = makeConfetti(random(-80, -16));
              continue;
            }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;
            if (p.shape === 'rect') {
              ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size * 0.52);
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, p.size * 0.36, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }

        function drawSparks() {
          for (let i = sparks.length - 1; i >= 0; i -= 1) {
            const s = sparks[i];
            s.life -= 1;
            s.x += s.vx;
            s.y += s.vy;
            s.vx *= s.drag;
            s.vy = s.vy * s.drag + s.gravity;
            if (s.life <= 0) { sparks.splice(i, 1); continue; }
            const alpha = Math.max(0, s.life / s.maxLife);
            ctx.globalAlpha = alpha * 0.72;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        function drawRings() {
          for (let i = rings.length - 1; i >= 0; i -= 1) {
            const r = rings[i];
            r.life += 1;
            const t = r.life / r.maxLife;
            if (t >= 1) { rings.splice(i, 1); continue; }
            r.radius = r.maxRadius * (1 - Math.pow(1 - t, 3));
            ctx.save();
            ctx.globalAlpha = (1 - t) * 0.45;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }

        function frame(timestamp) {
          if (!started) {
            started = true;
            const card = document.querySelector('.card');
            if (card instanceof HTMLElement) {
              const rect = card.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              rings.push(makeRing(cx, cy));
              emitBurst(rect.left + rect.width * 0.18, rect.top + rect.height * 0.22, 1.05);
              emitBurst(rect.left + rect.width * 0.82, rect.top + rect.height * 0.22, 1.05);
              emitBurst(cx, rect.top + rect.height * 0.6, 0.7);
            } else {
              emitBurst(width * 0.5, height * 0.4, 1.0);
            }
          }

          ctx.clearRect(0, 0, width, height);
          drawRings();
          drawConfetti(timestamp);
          drawSparks();

          if (timestamp - lastBurstAt > 2400) {
            const bx = random(width * 0.2, width * 0.8);
            const by = random(height * 0.12, height * 0.42);
            emitBurst(bx, by, random(0.4, 0.78));
            lastBurstAt = timestamp;
          }

          rafId = window.requestAnimationFrame(frame);
        }

        function onPointerMove(event) {
          const now = performance.now();
          if (now - lastPointerBurstAt > 260) {
            emitBurst(event.clientX, event.clientY, 0.22);
            lastPointerBurstAt = now;
          }
        }

        resize();
        for (let i = 0; i < 90; i += 1) confetti.push(makeConfetti());

        window.addEventListener('resize', resize, { passive: true });
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            window.cancelAnimationFrame(rafId);
            return;
          }
          rafId = window.requestAnimationFrame(frame);
        });

        rafId = window.requestAnimationFrame(frame);
      })();
    </script>`;
}
