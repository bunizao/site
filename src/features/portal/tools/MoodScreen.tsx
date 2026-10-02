import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ChevronDown, RefreshCw, Search } from 'lucide-react';
import type { MoodAiConfig, MoodCoverageSummary, MoodIngestHealth, MoodSearchResult } from '@bunizao/contracts/mood';
import { Button } from '@/components/coss/button';
import { Input } from '@/components/coss/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/coss/input-group';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/coss/menu';
import { Spinner } from '@/components/coss/spinner';
import { cn } from '@/lib/utils';
import { BLEED, Dot, GUTTER, HEAD, LIST, LoadError, Mono, ROW, Section, SkeletonRows, SMALL, type Tone, Updating } from '../activity/table';
import { useHotkeys } from '../app/hotkeys';
import { setSearch, useLocation } from '../app/router';
import { useScrollRestoration } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { ago, formatCount, fullTime, plural, shortDate } from '../moderation/format';
import { TOUCH_MENU } from '../moderation/ui';
import {
  explained,
  prefetchMood,
  useModelTests,
  useMoodConfig,
  useMoodHealth,
  useMoodSearch,
  useSetMoodModel,
  type ModelSlot,
  type ModelTest,
} from './data';

/* Mood operations: is ingest keeping up, which model classifies posts, and
   the archive's full-text search. Everything reads from site-api's
   /admin/mood/* and /admin/ai/test; there is no error log endpoint, so the
   status lines report what the archive itself can prove. */

/* ------------------------------------------------------------------ */
/* Ingest health                                                       */
/* ------------------------------------------------------------------ */

const LINE = cn('grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 py-2 text-sm sm:grid-cols-[7.5rem_10rem_minmax(0,1fr)]', BLEED, ROW);

function StatusLine({ tone, word, label, children }: { tone: Tone; word: string; label: string; children: React.ReactNode }) {
  return (
    <li className={LINE}>
      <span className="flex items-center gap-2 self-center">
        <Dot tone={tone} />
        <span className="font-medium">{word}</span>
      </span>
      <span className="text-muted-foreground max-sm:col-start-2">{label}</span>
      <span className="min-w-0 max-sm:col-start-2 [overflow-wrap:anywhere]">{children}</span>
    </li>
  );
}

function lagText(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

/* Thresholds are judgement calls, written down: site-api ingests on a
   15-minute cron, so up to 20 minutes behind is a run that has not come
   round yet, and over an hour means runs are failing. */
const NORMAL_LAG_S = 20 * 60;
const STALLED_LAG_S = 60 * 60;

function ingestLine(health: MoodIngestHealth): { tone: Tone; word: string; detail: React.ReactNode } {
  const { lastIngested, liveLatest, drift } = health;
  if (!lastIngested) return { tone: 'danger', word: 'Empty', detail: 'Nothing has been ingested into the archive yet.' };
  const last = (
    <>
      Last ingested <span className="tabular-nums">#{lastIngested.id}</span> <span title={fullTime(lastIngested.datetime)}>{ago(lastIngested.datetime)}</span>
    </>
  );
  if (!liveLatest) return { tone: 'neutral', word: 'Unknown', detail: <>{last}. The live channel did not answer, so drift is unknown.</> };
  const behind = drift.messages ?? 0;
  if (behind <= 0) return { tone: 'neutral', word: 'Current', detail: <>{last}; the channel has nothing newer.</> };
  const lag = drift.seconds !== null ? `, ${lagText(drift.seconds)} behind` : '';
  const seconds = drift.seconds ?? 0;
  const [tone, word]: [Tone, string] =
    seconds > STALLED_LAG_S ? ['danger', 'Stalled'] : seconds > NORMAL_LAG_S ? ['attention', 'Behind'] : ['neutral', 'Current'];
  return {
    tone,
    word,
    detail: (
      <>
        {last}; the channel is at <span className="tabular-nums">#{liveLatest.id}</span> ({plural(behind, 'post')}{lag}).
      </>
    ),
  };
}

function coverageLine(summary: MoodCoverageSummary): { tone: Tone; word: string; detail: React.ReactNode } {
  const missing = summary.total - summary.covered;
  const tone: Tone = summary.percent >= 99 ? 'neutral' : summary.percent >= 90 ? 'attention' : 'danger';
  const word = summary.percent >= 99 ? 'Good' : summary.percent >= 90 ? 'Gaps' : 'Low';
  return {
    tone,
    word,
    detail: (
      <>
        <span className="tabular-nums">{summary.percent}% of {formatCount(summary.total)}</span> posts
        {missing > 0 && <span className="text-muted-foreground">, {formatCount(missing)} still to classify</span>}
      </>
    ),
  };
}

function HealthSection() {
  const health = useMoodHealth();
  const data = health.data;

  const refresh = (
    <Button
      size="icon-sm"
      variant="ghost"
      className="pointer-coarse:size-11 active:bg-accent"
      aria-label="Check ingest health again"
      onClick={() => void health.refetch()}
    >
      <RefreshCw aria-hidden className={cn(health.isFetching && 'motion-safe:animate-spin')} />
    </Button>
  );

  let body: React.ReactNode;
  if (health.isPending) {
    body = <SkeletonRows rows={5} widths={['w-20', 'w-28', 'w-2/5']} />;
  } else if (health.isError && !data) {
    body = <LoadError what="ingest health" error={explained(health.error)} onRetry={() => void health.refetch()} retrying={health.isFetching} />;
  } else if (data) {
    const ingest = ingestLine(data);
    const sentiment = coverageLine(data.coverage.sentiment);
    const tags = coverageLine(data.coverage.tags);
    const replies = data.replyIntegrity;
    const snapshotAge = data.snapshotGeneratedAt ? Date.now() - Date.parse(data.snapshotGeneratedAt) : null;
    body = (
      <ul className={LIST}>
        <StatusLine tone={ingest.tone} word={ingest.word} label="Ingest">
          {ingest.detail}
        </StatusLine>
        <StatusLine tone={sentiment.tone} word={sentiment.word} label="Sentiment">
          {sentiment.detail}
        </StatusLine>
        <StatusLine tone={tags.tone} word={tags.word} label="Tags">
          {tags.detail}
        </StatusLine>
        <StatusLine
          tone={replies.unresolvedTargets > 0 ? 'attention' : 'neutral'}
          word={replies.unresolvedTargets > 0 ? 'Unresolved' : replies.unverifiedPosts > 0 ? 'Checking' : 'Clean'}
          label="Reply links"
        >
          <span className="tabular-nums">{formatCount(replies.edges)}</span> links
          {replies.unresolvedTargets > 0 && (
            <>
              ; {plural(replies.unresolvedTargets, 'target')} missing:{' '}
              {replies.unresolvedPostIds.map((id, index) => (
                <React.Fragment key={id}>
                  {index > 0 && ' '}
                  <span className="tabular-nums">#{id}</span>
                </React.Fragment>
              ))}
              {replies.unresolvedTargets > replies.unresolvedPostIds.length && <span className="text-muted-foreground"> and more</span>}
            </>
          )}
          {replies.unverifiedPosts > 0 && (
            <span className="text-muted-foreground">
              ; {plural(replies.unverifiedPosts, 'post')} not verified yet
              {replies.oldestVerifiedAt && <>, oldest check {ago(replies.oldestVerifiedAt)}</>}
            </span>
          )}
        </StatusLine>
        <StatusLine
          tone={snapshotAge === null ? 'danger' : snapshotAge < 2 * 3_600_000 ? 'neutral' : snapshotAge < 26 * 3_600_000 ? 'attention' : 'danger'}
          word={snapshotAge === null ? 'Missing' : snapshotAge < 2 * 3_600_000 ? 'Fresh' : 'Stale'}
          label="Stats snapshot"
        >
          {data.snapshotGeneratedAt ? (
            <>
              Built <span title={fullTime(data.snapshotGeneratedAt)}>{ago(data.snapshotGeneratedAt)}</span>
            </>
          ) : (
            'No snapshot has been built. The mood stats page falls back to live queries.'
          )}
        </StatusLine>
      </ul>
    );
  }

  return (
    <Section title="Ingest" headingId="mood-ingest" meta={data && health.dataUpdatedAt ? `checked ${ago(new Date(health.dataUpdatedAt).toISOString())}` : undefined} action={refresh}>
      {/* A failed poll over lines already shown is the header's Stale marker. */}
      {body}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* AI models                                                           */
/* ------------------------------------------------------------------ */

// Gateway aliases: ai.tuuhub.com picks the backend and fails over itself.
const ALIASES = ['task-summarize'];

function TestResult({ test }: { test: ModelTest | undefined }) {
  if (!test) return <span className="text-muted-foreground">Not tested yet</span>;
  if (test.state === 'running') {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Spinner className="size-3.5" />
        Testing
      </span>
    );
  }
  const ms = test.ms !== null && <span className="text-muted-foreground tabular-nums">{formatCount(test.ms)} ms</span>;
  if (test.state === 'ok') {
    // A reply is the expected outcome, so its dot stays neutral.
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        <Dot tone="neutral" />
        <span className="min-w-0 [overflow-wrap:anywhere]">Replied “{test.reply}”</span>
        {ms}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
      <Dot tone="danger" />
      <span className="font-medium">Failed</span>
      {ms}
      <span className="basis-full text-muted-foreground [overflow-wrap:anywhere]">{test.error}</span>
    </span>
  );
}

function ModelRow({
  slot,
  config,
  test,
  onPick,
  onTest,
}: {
  slot: ModelSlot;
  config: MoodAiConfig;
  test: ModelTest | undefined;
  onPick: (slot: ModelSlot, model: string) => void;
  onTest: (model: string) => void;
}) {
  const value = config[slot];
  const [typing, setTyping] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const choices = [...new Set([...ALIASES, config.primary, config.fallback])];
  const label = slot === 'primary' ? 'Primary' : 'Fallback';

  const save = (): void => {
    const next = draft.trim();
    setTyping(false);
    if (next) onPick(slot, next);
  };

  return (
    <li className={cn('grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2 text-sm sm:grid-cols-[7.5rem_16rem_auto_minmax(0,1fr)]', BLEED, ROW)}>
      <span className="text-muted-foreground" id={`model-${slot}`}>
        {label}
      </span>
      {typing ? (
        <Input
          size="sm"
          autoFocus
          aria-labelledby={`model-${slot}`}
          placeholder="Model or gateway alias"
          value={draft}
          // Selected, so typing replaces the current name and arrows edit it.
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setTyping(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setTyping(false);
            }
          }}
          className="font-mono pointer-coarse:h-11 pointer-coarse:**:[input]:h-full"
        />
      ) : (
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                aria-label={`${label} model: ${value}. Change it`}
                className={cn(SMALL, 'w-full justify-between font-mono active:bg-accent')}
              />
            }
          >
            <span className="truncate">{value}</span>
            <ChevronDown aria-hidden />
          </MenuTrigger>
          <MenuPopup align="start" className={TOUCH_MENU}>
            <MenuRadioGroup value={value} onValueChange={(next: string) => onPick(slot, next)}>
              <MenuGroup>
                <MenuGroupLabel>{label} model</MenuGroupLabel>
                {choices.map((choice) => (
                  <MenuRadioItem key={choice} value={choice} className="font-mono">
                    {choice}
                  </MenuRadioItem>
                ))}
              </MenuGroup>
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                setDraft(value);
                setTyping(true);
              }}
            >
              Another model…
            </MenuItem>
          </MenuPopup>
        </Menu>
      )}
      <Button
        size="sm"
        variant="outline"
        className={cn(SMALL, 'w-16 active:bg-accent')}
        onClick={() => onTest(value)}
        disabled={test?.state === 'running' && test.model === value}
        aria-label={`Test ${value}`}
      >
        Test
      </Button>
      <span className="min-w-0 max-sm:col-span-2 max-sm:col-start-2" aria-live="polite">
        <TestResult test={test} />
      </span>
    </li>
  );
}

function ModelsSection() {
  const config = useMoodConfig();
  const setModel = useSetMoodModel();
  const [tests, runTest] = useModelTests();
  const data = config.data;

  // A new model is tested the moment it is picked: that is the next thing
  // anyone wants to know about it.
  const pick = React.useCallback(
    (slot: ModelSlot, model: string) => {
      setModel(slot, model);
      runTest(model);
    },
    [runTest, setModel],
  );

  let body: React.ReactNode;
  if (config.isPending) {
    body = <SkeletonRows rows={2} widths={['w-16', 'w-56', 'w-12', 'w-32']} />;
  } else if (config.isError && !data) {
    body = <LoadError what="the model config" error={explained(config.error)} onRetry={() => void config.refetch()} retrying={config.isFetching} />;
  } else if (data) {
    body = (
      <>
        <ul className={LIST}>
          <ModelRow slot="primary" config={data} test={tests[data.primary]} onPick={pick} onTest={runTest} />
          <ModelRow slot="fallback" config={data} test={tests[data.fallback]} onPick={pick} onTest={runTest} />
        </ul>
        <p className={cn('py-2 text-muted-foreground text-xs', GUTTER)}>
          Sentiment and tags use the primary, and the fallback when it fails. A gateway alias such as task-summarize fails over between
          backends by itself, so both can be the same alias.
        </p>
      </>
    );
  }

  return (
    <Section title="AI models" headingId="mood-models" meta={data ? `changed ${shortDate(data.updatedAt)}` : undefined}>
      {body}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Archive search                                                      */
/* ------------------------------------------------------------------ */

const SENTIMENT_WORDS: Record<string, string> = {
  joy: 'Joy',
  calm: 'Calm',
  melancholy: 'Melancholy',
  anger: 'Anger',
  anxiety: 'Anxiety',
  neutral: 'Neutral',
};

/** site-api marks hits with literal <mark> tags around raw post text; the
    text is split on them and rendered as text, never as HTML. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/<mark>|<\/mark>/);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-[2px] bg-[hsl(var(--portal-accent)/0.28)] px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

const RESULT_GRID = 'grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[4.5rem_4.5rem_minmax(0,1fr)_6rem]';

function ResultRow({ result }: { result: MoodSearchResult }) {
  return (
    <li className={cn(RESULT_GRID, 'items-baseline gap-y-1 py-3 text-sm', BLEED)}>
      <a
        href={`/mood/${encodeURIComponent(result.id)}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open mood post ${result.id} in a new tab`}
        className="relative rounded-sm font-mono text-[13px] tabular-nums underline-offset-[3px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring active:text-[hsl(var(--portal-accent))] pointer-coarse:after:absolute pointer-coarse:after:-inset-y-3.5 pointer-coarse:after:-inset-x-2"
      >
        #{result.id}
      </a>
      <Mono className="text-muted-foreground text-xs max-sm:col-start-2 max-sm:row-start-2">
        <span title={result.datetime ? fullTime(result.datetime) : undefined}>{result.datetime ? shortDate(result.datetime) : 'no date'}</span>
      </Mono>
      <span className="min-w-0 [overflow-wrap:anywhere] max-sm:col-start-2 max-sm:row-start-1">
        <Snippet text={result.snippet} />
        {result.tags.length > 0 && (
          <span className="ms-2 text-muted-foreground text-xs">{result.tags.map((tag) => `#${tag}`).join(' ')}</span>
        )}
      </span>
      <span className="text-muted-foreground text-xs max-sm:col-start-2 max-sm:row-start-3 sm:text-sm">
        {result.sentiment_label ? SENTIMENT_WORDS[result.sentiment_label] ?? result.sentiment_label : 'Unscored'}
      </span>
    </li>
  );
}

function SearchSection({ archiveSize }: { archiveSize: number | null }) {
  const { search } = useLocation();
  const query = search.get('q') ?? '';
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState(query);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Back, forward or a cleared box moved the URL under the input.
  const [seen, setSeen] = React.useState(query);
  if (query !== seen) {
    setSeen(query);
    setText(query);
  }

  const write = React.useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSearch({ q: value.trim() || null });
  }, []);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useHotkeys({ '/': () => inputRef.current?.focus() });

  const results = useMoodSearch(query);
  const rows = results.data ?? [];
  const searching = query.trim().length > 0;

  let body: React.ReactNode;
  if (!searching) {
    body = (
      <p className={cn('py-3 text-muted-foreground text-sm', GUTTER)}>
        Every word must appear in the post. {archiveSize !== null && <>The archive holds {plural(archiveSize, 'post')}.</>}
      </p>
    );
  } else if (results.isPending) {
    body = <SkeletonRows rows={6} widths={['w-10', 'w-12', 'w-3/5', 'w-12']} />;
  } else if (results.isError && !results.data) {
    body = <LoadError what="search results" error={explained(results.error)} onRetry={() => void results.refetch()} retrying={results.isFetching} />;
  } else if (rows.length === 0) {
    body = (
      <p className={cn('py-3 text-sm', GUTTER)}>
        No archived post has all of these words. <span className="text-muted-foreground">Try fewer or shorter words.</span>
      </p>
    );
  } else {
    body = (
      <>
        <div aria-hidden className={cn(RESULT_GRID, HEAD, 'items-center max-sm:hidden', GUTTER)}>
          <span>Post</span>
          <span>Date</span>
          <span>Text and tags</span>
          <span>Mood</span>
        </div>
        <ol className={cn(LIST, 'transition-opacity duration-100 motion-reduce:transition-none', results.isPlaceholderData && 'opacity-60')}>
          {rows.map((result) => (
            <ResultRow key={result.id} result={result} />
          ))}
        </ol>
      </>
    );
  }

  const meta = searching && results.data ? (rows.length >= 25 ? 'top 25 by relevance' : plural(rows.length, 'match', 'matches')) : undefined;

  return (
    <Section title="Archive search" headingId="mood-search" meta={meta} action={<Updating active={results.isFetching && Boolean(results.data)} />}>
      <div className={cn('py-2', GUTTER)}>
        <InputGroup className="max-w-xl pointer-coarse:h-11 pointer-coarse:**:[input]:h-full">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            type="search"
            aria-label="Search the mood archive"
            placeholder="Search the archive"
            value={text}
            enterKeyHint="search"
            onChange={(event) => {
              const value = event.target.value;
              setText(value);
              if (timer.current) clearTimeout(timer.current);
              // Safari refuses more than 100 history writes in 30 seconds.
              timer.current = setTimeout(() => write(value), 300);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                write(text);
              }
              if (event.key === 'Escape') event.currentTarget.blur();
            }}
          />
          <InputGroupAddon align="inline-end" className="pointer-coarse:hidden">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div className="pt-2">{body}</div>
    </Section>
  );
}

/** Health, models and the URL's search (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient, search: URLSearchParams): Promise<unknown> {
  return prefetchMood(client, search.get('q') ?? '');
}

export default function MoodScreen() {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const health = useMoodHealth();
  useScrollRestoration(scrollRef, 'mood', !health.isPending);

  return (
    <div className="flex h-svh flex-col">
      <ScreenHeader title="Mood" />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 pt-1 pb-10 sm:gap-12">
          <HealthSection />
          <ModelsSection />
          <SearchSection archiveSize={health.data?.coverage.sentiment.total ?? null} />
        </div>
      </div>
    </div>
  );
}
