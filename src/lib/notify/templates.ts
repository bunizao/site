function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimPreview(value: string, maxLength = 140): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

const MONO_FONT = "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, 'Courier New', monospace";

function emailShell(content: string): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #0a0a0a !important; }
      .email-card { background-color: #0a0a0a !important; border-color: #333 !important; }
      .email-text { color: #e5e5e5 !important; }
      .email-muted { color: #888 !important; }
      .email-btn { background-color: #fff !important; color: #000 !important; }
      .email-btn-text { color: #000 !important; }
      .email-link { color: #e5e5e5 !important; }
      .email-divider { border-color: #333 !important; }
      .email-label { color: #888 !important; }
      .email-grid-dot { opacity: 0.1 !important; }
    }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; background-color: #fff; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff;" class="email-body">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width: 560px; width: 100%; border: 1px solid #000; background-color: #fff;">
          ${content}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildSubscribeConfirmEmail(options: {
  siteUrl: string;
  confirmUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Confirm your mood subscription';
  const html = emailShell(`
          <!-- Header label -->
          <tr>
            <td style="padding: 28px 28px 0;">
              <span class="email-label" style="font-family: ${MONO_FONT}; font-size: 11px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: #666;">subscription</span>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td class="email-text" style="padding: 16px 28px 0; font-family: ${MONO_FONT}; font-size: 18px; font-weight: 600; color: #000; letter-spacing: -0.01em;">
              Confirm subscription
            </td>
          </tr>
          <!-- Body text -->
          <tr>
            <td class="email-muted" style="padding: 12px 28px 0; font-family: ${MONO_FONT}; font-size: 13px; line-height: 1.7; color: #666;">
              Click the button below to activate your mood update notifications.
            </td>
          </tr>
          <!-- CTA Button -->
          <tr>
            <td style="padding: 24px 28px 0;">
              <a href="${escapeHtml(options.confirmUrl)}" class="email-btn" style="display: inline-block; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 500; color: #fff; background-color: #000; text-decoration: none; padding: 10px 20px; border: 2px solid #000;">
                <span class="email-btn-text" style="color: #fff;">Confirm &rarr;</span>
              </a>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 24px 28px 0;">
              <hr class="email-divider" style="border: none; border-top: 1px dashed #ccc; margin: 0;" />
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 28px 28px;">
              <p class="email-muted" style="margin: 0 0 4px; font-family: ${MONO_FONT}; font-size: 11px; color: #999; line-height: 1.6;">If you did not request this, ignore this email.</p>
              <a href="${escapeHtml(options.siteUrl)}" class="email-link" style="font-family: ${MONO_FONT}; font-size: 11px; color: #000; text-decoration: none;">${escapeHtml(options.siteUrl)}</a>
            </td>
          </tr>`);

  const text = [
    'SUBSCRIPTION',
    '────────────',
    '',
    'Confirm your mood subscription',
    '',
    `Open this link: ${options.confirmUrl}`,
    '',
    'If you did not request this, ignore this email.',
    `Site: ${options.siteUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export function buildMoodNotificationEmail(options: {
  moodUrl: string;
  unsubscribeUrl: string;
  previewText: string;
  postId: string;
}): { subject: string; html: string; text: string } {
  const preview = trimPreview(options.previewText || '(No text preview)');
  const subject = `New mood #${options.postId}`;
  const html = emailShell(`
          <!-- Header label -->
          <tr>
            <td style="padding: 28px 28px 0;">
              <span class="email-label" style="font-family: ${MONO_FONT}; font-size: 11px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: #666;">mood &middot; #${escapeHtml(options.postId)}</span>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td class="email-text" style="padding: 16px 28px 0; font-family: ${MONO_FONT}; font-size: 18px; font-weight: 600; color: #000; letter-spacing: -0.01em;">
              New mood posted
            </td>
          </tr>
          <!-- Preview text -->
          <tr>
            <td style="padding: 12px 28px 0;">
              <div class="email-text" style="font-family: ${MONO_FONT}; font-size: 13px; line-height: 1.7; color: #374151; padding: 12px 16px; border-left: 2px solid #000;">
                ${escapeHtml(preview)}
              </div>
            </td>
          </tr>
          <!-- CTA Button -->
          <tr>
            <td style="padding: 24px 28px 0;">
              <a href="${escapeHtml(options.moodUrl)}" class="email-btn" style="display: inline-block; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 500; color: #fff; background-color: #000; text-decoration: none; padding: 10px 20px; border: 2px solid #000;">
                <span class="email-btn-text" style="color: #fff;">Read mood &rarr;</span>
              </a>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 24px 28px 0;">
              <hr class="email-divider" style="border: none; border-top: 1px dashed #ccc; margin: 0;" />
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 28px 28px;">
              <a href="${escapeHtml(options.unsubscribeUrl)}" class="email-muted" style="font-family: ${MONO_FONT}; font-size: 11px; color: #999; text-decoration: none;">Unsubscribe &rarr;</a>
            </td>
          </tr>`);

  const text = [
    `MOOD · #${options.postId}`,
    '────────────',
    '',
    preview,
    '',
    `Read: ${options.moodUrl}`,
    `Unsubscribe: ${options.unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}
