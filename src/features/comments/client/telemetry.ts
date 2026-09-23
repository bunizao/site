import type { CommentTelemetryInput } from '@bunizao/contracts/comments';
import { readTurnstilePrompts, type TurnstileAction } from './turnstile-token';

const ENDPOINT = '/api/v2/comments/telemetry';

function report(payload: CommentTelemetryInput): void {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  } catch {
    // A refused beacon can still use the ordinary keepalive transport.
  }
  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      referrerPolicy: 'no-referrer',
    }).catch(() => {});
  } catch {
    // A report must never change the outcome of the user's write.
  }
}

export interface WriteTelemetry {
  captureChallenges(): void;
  finish(outcome: CommentTelemetryInput['outcome']): void;
}

/** One report per user attempt. Automated retries retain the same object. */
export function beginWriteTelemetry(kind: CommentTelemetryInput['kind'], action: TurnstileAction): WriteTelemetry {
  const initial = readTurnstilePrompts(action);
  const baseline = initial.total - initial.current;
  let challenges = initial.current;
  let finished = false;
  return {
    captureChallenges() {
      if (!finished) challenges = Math.max(challenges, readTurnstilePrompts(action).total - baseline);
    },
    finish(outcome) {
      if (finished) return;
      finished = true;
      report({ kind, outcome, challenges: Math.min(10, Math.max(0, Math.round(challenges))) });
    },
  };
}
