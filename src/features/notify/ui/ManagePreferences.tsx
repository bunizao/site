// Self-serve subscription preferences — one email, one record, both content
// channels (blog / mood) in one place. Two states, one route:
//
//   no token  → magic-link gate: type an email, we mail a signed manage link.
//               Always reports "sent" so the page never reveals whether an
//               address is subscribed.
//   token     → the control panel: toggle channels, drag a cadence, and (for
//               daily) pick a timezone + hour. Save patches the record;
//               "unsubscribe" flips status to unsubscribed (row kept).
//
// This page is the ONLY reader-facing destination for subscription changes:
// every email footer — including the ones labelled 退订 / Unsubscribe — lands
// here, because slowing the mail down and stopping it are the same decision and
// nobody should have to guess which link means which. ?intent=unsubscribe
// raises the confirmation straight away while leaving the panel behind it, so
// the reader can turn the frequency down instead of leaving entirely.
//
// Bilingual: copy follows the browser's language (zh for any Chinese locale,
// otherwise en). Only the two operational channels the reader actually opts
// into — blog and mood — are shown; privacy/announcement are system mail and
// aren't managed here.
//
// This island owns only the DOM + fetches; the API lives in ../site-api under
// /notify/manage (token action 'manage' or 'unsubscribe'). Types are local for
// now; they move to @bunizao/contracts when the backend lands.
import * as React from 'react';

// --- Shared shape (mirror of the planned contracts types) ------------------
type SubscriberStatus = 'pending' | 'active' | 'unsubscribed';
type DeliveryMode = 'immediate' | 'every_5h' | 'daily';
type NotifyChannel = 'mood' | 'blog' | 'privacy' | 'announcement';

interface ManagePreferencesView {
  email: string;
  status: SubscriberStatus;
  channels: NotifyChannel[];
  deliveryMode: DeliveryMode;
  timezone: string;
  dailyHour: number;
  lastNotifiedAt?: string;
}

interface Props {
  /** Cloudflare Turnstile site key for the magic-link request. */
  turnstileSiteKey?: string;
}

type Lang = 'zh' | 'en';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Managed channels: only the two the reader opts into. The record may still
// carry privacy/announcement, but they're system mail and not shown here — a
// save preserves them by merging (see PreferencesPanel.save).
const MANAGED_CHANNELS: NotifyChannel[] = ['blog', 'mood'];

// Cadence order is also the slider's left-to-right order: loudest first.
const MODE_ORDER: DeliveryMode[] = ['immediate', 'every_5h', 'daily'];

function getManagedChannels(channels: NotifyChannel[]): NotifyChannel[] {
  return channels.filter((channel) => MANAGED_CHANNELS.includes(channel));
}

function getRetainedChannels(channels: NotifyChannel[]): NotifyChannel[] {
  return channels.filter((channel) => !MANAGED_CHANNELS.includes(channel));
}

// --- i18n dictionary --------------------------------------------------------
// One flat object per language; components read t.<key>. Kept literal (no
// interpolation lib) — the placeholders that need a value take a fn.
const STRINGS = {
  zh: {
    title: '订阅偏好',
    gateLead: '输入你订阅时用的邮箱，您将会收到一个管理链接，点开即可调整或退订。',
    emailLabel: '邮箱地址',
    emailPlaceholder: 'you@example.com',
    sendLink: '发送管理链接',
    linkSent: '管理链接已发出，若该邮箱已订阅，收件箱里应该找得到。',
    changeEmail: '换个邮箱吧',
    invalidEmail: '请输入有效的邮箱地址。',
    turnstileFirst: '请先完成安全校验。',
    tooFrequent: '太频繁了，请稍后再试。',
    networkError: '网络错误，检查下连接。',
    privacyNote: (link: React.ReactNode) => <>订阅信息受 {link} 保护。</>,
    privacyPolicy: '隐私政策',
    loading: '正在读取你的订阅…',
    linkExpired: '这个管理链接已过期。请重新申请一封新的吧。',
    linkInvalid: '链接失效了。请从邮件里重新打开。',
    requestAgain: '用邮箱重新申请',
    statusActive: '已订阅',
    statusPending: '待确认',
    channelsHeading: '订阅内容',
    blogTitle: 'Blog · 無人之境',
    blogMeta: '长文更新即送达',
    moodTitle: 'Mood · 闲谈手记',
    moodMeta: '按下方频率推送',
    noChannelsHint: '两个都关掉的话，直接用下面的「退订全部」更干脆。',
    cadenceHeading: '推送频率',
    modeImmediate: '即时',
    modeEvery5h: '每 5 小时',
    modeDaily: '每日',
    modeImmediateHint: '新的 mood 一发布，就落进你的收件箱。',
    modeEvery5hHint: '攒成一封，每五小时送一次。',
    modeDailyHint: '一天一封，时间你说了算。',
    moodOffHint: '打开 Mood 订阅后才能调整频率。',
    timezone: '时区',
    dailyTime: '送达时间',
    lastSent: (date: string) => `上次送达 · ${date}`,
    unsubscribeAll: '退订全部',
    saveChanges: '保存更改',
    saved: '已保存',
    saveFailed: '保存失败，稍后重试。',
    actionFailed: '操作失败，稍后重试。',
    unsubscribedText: '已退订全部内容。这个邮箱不会再收到我们的消息。',
    resubscribe: '重新开启订阅',
    confirmTitle: '退订全部内容？',
    confirmBody: (email: string) => `我们会停止向 ${email} 发送任何邮件。记录会保留，你随时可以回来重新开启。`,
    confirmQuieter: '先把频率调低',
    cancel: '取消',
    never: '—',
  },
  en: {
    title: 'Subscription preferences',
    gateLead: 'Enter the email you subscribed with. We’ll send a magic link to adjust or cancel your subscription.',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    sendLink: 'Send manage link',
    linkSent: 'If that address is subscribed, a manage link is on its way. Check your inbox.',
    changeEmail: 'Use another email',
    invalidEmail: 'Enter a valid email address.',
    turnstileFirst: 'Please complete the security check first.',
    tooFrequent: 'Too many attempts. Try again shortly.',
    networkError: 'Network error — check your connection.',
    privacyNote: (link: React.ReactNode) => <>Your details are protected by our {link}.</>,
    privacyPolicy: 'privacy policy',
    loading: 'Loading your subscription…',
    linkExpired: 'This manage link has expired. Request a fresh one below.',
    linkInvalid: 'Invalid link. Please reopen it from the email.',
    requestAgain: 'Request a new link',
    statusActive: 'Subscribed',
    statusPending: 'Pending',
    channelsHeading: 'Subscriptions',
    blogTitle: 'Sillage · Blog',
    blogMeta: 'Sent when a post ships',
    moodTitle: 'Mood · Feed',
    moodMeta: 'Sent at the frequency below',
    noChannelsHint: 'With both off, “Unsubscribe from all” below is the cleaner exit.',
    cadenceHeading: 'Push frequency',
    modeImmediate: 'Instant',
    modeEvery5h: 'Every 5 hours',
    modeDaily: 'Daily',
    modeImmediateHint: 'New moods land in your inbox the moment they post.',
    modeEvery5hHint: 'Bundled together and sent once every five hours.',
    modeDailyHint: 'One bundle a day, at a time you choose.',
    moodOffHint: 'Turn Mood on to change how often it arrives.',
    timezone: 'Timezone',
    dailyTime: 'Delivery time',
    lastSent: (date: string) => `Last sent · ${date}`,
    unsubscribeAll: 'Unsubscribe from all',
    saveChanges: 'Save changes',
    saved: 'Saved',
    saveFailed: 'Save failed. Try again shortly.',
    actionFailed: 'Something went wrong. Try again shortly.',
    unsubscribedText: 'You’ve unsubscribed from everything. This inbox won’t hear from us again.',
    resubscribe: 'Re-enable subscription',
    confirmTitle: 'Unsubscribe from all?',
    confirmBody: (email: string) => `We’ll stop sending any mail to ${email}. Your record is kept, so you can come back any time.`,
    confirmQuieter: 'Lower the frequency instead',
    cancel: 'Cancel',
    never: '—',
  },
} as const;

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of langs) {
    const lang = (raw || '').toLowerCase();
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('en')) return 'en';
  }
  return 'en';
}

// A short, curated timezone list keeps the daily control from becoming a
// 400-entry dropdown; the subscriber's own zone is added if it's missing.
const BASE_TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function formatDate(value: string | undefined, lang: Lang): string {
  if (!value) return STRINGS[lang].never;
  try {
    return new Date(value).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

function readQueryParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URL(window.location.href).searchParams.get(name)?.trim() ?? '';
}

function readToken(): string {
  return readQueryParam('token');
}

// A demo record so the page is reviewable without a live subscription:
// /subscribe/manage?demo=1 renders the control panel with sample data.
function demoView(): ManagePreferencesView {
  return {
    email: 'you@example.com',
    status: 'active',
    channels: ['blog', 'mood'],
    deliveryMode: 'every_5h',
    timezone: browserTimezone(),
    dailyHour: 9,
    lastNotifiedAt: '2026-06-28T09:00:00Z',
  };
}

type T = (typeof STRINGS)[Lang];
type ManageInvalidReason = 'expired' | 'invalid' | 'network';
type ManageSnapshot =
  | { phase: 'loading' }
  | { phase: 'panel'; view: ManagePreferencesView }
  | { phase: 'invalid'; reason: ManageInvalidReason };

const LOADING_SNAPSHOT: ManageSnapshot = { phase: 'loading' };
const CONFIRM_DIALOG_STYLE: React.CSSProperties = {
  border: 0,
  color: 'inherit',
  height: 'auto',
  margin: 0,
  maxHeight: 'none',
  maxWidth: 'none',
  padding: 0,
  width: 'auto',
};

interface ManageStoreEntry {
  snapshot: ManageSnapshot;
  listeners: Set<() => void>;
  loading: boolean;
}

const manageStore = new Map<string, ManageStoreEntry>();

function getManageStoreEntry(token: string): ManageStoreEntry {
  let entry = manageStore.get(token);
  if (!entry) {
    entry = { snapshot: LOADING_SNAPSHOT, listeners: new Set(), loading: false };
    manageStore.set(token, entry);
  }
  return entry;
}

function notifyManageStore(entry: ManageStoreEntry) {
  for (const listener of entry.listeners) listener();
}

function loadManageStoreEntry(token: string) {
  const entry = getManageStoreEntry(token);
  if (entry.loading || entry.snapshot.phase === 'panel') return;
  entry.loading = true;
  void fetch(`/api/notify/manage?token=${encodeURIComponent(token)}`)
    .then(async (res) => {
      if (!res.ok) {
        entry.snapshot = {
          phase: 'invalid',
          reason: res.status === 410 ? 'expired' : 'invalid',
        };
        return;
      }
      entry.snapshot = { phase: 'panel', view: (await res.json()) as ManagePreferencesView };
    })
    .catch(() => {
      entry.snapshot = { phase: 'invalid', reason: 'network' };
    })
    .finally(() => {
      entry.loading = false;
      notifyManageStore(entry);
    });
}

function useManagePreferencesSnapshot(token: string): ManageSnapshot {
  const subscribe = React.useCallback(
    (listener: () => void) => {
      const entry = getManageStoreEntry(token);
      entry.listeners.add(listener);
      loadManageStoreEntry(token);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [token]
  );

  const getSnapshot = React.useCallback((): ManageSnapshot => {
    return getManageStoreEntry(token).snapshot;
  }, [token]);

  const getServerSnapshot = React.useCallback((): ManageSnapshot => LOADING_SNAPSHOT, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function invalidManageMessage(reason: ManageInvalidReason, t: T): string {
  if (reason === 'expired') return t.linkExpired;
  if (reason === 'network') return t.networkError;
  return t.linkInvalid;
}

export default function ManagePreferences({ turnstileSiteKey = '' }: Props) {
  const lang = React.useMemo(detectLang, []);
  const t = STRINGS[lang];
  const token = React.useMemo(readToken, []);
  const isDemo = React.useMemo(() => Boolean(readQueryParam('demo')), []);
  // Arriving from an email's 退订 / Unsubscribe link: raise the confirmation
  // immediately, but keep the panel behind it as the gentler alternative.
  const wantsUnsubscribe = React.useMemo(() => readQueryParam('intent') === 'unsubscribe', []);
  const demo = React.useMemo(() => (isDemo ? demoView() : null), [isDemo]);
  const [gateSent, setGateSent] = React.useState(false);

  // Reflect the resolved language on <html> so the browser hyphenates / selects
  // fonts correctly for the active copy.
  React.useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh' : 'en';
  }, [lang]);

  if (demo) {
    return (
      <PreferencesPanel
        key={demo.email}
        t={t}
        lang={lang}
        initial={demo}
        token={token}
        isDemo={isDemo}
        wantsUnsubscribe={wantsUnsubscribe}
      />
    );
  }

  if (!token) {
    return (
      <MagicLinkGate
        t={t}
        sent={gateSent}
        turnstileSiteKey={turnstileSiteKey}
        onSent={() => setGateSent(true)}
        onReset={() => setGateSent(false)}
      />
    );
  }

  return (
    <LoadedPreferencesPanel
      t={t}
      lang={lang}
      token={token}
      isDemo={isDemo}
      wantsUnsubscribe={wantsUnsubscribe}
    />
  );
}

function LoadedPreferencesPanel({
  t,
  lang,
  token,
  isDemo,
  wantsUnsubscribe,
}: {
  t: T;
  lang: Lang;
  token: string;
  isDemo: boolean;
  wantsUnsubscribe: boolean;
}) {
  const snapshot = useManagePreferencesSnapshot(token);

  if (snapshot.phase === 'loading') {
    return (
      <div className="mp-panel mp-panel--center">
        <span className="mp-spinner" aria-hidden="true" />
        <p className="mp-muted">{t.loading}</p>
      </div>
    );
  }

  if (snapshot.phase === 'invalid') {
    return (
      <div className="mp-panel mp-panel--center">
        <p className="mp-result-text">{invalidManageMessage(snapshot.reason, t)}</p>
        <a className="mp-btn mp-btn--ghost" href="/subscribe/manage">
          {t.requestAgain}
        </a>
      </div>
    );
  }

  return (
    <PreferencesPanel
      key={snapshot.view.email}
      t={t}
      lang={lang}
      initial={snapshot.view}
      token={token}
      isDemo={isDemo}
      wantsUnsubscribe={wantsUnsubscribe}
    />
  );
}

// --- State 1: magic-link gate ----------------------------------------------
function MagicLinkGate({
  t,
  sent,
  turnstileSiteKey,
  onSent,
  onReset,
}: {
  t: T;
  sent: boolean;
  turnstileSiteKey: string;
  onSent: () => void;
  onReset: () => void;
}) {
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const turnstileRef = React.useRef<HTMLDivElement>(null);
  const tsTokenRef = React.useRef('');
  const requiresTurnstile = Boolean(turnstileSiteKey);

  // Render Turnstile explicitly once the script is up.
  React.useEffect(() => {
    if (!requiresTurnstile || sent) return;
    let widgetId: string | null = null;
    let intervalId: number | null = null;
    const render = () => {
      const ts = (window as unknown as { turnstile?: any }).turnstile;
      if (!ts || !turnstileRef.current || widgetId !== null) return;
      widgetId = ts.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        action: 'notify_manage',
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        callback: (tok: string) => {
          tsTokenRef.current = tok || '';
        },
        'expired-callback': () => {
          tsTokenRef.current = '';
        },
        'error-callback': () => {
          tsTokenRef.current = '';
        },
      });
    };
    if ((window as unknown as { turnstile?: any }).turnstile) {
      render();
    } else if (!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      const s = document.createElement('script');
      s.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onManageTurnstileLoad';
      s.async = true;
      (window as unknown as { onManageTurnstileLoad?: () => void }).onManageTurnstileLoad = render;
      document.head.appendChild(s);
    } else {
      intervalId = window.setInterval(render, 120);
    }
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      const w = window as unknown as {
        turnstile?: { remove: (id: string) => void };
        onManageTurnstileLoad?: () => void;
      };
      if (w.onManageTurnstileLoad === render) delete w.onManageTurnstileLoad;
      if (widgetId !== null) {
        try {
          w.turnstile?.remove(widgetId);
        } catch {
          // Turnstile may already have removed this widget during navigation.
        }
      }
      tsTokenRef.current = '';
    };
  }, [requiresTurnstile, turnstileSiteKey, sent]);

  if (sent) {
    return (
      <div className="mp-panel mp-panel--center">
        <svg
          className="mp-result-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="m9 11 3 3L22 4" />
        </svg>
        <p className="mp-result-text">{t.linkSent}</p>
        <button type="button" className="mp-btn mp-btn--ghost" onClick={onReset}>
          {t.changeEmail}
        </button>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError(t.invalidEmail);
      return;
    }
    if (requiresTurnstile && !tsTokenRef.current) {
      setError(t.turnstileFirst);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/notify/manage/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, turnstileToken: tsTokenRef.current }),
      });
      if (res.status === 429) {
        setError(t.tooFrequent);
        return;
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || t.actionFailed);
        return;
      }
      // Success is intentionally uniform: the endpoint returns 200 whether or
      // not the address exists, so we never confirm subscription status here.
      onSent();
    } catch {
      setError(t.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mp-panel">
      <h1 className="mp-title">{t.title}</h1>
      <p className="mp-lead">{t.gateLead}</p>
      <form onSubmit={submit} noValidate>
        <input
          type="email"
          className="mp-input"
          aria-label={t.emailLabel}
          placeholder={t.emailPlaceholder}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {requiresTurnstile && <div ref={turnstileRef} className="mp-turnstile" />}
        {error && (
          <p className="mp-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="mp-btn mp-btn--block" disabled={busy}>
          {busy ? <span className="mp-spinner mp-spinner--on-fg" aria-hidden="true" /> : t.sendLink}
        </button>
      </form>
      <p className="mp-fineprint">
        {t.privacyNote(
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            {t.privacyPolicy}
          </a>
        )}
      </p>
    </div>
  );
}

// --- The cadence control ----------------------------------------------------
// Three options, three labelled segments. A slider would ask the reader to read
// a thumb position against a legend; a segmented control just names each stop.
// Native radios carry the semantics and arrow-key navigation; the only painted
// extra is the pill that slides between segments.
function CadenceSegments({
  stops,
  value,
  label,
  disabled,
  onChange,
}: {
  stops: ReadonlyArray<{ value: DeliveryMode; label: string }>;
  value: DeliveryMode;
  label: string;
  disabled: boolean;
  onChange: (value: DeliveryMode) => void;
}) {
  const name = React.useId();
  const index = Math.max(0, stops.findIndex((stop) => stop.value === value));

  return (
    <div
      className="mp-seg"
      role="radiogroup"
      aria-label={label}
      style={
        {
          '--mp-seg-pos': index,
          '--mp-seg-count': stops.length,
        } as React.CSSProperties
      }
    >
      <span className="mp-seg-indicator" aria-hidden="true" />
      {stops.map((stop) => (
        <label key={stop.value} className="mp-seg-option">
          <input
            type="radio"
            name={name}
            value={stop.value}
            checked={stop.value === value}
            disabled={disabled}
            onChange={() => onChange(stop.value)}
          />
          <span>{stop.label}</span>
        </label>
      ))}
    </div>
  );
}

// --- State 2: the control panel --------------------------------------------
interface PreferencesPanelState {
  channels: NotifyChannel[];
  mode: DeliveryMode;
  timezone: string;
  dailyHour: number;
  status: SubscriberStatus;
  saving: boolean;
  savedAt: string | null;
  error: string;
  confirmOpen: boolean;
}

type PreferencesPanelAction =
  | { type: 'toggle-channel'; value: NotifyChannel }
  | { type: 'mode'; value: DeliveryMode }
  | { type: 'timezone'; value: string }
  | { type: 'daily-hour'; value: number }
  | { type: 'saving'; value: boolean }
  | { type: 'saved'; at: string | null }
  | { type: 'error'; value: string }
  | { type: 'status'; value: SubscriberStatus }
  | { type: 'confirm-open'; value: boolean };

function preferencesPanelReducer(
  state: PreferencesPanelState,
  action: PreferencesPanelAction,
): PreferencesPanelState {
  switch (action.type) {
    case 'toggle-channel':
      return {
        ...state,
        savedAt: null,
        channels: state.channels.includes(action.value)
          ? state.channels.filter((channel) => channel !== action.value)
          : [...state.channels, action.value],
      };
    case 'mode':
      return { ...state, mode: action.value, savedAt: null };
    case 'timezone':
      return { ...state, timezone: action.value, savedAt: null };
    case 'daily-hour':
      return { ...state, dailyHour: action.value, savedAt: null };
    case 'saving':
      return { ...state, saving: action.value };
    case 'saved':
      return { ...state, savedAt: action.at };
    case 'error':
      return { ...state, error: action.value };
    case 'status':
      return { ...state, status: action.value };
    case 'confirm-open':
      return { ...state, confirmOpen: action.value };
  }
}

function PreferencesPanel({
  t,
  lang,
  initial,
  token,
  isDemo,
  wantsUnsubscribe,
}: {
  t: T;
  lang: Lang;
  initial: ManagePreferencesView;
  token: string;
  isDemo: boolean;
  wantsUnsubscribe: boolean;
}) {
  const CHANNELS: Array<{ value: NotifyChannel; title: string; meta: string }> = [
    { value: 'blog', title: t.blogTitle, meta: t.blogMeta },
    { value: 'mood', title: t.moodTitle, meta: t.moodMeta },
  ];
  const MODE_LABEL: Record<DeliveryMode, string> = {
    immediate: t.modeImmediate,
    every_5h: t.modeEvery5h,
    daily: t.modeDaily,
  };
  const MODE_HINT: Record<DeliveryMode, string> = {
    immediate: t.modeImmediateHint,
    every_5h: t.modeEvery5hHint,
    daily: t.modeDailyHint,
  };
  const STOPS = MODE_ORDER.map((value) => ({ value, label: MODE_LABEL[value] }));

  // Only the managed channels are editable here; anything else on the record
  // (privacy/announcement) is held aside and merged back on save.
  const retainedChannels = React.useRef<NotifyChannel[] | null>(null);
  if (retainedChannels.current === null) {
    retainedChannels.current = getRetainedChannels(initial.channels);
  }

  const [state, dispatch] = React.useReducer(preferencesPanelReducer, initial, (value): PreferencesPanelState => ({
    channels: getManagedChannels(value.channels),
    mode: value.deliveryMode,
    timezone: value.timezone || browserTimezone(),
    dailyHour: value.dailyHour ?? 9,
    status: value.status,
    saving: false,
    savedAt: null,
    error: '',
    confirmOpen: false,
  }));
  const { channels, mode, timezone, dailyHour, status, saving, savedAt, error, confirmOpen } = state;
  const confirmDialogRef = React.useRef<HTMLDialogElement>(null);
  const confirmTitleId = React.useId();
  const confirmBodyId = React.useId();

  const timezoneOptions = React.useMemo(() => {
    const set = new Set(BASE_TIMEZONES);
    if (timezone) set.add(timezone);
    return Array.from(set);
  }, [timezone]);

  const noChannels = channels.length === 0;
  const moodOn = channels.includes('mood');

  function openConfirmDialog() {
    dispatch({ type: 'confirm-open', value: true });
    queueMicrotask(() => {
      const dialog = confirmDialogRef.current;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }

  function closeConfirmDialog() {
    if (confirmDialogRef.current?.open) confirmDialogRef.current.close();
    dispatch({ type: 'confirm-open', value: false });
  }

  // The email's unsubscribe link lands here with the confirmation already up.
  const unsubscribeIntentHandled = React.useRef(false);
  React.useEffect(() => {
    if (unsubscribeIntentHandled.current) return;
    unsubscribeIntentHandled.current = true;
    if (wantsUnsubscribe && status !== 'unsubscribed') openConfirmDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsUnsubscribe]);

  async function persist(body: Record<string, unknown>) {
    if (isDemo) {
      // Demo mode: no network, just reflect the change locally.
      dispatch({ type: 'saved', at: new Date().toISOString() });
      return true;
    }
    const res = await fetch(`/api/notify/manage?token=${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `HTTP ${res.status}`);
    }
    dispatch({ type: 'saved', at: new Date().toISOString() });
    return true;
  }

  async function save() {
    if (noChannels) return;
    dispatch({ type: 'saving', value: true });
    dispatch({ type: 'error', value: '' });
    try {
      await persist({
        status: 'active',
        // Merge managed selections with any retained system channels.
        channels: [...channels, ...(retainedChannels.current ?? [])],
        deliveryMode: mode,
        timezone: mode === 'daily' ? timezone : null,
        dailyHour: mode === 'daily' ? dailyHour : null,
      });
      dispatch({ type: 'status', value: 'active' });
    } catch (e) {
      dispatch({ type: 'error', value: e instanceof Error && e.message ? e.message : t.saveFailed });
    } finally {
      dispatch({ type: 'saving', value: false });
    }
  }

  async function unsubscribeAll() {
    confirmDialogRef.current?.close();
    dispatch({ type: 'confirm-open', value: false });
    dispatch({ type: 'saving', value: true });
    dispatch({ type: 'error', value: '' });
    try {
      await persist({ status: 'unsubscribed' });
      dispatch({ type: 'status', value: 'unsubscribed' });
    } catch (e) {
      dispatch({ type: 'error', value: e instanceof Error && e.message ? e.message : t.actionFailed });
    } finally {
      dispatch({ type: 'saving', value: false });
    }
  }

  if (status === 'unsubscribed') {
    return (
      <div className="mp-panel mp-panel--center">
        <p className="mp-result-text">{t.unsubscribedText}</p>
        <button
          type="button"
          className="mp-btn"
          disabled={saving}
          onClick={() => {
            dispatch({ type: 'status', value: 'active' });
            dispatch({ type: 'saved', at: null });
          }}
        >
          {t.resubscribe}
        </button>
      </div>
    );
  }

  return (
    <div className="mp-panel">
      <header className="mp-head">
        <h1 className="mp-title">{t.title}</h1>
        <div className="mp-identity">
          <span className="mp-identity-email">{initial.email}</span>
          <span className={`mp-chip${status === 'active' ? '' : ' mp-chip--pending'}`}>
            <span className="mp-chip-dot" aria-hidden="true" />
            {status === 'active' ? t.statusActive : t.statusPending}
          </span>
        </div>
        <p className="mp-identity-meta">{t.lastSent(formatDate(initial.lastNotifiedAt, lang))}</p>
      </header>

      <section className="mp-section">
        <h2 className="mp-section-title">{t.channelsHeading}</h2>
        <div className="mp-channels">
          {CHANNELS.map((ch) => (
            <label key={ch.value} className="mp-channel">
              <input
                type="checkbox"
                checked={channels.includes(ch.value)}
                onChange={() => dispatch({ type: 'toggle-channel', value: ch.value })}
              />
              <span className="mp-channel-text">
                <span className="mp-channel-title">{ch.title}</span>
                <span className="mp-channel-meta">{ch.meta}</span>
              </span>
              <span className="mp-switch" aria-hidden="true" />
            </label>
          ))}
        </div>
        {noChannels && <p className="mp-hint">{t.noChannelsHint}</p>}
      </section>

      <section className={`mp-section mp-cadence${moodOn ? '' : ' is-muted'}`}>
        <h2 className="mp-section-title">{t.cadenceHeading}</h2>

        <CadenceSegments
          stops={STOPS}
          value={mode}
          label={t.cadenceHeading}
          disabled={!moodOn}
          onChange={(next) => dispatch({ type: 'mode', value: next })}
        />

        <p className="mp-cadence-hint" key={moodOn ? mode : 'off'}>
          {moodOn ? MODE_HINT[mode] : t.moodOffHint}
        </p>

        <div className={`mp-daily${moodOn && mode === 'daily' ? ' is-open' : ''}`}>
          <div className="mp-daily-inner">
            <div className="mp-field">
              <label className="mp-field-label" htmlFor="mp-tz">
                {t.timezone}
              </label>
              <select
                id="mp-tz"
                className="mp-select"
                value={timezone}
                onChange={(e) => dispatch({ type: 'timezone', value: e.target.value })}
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="mp-field">
              <label className="mp-field-label" htmlFor="mp-hour">
                {t.dailyTime}
              </label>
              <select
                id="mp-hour"
                className="mp-select"
                value={dailyHour}
                onChange={(e) => dispatch({ type: 'daily-hour', value: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <p className="mp-error" role="alert">
          {error}
        </p>
      )}

      <footer className="mp-foot">
        <button type="button" className="mp-link-btn" disabled={saving} onClick={openConfirmDialog}>
          {t.unsubscribeAll}
        </button>
        <div className="mp-foot-actions">
          <span className={`mp-saved${savedAt ? ' is-on' : ''}`} aria-live="polite">
            {savedAt ? t.saved : ''}
          </span>
          <button type="button" className="mp-btn" disabled={saving || noChannels} onClick={save}>
            {saving ? <span className="mp-spinner mp-spinner--on-fg" aria-hidden="true" /> : t.saveChanges}
          </button>
        </div>
      </footer>

      <ConfirmUnsubscribeDialog
        open={confirmOpen}
        dialogRef={confirmDialogRef}
        titleId={confirmTitleId}
        bodyId={confirmBodyId}
        title={t.confirmTitle}
        body={t.confirmBody(initial.email)}
        quieterLabel={t.confirmQuieter}
        confirmLabel={t.unsubscribeAll}
        saving={saving}
        onClose={closeConfirmDialog}
        onConfirm={unsubscribeAll}
      />
    </div>
  );
}

// The dismissal path is the recommended one: "turn it down" is the primary
// button, unsubscribing is the quiet text action next to it.
function ConfirmUnsubscribeDialog({
  open,
  dialogRef,
  titleId,
  bodyId,
  title,
  body,
  quieterLabel,
  confirmLabel,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  titleId: string;
  bodyId: string;
  title: string;
  body: string;
  quieterLabel: string;
  confirmLabel: string;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="mp-confirm"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={onClose}
      style={CONFIRM_DIALOG_STYLE}
    >
      <div className="mp-confirm-box">
        <p id={titleId} className="mp-confirm-title">
          {title}
        </p>
        <p id={bodyId} className="mp-confirm-body">
          {body}
        </p>
        <div className="mp-confirm-actions">
          <button type="button" className="mp-btn mp-btn--block" disabled={saving} onClick={onClose}>
            {quieterLabel}
          </button>
          <button type="button" className="mp-link-btn mp-link-btn--danger" disabled={saving} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
