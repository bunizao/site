import * as React from 'react';
import { Check, Copy, KeyRound, RefreshCw } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/coss';
import { adminApiEndpoint } from './api';

interface OwnerCodeResult {
  code: string;
  expiresAt: string;
}

export default function OwnerAccessPanel() {
  const [email, setEmail] = React.useState('');
  const [needsEmail, setNeedsEmail] = React.useState(false);
  const [result, setResult] = React.useState<OwnerCodeResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const generate = React.useCallback(async () => {
    setBusy(true);
    setCopied(false);
    setError(null);
    try {
      const response = await fetch(adminApiEndpoint('/comments/owner-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email } : {}),
      });
      const payload = await response.json().catch(() => ({})) as Partial<OwnerCodeResult> & { error?: string };
      if (response.status === 400 && payload.error === 'owner_email_required') {
        setNeedsEmail(true);
        throw new Error('Enter the owner email once to establish the reader identity.');
      }
      if (response.status === 400 && payload.error === 'owner_email_mismatch') {
        setNeedsEmail(true);
        throw new Error('That address does not match the configured owner identity.');
      }
      if (!response.ok || !payload.code || !payload.expiresAt) {
        throw new Error('Could not generate a code. Try again.');
      }
      setResult({ code: payload.code, expiresAt: payload.expiresAt });
      setNeedsEmail(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not generate a code. Try again.');
    } finally {
      setBusy(false);
    }
  }, [email]);

  const copy = React.useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
    } catch {
      setError('Clipboard access failed. Select and copy the code manually.');
    }
  }, [result]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="portal-card-title"><KeyRound size={14} /> Author access</CardTitle>
        <CardDescription>
          Mint a random, single-use code for the small key beside the public comment name field.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {needsEmail && (
          <div className="space-y-1.5">
            <Label htmlFor="owner-access-email">Owner email</Label>
            <Input
              id="owner-access-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Needed once during initial setup"
              autoComplete="email"
            />
          </div>
        )}

        {result && (
          <div className="space-y-2" data-owner-code-result>
            <div className="flex gap-2">
              <Input readOnly value={result.code} className="font-mono text-xs" aria-label="One-time author code" />
              <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="portal-list-meta">
              Expires at {new Date(result.expiresAt).toLocaleTimeString()} and becomes invalid immediately after use.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <Button type="button" onClick={() => void generate()} disabled={busy}>
          <RefreshCw size={14} className={busy ? 'animate-spin' : undefined} />
          {busy ? 'Generating…' : result ? 'Replace code' : 'Generate one-time code'}
        </Button>
      </CardContent>
    </Card>
  );
}
