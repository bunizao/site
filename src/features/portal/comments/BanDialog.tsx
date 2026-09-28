import * as React from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminBanInput,
  AdminBanKeyType,
  AdminBanPreview,
  AdminBanPreviewInput,
  AdminBanRestoreResult,
  AdminBanResult,
  AdminCommentActor,
  AdminSourceKeyType,
} from '@bunizao/contracts';
import { Button } from '@/components/coss/button';
import { Checkbox } from '@/components/coss/checkbox';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/coss/dialog';
import { Input } from '@/components/coss/input';
import { Kbd } from '@/components/coss/kbd';
import { Label } from '@/components/coss/label';
import { Skeleton } from '@/components/coss/skeleton';
import { Switch } from '@/components/coss/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/coss/toggle-group';
import { toastManager } from '@/components/coss/toast';
import { cn } from '@/lib/utils';
import { apiSend, describeError } from '../app/api';
import { forgetUndo, registerUndo } from '../app/undo';
import { CHOICE_ITEM } from '../moderation/ui';
import {
  actorKeys,
  type BanDelete,
  deleteScope,
  fingerprintSweepKey,
  impactHold,
  namesOnePerson,
  shortHandle,
  sourceLabel,
} from './model';

/* One step: the keys that name one person arrive ticked (the session, and
   the address when it was verified at writing), the impact below them
   updates as ticks change, and the ban button already has focus, so B then
   Enter bans the obvious keys and deletes the comment the ban came from,
   at once. A key other readers can share (a subnet, a network, a domain, a
   device fingerprint) is never ticked for you, pivots included: it takes a
   deliberate tick, and Ban waits until the impact of exactly the ticked
   keys is on screen. So does any sweep. Undo in the receipt lifts the bans
   and restores everything deleted. */

export const SHARED_WARNING: Partial<Record<AdminBanKeyType, string>> = {
  email: 'An unconfirmed address can be typed by anybody.',
  ip: 'Other readers on the same network share this address.',
  fp: 'Unrelated readers can share this network and browser signature.',
  client_fp: 'Device fingerprints collide across devices. A match is not one person.',
  domain: 'Blocks every comment linking to this domain, legitimate ones included.',
  ip24: 'Blocks the whole subnet: offices, carrier NATs, campuses.',
  asn: 'Blocks an entire network operator.',
  email_domain: 'Blocks every address at this domain.',
};

export const EXPIRY = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'Never' },
];

/** `commentId` is the comment the ban was raised from, which it deletes by
    default; a ban raised from a reaction has none. */
export type BanTarget =
  | { kind: 'actor'; actor: AdminCommentActor; commentId?: string | null }
  | { kind: 'source'; type: AdminSourceKeyType; value: string; ban: AdminBanKeyType; display?: string | null; emailDomainPublishedComments?: number | null };

const DELETE_LABELS: Record<BanDelete, string> = {
  comment: 'This comment',
  fingerprint: 'Same fingerprint',
  matched: 'Everything matched',
  none: 'Nothing',
};

/** What a ban can delete, in the order 1, 2, 3 pick them. Nothing is last
    everywhere, so the digit for it moves least. */
function deleteModes(target: BanTarget): BanDelete[] {
  if (target.kind === 'source') return ['matched', 'none'];
  return target.commentId ? ['comment', 'fingerprint', 'none'] : ['fingerprint', 'none'];
}

interface Choice {
  id: string;
  ban: AdminBanKeyType;
  label: string;
  value: string;
  display: string;
  banned: boolean;
}

function choicesFor(target: BanTarget): Choice[] {
  if (target.kind === 'source') {
    return [{
      id: `${target.ban}:${target.value}`,
      ban: target.ban,
      label: sourceLabel(target.type),
      value: target.value,
      display: target.display ?? shortHandle(target.value),
      banned: false,
    }];
  }
  const actor = target.actor;
  return actorKeys(actor)
    .filter((key) => key.ban !== null && !(key.id === 'clientFpStable' && actor.keys.clientFp))
    .map((key) => ({
      id: `${key.ban}:${key.value}`,
      ban: key.ban!,
      label: key.label,
      value: key.value,
      display: key.id === 'ip' && actor.ip ? actor.ip : key.id === 'email' && actor.email ? actor.email : shortHandle(key.value),
      banned: key.banned,
    }));
}

/** Memoized: the comment log re-renders on every j, and a closed dialog
    should not. `onDeletesComment` takes the target's comment off the screen
    the way D does, and returns what puts it back. `onSwept` runs once the
    lists have refetched after a sweep or its undo: rows the screen cannot
    name left or came back. */
export const BanDialog = React.memo(function BanDialog({ target, open, onOpenChange, onDeletesComment, onSwept }: {
  target: BanTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeletesComment?: (id: string) => () => void;
  onSwept?: () => void;
}) {
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  // After a delete, focus belongs to the row the list moved on to, not to
  // the row or button that opened this.
  const deleted = React.useRef(false);
  const finalFocus = React.useCallback(() => {
    const back = !deleted.current;
    deleted.current = false;
    return back;
  }, []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg" initialFocus={confirmRef} finalFocus={finalFocus}>
        {target && (
          <BanForm
            key={JSON.stringify(target.kind === 'actor' ? [target.actor.keys, target.commentId ?? null] : target)}
            target={target}
            open={open}
            confirmRef={confirmRef}
            onDeletesComment={onDeletesComment && ((id) => {
              deleted.current = true;
              return onDeletesComment(id);
            })}
            onSwept={onSwept}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
});

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** `12 comments and 3 reactions`, or null when both are zero. */
function deletedText(counts: { comments: number; reactions: number }): string | null {
  const parts = [
    counts.comments > 0 && plural(counts.comments, 'comment'),
    counts.reactions > 0 && plural(counts.reactions, 'reaction'),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' and ') : null;
}

/** The preview takes the same fields the ban will, so what it shows is
    what Ban does. */
function useBanPreview(input: AdminBanPreviewInput) {
  return useQuery({
    queryKey: ['bans', 'preview', input],
    queryFn: () => apiSend<AdminBanPreview>('POST', 'admin/bans/preview', input),
    enabled: input.keys.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

interface ImpactProps {
  mode: BanDelete;
  sweep: { label: string; value: string } | null;
  /** The mode to suggest when a sweep is refused. */
  fallback: BanDelete;
}

function Impact({ keys, preview, ...props }: ImpactProps & {
  keys: AdminBanInput['keys'];
  preview: ReturnType<typeof useBanPreview>;
}) {
  // Fixed height, sized for the longest sweep, so neither a tick nor a
  // mode moves the controls: the sheet on a phone grows upwards, under
  // the finger.
  return (
    <div className="flex h-31 flex-col justify-center gap-1 rounded-lg bg-muted px-3 text-[13px] leading-5 max-sm:h-38" aria-live="polite">
      {keys.length === 0 ? (
        <p className="text-muted-foreground">Tick at least one key.</p>
      ) : preview.isPending ? (
        <>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </>
      ) : preview.isError ? (
        <p className="text-muted-foreground">
          The impact check failed: {describeError(preview.error)}{' '}
          <button type="button" className="text-foreground underline underline-offset-2" onClick={() => void preview.refetch()}>
            Check again
          </button>
        </p>
      ) : (
        <ImpactLines data={preview.data} fetching={preview.isFetching} {...props} />
      )}
    </div>
  );
}

/** "1 published, 3 held": every status present, so the parts add up. */
function statusMix(comments: AdminBanPreview['comments']): string {
  const parts = (['published', 'held', 'rejected', 'deleted'] as const)
    .filter((status) => comments[status] > 0)
    .map((status) => `${comments[status]} ${status}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function ImpactLines({ data, fetching, mode, sweep, fallback }: ImpactProps & {
  data: AdminBanPreview;
  fetching: boolean;
}) {
  const lead = cn('text-foreground', fetching && 'text-muted-foreground');
  const matches = (
    <p className={lead}>
      Matches {plural(data.comments.total, 'comment')}{statusMix(data.comments)}
      {' '}and {plural(data.reactions, 'reaction')} from {plural(data.sessions, 'session')}
      {data.accounts > 0 ? ` and ${plural(data.accounts, 'account')}` : ''} in {data.windowDays} days.
    </p>
  );
  if (mode === 'comment' || mode === 'none') {
    return (
      <>
        {matches}
        <p className="text-muted-foreground">
          {mode === 'comment'
            ? 'Deletes this comment. Restorable for 30 days.'
            : data.comments.published > 3
              ? `${data.comments.published} published comments is a lot for one person. Check no key is shared.`
              : 'Existing comments stay. New ones are held silently.'}
        </p>
      </>
    );
  }
  if (!data.purgeAllowed) {
    return (
      <>
        {matches}
        <p className="text-muted-foreground">
          Too much to delete at once: the limit is {data.purgeLimit}. Untick a shared key or pick {DELETE_LABELS[fallback]}.
        </p>
      </>
    );
  }
  // Every number here is what the ban removes, not what the keys reach:
  // spared rows are neither deleted nor counted. A site-api without the
  // breakdown falls back to the reach.
  const { purge } = data;
  const spared = data.spared ?? 0;
  const others = purge.otherAccounts ?? 0;
  return (
    <>
      <p className={lead}>
        Deletes {plural(purge.comments, 'comment')}{purge.published ? ` (${purge.published} published)` : ''}
        {' '}and {plural(purge.reactions, 'reaction')} from {plural(purge.sessions ?? data.sessions, 'session')}.
      </p>
      <p className="text-muted-foreground">
        {[
          mode === 'fingerprint' && sweep && `${sweep.label} ${shortHandle(sweep.value)}.`,
          spared > 0 ? `Spares ${plural(spared, 'published comment')} by signed-in readers.` : 'Restorable for 30 days.',
        ].filter(Boolean).join(' ')}
      </p>
      {others > 0 && (
        <p className="text-[hsl(var(--portal-danger))]">
          Also deletes from {plural(others, 'other reader account')}. Check they are the same person.
        </p>
      )}
    </>
  );
}

function BanForm({ target, open, confirmRef, onDeletesComment, onSwept, onDone }: {
  target: BanTarget;
  open: boolean;
  confirmRef: React.RefObject<HTMLButtonElement | null>;
  onDeletesComment?: (id: string) => () => void;
  onSwept?: () => void;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const actor = target.kind === 'actor' ? target.actor : null;
  const commentId = target.kind === 'actor' ? target.commentId ?? null : null;
  const verified = actor?.authAtWrite === 'verified';
  const choices = React.useMemo(() => choicesFor(target), [target]);
  const published = target.kind === 'source' ? target.emailDomainPublishedComments : actor?.emailDomainPublishedComments;
  const domainLocked = published === null || published === undefined || published > 10;
  const modes = deleteModes(target);
  const sweepKey = React.useMemo(() => (actor ? fingerprintSweepKey(actor) : null), [actor]);
  // The mode to fall back to when a sweep is refused or its check fails.
  const fallback: BanDelete = commentId ? 'comment' : 'none';

  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set(
    choices
      .filter((choice) => !choice.banned && namesOnePerson(choice.ban, verified))
      .map((choice) => choice.id),
  ));
  const [note, setNote] = React.useState('');
  // Seven days, as site-api gives a ban that names no expiry.
  const [expiry, setExpiry] = React.useState('7');
  // The comment the ban came from goes with it; a pivot or a reaction
  // deletes nothing unless asked.
  const [mode, setMode] = React.useState<BanDelete>(commentId ? 'comment' : 'none');
  const [revoke, setRevoke] = React.useState(false);

  const selected = choices.filter((choice) => ticked.has(choice.id) && !(choice.ban === 'email_domain' && domainLocked));
  const keys = React.useMemo(
    () => selected.map((choice) => ({ type: choice.ban, value: choice.value })),
    // `selected` is rebuilt every render; its ids are the identity.
    [selected.map((choice) => choice.id).join('|')],
  );
  const revokeReaderId = revoke && actor ? actor.readerId : null;
  const scope = deleteScope(mode, keys, sweepKey, commentId);
  const preview = useBanPreview({ keys, revokeReaderId, ...scope });
  const sweeping = mode === 'fingerprint' || mode === 'matched';
  // A shared key or a sweep waits for the impact of exactly this input,
  // not the last input's impact still on screen. A shared key pressed blind
  // may ban a whole subnet; a sweep pressed early would read "Banned" for
  // a write site-api may then refuse. The open comment alone does not wait.
  const hold = impactHold(selected.map((choice) => choice.ban), verified, mode);
  const exact = preview.data !== undefined && !preview.isPlaceholderData ? preview.data : null;
  const impactUnknown = hold !== null && exact === null;
  const overLimit = sweeping && preview.data !== undefined && !preview.data.purgeAllowed;
  const blocked = keys.length === 0
    ? 'Tick at least one key.'
    : impactUnknown
      ? preview.isError
        ? `The impact check failed. Check again or ${hold === 'shared' ? 'untick the shared keys' : `pick ${DELETE_LABELS[fallback]}`}.`
        : sweeping ? 'Checking what this deletes.' : 'Checking what the ban reaches.'
      : overLimit ? 'Too much to delete at once.' : null;

  // 1-3 pick what the ban deletes, as 1-5 pick a reject reason. Caught on
  // the window from the commit that opens the dialog, so a digit typed
  // right after B lands here and not on the page's status keys.
  const pick = React.useRef(setMode);
  const enabled = modes.filter((each) => each !== 'fingerprint' || sweepKey !== null);
  React.useLayoutEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement && event.target.type === 'text') return;
      const next = /^[1-9]$/.test(event.key) ? modes[Number(event.key) - 1] : undefined;
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      if (enabled.includes(next)) pick.current(next);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, modes.join('|'), enabled.join('|')]);

  function apply(): void {
    if (blocked) return;
    const input: AdminBanInput = {
      keys,
      note: note.trim() || undefined,
      expiresAt: expiry === 'never' ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString(),
      ...scope,
      revokeReaderId,
    };
    // The comment leaves the screen in this frame, as it does on D.
    const putBack = input.removeCommentId ? onDeletesComment?.(input.removeCommentId) ?? null : null;
    onDone();
    const request = apiSend<AdminBanResult>('POST', 'admin/bans', input);
    const banned = `Banned ${plural(keys.length, 'key')}`;
    const expected = mode === 'comment' ? 'the comment' : sweeping && exact ? deletedText(exact.purge) : null;
    let undone = false;
    const toastId: string = toastManager.add({
      type: 'success',
      title: expected ? `${banned} and deleted ${expected}` : banned,
      description: mode === 'none'
        ? 'Their next comments are held silently.'
        : 'Restorable for 30 days. Their next comments are held silently.',
      timeout: 8000,
      actionProps: {
        children: 'Undo',
        onClick: () => undo(),
      },
      onRemove: () => forgetUndo(toastId),
    });
    // Everything a ban or its undo changes, refetched; then a sweep hands
    // the screen the server's rows.
    const refresh = (): void => {
      void Promise.all(['comments', 'reactions', 'bans'].map((key) => client.invalidateQueries({ queryKey: [key] })))
        .then(() => sweeping && onSwept?.());
    };
    const undo = (): void => {
      if (undone) return;
      undone = true;
      putBack?.();
      void request
        .then(async (result) => {
          await Promise.all(result.bans.map((ban) =>
            apiSend('DELETE', `admin/bans/${encodeURIComponent(ban.keyType)}/${encodeURIComponent(ban.keyValue)}`)));
          // The operation holds every row the ban deleted, the one comment
          // included.
          const restored = result.operation && result.purged.comments + result.purged.reactions > 0
            ? await apiSend<AdminBanRestoreResult>('POST', `admin/bans/operations/${encodeURIComponent(result.operation.id)}/restore`)
            : null;
          const back = restored ? deletedText(restored.operation.restored) : null;
          toastManager.add({
            type: 'success',
            title: back ? `Ban lifted and ${mode === 'comment' ? 'the comment' : back} restored` : 'Ban lifted',
            description: input.revokeReaderId ? 'The reader account stays banned. Unban it from Bans.' : undefined,
            timeout: 4000,
          });
        })
        .catch((error) => toastManager.add({ type: 'error', title: 'The ban was not lifted', description: `${describeError(error)} Lift it from Bans.` }))
        .finally(refresh);
    };
    registerUndo(toastId, undo);
    request.then(
      (result) => {
        if (!undone && input.removeCommentId && result.purged.comments === 0) {
          // A site-api older than this dialog bans without deleting, and a
          // comment someone deleted first is not deleted again.
          putBack?.();
          toastManager.update(toastId, { type: 'warning', title: banned, description: 'The comment was not deleted. Press D to delete it.' });
        } else if (!undone && sweeping) {
          toastManager.update(toastId, { title: `${banned}${deletedText(result.purged) ? ` and deleted ${deletedText(result.purged)}` : ''}` });
        }
        refresh();
      },
      (error) => {
        toastManager.close(toastId);
        if (!undone) putBack?.();
        toastManager.add({ type: 'error', title: 'The ban was not saved', description: `${describeError(error)} Press B to open it again.` });
      },
    );
  }

  const title = target.kind === 'source' ? `Ban this ${sourceLabel(target.type).toLowerCase()}` : 'Ban this writer';
  const deletes = sweeping && exact ? exact.purge.comments : 0;

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Their comments are held and their reactions go nowhere. Nothing tells them.</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <fieldset className="flex flex-col">
          <legend className="sr-only">Keys to ban</legend>
          {choices.length === 0 && <p className="text-muted-foreground text-sm">This comment carries no key a ban can hold.</p>}
          {choices.map((choice) => {
            const locked = choice.ban === 'email_domain' && domainLocked;
            const warning = choice.ban === 'email' && verified
              ? null
              : choice.ban === 'email_domain'
                ? published === null || published === undefined
                  ? 'Unavailable: the published-comment count for this domain did not load.'
                  : `${published} published comments here in 90 days.${locked ? ' Domain bans are off above 10.' : ''}`
                : SHARED_WARNING[choice.ban];
            return (
              <label
                key={choice.id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50 has-disabled:cursor-not-allowed"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={ticked.has(choice.id)}
                  disabled={locked || choice.banned}
                  onCheckedChange={(value) => setTicked((current) => {
                    const next = new Set(current);
                    if (value) next.add(choice.id);
                    else next.delete(choice.id);
                    return next;
                  })}
                />
                <span className="flex min-w-0 flex-1 flex-col text-[13px] leading-5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-medium">{choice.label}</span>
                    <code className="truncate font-mono text-muted-foreground text-xs" title={choice.value}>{choice.display}</code>
                    {choice.banned && <span className="shrink-0 text-[hsl(var(--portal-danger))] text-xs">Already banned</span>}
                  </span>
                  {warning && <span className="text-muted-foreground text-xs">{warning}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Label id="ban-delete-label" className="gap-2 text-[13px]">
              Delete
              <Kbd className="pointer-coarse:hidden">1–{modes.length}</Kbd>
            </Label>
            <ToggleGroup
              aria-labelledby="ban-delete-label"
              value={[mode]}
              onValueChange={(value) => value[0] && setMode(value[0] as BanDelete)}
              variant="outline"
              size="sm"
            >
              {modes.map((each) => (
                <ToggleGroupItem
                  key={each}
                  value={each}
                  disabled={!enabled.includes(each)}
                  className={cn(CHOICE_ITEM, 'pointer-coarse:h-11')}
                >
                  {DELETE_LABELS[each]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {modes.includes('fingerprint') && !sweepKey && (
            <p className="text-muted-foreground text-xs">Same fingerprint is off: this writer sent no fingerprint.</p>
          )}
        </div>

        <Impact
          keys={keys}
          preview={preview}
          mode={mode}
          sweep={sweepKey}
          fallback={fallback}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Label id="ban-expiry-label" className="text-[13px]">Expires after</Label>
          <ToggleGroup
            aria-labelledby="ban-expiry-label"
            value={[expiry]}
            onValueChange={(value) => value[0] && setExpiry(value[0])}
            variant="outline"
            size="sm"
          >
            {EXPIRY.map((choice) => (
              <ToggleGroupItem key={choice.value} value={choice.value} className={cn(CHOICE_ITEM, 'pointer-coarse:h-11')}>{choice.label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Input
          aria-label="Note to yourself"
          value={note}
          placeholder="Note to yourself, for the ban list"
          onChange={(event) => setNote(event.target.value)}
        />

        {actor?.readerId && verified && (
          <label className="flex min-h-11 items-center justify-between gap-4 text-[13px]">
            <span className="flex flex-col">
              <span className="font-medium">Ban their reader account too</span>
              <span className="text-muted-foreground text-xs">They wrote this signed in. This blocks the account, not just this device.</span>
            </span>
            <Switch checked={revoke} onCheckedChange={setRevoke} />
          </label>
        )}
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="ghost" className="pointer-coarse:h-11" onClick={onDone}>
          Cancel
        </Button>
        <Button
          ref={confirmRef}
          type="submit"
          variant="destructive"
          aria-disabled={blocked ? true : undefined}
          title={blocked ?? undefined}
          className="aria-disabled:opacity-64 pointer-coarse:h-11"
        >
          Ban {plural(keys.length, 'key')}{mode === 'none' ? '' : ` and delete${deletes > 0 ? ` ${deletes}` : ''}`}
        </Button>
      </DialogFooter>
    </form>
  );
}
