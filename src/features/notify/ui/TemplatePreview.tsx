import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    welcome: string;
    mood: string;
    digest: string;
    cancel: string;
  };
  html: {
    subscribe: string;
    welcome: string;
    mood: string;
    digest: string;
    cancel: string;
  };
}

type TemplateKey = 'subscribe' | 'welcome' | 'mood' | 'digest' | 'cancel';
type CardSize = 'compacted' | 'regular' | 'expanded';

const TEMPLATE_ORDER: ReadonlyArray<{
  key: TemplateKey;
  label: string;
  index: string;
  intent: string;
}> = [
  { key: 'subscribe', label: 'Subscribe Confirm', index: '01', intent: 'double-opt-in' },
  { key: 'welcome', label: 'Welcome', index: '02', intent: 'post-confirm onboarding' },
  { key: 'mood', label: 'Mood Notification', index: '03', intent: 'per-post push' },
  { key: 'digest', label: 'Mood Digest', index: '04', intent: 'batched window' },
  { key: 'cancel', label: 'Unsubscribe Notice', index: '05', intent: 'opt-out receipt' },
];

const CARD_SIZE_OPTIONS: ReadonlyArray<{ label: string; value: CardSize }> = [
  { label: 'Compacted', value: 'compacted' },
  { label: 'Regular', value: 'regular' },
  { label: 'Expanded', value: 'expanded' },
];

export default function TemplatePreview() {
  const [digestMode, setDigestMode] = useState<'daily' | 'every_5h'>('daily');
  const [sample, setSample] = useState<'live' | 'rich'>('live');
  const [timezone, setTimezone] = useState('UTC');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [focused, setFocused] = useState<TemplateKey | null>(null);
  const [cardSize, setCardSize] = useState<CardSize>('regular');
  const requestId = useRef(0);

  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    setTimezone(resolved);
  }, []);

  const fetchPreview = useCallback(async () => {
    const id = ++requestId.current;
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
      if (id === requestId.current) {
        setPreview(data);
      }
    } catch (fetchError) {
      if (id === requestId.current) {
        const message = fetchError instanceof Error ? fetchError.message : 'Failed to load preview';
        setError(message);
        setPreview(null);
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [digestMode, sample, timezone, refreshKey]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  const generatedLabel = useMemo(() => {
    if (!preview?.generatedAt) return '—';
    try {
      return new Date(preview.generatedAt).toLocaleString();
    } catch {
      return preview.generatedAt;
    }
  }, [preview?.generatedAt]);

  const metaRows: ReadonlyArray<{ label: string; value: string }> = [
    { label: 'Channel', value: preview?.source.channelTitle || '—' },
    { label: 'Sample', value: preview?.sample || sample },
    { label: 'Latest post', value: preview?.source.latestPostId || '—' },
    { label: 'Digest count', value: String(preview?.source.digestPostIds.length ?? 0) },
    { label: 'Generated', value: generatedLabel },
  ];

  return (
    <section className={`notify-preview notify-preview--${cardSize}`}>
      <div className="notify-control-bar">
        <div className="notify-control-group" role="group" aria-label="Digest mode">
          <span className="notify-control-label">Digest</span>
          <div className="notify-segment">
            <button
              type="button"
              onClick={() => setDigestMode('daily')}
              className={`notify-segment__btn${digestMode === 'daily' ? ' notify-segment__btn--active' : ''}`}
              aria-pressed={digestMode === 'daily'}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setDigestMode('every_5h')}
              className={`notify-segment__btn${digestMode === 'every_5h' ? ' notify-segment__btn--active' : ''}`}
              aria-pressed={digestMode === 'every_5h'}
            >
              Every 5h
            </button>
          </div>
        </div>

        <div className="notify-control-group" role="group" aria-label="Sample source">
          <span className="notify-control-label">Source</span>
          <div className="notify-segment">
            <button
              type="button"
              onClick={() => setSample('live')}
              className={`notify-segment__btn${sample === 'live' ? ' notify-segment__btn--active' : ''}`}
              aria-pressed={sample === 'live'}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => setSample('rich')}
              className={`notify-segment__btn${sample === 'rich' ? ' notify-segment__btn--active' : ''}`}
              aria-pressed={sample === 'rich'}
            >
              Rich sample
            </button>
          </div>
        </div>

        <div className="notify-control-group" role="group" aria-label="Card size">
          <span className="notify-control-label">Cards</span>
          <div className="notify-segment">
            {CARD_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCardSize(option.value)}
                className={`notify-segment__btn${cardSize === option.value ? ' notify-segment__btn--active' : ''}`}
                aria-pressed={cardSize === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          className="notify-refresh"
        >
          <span className="notify-refresh__dot" aria-hidden="true" data-loading={loading ? 'true' : 'false'} />
          {loading ? 'Refreshing…' : 'Refresh live data'}
        </button>
      </div>

      <dl className="notify-meta">
        {metaRows.map((row) => (
          <div key={row.label} className="notify-meta__row">
            <dt>{row.label}</dt>
            <dd title={row.value}>{row.value}</dd>
          </div>
        ))}
        <div className="notify-meta__row">
          <dt>Timezone</dt>
          <dd title={timezone}>{timezone}</dd>
        </div>
      </dl>

      {error && (
        <p className="notify-error" role="alert">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      )}

      <div className={`notify-grid${focused ? ' notify-grid--focused' : ''}`}>
        {TEMPLATE_ORDER.map((tpl) => {
          const subject = preview?.subjects?.[tpl.key] ?? '';
          const html = preview?.html?.[tpl.key] ?? '';
          const isFocused = focused === tpl.key;
          const isHidden = Boolean(focused) && !isFocused;
          return (
            <article
              key={tpl.key}
              className={[
                'notify-card',
                isFocused ? 'notify-card--active' : '',
                isHidden ? 'notify-card--hidden' : '',
              ].filter(Boolean).join(' ')}
              data-template={tpl.key}
            >
              <header className="notify-card__head">
                <div className="notify-card__heading">
                  <span className="notify-card__index">{tpl.index}</span>
                  <div>
                    <h3 className="notify-card__title">{tpl.label}</h3>
                    <p className="notify-card__intent">{tpl.intent}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFocused(isFocused ? null : tpl.key)}
                  className="notify-card__focus"
                  aria-pressed={isFocused}
                >
                  {isFocused ? 'Exit focus' : 'Focus'}
                </button>
              </header>
              <p className="notify-card__subject" title={subject || undefined}>
                <span className="notify-card__subject-tag">Subject</span>
                <span className="notify-card__subject-value">{subject || '—'}</span>
              </p>
              <div className="notify-card__frame">
                {html ? (
                  <iframe
                    title={`${tpl.label} preview`}
                    srcDoc={html}
                    className="notify-card__iframe"
                    loading="lazy"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="notify-card__empty">
                    {loading ? 'Loading live preview…' : 'No content.'}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
