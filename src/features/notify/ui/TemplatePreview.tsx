import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/coss';

interface PreviewResponse {
  generatedAt: string;
  mode: 'daily' | 'every_5h';
  sample: 'live' | 'rich';
  timezone: string;
  siteUrl: string;
  source: {
    channelTitle: string;
    channelAvatarUrl?: string;
    latestPostId: string | null;
    digestPostIds: string[];
  };
  subjects: {
    subscribe: string;
    welcome: string;
    blog: string;
    mood: string;
    digest: string;
    cancel: string;
    changeEmail: string;
    emailChanged: string;
    deleteRecord: string;
  };
  html: {
    subscribe: string;
    welcome: string;
    blog: string;
    mood: string;
    digest: string;
    cancel: string;
    changeEmail: string;
    emailChanged: string;
    deleteRecord: string;
  };
  callbackPages: {
    confirmSuccess: string;
    confirmError: string;
    unsubscribeSuccess: string;
    unsubscribeError: string;
    deleteRecordConfirm: string;
    deleteRecordDone: string;
  };
}

type EmailKey = 'subscribe' | 'welcome' | 'blog' | 'mood' | 'digest' | 'cancel' | 'changeEmail' | 'emailChanged' | 'deleteRecord';
type CallbackKey = 'confirmSuccess' | 'confirmError' | 'unsubscribeSuccess' | 'unsubscribeError' | 'deleteRecordConfirm' | 'deleteRecordDone';
// The preferences panel is the one notify surface this endpoint cannot build:
// it is an Astro island in the site repo, so the catalog frames the real page
// in demo mode instead of a string of HTML.
type LiveKey = 'managePanel';
type TemplateKey = EmailKey | CallbackKey | LiveKey;
type CardSize = 'compacted' | 'regular' | 'expanded';
type Surface = 'email' | 'page';

interface TemplateMeta {
  key: TemplateKey;
  surface: Surface;
  label: string;
  index: string;
  intent: string;
}

const TEMPLATE_ORDER: ReadonlyArray<TemplateMeta> = [
  { key: 'subscribe', surface: 'email', label: 'Subscribe Confirm', index: 'E1', intent: 'double-opt-in email' },
  { key: 'welcome', surface: 'email', label: 'Welcome', index: 'E2', intent: 'post-confirm onboarding' },
  { key: 'blog', surface: 'email', label: 'Blog Newsletter', index: 'E3', intent: 'editorial post send' },
  { key: 'mood', surface: 'email', label: 'Mood Notification', index: 'E4', intent: 'per-post push' },
  { key: 'digest', surface: 'email', label: 'Mood Digest', index: 'E5', intent: 'batched window' },
  { key: 'cancel', surface: 'email', label: 'Unsubscribe Notice', index: 'E6', intent: 'opt-out receipt' },
  { key: 'changeEmail', surface: 'email', label: 'Change Email Confirm', index: 'E7', intent: 'opt-in on the new address' },
  { key: 'emailChanged', surface: 'email', label: 'Address Changed Notice', index: 'E8', intent: 'receipt to the old address' },
  { key: 'deleteRecord', surface: 'email', label: 'Delete Record Confirm', index: 'E9', intent: 'second step before erasure' },
  { key: 'confirmSuccess', surface: 'page', label: 'Confirm — Success', index: 'P1', intent: 'callback after confirm OK' },
  { key: 'confirmError', surface: 'page', label: 'Confirm — Error', index: 'P2', intent: 'expired / used token' },
  { key: 'unsubscribeSuccess', surface: 'page', label: 'Unsubscribe — Success', index: 'P3', intent: 'POST unsubscribe' },
  { key: 'unsubscribeError', surface: 'page', label: 'Unsubscribe — Error', index: 'P4', intent: 'invalid / failed' },
  { key: 'deleteRecordConfirm', surface: 'page', label: 'Delete Record — Confirm', index: 'P5', intent: 'the button that erases' },
  { key: 'deleteRecordDone', surface: 'page', label: 'Delete Record — Receipt', index: 'P6', intent: 'what was removed' },
  { key: 'managePanel', surface: 'page', label: 'Preferences Panel', index: 'P7', intent: 'live page, demo record' },
];

const CARD_SIZE_OPTIONS: ReadonlyArray<{ label: string; value: CardSize }> = [
  { label: 'Compacted', value: 'compacted' },
  { label: 'Regular', value: 'regular' },
  { label: 'Expanded', value: 'expanded' },
];

const SURFACE_FILTERS: ReadonlyArray<{ label: string; value: Surface | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Emails', value: 'email' },
  { label: 'Pages', value: 'page' },
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
  const [surfaceFilter, setSurfaceFilter] = useState<Surface | 'all'>('all');
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
      const response = await fetch(`/dev/portal/api/notify-preview?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const detail = await response
          .clone()
          .json()
          .then((body: unknown) => (
            body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : null
          ))
          .catch(() => null);
        throw new Error(
          detail
            ? `Preview request failed (${response.status}): ${detail}`
            : `Preview request failed (${response.status})`
        );
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

  const visibleTemplates = useMemo(
    () => TEMPLATE_ORDER.filter((tpl) => surfaceFilter === 'all' || tpl.surface === surfaceFilter),
    [surfaceFilter]
  );

  function getTemplateContent(key: TemplateKey): { subject?: string; html: string; src?: string } {
    if (!preview) return { html: '' };
    if (
      key === 'subscribe' || key === 'welcome' || key === 'blog' || key === 'mood'
      || key === 'digest' || key === 'cancel' || key === 'changeEmail' || key === 'emailChanged'
      || key === 'deleteRecord'
    ) {
      return { subject: preview.subjects[key], html: preview.html[key] };
    }
    if (key === 'managePanel') {
      // siteUrl is newer than this card; an API that predates it still renders.
      const origin = (preview.siteUrl || window.location.origin).replace(/\/$/, '');
      return { html: '', src: `${origin}/subscribe/manage?demo=1` };
    }
    return { html: preview.callbackPages[key] };
  }

  return (
    <TooltipProvider>
      <section className={`notify-preview notify-preview--${cardSize}`}>
      <Card className="notify-control-bar">
        <div className="notify-control-group" role="group" aria-label="Surface filter">
          <span className="notify-control-label">Surface</span>
          <div className="notify-segment">
            {SURFACE_FILTERS.map((option) => (
              <Button
                key={option.value}
                variant="ghost"
                size="sm"
                onClick={() => setSurfaceFilter(option.value)}
                className={`notify-segment__btn${surfaceFilter === option.value ? ' notify-segment__btn--active' : ''}`}
                aria-pressed={surfaceFilter === option.value}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="notify-control-group" role="group" aria-label="Digest mode">
          <span className="notify-control-label">Digest</span>
          <div className="notify-segment">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDigestMode('daily')}
              className={`notify-segment__btn${digestMode === 'daily' ? ' notify-segment__btn--active' : ''}`}
              aria-pressed={digestMode === 'daily'}
            >
              Daily
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDigestMode('every_5h')}
              className={`notify-segment__btn${digestMode === 'every_5h' ? ' notify-segment__btn--active' : ''}`}
              aria-pressed={digestMode === 'every_5h'}
            >
              Every 5h
            </Button>
          </div>
        </div>

        <div className="notify-control-group" role="group" aria-label="Sample source">
          <span className="notify-control-label">Source</span>
          <div className="notify-segment">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSample('live')}
              className={`notify-segment__btn${sample === 'live' ? ' notify-segment__btn--active' : ''}`}
              aria-pressed={sample === 'live'}
            >
              Live
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSample('rich')}
              className={`notify-segment__btn${sample === 'rich' ? ' notify-segment__btn--active' : ''}`}
              aria-pressed={sample === 'rich'}
            >
              Rich sample
            </Button>
          </div>
        </div>

        <div className="notify-control-group" role="group" aria-label="Card size">
          <span className="notify-control-label">Cards</span>
          <div className="notify-segment">
            {CARD_SIZE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant="ghost"
                size="sm"
                onClick={() => setCardSize(option.value)}
                className={`notify-segment__btn${cardSize === option.value ? ' notify-segment__btn--active' : ''}`}
                aria-pressed={cardSize === option.value}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((value) => value + 1)}
          className="notify-refresh"
        >
          <span className="notify-refresh__dot" aria-hidden="true" data-loading={loading ? 'true' : 'false'} />
          {loading ? 'Refreshing…' : 'Refresh live data'}
        </Button>
      </Card>

      <Separator />

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
        {visibleTemplates.map((tpl) => {
          const { subject, html, src } = getTemplateContent(tpl.key);
          const isFocused = focused === tpl.key;
          const isHidden = Boolean(focused) && !isFocused;
          return (
            <Card
              key={tpl.key}
              className={[
                'notify-card',
                `notify-card--${tpl.surface}`,
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
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFocused(isFocused ? null : tpl.key)}
                        className="notify-card__focus"
                        aria-pressed={isFocused}
                      >
                        {isFocused ? 'Exit focus' : 'Focus'}
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {isFocused ? 'Return to the template grid' : 'Open this preview'}
                  </TooltipContent>
                </Tooltip>
              </header>
              {tpl.surface === 'email' ? (
                <p className="notify-card__subject" title={subject || undefined}>
                  <span className="notify-card__subject-tag">Subject</span>
                  <span className="notify-card__subject-value">{subject || '—'}</span>
                </p>
              ) : null}
              <div className="notify-card__frame">
                {html || src ? (
                  <iframe
                    title={`${tpl.label} preview`}
                    src={src}
                    srcDoc={src ? undefined : html}
                    className="notify-card__iframe"
                    loading="lazy"
                    sandbox={tpl.surface === 'page' ? 'allow-same-origin allow-scripts' : 'allow-same-origin'}
                  />
                ) : (
                  <div className="notify-card__empty">
                    {loading ? 'Loading live preview…' : 'No content.'}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      </section>
    </TooltipProvider>
  );
}
