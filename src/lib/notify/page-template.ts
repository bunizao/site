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
  rateLimitHeaders?: Headers;
}): Response {
  const safeLabel = escapeHtml(options.label);
  const safeTitle = escapeHtml(options.title);
  const safeMessage = escapeHtml(options.message);

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

      .container {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 480px;
        padding: 24px;
      }

      .card {
        border: 1px solid var(--border);
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
