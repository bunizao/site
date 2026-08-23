import * as React from 'react';
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { mountMagnetic } from '@/features/comments/client/use-magnetic';
import type { Reactor } from '@/features/comments/types';

interface Props {
  count: number;
  reacted?: boolean;
  signedIn?: boolean;
  reactors?: Reactor[];
  faceLimit?: number;
}

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? '')
    .join('');
}

/** One burst of hearts per like. Keyed by id so a fast double-tap stacks. */
interface Spark {
  id: number;
  x: number;
  rot: number;
  delay: number;
}

export default function ReactionBar({
  count,
  reacted = false,
  signedIn = false,
  reactors = [],
  faceLimit = 5,
}: Props) {
  const scope = React.useRef<HTMLDivElement>(null);
  const [liked, setLiked] = React.useState(reacted);
  const [flipped, setFlipped] = React.useState(false);
  const [sparks, setSparks] = React.useState<Spark[]>([]);
  const sparkId = React.useRef(0);

  const total = count + (liked && !reacted ? 1 : 0) - (!liked && reacted ? 1 : 0);
  const faces = reactors.slice(0, faceLimit);
  const overflow = Math.max(0, total - faces.length);

  React.useEffect(() => {
    if (!scope.current) return;
    return mountMagnetic(scope.current, { radius: 110, strength: 0.45, lift: -8, scale: 1.12 });
  }, []);

  // Turning the pill back over is a dismissal, so it answers to the two things
  // every dismissal answers to.
  React.useEffect(() => {
    if (!flipped) return;
    const away = (event: MouseEvent) => {
      if (!scope.current?.contains(event.target as Node)) setFlipped(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFlipped(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [flipped]);

  function toggle() {
    // Signed out the pill is not inert — pressing it turns the card over and
    // offers the way in. Hover would strand every touch device.
    if (!signedIn) {
      setFlipped(true);
      return;
    }
    const next = !liked;
    setLiked(next);
    if (!next) return;

    const burst = Array.from({ length: 5 }, (_, i) => ({
      id: sparkId.current++,
      x: (i - 2) * 7 + (i % 2 ? 3 : -3),
      rot: (i - 2) * 14,
      delay: i * 45,
    }));
    setSparks((current) => [...current, ...burst]);
    window.setTimeout(
      () => setSparks((current) => current.filter((s) => !burst.some((b) => b.id === s.id))),
      1100,
    );
  }

  return (
    <div ref={scope} className="blog-react" data-pagefind-ignore>
      {/* Signed out, pressing the pill turns it over and offers the way in, so
          the bar never has to carry a line of "sign in to react" copy beside
          it. Both faces share a min-width, which is what keeps the flip from
          resizing the row mid-turn. */}
      <div className={cn('blog-react__flip', flipped && 'is-flipped')}>
        <div className="blog-react__faces" data-magnetic>
          <div className="blog-react__face-front">
            <button
              type="button"
              onClick={toggle}
              aria-pressed={signedIn ? liked : undefined}
              aria-label={
                signedIn ? (liked ? 'Remove your reaction' : 'Like this post') : 'Sign in to react'
              }
              tabIndex={flipped ? -1 : 0}
              className={cn('blog-react__pill', liked && 'is-liked')}
            >
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
                  >
                    <path d={HEART_PATH} />
                  </svg>
                ))}
              </span>
              <svg
                viewBox="0 0 24 24"
                fill={liked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.5"
                className="blog-react__glyph"
                aria-hidden="true"
              >
                <path d={HEART_PATH} />
              </svg>
              {/* Slot-machine roller: both values are always mounted and the
                  column slides, so the digits travel instead of blinking. */}
              <span className="blog-react__roller">
                <span
                  className="blog-react__reel"
                  style={{ transform: `translateY(${liked === reacted ? '0' : '-1.5em'})` }}
                >
                  <span>{count}</span>
                  <span>{total}</span>
                </span>
              </span>
            </button>
          </div>

          <div className="blog-react__face-back">
            <button type="button" className="blog-react__signin" tabIndex={flipped ? 0 : -1}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2A10 10 0 0 0 8.84 21.5c.5.08.66-.23.66-.5v-1.69C6.73 19.91 6.14 18 6.14 18A2.69 2.69 0 0 0 5 16.5c-.91-.62.07-.6.07-.6a2.1 2.1 0 0 1 1.53 1 2.15 2.15 0 0 0 2.91.83 2.16 2.16 0 0 1 .63-1.34c-2.14-.24-4.52-1.07-4.52-4.91a3.86 3.86 0 0 1 1-2.71 3.58 3.58 0 0 1 .1-2.64s.84-.27 2.75 1.02a9.63 9.63 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02a3.58 3.58 0 0 1 .1 2.64 3.86 3.86 0 0 1 1 2.71c0 3.85-2.34 4.67-4.57 4.91a2.39 2.39 0 0 1 .69 1.85V21c0 .27.16.59.67.5A10 10 0 0 0 12 2Z" />
              </svg>
              Sign in
            </button>
          </div>
        </div>
      </div>

      {faces.length > 0 && (
        <AvatarGroup className="blog-react__stack">
          {faces.map((reactor, i) => (
            <Avatar
              key={reactor.name}
              size="lg"
              data-magnetic
              className="blog-react__avatar"
              style={{ ['--entry-delay' as string]: `${i * 60}ms` }}
            >
              {reactor.avatar && <AvatarImage src={reactor.avatar} alt={reactor.name} />}
              <AvatarFallback>{initials(reactor.name)}</AvatarFallback>
              <AvatarBadge className="blog-react__avatar-badge">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={HEART_PATH} />
                </svg>
              </AvatarBadge>
            </Avatar>
          ))}
          {overflow > 0 && (
            <AvatarGroupCount
              data-magnetic
              className="blog-react__avatar blog-react__more"
              style={{ ['--entry-delay' as string]: `${faces.length * 60}ms` }}
            >
              +{overflow}
            </AvatarGroupCount>
          )}
        </AvatarGroup>
      )}
    </div>
  );
}
