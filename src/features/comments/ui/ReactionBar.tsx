import * as React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { mountAvatarComb } from '@/features/comments/client/use-avatar-comb';
import { mountMagnetic } from '@/features/comments/client/use-magnetic';
import {
  challengeTurnstile,
  getTurnstileToken,
  releaseTurnstileToken,
  setTurnstileHost,
} from '@/features/comments/client/turnstile-token';
import { describeCommentFailure, readErrorSlug } from '@/features/comments/comment-error';
import {
  forgetReactionPass,
  hasReactionPass,
  rememberReactionPass,
} from '@/features/comments/client/reaction-pass';
import { seedNumber } from '@/features/comments/identity';
import { anonymousSeeds, drawnAvatarSvg } from '@/features/comments/drawn-avatar';
import { isAvatarSeed } from '@bunizao/contracts/comments';
import { ICONS } from '@/features/comments/icons';
import { resolveCommentsCopy } from '@/features/comments/copy';
import type { ClientEvidence, ReactionToggleInput } from '@bunizao/contracts/comments';
import { collectClientEvidence, warmClientEvidence } from '@/features/comments/client/client-evidence';
import { beginWriteTelemetry, type WriteTelemetry } from '@/features/comments/client/telemetry';
import type { Reactor } from '@/features/comments/types';
import { safeReaderAvatarUrl } from '@/features/comments/reader-avatar';
import { reactionsUrl } from '@/features/comments/api-urls';
import { fetchPrefetched } from '@/lib/api-prefetch';

interface Props {
  count: number;
  reacted?: boolean;
  reactors?: Reactor[];
  faceLimit?: number;
  /** Page locale. The island renders before any DOM exists to read it from. */
  locale?: string;
  /** Ghost post.id. When set, the bar loads its live tally from
      /api/v2/reactions on mount and persists presses through
      /api/v2/reactions/toggle; without it (lab page) presses stay local. */
  postId?: string;
  /** Turnstile site key for the invisible 'blog_reaction' widget. */
  siteKey?: string;
}

/** Live hearts on screen at once. Six bursts' worth -- past that they overlap
    into a smear anyway, and the DOM stops growing. */
const SPARK_LIMIT = 30;

/* Path data rather than lucide-react's own component: this heart is drawn
   twice more outside React (the comment like button, and the controller's
   client pass), and one table keeps the three in step. */
function Heart({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="blog-react__glyph"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS.heart }}
    />
  );
}

/** Server chips to stack faces. Only the same-origin avatar route survives. */
function toReactors(
  chips: { name: string; avatarUrl: string | null; avatarSeed?: number | null }[] | undefined,
): Reactor[] {
  return (chips ?? []).map((chip) => ({
    name: chip.name,
    avatar: safeReaderAvatarUrl(chip.avatarUrl),
    avatarSeed: isAvatarSeed(chip.avatarSeed) ? chip.avatarSeed : undefined,
  }));
}

const reactorSeed = (reactor: Reactor) => reactor.avatarSeed ?? seedNumber(reactor.name);

function DrawnFace({ seed }: { seed: number }) {
  // drawn-avatar.ts builds this from numbers and palette constants only.
  return <span className="blog-avatar-drawn size-full" dangerouslySetInnerHTML={{ __html: drawnAvatarSvg(seed) }} />;
}

/** One burst of hearts per press. Keyed by id so a fast double-tap stacks --
    which is now the whole point of a second press, since a like cannot be
    taken back. Capped in spawnSparks so a stuck pointer cannot mount an
    unbounded number of them. */
interface Spark {
  id: number;
  x: number;
  rot: number;
  delay: number;
}

export default function ReactionBar({
  count,
  reacted = false,
  reactors = [],
  faceLimit = 5,
  locale,
  postId,
  siteKey = '',
}: Props) {
  const t = resolveCommentsCopy(locale);
  const stack = React.useRef<HTMLDivElement>(null);
  const scope = React.useRef<HTMLDivElement>(null);
  const [summary, setSummary] = React.useState({ count, reacted, reactors });
  const [liked, setLiked] = React.useState(reacted);
  const [sparks, setSparks] = React.useState<Spark[]>([]);
  const [error, setError] = React.useState('');
  const sparkId = React.useRef(0);
  const inflight = React.useRef(false);
  const challenge = React.useRef<HTMLDivElement>(null);

  // /blog/[slug] is prerendered, so the island always ships with a zero
  // tally and reads the live one on mount -- from the request the page's
  // inline prefetch started while it parsed, when there is one.
  React.useEffect(() => {
    if (!postId) return;
    const key = `post:${postId}`;
    let cancelled = false;
    fetchPrefetched(reactionsUrl([key]))
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const live = json?.reactions?.[key]?.[0];
        if (cancelled || !live) return;
        setSummary({
          count: live.count,
          reacted: live.reacted,
          reactors: toReactors(live.reactors),
        });
        setLiked(live.reacted);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // The two faces of the card are the two counts, so each is derived once here
  // rather than animated from one into the other: `base` is the tally without
  // this reader, `mine` the same tally with them in it.
  const base = summary.reacted ? summary.count - 1 : summary.count;
  const mine = base + 1;
  const total = liked ? mine : base;
  const faces = summary.reactors.slice(0, faceLimit);
  // Likes with no reader behind them still get a face, after the named ones:
  // the count already says they happened, and a stack that shows only the
  // few readers who signed in reads as a room with one person in it.
  const anonymous = Math.max(0, Math.min(faceLimit - faces.length, total - summary.reactors.length));
  const anonSeeds = anonymousSeeds(
    anonymous,
    faces.filter((reactor) => !reactor.avatar).map(reactorSeed),
    postId ?? 'lab',
  );
  const overflow = Math.max(0, total - faces.length - anonymous);

  React.useEffect(() => {
    if (!stack.current) return;
    return mountAvatarComb(stack.current);
  }, [faces.length, anonymous, overflow]);

  // Somewhere for an interactive Turnstile challenge to open. Invisible mode
  // stays invisible right up until Cloudflare wants a human, and a widget
  // living in a hidden div can never show one -- the press would just fail.
  // Collapsed until then, so the bar keeps its size.
  React.useEffect(() => {
    if (challenge.current) setTurnstileHost('blog_reaction', challenge.current);
  }, []);

  // The pull rides the whole bar, not the pill, so the card starts drifting
  // before the cursor is over anything to press. It targets the flip wrapper —
  // see use-magnetic for why it cannot be the faces.
  React.useEffect(() => {
    if (!scope.current) return;
    return mountMagnetic(scope.current, { radius: 110, strength: 0.45, lift: -8, scale: 1.12 });
  }, []);

  function spawnSparks() {
    const burst = Array.from({ length: 5 }, (_, i) => ({
      id: sparkId.current++,
      x: (i - 2) * 7 + (i % 2 ? 3 : -3),
      rot: (i - 2) * 14,
      delay: i * 45,
    }));
    // Each burst clears itself after ~1.1s, so the ceiling only ever binds
    // under a held-down pointer or an autoclicker -- and there it binds hard.
    setSparks((current) => [...current, ...burst].slice(-SPARK_LIMIT));
    window.setTimeout(
      () => setSparks((current) => current.filter((s) => !burst.some((b) => b.id === s.id))),
      1100,
    );
  }

  const armedAt = React.useRef<number | undefined>(undefined);
  const taps = React.useRef(0);

  function armEvidence(): void {
    if (armedAt.current !== undefined) return;
    armedAt.current = Math.round(performance.now());
    warmClientEvidence();
  }

  /** One way. A like is applause, not a vote, and the toggle it used to be
      punished the reader who pressed again to mean it: the second press took
      the first one back. Every press now spends hearts; only the first one
      spends a request. */
  async function like() {
    armEvidence();
    taps.current += 1;
    spawnSparks();
    if (liked || inflight.current) return;
    setError('');
    setLiked(true);
    if (!postId) return;

    inflight.current = true;
    const telemetry = beginWriteTelemetry('reaction', 'blog_reaction');
    const submittedEvidence = collectClientEvidence({
      kind: 'reaction',
      armedAt: armedAt.current,
      tapsThisPage: taps.current,
      turnstileAction: 'blog_reaction',
    });
    try {
      await send(false, submittedEvidence, telemetry);
    } finally {
      inflight.current = false;
    }
  }

  /** One press, one write. `retried` marks the resend that follows a solved
      challenge, so a second refusal ends here instead of looping. */
  async function send(retried: boolean, submittedEvidence: Promise<ClientEvidence>, telemetry: WriteTelemetry): Promise<void> {
    if (!postId) return;
    try {
      // Before every send, not once on mount: the comment rows share this
      // widget, and the last one to send took the container down into the
      // thread with it. An interaction-only widget opens its challenge
      // wherever the container is sitting, so a stale host means the reader is
      // asked for a checkbox somewhere they are not looking -- the solve times
      // out, the token comes back empty, and the like is refused for a
      // question nobody was shown.
      if (challenge.current) setTurnstileHost('blog_reaction', challenge.current);
      // A pass earned by an earlier like stands in for the token: no solve,
      // no widget, nothing for Cloudflare to escalate on.
      const viaPass = hasReactionPass();
      const turnstileToken = viaPass ? '' : await getTurnstileToken(siteKey, 'blog_reaction');
      if (!viaPass) telemetry.captureChallenges();
      const response = await fetch('/api/v2/reactions/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetType: 'post',
          targetId: postId,
          reacted: true,
          turnstileToken,
          ...(await submittedEvidence),
        } satisfies ReactionToggleInput),
      });
      if (!viaPass) releaseTurnstileToken('blog_reaction');

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const failure = describeCommentFailure(response.status, readErrorSlug(body), t.submitError);
        // The pass this browser remembered is not one the server still holds
        // (cookies cleared, or it lapsed on a clock we cannot see). Not a
        // reason to put a checkbox in front of anyone yet: forget it and go
        // once more the ordinary way, with a silent token.
        if (failure.code === 'BOT' && viaPass) {
          forgetReactionPass();
          await send(retried, submittedEvidence, telemetry);
          return;
        }
        // Cloudflare wants a human and the silent widget could not settle it.
        // Say so, draw a real checkbox in the slot under the bar, and send the
        // like again the moment it is answered. The heart stays filled while
        // the reader answers -- they pressed it, and nothing has refused them
        // yet that they can still act on.
        if (failure.code === 'BOT' && !retried) {
          setError(failure.message);
          const token = await challengeTurnstile(siteKey, 'blog_reaction');
          telemetry.captureChallenges();
          if (token) {
            setError('');
            await send(true, submittedEvidence, telemetry);
            return;
          }
          telemetry.finish('challenge_failed');
        }
        setLiked(false);
        setError(failure.code === 'BOT' ? failure.message : t.reactError);
        telemetry.finish(failure.code === 'BOT' ? 'challenge_failed' : 'http_error');
        return;
      }

      const json = await response.json();
      telemetry.finish('accepted');
      rememberReactionPass(json?.passUntil);
      const live = json?.reaction;
      if (live && typeof live.count === 'number') {
        // The response carries the fresh reactor list, so a signed-in reader's
        // own face lands in the stack now instead of as an anonymous one.
        setSummary((current) => ({
          ...current,
          count: live.count,
          reacted: live.reacted,
          reactors: live.reactors ? toReactors(live.reactors) : current.reactors,
        }));
        setLiked(Boolean(live.reacted));
      }
    } catch {
      telemetry.finish('network_error');
      setLiked(false);
      setError(t.reactError);
    }
  }

  return (
    <div ref={scope} className="blog-react" data-pagefind-ignore>
      <div className="blog-react__row">
        {/* Liking a post asks for no account. It is a count, not a signature: the
            card used to turn over to a Sign in door on the first press, which
            charged a reader an identity for one bit of feedback. It still turns
            over -- that was the good part -- but the far side is now the liked
            state itself, so the flip IS the feedback rather than a toll gate.
            Anonymous presses are counted, and each one puts a nameless
            generated face in the stack.

            The turn happens once. Nothing here turns back: see like(). */}
        <div className="blog-react__pull" data-magnetic>
          {/* Outside the card, so the burst happens in flat screen space over a
              face that is mid-rotation. */}
          <span className="blog-react__sparks" aria-hidden="true">
            {sparks.map((spark) => (
              <svg
                key={spark.id}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="blog-react__spark"
                style={{
                  ['--spark-x' as string]: `${spark.x}px`,
                  ['--spark-rot' as string]: `${spark.rot}deg`,
                  animationDelay: `${spark.delay}ms`,
                }}
                dangerouslySetInnerHTML={{ __html: ICONS.heart }}
              />
            ))}
          </span>

          <button
            type="button"
            onClick={like}
            aria-pressed={liked}
            aria-label={`${liked ? t.reactDone : t.reactAdd}: ${total}`}
            className={cn('blog-react__card', liked && 'is-flipped')}
          >
            {/* Both faces are always mounted and stacked in one grid cell, which
                is also what keeps them the same width when the two counts have a
                different number of digits. */}
            <span className="blog-react__pill" aria-hidden={liked}>
              <Heart />
              <span className="blog-react__count">{base}</span>
            </span>
            <span className="blog-react__pill blog-react__pill--liked" aria-hidden={!liked}>
              <Heart filled />
              <span className="blog-react__count">{mine}</span>
            </span>
          </button>
        </div>

        {total > 0 && (
          /* Tighter than the component default: the faces have to read as one
             overlapping stack, not a row that happens to touch. Paint order runs
             left to right via an explicit z-index, so each face clips the one
             before it.

             No heart badge on each face. Every face in this stack reacted — that
             is what the stack IS — so a heart on all five says nothing the row
             does not already say, and the overlap clips each one to a crescent
             with its glyph hidden underneath the next circle. It read as a
             rendering fault, which is an expensive way to repeat yourself. */
          <AvatarGroup ref={stack} className="blog-react__stack -space-x-[9px]">
            {faces.map((reactor, i) => (
              <Avatar
                key={reactor.name}
                size="default"
                data-comb-item
                className="blog-react__avatar"
                style={{
                  zIndex: i,
                  ['--entry-delay' as string]: `${i * 60}ms`,
                }}
              >
                {reactor.avatar && <AvatarImage src={reactor.avatar} alt={reactor.name} />}
                <AvatarFallback>
                  <DrawnFace seed={reactorSeed(reactor)} />
                </AvatarFallback>
                {/* Hover names the face instead of pulling it clear of the stack:
                    the overlap is the point, and a face that jumps to the front
                    reshuffles the row every time the pointer crosses it. Hidden
                    from assistive tech — the image alt already carries the name.
                    Sits below the circles, so it is never clipped by the next
                    face's stacking context. */}
                <span className="blog-react__name" aria-hidden="true">
                  {reactor.name}
                </span>
              </Avatar>
            ))}
            {anonSeeds.map((seed, j) => {
              const i = faces.length + j;
              return (
                <Avatar
                  key={`anon-${j}`}
                  size="default"
                  data-comb-item
                  className="blog-react__avatar"
                  style={{ zIndex: i, ['--entry-delay' as string]: `${i * 60}ms` }}
                >
                  <AvatarFallback>
                    <DrawnFace seed={seed} />
                  </AvatarFallback>
                  <span className="blog-react__name" aria-hidden="true">
                    {t.reactAnonymous}
                  </span>
                </Avatar>
              );
            })}
            {overflow > 0 && (
              <AvatarGroupCount
                data-comb-item
                className="blog-react__avatar blog-react__more"
                style={{
                  zIndex: faces.length + anonymous,
                  ['--entry-delay' as string]: `${(faces.length + anonymous) * 60}ms`,
                }}
              >
                +{overflow}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
        )}
        {error && <p className="blog-react__error" role="status">{error}</p>}
      </div>

      {/* Out of the row above, not in it. An invisible Turnstile draws
          nothing until Cloudflare asks a question, but a zero-width flex
          item still takes the row's 18px gap -- which pushed the heart
          18px right of the prose, the colophon rule and the Comments
          heading it is supposed to line up with. */}
      <div ref={challenge} className="blog-compose__turnstile" />
    </div>
  );
}
