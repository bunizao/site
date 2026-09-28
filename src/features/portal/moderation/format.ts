import type { AdminBan, AdminBanKeyType } from '@bunizao/contracts';
import { shortHandle } from '../comments/model';

/* Words and numbers for the moderation screens. The key labels match
   KEY_KINDS in comments/model.ts, so a key reads the same on every screen. */

export const BAN_TYPES: readonly AdminBanKeyType[] = [
  'session', 'email', 'client_fp', 'ip', 'fp', 'ip24', 'asn', 'domain', 'email_domain',
];

export const BAN_TYPE_LABELS: Record<AdminBanKeyType, string> = {
  session: 'Session',
  email: 'Email',
  client_fp: 'Device fingerprint',
  ip: 'IP address',
  fp: 'Network signature',
  ip24: 'Subnet',
  asn: 'Network',
  domain: 'Link domain',
  email_domain: 'Email domain',
};

/** Kinds stored as readable text. Every other kind is a hash. */
export const RAW_BAN_TYPES = new Set<AdminBanKeyType>(['asn', 'domain', 'email_domain']);

export function banId(ban: Pick<AdminBan, 'keyType' | 'keyValue'>): string {
  return `${ban.keyType}:${ban.keyValue}`;
}

/** What a cell prints for a key: domains and ASNs as written, hashes short. */
export function keyText(type: string, value: string): string {
  if (type === 'asn') return /^\d+$/.test(value) ? `AS${value}` : value;
  if (type === 'domain' || type === 'email_domain') return value;
  return shortHandle(value);
}

const count = new Intl.NumberFormat('en');
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCount(value: number): string {
  return value >= 100_000 ? compact.format(value) : count.format(value);
}

/** 0..1 to a percentage. Small shares keep a decimal so 0.4% is not 0%. */
export function formatShare(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '–';
  const percent = value * 100;
  if (percent > 0 && percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

function span(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export type ExpiryState = 'never' | 'active' | 'soon' | 'expired';

/** A ban with under three days left is worth a second look. */
export function expiryState(expiresAt: string | null, now = Date.now()): ExpiryState {
  if (!expiresAt) return 'never';
  const left = Date.parse(expiresAt) - now;
  if (left <= 0) return 'expired';
  return left < 3 * 86_400_000 ? 'soon' : 'active';
}

export function expiryText(expiresAt: string | null, now = Date.now()): string {
  if (!expiresAt) return 'Never';
  const left = Date.parse(expiresAt) - now;
  return left > 0 ? `in ${span(left)}` : `${span(-left)} ago`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

let regions: Intl.DisplayNames | null = null;

export function countryName(code: string | null): string {
  if (!code) return 'Unknown country';
  try {
    regions ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regions.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function networkName(asn: number | null, org: string | null): string {
  if (org) return org;
  return asn === null ? 'Unknown network' : `AS${asn}`;
}

export function subnetName(sampleIp: string | null): string {
  if (!sampleIp) return 'Unknown subnet';
  if (sampleIp.includes(':')) return `${sampleIp.split(':').slice(0, 3).join(':')}::/48`;
  return `${sampleIp.split('.').slice(0, 3).join('.')}.0/24`;
}

/** Day key (YYYY-MM-DD, UTC) to a short label such as "Sep 24". */
export function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function plural(value: number, one: string, many = `${one}s`): string {
  return `${formatCount(value)} ${value === 1 ? one : many}`;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `09-28 14:03`, local time: fixed width, so a column of them aligns. */
export function clock(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `2026-09-28 14:03:22`, for titles. */
export function fullTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** `5m ago`, `3h ago`, `12d ago`. */
export function ago(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  return ms < 45_000 ? 'just now' : `${span(ms)} ago`;
}

const SOURCE_ONLY_LABELS: Record<string, string> = {
  client_fp_stable: 'Stable device fingerprint',
  storage_id: 'Browser storage id',
  body_hash: 'Comment text',
};

export function sourceKeyLabel(type: string): string {
  return BAN_TYPE_LABELS[type as AdminBanKeyType] ?? SOURCE_ONLY_LABELS[type] ?? type;
}
