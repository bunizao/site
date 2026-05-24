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

export function renderNotifyPage(options: {
  label: string;
  title: string;
  message: string;
  status: PageStatus;
  enableCongratsFx?: boolean;
  actionsHtml?: string;
  rateLimitHeaders?: Headers;
}): Response {
  const safeLabel = escapeHtml(options.label);
  const safeTitle = escapeHtml(options.title);
  const safeMessage = escapeHtml(options.message);
  const enableCongratsFx = options.enableCongratsFx === true;
  const defaultAction = `<a href="/mood" class="button"><span>Mood feed</span><span class="button-arrow" aria-hidden="true">&rarr;</span></a>`;
  const actionsHtml = options.actionsHtml ?? defaultAction;

  const statusModifier = options.status === 'success'
    ? 'is-success'
    : options.status === 'error'
      ? 'is-error'
      : 'is-info';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle} — buxx.me</title>
    <link rel="icon" type="image/svg+xml" href="/logo/peek.svg?v=3" />
    <link rel="alternate icon" href="/favicon.ico" />
    <link rel="preload" as="font" href="/fonts/jetbrains-mono-variable.woff2" type="font/woff2" crossorigin />
    <style>
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
        --bg: #ffffff;
        --fg: #0a0a0a;
        --muted: #666;
        --hairline: rgba(10, 10, 10, 0.12);
        --hairline-strong: rgba(10, 10, 10, 0.22);
        --grid: rgba(10, 10, 10, 0.10);
        --card: #ffffff;
        --card-hover: rgba(10, 10, 10, 0.04);
        --peek-accent: #c44848;
        --status-info: #0a0a0a;
        --status-success: #0a0a0a;
        --status-error: #c44848;
        color-scheme: light;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0a0a0a;
          --fg: #fafafa;
          --muted: #888;
          --hairline: rgba(255, 255, 255, 0.12);
          --hairline-strong: rgba(255, 255, 255, 0.22);
          --grid: rgba(255, 255, 255, 0.08);
          --card: #0a0a0a;
          --card-hover: rgba(255, 255, 255, 0.06);
          --peek-accent: #f87171;
          --status-info: #fafafa;
          --status-success: #fafafa;
          --status-error: #f87171;
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
        font-family: 'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace;
        background: var(--bg);
        color: var(--fg);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        position: relative;
        overflow-x: hidden;
      }

      .grid-bg {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        background-image: radial-gradient(circle, var(--grid) 1px, transparent 1px);
        background-size: 24px 24px;
        mask-image: radial-gradient(ellipse at center, #000 38%, transparent 78%);
        -webkit-mask-image: radial-gradient(ellipse at center, #000 38%, transparent 78%);
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
        max-width: 520px;
        padding: 32px 20px;
      }

      .card {
        position: relative;
        background: var(--card);
        border: 1px solid var(--hairline-strong);
        border-radius: 18px;
        padding: 28px 28px 24px;
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.04) inset,
          0 24px 60px -32px rgba(10, 10, 10, 0.18);
      }

      @media (prefers-color-scheme: dark) {
        .card {
          box-shadow:
            0 1px 0 rgba(255, 255, 255, 0.05) inset,
            0 24px 80px -32px rgba(0, 0, 0, 0.6);
        }
      }

      /* Brand header */
      .brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 20px;
        margin-bottom: 22px;
        border-bottom: 1px solid var(--hairline);
      }

      .brand-mark {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: var(--fg);
        text-decoration: none;
      }

      .brand-mark svg {
        width: 20px;
        height: 15px;
        display: block;
      }

      .brand-mark-text {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .brand-label {
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--muted);
      }

      /* Status + title */
      .status-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 14px;
      }

      .status-dot {
        position: relative;
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 999px;
      }

      .is-info .status-dot { background: var(--status-info); }
      .is-success .status-dot { background: var(--status-success); }
      .is-error .status-dot { background: var(--status-error); }

      .status-dot::before {
        content: '';
        position: absolute;
        inset: -4px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.18;
        animation: pulse 2.4s ease-out infinite;
      }

      .is-info .status-dot::before { color: var(--status-info); }
      .is-success .status-dot::before { color: var(--status-success); }
      .is-error .status-dot::before { color: var(--status-error); }

      @keyframes pulse {
        0% { transform: scale(0.6); opacity: 0.32; }
        70% { transform: scale(1.6); opacity: 0; }
        100% { transform: scale(1.6); opacity: 0; }
      }

      h1 {
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.25;
      }

      .message {
        font-size: 14px;
        color: var(--muted);
        line-height: 1.7;
        margin-bottom: 22px;
        max-width: 44ch;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-bottom: 26px;
      }

      .button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.005em;
        line-height: 1;
        height: 40px;
        padding: 0 18px;
        background: var(--fg);
        color: var(--bg);
        border: 1px solid var(--fg);
        border-radius: 999px;
        cursor: pointer;
        text-decoration: none;
        transition: transform 0.15s ease, opacity 0.15s ease, background 0.15s ease;
      }

      .button:hover {
        opacity: 0.86;
      }

      .button:active {
        transform: translateY(1px);
      }

      .button-arrow {
        display: inline-block;
        transition: transform 0.15s ease;
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
        background: var(--card-hover);
        opacity: 1;
      }

      /* Dot divider */
      .dot-divider {
        display: flex;
        gap: 8px;
        margin-bottom: 18px;
        opacity: 0.45;
      }

      .dot-divider span {
        width: 3px;
        height: 3px;
        border-radius: 999px;
        background: var(--fg);
      }

      .footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 11px;
        color: var(--muted);
      }

      .footer-row a {
        color: var(--muted);
        text-decoration: none;
        transition: color 0.15s ease;
      }

      .footer-row a:hover {
        color: var(--fg);
      }

      .footer-meta {
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      /* Form (used by unsubscribe confirm) */
      form {
        margin: 0;
      }

      /* Animations */
      @keyframes rise {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .animate {
        animation: rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .delay-1 { animation-delay: 0.04s; }
      .delay-2 { animation-delay: 0.10s; }
      .delay-3 { animation-delay: 0.16s; }
      .delay-4 { animation-delay: 0.22s; }
      .delay-5 { animation-delay: 0.28s; }
      .delay-6 { animation-delay: 0.34s; }

      @media (prefers-reduced-motion: reduce) {
        .animate { animation: none; }
        .status-dot::before { animation: none; }
      }

      @media (max-width: 480px) {
        .container { padding: 20px 14px; }
        .card { padding: 22px 20px 20px; border-radius: 16px; }
        h1 { font-size: 19px; }
        .message { font-size: 13px; }
      }
    </style>
  </head>
  <body>
    <div class="grid-bg" aria-hidden="true"></div>
    ${enableCongratsFx ? '<div class="congrats-layer" aria-hidden="true"><canvas class="congrats-canvas" data-notify-congrats-fx></canvas></div>' : ''}
    <div class="container">
      <div class="card ${statusModifier}">
        <div class="brand animate">
          <a class="brand-mark" href="/" aria-label="bunizao home">
            ${PEEK_LOGO_SVG}
            <span class="brand-mark-text">bunizao</span>
          </a>
          <span class="brand-label">${safeLabel}</span>
        </div>
        <div class="status-row animate delay-1">
          <span class="status-dot" aria-hidden="true"></span>
          <h1>${safeTitle}</h1>
        </div>
        <p class="message animate delay-2">${safeMessage}</p>
        <div class="actions animate delay-3">${actionsHtml}</div>
        <div class="dot-divider animate delay-4" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="footer-row animate delay-5">
          <span class="footer-meta">buxx.me</span>
          <a href="/mood">mood feed &rarr;</a>
        </div>
      </div>
    </div>
    ${enableCongratsFx ? `<script>
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
            size: random(2.6, 6.4),
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
            size: random(1, 2.6),
            drag: random(0.96, 0.985),
            gravity: random(0.024, 0.05),
            color: pickColor(),
          };
        }

        function makeRing(x, y) {
          return {
            x, y,
            radius: 0,
            maxRadius: random(160, 240),
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
            ctx.globalAlpha = (1 - t) * 0.5;
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
    </script>` : ''}
  </body>
</html>`;

  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
  if (options.rateLimitHeaders) {
    options.rateLimitHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return new Response(html, { headers });
}
