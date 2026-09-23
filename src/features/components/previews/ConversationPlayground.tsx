import * as React from 'react';
import { Switch } from '@base-ui/react/switch';
import { Check, Copy } from 'lucide-react';
import { Tabs, TabsList, TabsTab } from '@/components/coss/tabs';
import {
  parseConversation,
  renderConversation,
  setConversationOption,
  type ConversationOption,
} from '@/features/content/conversation';
import { observeConversations } from '@/features/content/client/conversation-fit';

// Live playground for the conversation component, embedded on
// /components/conversation.
//
// The renderer is pure and has no Node dependencies, so the exact module that
// renders blog posts on the server also runs in the browser here: what you edit
// is the shipping output, not a reimplementation of it.

const fenced = (lines: string[]): string => [
  '```conversation',
  '@conversation avatars=on names=on tints=on',
  ...lines,
  '```',
].join('\n');

const SAMPLES: { name: string; source: string }[] = [
  {
    name: 'Basics',
    source: fenced([
      '@Ada accent=#B4603A avatar=🐈',
      '',
      'you: so what is actually hard about a chat bubble?',
      'ada: Width.',
      'ada: One "sure" and a three-hundred word answer have to come out of the',
      '  same rule, and both have to look deliberate.',
      '--- a different way to put it',
      'ada: The cap is `30em`, not a pixel width.',
      'you: and when the container gets narrow?',
      'ada: All **container queries**. It never asks how wide the viewport is,',
      '  only how wide the hole it was dropped into is.',
    ]),
  },
  {
    name: 'Group',
    source: fenced([
      '@Ada',
      '@Grace accent=#4E7A5E',
      '@Alan accent=#7C5CD6',
      '',
      'ada: Ship it?',
      'grace: One thing first.',
      'grace: A run of messages from one person is labelled once, at the top.',
      'grace: Like this. Three bubbles, one name.',
      'alan: And the last bubble of a run squares off the corner nearest its speaker.',
      'you: Right — no drawn tail. Alignment carries the rest.',
      '--- ',
      'ada: Ship it.',
    ]),
  },
  {
    name: 'Avatars',
    source: fenced([
      '@you accent=#3C5D80',
      '@octo [Octocat] avatar=https://avatars.githubusercontent.com/u/583231?v=4',
      '@Emoji accent=#B4603A avatar=🐈',
      '@ada [Ada Lovelace] accent=#4E7A5E',
      '',
      'you: How many avatar forms are there?',
      'octo: A URL — `avatar=https://…`, or any site-relative path.',
      'emoji: A glyph works too.',
      'ada: Write nothing and you get initials; a CJK label takes its last character.',
      '--- ',
      'you: Why is there no avatar on my side?',
      'octo: Because that one is you. Readers do not need reminding what they look like.',
    ]),
  },
  {
    // The seam case: the source joins tight and `text-autospace` draws the gap
    // between a CJK character and a Latin one, so no space is ever invented.
    name: 'Mixed',
    source: fenced([
      '@tutu [图图] accent=#B4603A avatar=🐈',
      '',
      '我: 中英混排会不会打架？',
      'tutu: 不会。一个汉字正好 1em，拉丁字母大约',
      '  0.5em，所以同一个 `30em` 既是 30 个汉字，也是 60 个字母。',
      'tutu: 缝隙是排版画出来的，源码里一个空格都没多。',
    ]),
  },
  {
    name: 'Stress',
    source: fenced([
      'a: ok',
      'b: 好',
      'a: A single word bubble still has to look like a bubble and not a stray pill.',
      'b: This one runs long enough to wrap several times, which is the point: a long',
      '  message keeps the same measure instead of turning the whole thread into a',
      '  paragraph with rounded corners — that is where the metaphor dies.',
      'a: https://example.com/a/very/long/unbroken/url/that/must/not/overflow/the/bubble',
    ]),
  },
];

const LABEL = 'mb-2 block text-xs font-medium tracking-wide text-foreground/48';
const STORAGE_KEY = 'conversation-playground-source:v1';

function initialSource(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || SAMPLES[0].source;
  } catch {
    return SAMPLES[0].source;
  }
}

function Field({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}): React.ReactElement {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/72 select-none">
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="relative min-h-6 w-8 shrink-0 rounded-full bg-transparent py-[3px] outline-none before:absolute before:inset-y-[3px] before:inset-x-0 before:rounded-full before:bg-foreground/16 before:transition-colors focus-visible:ring-2 focus-visible:ring-ring data-[checked]:before:bg-foreground"
      >
        <Switch.Thumb className="relative ml-0.5 block size-3.5 rounded-full bg-background transition-transform data-[checked]:translate-x-3.5" />
      </Switch.Root>
      {label}
    </label>
  );
}

export default function ConversationPlayground(): React.ReactElement {
  const [source, setSource] = React.useState(initialSource);
  const [copied, setCopied] = React.useState(false);

  const html = React.useMemo(() => renderConversation(source), [source]);
  const rendered = React.useRef<HTMLDivElement>(null);

  // Every edit replaces the thread wholesale, so the fit pass has to be pointed
  // at the new nodes. The drag handle below resizes the column without resizing
  // the window, which is exactly the case the observer exists for.
  React.useLayoutEffect(() => observeConversations(rendered.current), [html]);
  const options = React.useMemo(() => parseConversation(source).options, [source]);
  const sample = SAMPLES.find((entry) => entry.source === source)?.name ?? '';

  const updateSource = React.useCallback((next: string) => {
    setSource(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The playground still works in memory when persistence is unavailable.
    }
  }, []);

  const pick = (name: string) => {
    const found = SAMPLES.find((entry) => entry.name === name);
    if (!found) return;
    updateSource(found.source);
  };

  const setOption = (name: ConversationOption, enabled: boolean) => {
    updateSource(setConversationOption(source, name, enabled));
  };

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // The textarea remains selectable when clipboard permission is denied.
    }
  };

  return (
    // The detail page hands its sections a mono stack; the chrome here is UI,
    // not code, so it takes the sans back. The source pane opts into mono again
    // because that pane IS code.
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* The coss primitives are built against the dev portal's palette,
            where `muted` is a surface. On the public site --muted is a mid grey
            meant for text, so the list and its indicator are repainted from
            --foreground here instead of inheriting a slab of grey. */}
        <Tabs value={sample} onValueChange={(value) => pick(String(value))}>
          <TabsList
            className="bg-foreground/6 [&_[data-slot=tab-indicator]]:bg-background [&_[data-slot=tab-indicator]]:shadow-sm"
          >
            {SAMPLES.map((entry) => (
              <TabsTab
                key={entry.name}
                value={entry.name}
                className="text-foreground/60 hover:text-foreground/80 data-active:text-foreground"
              >
                {entry.name}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>

        {/* Switches, not another row of pills: the samples already own the
            pill, and two of them side by side read as one control with a
            selection rather than two independent on/off states. */}
        <div className="flex items-center gap-5">
          <Field
            label="Avatars"
            checked={options.avatars}
            onChange={(enabled) => setOption('avatars', enabled)}
          />
          <Field
            label="Names"
            checked={options.names}
            onChange={(enabled) => setOption('names', enabled)}
          />
          <Field
            label="Tints"
            checked={options.tints}
            onChange={(enabled) => setOption('tints', enabled)}
          />
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-xs font-medium tracking-wide text-foreground/48" htmlFor="conv-source">
          Source · paste into a Markdown editor
        </label>
        {/* Labelled variant of the site's copy control: only the mark swaps, so
            the row does not reflow mid-click (styles/copy-button.css). */}
        <button
          type="button"
          onClick={() => void copySource()}
          aria-label="Copy complete conversation source"
          data-copied={copied ? '' : undefined}
          className="relative inline-flex min-h-6 items-center gap-1.5 text-xs font-medium text-foreground/48 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground data-[copied]:text-foreground"
        >
          <span className="copy-btn-icons" aria-hidden="true">
            <Copy className="copy-btn-icon copy-btn-icon--copy" />
            <Check className="copy-btn-icon copy-btn-icon--check" />
          </span>
          Copy all
          <span className="copy-btn-tip" role="status">Copied</span>
        </button>
      </div>
      <textarea
        id="conv-source"
        spellCheck={false}
        autoComplete="off"
        value={source}
        onChange={(event) => updateSource(event.target.value)}
        className="h-64 w-full resize-y rounded-lg border border-foreground/10 bg-foreground/3 px-4 py-3 text-[0.8125rem] leading-relaxed text-foreground outline-none transition-colors focus-visible:border-foreground/24"
        style={{ fontFamily: 'var(--font-code)', tabSize: 2 }}
      />

      <span className={`${LABEL} mt-6`}>Rendered</span>
      {/* Resizable so the container queries can be exercised directly: drag the
          corner and the thread reflows against its own width, not the
          viewport's. */}
      <div
        ref={rendered}
        className="max-w-full min-w-48 resize-x overflow-auto rounded-lg border border-dashed border-foreground/12 px-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
