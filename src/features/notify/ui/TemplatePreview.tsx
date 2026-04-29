import { useCallback, useEffect, useState } from 'react';

interface PreviewResponse {
  generatedAt: string;
  mode: 'daily' | 'every_5h';
  sample: 'live' | 'rich';
  timezone: string;
  source: {
    channelTitle: string;
    channelAvatarUrl?: string;
    latestPostId: string | null;
    digestPostIds: string[];
  };
  subjects: {
    subscribe: string;
    mood: string;
    digest: string;
  };
  html: {
    subscribe: string;
    mood: string;
    digest: string;
  };
}

export default function TemplatePreview() {
  const [digestMode, setDigestMode] = useState<'daily' | 'every_5h'>('daily');
  const [sample, setSample] = useState<'live' | 'rich'>('live');
  const [timezone, setTimezone] = useState('UTC');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    setTimezone(resolved);
  }, []);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        mode: digestMode,
        sample,
        timezone,
      });
      const response = await fetch(`/api/notify/preview?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Preview request failed (${response.status})`);
      }

      const data = (await response.json()) as PreviewResponse;
      setPreview(data);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to load preview';
      setError(message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [digestMode, sample, timezone, refreshKey]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  return (
    <section className="mx-auto grid w-full max-w-[1400px] gap-6">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => setDigestMode('daily')}
              className={`rounded px-3 py-1.5 text-xs ${digestMode === 'daily' ? 'bg-foreground text-background' : 'text-foreground/70'}`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setDigestMode('every_5h')}
              className={`rounded px-3 py-1.5 text-xs ${digestMode === 'every_5h' ? 'bg-foreground text-background' : 'text-foreground/70'}`}
            >
              Every 5h
            </button>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => setSample('live')}
              className={`rounded px-3 py-1.5 text-xs ${sample === 'live' ? 'bg-foreground text-background' : 'text-foreground/70'}`}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => setSample('rich')}
              className={`rounded px-3 py-1.5 text-xs ${sample === 'rich' ? 'bg-foreground text-background' : 'text-foreground/70'}`}
            >
              Rich sample
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-foreground/80 transition hover:bg-accent"
          >
            Refresh Live Data
          </button>
          <span className="text-xs text-muted-foreground">
            Timezone: {timezone}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Channel: {preview?.source.channelTitle || '-'}</span>
          <span>Sample: {preview?.sample || sample}</span>
          <span>Latest Post: {preview?.source.latestPostId || '-'}</span>
          <span>Digest Count: {preview?.source.digestPostIds.length ?? 0}</span>
          <span>Generated: {preview?.generatedAt ? new Date(preview.generatedAt).toLocaleString() : '-'}</span>
        </div>

        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 border-b border-border pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">Subscribe Confirmation</h2>
            <p className="mt-1 text-xs text-muted-foreground">{preview?.subjects.subscribe || '-'}</p>
          </div>
          <iframe
            title="Subscribe confirmation email preview"
            srcDoc={preview?.html.subscribe || ''}
            className="h-[760px] w-full rounded-lg border border-border bg-white"
          />
        </article>

        <article className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 border-b border-border pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">Mood Notification</h2>
            <p className="mt-1 text-xs text-muted-foreground">{preview?.subjects.mood || '-'}</p>
          </div>
          <iframe
            title="Mood notification email preview"
            srcDoc={preview?.html.mood || ''}
            className="h-[760px] w-full rounded-lg border border-border bg-white"
          />
        </article>

        <article className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 border-b border-border pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">Mood Digest</h2>
            <p className="mt-1 text-xs text-muted-foreground">{preview?.subjects.digest || '-'}</p>
          </div>
          <iframe
            title="Mood digest email preview"
            srcDoc={preview?.html.digest || ''}
            className="h-[760px] w-full rounded-lg border border-border bg-white"
          />
        </article>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground">Loading live preview…</p>
      )}
    </section>
  );
}
