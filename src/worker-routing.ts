const IMAGE_WORKER_HOSTNAME = 'image.buxx.me';
const LOCAL_WRANGLER_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

function normalizeHost(host: string): string {
  const value = host.trim().toLowerCase();
  const ipv6End = value.indexOf(']');

  if (value.startsWith('[') && ipv6End !== -1) {
    return value.slice(0, ipv6End + 1);
  }

  return value.split(':', 1)[0] ?? '';
}

export function isImageWorkerRequest(request: Request): boolean {
  const urlHostname = normalizeHost(new URL(request.url).hostname);
  const hostHeader = request.headers.get('host');

  if (urlHostname === IMAGE_WORKER_HOSTNAME) {
    return true;
  }

  if (!LOCAL_WRANGLER_HOSTNAMES.has(urlHostname)) {
    return false;
  }

  return hostHeader ? normalizeHost(hostHeader) === IMAGE_WORKER_HOSTNAME : false;
}
