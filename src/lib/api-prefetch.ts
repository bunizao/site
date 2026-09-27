/**
 * Early API fetches, started by an inline script while the HTML is still
 * parsing and handed to the module that would otherwise have asked later.
 *
 * Module scripts run after the document has parsed, and the comment and
 * reaction controllers then wait a frame or two more, so their first request
 * used to leave the browser well after the page was on screen. The inline
 * script (ApiPrefetch.astro) issues the same request as soon as the parser
 * reaches it; the controller takes the in-flight promise instead of starting
 * its own.
 *
 * A prefetched response is single-use: the first `fetchPrefetched` for a URL
 * takes it, and every later call (a refresh, a retry) goes to the network.
 * URLs must match byte for byte, so both sides build them with the helpers in
 * features/comments/api-urls.ts.
 */

declare global {
  interface Window {
    __apiPrefetch?: Map<string, Promise<Response>>;
  }
}

export function fetchPrefetched(url: string, init?: RequestInit): Promise<Response> {
  const pending = window.__apiPrefetch?.get(url);
  if (pending) {
    window.__apiPrefetch?.delete(url);
    return pending;
  }
  return fetch(url, init);
}

// Body shared by both inline variants: start each of `u` once, low priority.
const START_FETCHES = `var m=window.__apiPrefetch||(window.__apiPrefetch=new Map());u.forEach(function(x){if(m.has(x))return;var p=fetch(x,{headers:{Accept:'application/json'},priority:'low'});p.catch(function(){});m.set(x,p)})`;

/** Inline script body that starts `urls`. Plain ES5, since it is not
    bundled. Low priority: these feed below-the-fold widgets and must not
    compete with the LCP image for the connection. */
export function prefetchScript(urls: string[]): string {
  return `(function(u){${START_FETCHES}})(${serializeUrls(urls)})`;
}

/** Root margin shared by the proximity-gated prefetch and the consumers it
    feeds: 1.5 viewports below the fold, so a reader scrolling at a normal
    pace still finds the response in flight before the widget hydrates. */
export const NEAR_ROOT_MARGIN = '0px 0px 150% 0px';

/** Like `prefetchScript`, but the fetches wait until the element right before
    the script tag comes within `NEAR_ROOT_MARGIN` of the viewport. A widget at
    the end of a long page then costs no request for readers who never get
    there; a short page is already in range and fires on first layout. Without
    IntersectionObserver, or with nothing to observe, it fires at once. */
export function prefetchScriptWhenNear(urls: string[]): string {
  return `(function(u){var go=function(){${START_FETCHES}};var s=document.currentScript,t=s&&s.previousElementSibling;if(!t||!('IntersectionObserver' in window))return go();var io=new IntersectionObserver(function(e){for(var i=0;i<e.length;i++){if(e[i].isIntersecting){io.disconnect();go();return}}},{rootMargin:'${NEAR_ROOT_MARGIN}'});io.observe(t)})(${serializeUrls(urls)})`;
}

function serializeUrls(urls: string[]): string {
  return JSON.stringify(urls).replace(/</g, '\\u003c');
}
