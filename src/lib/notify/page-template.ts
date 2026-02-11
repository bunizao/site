function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type PageStatus = 'success' | 'error' | 'info';

export function renderNotifyPage(options: {
  label: string;
  title: string;
  message: string;
  status: PageStatus;
  enableCongratsFx?: boolean;
  rateLimitHeaders?: Headers;
}): Response {
  const safeLabel = escapeHtml(options.label);
  const safeTitle = escapeHtml(options.title);
  const safeMessage = escapeHtml(options.message);
  const enableCongratsFx = options.enableCongratsFx === true;

  const statusIcon = options.status === 'success'
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`
    : options.status === 'error'
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle} — buxx.me</title>
    <link rel="icon" href="/favicon.ico" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #fff;
        --fg: #000;
        --muted: #666;
        --border: #000;
        --grid: rgba(0,0,0,0.12);
        --card-bg: #fff;
        --divider: #ccc;
        --success: #000;
        --error: #dc2626;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0a0a0a;
          --fg: #fff;
          --muted: #888;
          --border: #fff;
          --grid: rgba(255,255,255,0.1);
          --card-bg: #0a0a0a;
          --divider: #333;
          --success: #fff;
          --error: #f87171;
        }
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
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
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background-image: radial-gradient(circle, var(--grid) 1px, transparent 1px);
        background-size: 24px 24px;
        z-index: 0;
      }

      .congrats-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        overflow: hidden;
      }

      .congrats-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }

      .container {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 480px;
        padding: 24px;
      }

      .card {
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 32px;
      }

      .label {
        display: inline-block;
        font-size: 11px;
        font-weight: 300;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 20px;
      }

      .status-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .status-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: ${options.status === 'error' ? 'var(--error)' : 'var(--fg)'};
      }

      h1 {
        font-size: 20px;
        font-weight: 600;
        letter-spacing: -0.02em;
      }

      .message {
        font-size: 13px;
        color: var(--muted);
        line-height: 1.7;
        margin-bottom: 24px;
      }

      .divider {
        border: none;
        border-top: 1px dashed var(--divider);
        margin: 0 0 20px;
      }

      .link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        color: var(--fg);
        text-decoration: none;
        transition: opacity 0.15s ease;
      }

      .link:hover {
        opacity: 0.6;
      }

      .link::after {
        content: '\\2192';
        transition: transform 0.15s ease;
      }

      .link:hover::after {
        transform: translateX(4px);
      }

      .footer {
        text-align: center;
        margin-top: 24px;
      }

      .footer a {
        font-size: 11px;
        color: var(--muted);
        text-decoration: none;
        letter-spacing: 0.02em;
      }

      .footer a:hover {
        color: var(--fg);
      }

      @keyframes fade-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .animate {
        animation: fade-in 0.4s ease-out forwards;
      }

      .delay-1 { animation-delay: 0.05s; opacity: 0; }
      .delay-2 { animation-delay: 0.1s; opacity: 0; }
      .delay-3 { animation-delay: 0.15s; opacity: 0; }
      .delay-4 { animation-delay: 0.2s; opacity: 0; }
    </style>
  </head>
  <body>
    ${enableCongratsFx ? '<div class="congrats-layer" aria-hidden="true"><canvas class="congrats-canvas" data-notify-congrats-fx></canvas></div>' : ''}
    <div class="container">
      <div class="card">
        <span class="label animate">${safeLabel}</span>
        <div class="status-row animate delay-1">
          <span class="status-icon">${statusIcon}</span>
          <h1>${safeTitle}</h1>
        </div>
        <p class="message animate delay-2">${safeMessage}</p>
        <hr class="divider animate delay-3" />
        <div class="animate delay-4">
          <a href="/mood" class="link">Mood feed</a>
        </div>
      </div>
      <div class="footer animate delay-4">
        <a href="/">buxx.me</a>
      </div>
    </div>
    ${enableCongratsFx ? `<script>
      (() => {
        const canvas = document.querySelector('[data-notify-congrats-fx]');
        if (!(canvas instanceof HTMLCanvasElement)) {
          return;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (prefersReducedMotion.matches) {
          return;
        }

        const context = canvas.getContext('2d', { alpha: true });
        if (!context) {
          return;
        }

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        const colorPalette = prefersDark.matches
          ? ['#f2f2f2', '#d4d4d8', '#a1a1aa', '#7dd3fc', '#60a5fa']
          : ['#111827', '#374151', '#6b7280', '#0284c7', '#0ea5e9'];
        const confetti = [];
        const sparks = [];
        let width = 0;
        let height = 0;
        let dpr = 1;
        let started = false;
        let lastBurstAt = 0;
        let lastPointerBurstAt = 0;
        let rafId = 0;

        function random(min, max) {
          return Math.random() * (max - min) + min;
        }

        function randomColor() {
          return colorPalette[(Math.random() * colorPalette.length) | 0];
        }

        function createConfettiPiece(ySeed) {
          return {
            x: random(0, width),
            y: ySeed ?? random(-height, -12),
            vx: random(-0.35, 0.35),
            vy: random(0.8, 1.95),
            spin: random(-0.08, 0.08),
            rotation: random(0, Math.PI * 2),
            size: random(2.8, 7.2),
            phase: random(0, Math.PI * 2),
            shape: Math.random() > 0.45 ? 'rect' : 'dot',
            color: randomColor(),
          };
        }

        function createSpark(x, y, power) {
          const angle = random(0, Math.PI * 2);
          const speed = random(1.4, 5.8) * power;
          return {
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - random(0.55, 1.7),
            life: random(34, 70),
            maxLife: random(34, 70),
            size: random(1, 2.8),
            drag: random(0.962, 0.987),
            gravity: random(0.026, 0.052),
            color: randomColor(),
          };
        }

        function emitBurst(x, y, power) {
          const amount = Math.floor(24 + power * 42);
          for (let index = 0; index < amount; index += 1) {
            sparks.push(createSpark(x, y, power));
          }
        }

        function drawBackdrop() {
          const gradient = context.createRadialGradient(
            width * 0.5,
            height * 0.36,
            10,
            width * 0.5,
            height * 0.36,
            Math.max(width, height) * 0.72
          );
          if (prefersDark.matches) {
            gradient.addColorStop(0, 'rgba(125, 211, 252, 0.12)');
            gradient.addColorStop(0.44, 'rgba(96, 165, 250, 0.08)');
            gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
          } else {
            gradient.addColorStop(0, 'rgba(14, 116, 144, 0.11)');
            gradient.addColorStop(0.44, 'rgba(15, 23, 42, 0.06)');
            gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
          }
          context.fillStyle = gradient;
          context.fillRect(0, 0, width, height);
        }

        function drawConfetti(time) {
          for (let index = 0; index < confetti.length; index += 1) {
            const piece = confetti[index];
            piece.x += piece.vx + Math.sin(time * 0.001 + piece.phase) * 0.34;
            piece.y += piece.vy;
            piece.rotation += piece.spin;

            if (piece.y > height + 14) {
              confetti[index] = createConfettiPiece(random(-60, -12));
              continue;
            }

            context.save();
            context.translate(piece.x, piece.y);
            context.rotate(piece.rotation);
            context.fillStyle = piece.color;
            if (piece.shape === 'rect') {
              context.fillRect(-piece.size * 0.5, -piece.size * 0.5, piece.size, piece.size * 0.54);
            } else {
              context.beginPath();
              context.arc(0, 0, piece.size * 0.34, 0, Math.PI * 2);
              context.fill();
            }
            context.restore();
          }
        }

        function drawSparks() {
          for (let index = sparks.length - 1; index >= 0; index -= 1) {
            const spark = sparks[index];
            spark.life -= 1;
            spark.x += spark.vx;
            spark.y += spark.vy;
            spark.vx *= spark.drag;
            spark.vy = spark.vy * spark.drag + spark.gravity;

            if (spark.life <= 0) {
              sparks.splice(index, 1);
              continue;
            }

            const alpha = Math.max(0, spark.life / spark.maxLife);
            context.globalAlpha = alpha * 0.66;
            context.beginPath();
            context.fillStyle = spark.color;
            context.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
            context.fill();
          }
          context.globalAlpha = 1;
        }

        function resizeCanvas() {
          dpr = Math.min(window.devicePixelRatio || 1, 1.5);
          width = window.innerWidth;
          height = window.innerHeight;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.scale(dpr, dpr);
        }

        function renderFrame(timestamp) {
          if (!started) {
            started = true;
            const card = document.querySelector('.card');
            if (card instanceof HTMLElement) {
              const rect = card.getBoundingClientRect();
              emitBurst(rect.left + rect.width * 0.22, rect.top + rect.height * 0.2, 0.95);
              emitBurst(rect.left + rect.width * 0.78, rect.top + rect.height * 0.2, 0.95);
            } else {
              emitBurst(width * 0.5, height * 0.42, 0.9);
            }
          }

          context.clearRect(0, 0, width, height);
          drawBackdrop();
          drawConfetti(timestamp);
          drawSparks();

          if (timestamp - lastBurstAt > 2200) {
            const bx = random(width * 0.24, width * 0.76);
            const by = random(height * 0.14, height * 0.44);
            emitBurst(bx, by, random(0.42, 0.78));
            lastBurstAt = timestamp;
          }

          rafId = window.requestAnimationFrame(renderFrame);
        }

        function onPointerMove(event) {
          const now = performance.now();
          if (now - lastPointerBurstAt > 280) {
            emitBurst(event.clientX, event.clientY, 0.22);
            lastPointerBurstAt = now;
          }
        }

        resizeCanvas();
        for (let index = 0; index < 84; index += 1) {
          confetti.push(createConfettiPiece());
        }

        window.addEventListener('resize', resizeCanvas, { passive: true });
        window.addEventListener('pointermove', onPointerMove, { passive: true });

        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            window.cancelAnimationFrame(rafId);
            return;
          }
          rafId = window.requestAnimationFrame(renderFrame);
        });

        rafId = window.requestAnimationFrame(renderFrame);
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
