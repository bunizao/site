import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type NotifyTokenAction = 'subscribe' | 'unsubscribe';

export interface NotifyTokenPayload {
  v: number;
  action: NotifyTokenAction;
  email: string;
  exp: number;
}

const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return BASIC_EMAIL_REGEX.test(value);
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

export function secureCompareText(input: string, expected: string): boolean {
  if (!input || !expected) {
    return false;
  }

  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createNotifyToken(
  payload: Omit<NotifyTokenPayload, 'v'>,
  secret: string
): string {
  const fullPayload: NotifyTokenPayload = {
    v: 1,
    ...payload,
  };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyNotifyToken(token: string, secret: string): NotifyTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid token format');
  }

  const [encodedPayload, signature] = parts;
  const expected = signPayload(encodedPayload, secret);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    throw new Error('Invalid token signature');
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('Invalid token signature');
  }

  let payload: NotifyTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as NotifyTokenPayload;
  } catch {
    throw new Error('Invalid token payload');
  }

  if (payload.v !== 1) {
    throw new Error('Unsupported token version');
  }

  if (!payload.email || !isValidEmail(payload.email)) {
    throw new Error('Invalid token email');
  }

  if (payload.action !== 'subscribe' && payload.action !== 'unsubscribe') {
    throw new Error('Invalid token action');
  }

  if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  payload.email = normalizeEmail(payload.email);
  return payload;
}
