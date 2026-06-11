import type { APIRoute } from 'astro';
import { json } from '@/lib/http/json-response';

export const prerender = false;

type CloudflareRequest = Request & {
  cf?: {
    colo?: unknown;
    country?: unknown;
    city?: unknown;
    region?: unknown;
    httpProtocol?: unknown;
    tlsVersion?: unknown;
    clientTcpRtt?: unknown;
    asOrganization?: unknown;
  };
};

export interface EdgeInfo {
  colo: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  protocol: string | null;
  tls: string | null;
  rtt: number | null;
  network: string | null;
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function colo(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const code = raw.toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function rtt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function readEdgeInfo(request: Request): EdgeInfo {
  const cf = (request as CloudflareRequest).cf ?? {};
  return {
    colo: colo(cf.colo),
    country: str(cf.country),
    city: str(cf.city),
    region: str(cf.region),
    protocol: str(cf.httpProtocol),
    tls: str(cf.tlsVersion),
    rtt: rtt(cf.clientTcpRtt),
    network: str(cf.asOrganization),
  };
}

export const GET: APIRoute = ({ request }) => {
  const headers = new Headers();
  // Per-visitor facts — never share across requests.
  headers.set('Cache-Control', 'no-store');
  return json(200, readEdgeInfo(request), headers);
};
