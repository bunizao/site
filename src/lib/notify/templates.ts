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

export function buildSubscribeConfirmEmail(options: {
  siteUrl: string;
  confirmUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Confirm your mood subscription';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 12px;">Confirm subscription</h2>
      <p style="margin: 0 0 12px;">Click the button below to start receiving mood updates.</p>
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(options.confirmUrl)}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Confirm subscription</a>
      </p>
      <p style="margin: 12px 0 0; font-size: 13px; color: #6b7280;">If you did not request this, you can ignore this email.</p>
      <p style="margin: 4px 0 0; font-size: 12px; color: #9ca3af;">${escapeHtml(options.siteUrl)}</p>
    </div>
  `;
  const text = [
    'Confirm your mood subscription',
    '',
    `Open this link: ${options.confirmUrl}`,
    '',
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
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 10px;">New mood posted</h2>
      <p style="margin: 0 0 14px; color: #374151;">${escapeHtml(preview)}</p>
      <p style="margin: 0 0 18px;">
        <a href="${escapeHtml(options.moodUrl)}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Read mood</a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #6b7280;">
        Unsubscribe: <a href="${escapeHtml(options.unsubscribeUrl)}" style="color: #6b7280;">${escapeHtml(options.unsubscribeUrl)}</a>
      </p>
    </div>
  `;
  const text = [
    `New mood #${options.postId}`,
    '',
    preview,
    '',
    `Read: ${options.moodUrl}`,
    `Unsubscribe: ${options.unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}
