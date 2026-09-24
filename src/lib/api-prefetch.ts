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

/** Inline script body that starts `urls`. Plain ES5, since it is not
    bundled. Low priority: these feed below-the-fold widgets and must not
    compete with the LCP image for the connection. */
export function prefetchScript(urls: string[]): string {
  const list = JSON.stringify(urls).replace(/</g, '\\u003c');
  return `(function(u){var m=window.__apiPrefetch||(window.__apiPrefetch=new Map());u.forEach(function(x){if(m.has(x))return;var p=fetch(x,{headers:{Accept:'application/json'},priority:'low'});p.catch(function(){});m.set(x,p)})})(${list})`;
}
