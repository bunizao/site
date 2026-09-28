import * as React from 'react';
import type { ReaderMe, ReaderMeResult } from '@bunizao/contracts/comments';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/coss/dialog';
import { Input } from '@/components/coss/input';
import { Skeleton } from '@/components/coss/skeleton';
import { apiUrl } from '../app/api';
import { navigate, setSearch } from '../app/router';

/* Signs this browser in to the blog's comment box as the owner, so comments
   written there carry the owner badge. Same two hops as the old portal
   card: the admin API mints a single-use code naming the owner address,
   and the public reader route trades it for a reader session cookie on this
   origin. The code never leaves the browser and burns on first use. See
   site-api's src/features/comments/server/owner-access.ts.

   The first sign-in has to be told the address once: the API answers
   `owner_email_required`, the form asks, and site-api checks it against
   the configured owner hash, so the field cannot make anyone else owner. */

const OWNER_SIGN_IN_PATH = '/api/v2/reader/owner-sign-in';
const READER_ME_PATH = '/api/v2/reader/me';

const ERROR_COPY: Record<string, string> = {
  owner_email_mismatch: 'That is not the configured owner address. Check it and try again.',
  owner_identity_unavailable: 'site-api has no owner identity. Set COMMENTS_OWNER_EMAIL_HASH and COMMENTS_OWNER_DISPLAY_NAME, then try again.',
  owner_access_unavailable: 'The handoff table is missing. Run the comment_owner_access_codes migration, then try again.',
  invalid_owner_code: 'The code was refused, probably because it expired. Try again.',
  not_found: 'Comments are switched off, so there is nothing to sign in to.',
};

type Phase = 'loading' | 'idle' | 'need-email' | 'working' | 'demo';

/** Opens the dialog from anywhere: the comments screen owns it. */
export function openOwnerSignIn(): void {
  if (location.pathname.endsWith('/comments')) setSearch({ dialog: 'owner' });
  else navigate('/comments?dialog=owner');
}

async function readReader(): Promise<ReaderMe | null> {
  const response = await fetch(READER_ME_PATH, { credentials: 'same-origin' });
  if (!response.ok) return null;
  const result = (await response.json().catch(() => null)) as ReaderMeResult | null;
  return result?.reader ?? null;
}

/** Open while the URL says `?dialog=owner`; the screen passes that in, so
    the dialog skips the renders every other URL change causes. */
export const OwnerSignInDialog = React.memo(function OwnerSignInDialog({ open }: { open: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && setSearch({ dialog: null })}>
      <DialogPopup className="sm:max-w-md">{open && <OwnerSignInForm onClose={() => setSearch({ dialog: null })} />}</DialogPopup>
    </Dialog>
  );
});

function OwnerSignInForm({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [reader, setReader] = React.useState<ReaderMe | null>(null);
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    readReader()
      .then((current) => live && (setReader(current), setPhase('idle')))
      .catch(() => live && setPhase('idle'));
    return () => {
      live = false;
    };
  }, []);

  const signIn = async (withEmail: string | null): Promise<void> => {
    setPhase('working');
    setError(null);
    try {
      const minted = await fetch(apiUrl('admin/comments/owner-code'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(withEmail ? { email: withEmail } : {}),
      });
      const payload = (await minted.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!minted.ok || !payload.code) {
        if (payload.error === 'owner_email_required') {
          setPhase('need-email');
          return;
        }
        throw new Error(ERROR_COPY[payload.error ?? ''] ?? `site-api answered ${payload.error ?? minted.status}. Try again in a moment.`);
      }
      // The demo API mints a code but has no reader service to trade it in.
      if (minted.headers.get('X-Portal-Demo') === '1') {
        setPhase('demo');
        return;
      }
      const redeemed = await fetch(OWNER_SIGN_IN_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code: payload.code }),
      });
      const result = (await redeemed.json().catch(() => ({}))) as { reader?: ReaderMe; error?: string };
      if (!redeemed.ok || !result.reader) {
        throw new Error(ERROR_COPY[result.error ?? ''] ?? `The blog refused the code (${result.error ?? redeemed.status}). Try again.`);
      }
      setReader(result.reader);
      setEmail('');
      setPhase('idle');
    } catch (err) {
      setError(err instanceof TypeError ? 'Could not reach the server. Check your connection and try again.' : (err as Error).message);
      setPhase(withEmail ? 'need-email' : 'idle');
    }
  };

  const signOut = async (): Promise<void> => {
    setPhase('working');
    setError(null);
    try {
      await fetch(READER_ME_PATH, { method: 'DELETE', credentials: 'same-origin' });
      setReader(null);
    } catch {
      setError('Sign-out did not reach the blog. Try again.');
    }
    setPhase('idle');
  };

  const busy = phase === 'working' || phase === 'loading';

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (reader) return;
        void signIn(phase === 'need-email' ? email.trim() : null);
      }}
    >
      <DialogHeader>
        <DialogTitle>Write as the owner</DialogTitle>
        <DialogDescription>
          Comments you write on the blog carry the owner badge only when this browser holds the owner’s reader session.
          This hands one over; nothing is typed into the blog.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-3 text-sm">
        <div className="flex h-5 items-center">
          {phase === 'loading' ? (
            <Skeleton className="h-4 w-56" />
          ) : reader ? (
            <p>
              Signed in as <strong className="font-medium">{reader.displayName}</strong>
              <span className="text-muted-foreground"> · {reader.provider} · {reader.grade}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">This browser is not signed in to the blog.</p>
          )}
        </div>
        {phase === 'need-email' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">
              First time: type the owner address once. site-api checks it against the configured hash and remembers it.
            </span>
            <Input
              type="email"
              autoComplete="email"
              placeholder="owner@example.com"
              value={email}
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
        )}
        {phase === 'demo' && (
          <p role="status" className="text-muted-foreground">
            Demo mode: the code was minted, but the demo has no reader service to trade it in, so this browser is not signed in.
            On the real portal this step finishes the sign-in.
          </p>
        )}
        {error && (
          <p role="alert" className="text-[hsl(var(--portal-danger))]">
            {error}
          </p>
        )}
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
        {reader ? (
          <>
            <Button type="button" variant="outline" render={<a href="/blog" target="_blank" rel="noreferrer" />}>
              Open the blog
              <ExternalLink />
            </Button>
            <Button type="button" variant="outline" loading={phase === 'working'} onClick={() => void signOut()}>
              Sign out of the blog
            </Button>
          </>
        ) : (
          <Button type="submit" loading={phase === 'working'} disabled={busy || (phase === 'need-email' && !email.trim())}>
            {phase === 'need-email' ? 'Sign in with this address' : 'Sign in as the owner'}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
