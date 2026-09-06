// Telegram Instant View link plumbing.
//
// Telegram renders a page as Instant View when a parsing template for its
// domain exists. The template is not deployed from this repo: its source lives
// in `config/instant-view/buxx.me.iv` and is published by hand at
// instantview.telegram.org. A template Telegram has not adopted domain-wide
// applies only to links carrying its `?rhash=`, so exactly one link on the site
// appends one — the Telegram share hand-off. Copied links, canonical, og:url,
// feeds and the native share sheet stay clean: `rhash` is a Telegram detail and
// has no meaning anywhere else.
//
// Free of any site-config import so the client bundle behind ShareRow can use
// the same functions the server does. The hash itself rides in as an argument
// (`blog.instantView.rhash` in src/data/site.ts is the one place it is set).

/** Query parameter Telegram reads a template hash from. */
export const INSTANT_VIEW_RHASH_PARAM = 'rhash';

/** Where Telegram's own share sheet lives. */
const TELEGRAM_SHARE_ENDPOINT = 'https://t.me/share/url';

/**
 * Add the Instant View template hash to an absolute URL, replacing any hash
 * already on it. An empty `rhash` (no template published yet) and a URL that is
 * not absolute both return the input untouched, so a caller never has to guard.
 */
export function withInstantViewRhash(url: string, rhash: string): string {
  const hash = rhash.trim();
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (hash) {
    parsed.searchParams.set(INSTANT_VIEW_RHASH_PARAM, hash);
  } else {
    // A stale hash on an incoming URL outlives the template it names; drop it
    // rather than forwarding it into a share.
    parsed.searchParams.delete(INSTANT_VIEW_RHASH_PARAM);
  }

  return parsed.toString();
}

/**
 * Telegram's share sheet, pointed at `url` with `title` as the accompanying
 * message. The shared link carries the Instant View hash, which is the whole
 * point: it is the one place a reader hands a post to Telegram, so it is the
 * one place worth upgrading.
 */
export function telegramShareUrl(input: {
  url: string;
  title?: string;
  rhash?: string;
}): string {
  const share = new URL(TELEGRAM_SHARE_ENDPOINT);

  share.searchParams.set('url', withInstantViewRhash(input.url, input.rhash ?? ''));

  const title = input.title?.trim();
  if (title) share.searchParams.set('text', title);

  return share.toString();
}
