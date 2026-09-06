/* Signs this browser in to the blog's comment box as the owner.

   The comment box has no admin login of its own, and should not grow one:
   a password field in a public form is a second front door to guard. What it
   has is a reader session, the same cookie every verified commenter holds,
   and the owner is a reader whose address is the configured owner address.
   So "log in as admin" is "become that reader", and the portal -- already
   behind the admin session -- is the one place allowed to say who that is.

   Two hops, both from this page, both same-origin so the cookie lands on
   buxx.me: the admin API mints a single-use code that lives ten minutes and
   names the owner address; the public reader route trades it for a reader
   session. The code never leaves the browser and is burnt on first use, so
   there is no standing owner credential anywhere. See site-api's
   src/features/comments/server/owner-access.ts.

   The first ever sign-in has to be told the address, because the owner has
   no reader row yet for the API to read it from -- COMMENTS_OWNER_EMAIL_HASH
   is a hash, and a hash cannot be mailed. The API answers
   `owner_email_required`, this card asks once, and the row it creates
   remembers it for every sign-in after. A wrong address is refused against
   that hash, so the field cannot make anyone else the owner. */

import * as React from 'react';
import type { ReaderMe, ReaderMeResult } from '@bunizao/contracts/comments';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@/components/coss';
import { adminApiEndpoint } from './api';

/** Public, on site-api. Consumes one code and answers with a reader session
    cookie. Not in @bunizao/contracts yet: the route is pinned to a package
    version the worker has not consumed, and one string is not worth the
    release. Move it to routes.ts when the next contract bump ships. */
const OWNER_SIGN_IN_PATH = '/api/v2/reader/owner-sign-in';
const READER_ME_PATH = '/api/v2/reader/me';

type Phase = 'loading' | 'idle' | 'need-email' | 'working' | 'error';

async function readReader(): Promise<ReaderMe | null> {
  const response = await fetch(READER_ME_PATH, { credentials: 'same-origin' });
  if (!response.ok) return null;
  const result = (await response.json().catch(() => null)) as ReaderMeResult | null;
  return result?.reader ?? null;
}

async function mintCode(email: string | null): Promise<{ code: string } | { error: string }> {
  const response = await fetch(adminApiEndpoint('/comments/owner-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(email ? { email } : {}),
  });
  const payload = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
  if (!response.ok || !payload.code) {
    return { error: payload.error || `HTTP ${response.status}` };
  }
  return { code: payload.code };
}

async function redeemCode(code: string): Promise<ReaderMe | { error: string }> {
  const response = await fetch(OWNER_SIGN_IN_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ code }),
  });
  const payload = (await response.json().catch(() => ({}))) as { reader?: ReaderMe; error?: string };
  if (!response.ok || !payload.reader) {
    return { error: payload.error || `HTTP ${response.status}` };
  }
  return payload.reader;
}

const ERROR_COPY: Record<string, string> = {
  owner_email_mismatch: 'That is not the configured owner address.',
  owner_identity_unavailable: 'The owner identity is not configured on site-api (COMMENTS_OWNER_EMAIL_HASH, COMMENTS_OWNER_DISPLAY_NAME).',
  owner_access_unavailable: 'The handoff table is missing — run the comment_owner_access_codes migration.',
  invalid_owner_code: 'The code was refused. It may have expired; try again.',
  not_found: 'Comments are switched off, so there is nothing to sign in to.',
};

export default function OwnerSignIn({ demo = false }: { demo?: boolean }) {
  // Starts as loading in every mode, so the server-rendered button is
  // disabled until the island has mounted and can actually handle a click.
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [reader, setReader] = React.useState<ReaderMe | null>(null);
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (demo) {
      setPhase('idle');
      return;
    }
    let cancelled = false;
    readReader()
      .then((current) => {
        if (cancelled) return;
        setReader(current);
        setPhase('idle');
      })
      .catch(() => {
        if (!cancelled) setPhase('idle');
      });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const fail = (code: string) => {
    setError(ERROR_COPY[code] ?? code);
    setPhase('error');
  };

  const signIn = async (withEmail: string | null) => {
    setPhase('working');
    setError(null);
    const minted = await mintCode(withEmail);
    if ('error' in minted) {
      if (minted.error === 'owner_email_required') {
        setPhase('need-email');
        return;
      }
      fail(minted.error);
      return;
    }
    const redeemed = await redeemCode(minted.code);
    if ('error' in redeemed) {
      fail(redeemed.error);
      return;
    }
    setReader(redeemed);
    setEmail('');
    setPhase('idle');
  };

  const signOut = async () => {
    setPhase('working');
    setError(null);
    try {
      await fetch(READER_ME_PATH, { method: 'DELETE', credentials: 'same-origin' });
      setReader(null);
    } catch {
      // The cookie may still stand; the next readReader will say so.
    }
    setPhase('idle');
  };

  const busy = phase === 'working' || phase === 'loading';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="portal-card-title">Your identity on the blog</CardTitle>
        <CardDescription>
          Comments you write on the blog carry the owner badge only when this browser holds the
          owner&apos;s reader session. Signing in here hands one over; nothing is typed into the blog.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {demo && (
          <p className="portal-list-meta">Demo mode — the admin API is not bound here, so the handoff will be refused.</p>
        )}

        {reader ? (
          <div className="owner-signin">
            <p className="owner-signin__state">
              Signed in as <strong>{reader.displayName}</strong>
              <span className="owner-signin__meta"> · {reader.provider} · {reader.grade}</span>
            </p>
            <div className="owner-signin__actions">
              <Button size="sm" variant="outline" onClick={signOut} disabled={busy}>
                Sign out of the blog
              </Button>
              <a className="owner-signin__link" href="/blog" target="_blank" rel="noopener">
                Open the blog ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="owner-signin">
            <p className="owner-signin__state">
              {phase === 'loading' ? 'Checking this browser…' : 'This browser is not signed in to the blog.'}
            </p>

            {phase === 'need-email' ? (
              <form
                className="owner-signin__form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void signIn(email.trim());
                }}
              >
                <p className="portal-list-meta">
                  First time: the owner has no reader row yet, so the address has to be typed once. It is
                  checked against the configured owner hash and remembered after.
                </p>
                <div className="owner-signin__actions">
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="owner@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <Button size="sm" type="submit" disabled={busy || !email.trim()}>
                    Sign in
                  </Button>
                </div>
              </form>
            ) : (
              <div className="owner-signin__actions">
                <Button size="sm" onClick={() => void signIn(null)} disabled={busy}>
                  {phase === 'working' ? 'Signing in…' : 'Sign in on the blog as owner'}
                </Button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="portal-notice" data-variant="error" role="alert">
            <span>{error}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
