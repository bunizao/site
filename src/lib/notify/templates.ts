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
      .email-embed-card { background-color: #0f0f0f !important; border-color: #2b2b2b !important; }
      .email-embed-header { border-color: #2b2b2b !important; }
      .email-embed-footer { border-color: #2b2b2b !important; }
      .email-avatar { background-color: #242424 !important; color: #e5e5e5 !important; }
      .email-channel-name { color: #e5e5e5 !important; }
      .email-channel-meta { color: #8a8a8a !important; }
      .email-preview { color: #e5e5e5 !important; }
      .email-view-link { color: #e5e5e5 !important; }
      .email-meta { color: #8a8a8a !important; }
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
  channelTitle?: string;
  channelAvatarUrl?: string;
}): { subject: string; html: string; text: string } {
  const preview = trimPreview(options.previewText || '(No text preview)');
  const channelTitle = (options.channelTitle || 'Mood Feed').trim() || 'Mood Feed';
  const channelInitial = channelTitle.charAt(0).toUpperCase() || 'M';
  const channelAvatarUrl = (options.channelAvatarUrl || '').trim();
  const channelAvatarHtml = channelAvatarUrl
    ? `<img src="${escapeHtml(channelAvatarUrl)}" alt="${escapeHtml(channelTitle)} avatar" width="32" height="32" style="display: block; width: 32px; height: 32px; border-radius: 999px;" />`
    : escapeHtml(channelInitial);
  const subject = `New mood #${options.postId}`;
  const html = emailShell(`
          <tr>
            <td style="padding: 24px 24px 0;">
              <span class="email-label" style="font-family: ${MONO_FONT}; font-size: 11px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: #666;">mood update</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-embed-card" style="border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; background-color: #fff;">
                <tr>
                  <td class="email-embed-header" style="padding: 12px 14px; border-bottom: 1px solid #e5e5e5;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" valign="middle">
                          <div class="email-avatar" style="width: 32px; height: 32px; border-radius: 999px; background: #f3f4f6; color: #111; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 600; line-height: 32px; text-align: center; overflow: hidden;">${channelAvatarHtml}</div>
                        </td>
                        <td valign="middle" style="padding-left: 10px;">
                          <a href="${escapeHtml(options.moodUrl)}" class="email-channel-name" style="display: inline-block; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 600; color: #111; text-decoration: none;">${escapeHtml(channelTitle)}</a>
                          <div class="email-channel-meta" style="margin-top: 2px; font-family: ${MONO_FONT}; font-size: 11px; color: #666;">New mood posted &middot; #${escapeHtml(options.postId)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px;">
                    <div class="email-preview" style="font-family: ${MONO_FONT}; font-size: 14px; line-height: 1.65; color: #111;">
                      ${escapeHtml(preview)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 14px 14px;">
                    <a href="${escapeHtml(options.moodUrl)}" class="email-view-link" style="font-family: ${MONO_FONT}; font-size: 12px; color: #000; text-decoration: none;">View full mood &rarr;</a>
                  </td>
                </tr>
                <tr>
                  <td class="email-embed-footer" style="padding: 10px 14px; border-top: 1px solid #e5e5e5;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="right">
                          <a href="${escapeHtml(options.unsubscribeUrl)}" class="email-muted" style="font-family: ${MONO_FONT}; font-size: 11px; color: #666; text-decoration: none;">Unsubscribe &rarr;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
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

interface MoodDigestPost {
  postId: string;
  moodUrl: string;
  previewText: string;
  timeLabel: string;
  dateLabel: string;
}

function buildDigestListHtml(posts: MoodDigestPost[]): string {
  let currentDate = '';
  const rows: string[] = [];

  for (const post of posts) {
    if (post.dateLabel && post.dateLabel !== currentDate) {
      currentDate = post.dateLabel;
      rows.push(`
                <tr>
                  <td style="padding: 14px 14px 6px; font-family: ${MONO_FONT}; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #666;">
                    ${escapeHtml(post.dateLabel)}
                  </td>
                </tr>`);
    }

    rows.push(`
                <tr>
                  <td style="padding: 0 14px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #efefef;">
                      <tr>
                        <td valign="top" width="56" style="padding: 10px 0; font-family: ${MONO_FONT}; font-size: 11px; color: #666;">
                          ${escapeHtml(post.timeLabel)}
                        </td>
                        <td valign="top" style="padding: 10px 0;">
                          <a href="${escapeHtml(post.moodUrl)}" class="email-preview" style="display: block; font-family: ${MONO_FONT}; font-size: 13px; line-height: 1.65; color: #111; text-decoration: none;">
                            ${escapeHtml(trimPreview(post.previewText, 160))}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`);
  }

  return rows.join('');
}

export function buildMoodDigestEmail(options: {
  mode: 'every_5h' | 'daily';
  moodUrl: string;
  unsubscribeUrl: string;
  channelTitle?: string;
  channelAvatarUrl?: string;
  posts: MoodDigestPost[];
}): { subject: string; html: string; text: string } {
  const channelTitle = (options.channelTitle || 'Mood Feed').trim() || 'Mood Feed';
  const channelInitial = channelTitle.charAt(0).toUpperCase() || 'M';
  const channelAvatarUrl = (options.channelAvatarUrl || '').trim();
  const channelAvatarHtml = channelAvatarUrl
    ? `<img src="${escapeHtml(channelAvatarUrl)}" alt="${escapeHtml(channelTitle)} avatar" width="32" height="32" style="display: block; width: 32px; height: 32px; border-radius: 999px;" />`
    : escapeHtml(channelInitial);
  const count = options.posts.length;
  const modeLabel = options.mode === 'daily' ? 'Daily digest' : '5-hour digest';
  const subject = `${modeLabel} · ${count} mood update${count > 1 ? 's' : ''}`;

  const html = emailShell(`
          <tr>
            <td style="padding: 24px 24px 0;">
              <span class="email-label" style="font-family: ${MONO_FONT}; font-size: 11px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: #666;">mood digest</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-embed-card" style="border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; background-color: #fff;">
                <tr>
                  <td class="email-embed-header" style="padding: 12px 14px; border-bottom: 1px solid #e5e5e5;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" valign="middle">
                          <div class="email-avatar" style="width: 32px; height: 32px; border-radius: 999px; background: #f3f4f6; color: #111; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 600; line-height: 32px; text-align: center; overflow: hidden;">${channelAvatarHtml}</div>
                        </td>
                        <td valign="middle" style="padding-left: 10px;">
                          <a href="${escapeHtml(options.moodUrl)}" class="email-channel-name" style="display: inline-block; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 600; color: #111; text-decoration: none;">${escapeHtml(channelTitle)}</a>
                          <div class="email-channel-meta" style="margin-top: 2px; font-family: ${MONO_FONT}; font-size: 11px; color: #666;">${escapeHtml(modeLabel)} &middot; ${count} update${count > 1 ? 's' : ''}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${buildDigestListHtml(options.posts)}
                <tr>
                  <td class="email-embed-footer" style="padding: 10px 14px; border-top: 1px solid #e5e5e5;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <a href="${escapeHtml(options.moodUrl)}" class="email-view-link" style="font-family: ${MONO_FONT}; font-size: 11px; color: #000; text-decoration: none;">View mood feed &rarr;</a>
                        </td>
                        <td align="right">
                          <a href="${escapeHtml(options.unsubscribeUrl)}" class="email-muted" style="font-family: ${MONO_FONT}; font-size: 11px; color: #666; text-decoration: none;">Unsubscribe &rarr;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);

  const textLines: string[] = [
    modeLabel.toUpperCase(),
    '────────────',
    '',
  ];

  let currentDate = '';
  for (const post of options.posts) {
    if (post.dateLabel && post.dateLabel !== currentDate) {
      currentDate = post.dateLabel;
      textLines.push(post.dateLabel);
    }

    textLines.push(`[${post.timeLabel}] ${trimPreview(post.previewText, 160)}`);
    textLines.push(`Read: ${post.moodUrl}`);
    textLines.push('');
  }

  textLines.push(`Feed: ${options.moodUrl}`);
  textLines.push(`Unsubscribe: ${options.unsubscribeUrl}`);

  return { subject, html, text: textLines.join('\n') };
}
