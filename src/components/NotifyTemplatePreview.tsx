import { useMemo, useState } from 'react';
import { buildMoodNotificationEmail, buildSubscribeConfirmEmail } from '@/lib/notify/templates';

const DEFAULTS = {
  siteUrl: 'https://example.com',
  confirmUrl: 'https://example.com/api/notify/confirm?token=preview_token',
  moodUrl: 'https://example.com/mood/12345',
  unsubscribeUrl: 'https://example.com/api/notify/unsubscribe?token=preview_token',
  previewText:
    'Today I refined the mood timeline interaction, reduced animation jitter, and improved mobile readability.',
  postId: '12345',
};

function safeSiteUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed || DEFAULTS.siteUrl;
}

function safePostId(value: string): string {
  const trimmed = value.trim();
  return trimmed || DEFAULTS.postId;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function TextField({ label, value, onChange, placeholder }: FieldProps) {
  return (
    <label className="block space-y-2 text-xs">
      <span className="font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground"
      />
    </label>
  );
}

export default function NotifyTemplatePreview() {
  const [siteUrl, setSiteUrl] = useState(DEFAULTS.siteUrl);
  const [confirmUrl, setConfirmUrl] = useState(DEFAULTS.confirmUrl);
  const [moodUrl, setMoodUrl] = useState(DEFAULTS.moodUrl);
  const [unsubscribeUrl, setUnsubscribeUrl] = useState(DEFAULTS.unsubscribeUrl);
  const [previewText, setPreviewText] = useState(DEFAULTS.previewText);
  const [postId, setPostId] = useState(DEFAULTS.postId);

  const subscribeHtml = useMemo(() => {
    return buildSubscribeConfirmEmail({
      siteUrl: safeSiteUrl(siteUrl),
      confirmUrl: confirmUrl.trim() || DEFAULTS.confirmUrl,
    }).html;
  }, [siteUrl, confirmUrl]);

  const moodHtml = useMemo(() => {
    return buildMoodNotificationEmail({
      moodUrl: moodUrl.trim() || DEFAULTS.moodUrl,
      unsubscribeUrl: unsubscribeUrl.trim() || DEFAULTS.unsubscribeUrl,
      previewText: previewText.trim() || DEFAULTS.previewText,
      postId: safePostId(postId),
    }).html;
  }, [moodUrl, unsubscribeUrl, previewText, postId]);

  return (
    <section className="mx-auto grid w-full max-w-[1400px] gap-6">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <TextField label="Site URL" value={siteUrl} onChange={setSiteUrl} placeholder="https://example.com" />
        <TextField
          label="Confirm URL"
          value={confirmUrl}
          onChange={setConfirmUrl}
          placeholder="https://example.com/api/notify/confirm?token=..."
        />
        <TextField label="Mood URL" value={moodUrl} onChange={setMoodUrl} placeholder="https://example.com/mood/12345" />
        <TextField
          label="Unsubscribe URL"
          value={unsubscribeUrl}
          onChange={setUnsubscribeUrl}
          placeholder="https://example.com/api/notify/unsubscribe?token=..."
        />
        <TextField label="Post ID" value={postId} onChange={setPostId} placeholder="12345" />
        <label className="block space-y-2 text-xs md:col-span-2">
          <span className="font-medium uppercase tracking-[0.14em] text-muted-foreground">Preview Text</span>
          <textarea
            value={previewText}
            onChange={(event) => setPreviewText(event.target.value)}
            rows={4}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground"
          />
        </label>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 border-b border-border pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">Subscribe Confirmation</h2>
          </div>
          <iframe
            title="Subscribe confirmation email preview"
            srcDoc={subscribeHtml}
            className="h-[760px] w-full rounded-lg border border-border bg-white"
          />
        </article>

        <article className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 border-b border-border pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">Mood Notification</h2>
          </div>
          <iframe
            title="Mood notification email preview"
            srcDoc={moodHtml}
            className="h-[760px] w-full rounded-lg border border-border bg-white"
          />
        </article>
      </div>
    </section>
  );
}
