const PROBE_TIMEOUT_MS = 5_000;
const VERDICT_KEY = 'youtube-embed-reachable:v1';
const PLACEHOLDER_MAX_WIDTH = 120;
const PLAYER_API_URL = 'https://www.youtube.com/iframe_api';

type ReachabilityVerdict = 'yes' | 'no';

interface YouTubePlayerApi {
  Player: new (
    iframe: HTMLIFrameElement,
    options: {
      events: {
        onError: () => void;
        onReady: () => void;
      };
    },
  ) => unknown;
}

declare global {
  interface Window {
    YT?: Partial<YouTubePlayerApi>;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let playerApiPromise: Promise<YouTubePlayerApi> | null = null;

function readVerdict(): ReachabilityVerdict | null {
  try {
    const value = sessionStorage.getItem(VERDICT_KEY);
    return value === 'yes' || value === 'no' ? value : null;
  } catch {
    return null;
  }
}

function writeVerdict(value: ReachabilityVerdict): void {
  try {
    sessionStorage.setItem(VERDICT_KEY, value);
  } catch {
    // Storage is an optimization. Playback still works when it is unavailable.
  }
}

function readPlayerApi(): YouTubePlayerApi | null {
  const Player = window.YT?.Player;
  return typeof Player === 'function' ? { Player } as YouTubePlayerApi : null;
}

function loadPlayerApi(): Promise<YouTubePlayerApi> {
  const loaded = readPlayerApi();
  if (loaded) return Promise.resolve(loaded);
  if (playerApiPromise) return playerApiPromise;

  const pending = new Promise<YouTubePlayerApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      const api = readPlayerApi();
      if (!api) {
        reject(new Error('YouTube Player API did not initialize'));
        return;
      }
      window.onYouTubeIframeAPIReady = previousReady;
      resolve(api);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-youtube-player-api]',
    );
    if (existing) {
      existing.addEventListener('error', () => reject(new Error('YouTube Player API failed')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = PLAYER_API_URL;
    script.async = true;
    script.dataset.youtubePlayerApi = 'true';
    script.addEventListener('error', () => reject(new Error('YouTube Player API failed')), {
      once: true,
    });
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    playerApiPromise = null;
    throw error;
  });
  playerApiPromise = pending;

  return pending;
}

function mountPoster(card: HTMLElement): void {
  const poster = card.querySelector('[data-yt-poster]');
  if (!(poster instanceof HTMLImageElement) || poster.dataset.ytPosterBound === 'true') return;

  poster.dataset.ytPosterBound = 'true';
  const fallbackUrl = poster.dataset.ytPosterFallback;
  let fellBack = poster.src === new URL(fallbackUrl ?? '', window.location.href).href;

  const fallback = () => {
    if (fellBack || !fallbackUrl) return;
    fellBack = true;
    poster.src = fallbackUrl;
  };
  const inspect = () => {
    if (poster.naturalWidth > 0 && poster.naturalWidth <= PLACEHOLDER_MAX_WIDTH) {
      fallback();
    }
  };

  poster.addEventListener('load', inspect);
  poster.addEventListener('error', fallback, { once: true });
  if (poster.complete) queueMicrotask(inspect);
}

function markUnreachable(card: HTMLElement, player: HTMLIFrameElement): void {
  player.removeAttribute('src');
  player.hidden = true;
  card.classList.remove('is-loading', 'is-playing');
  card.classList.add('is-unreachable');
}

function play(card: HTMLElement): void {
  if (
    card.classList.contains('is-playing')
    || card.classList.contains('is-loading')
    || card.classList.contains('is-unreachable')
  ) {
    return;
  }

  const player = card.querySelector('[data-yt-player]');
  if (!(player instanceof HTMLIFrameElement)) return;
  const iframe: HTMLIFrameElement = player;

  const verdict = readVerdict();
  if (verdict === 'no' || !/^https?:$/u.test(window.location.protocol)) {
    markUnreachable(card, player);
    return;
  }

  const id = card.dataset.video ?? '';
  const start = card.dataset.start ?? '0';
  const params = new URLSearchParams({
    autoplay: '1',
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    start,
    origin: window.location.origin,
  });

  card.classList.add('is-loading');
  player.hidden = false;

  let settled = false;
  let timer = 0;
  const cleanup = () => {
    window.clearTimeout(timer);
  };
  const fail = (networkFailure: boolean) => {
    if (settled) return;
    settled = true;
    cleanup();
    markUnreachable(card, player);
    if (networkFailure) writeVerdict('no');
  };
  const succeed = () => {
    if (settled) return;
    settled = true;
    cleanup();
    card.classList.remove('is-loading', 'is-unreachable');
    card.classList.add('is-playing');
    writeVerdict('yes');
  };

  timer = window.setTimeout(() => fail(verdict !== 'yes'), PROBE_TIMEOUT_MS);
  void loadPlayerApi().then((api) => {
    if (settled) return;
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?${params}`;
    new api.Player(iframe, {
      events: {
        onError: () => fail(false),
        onReady: succeed,
      },
    });
  }).catch(() => fail(verdict !== 'yes'));
}

export function initYouTubeEmbeds(root: ParentNode = document): void {
  root.querySelectorAll('[data-yt]').forEach((node) => {
    if (!(node instanceof HTMLElement) || node.dataset.ytBound === 'true') return;

    const frame = node.querySelector('[data-yt-frame]');
    if (!(frame instanceof HTMLButtonElement)) return;

    node.dataset.ytBound = 'true';
    mountPoster(node);
    frame.addEventListener('click', () => play(node));
  });
}
