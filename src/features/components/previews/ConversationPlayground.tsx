import * as React from 'react';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { CircleUserRound, Tag } from 'lucide-react';
import { Tabs, TabsList, TabsTab } from '@/components/coss/tabs';
import { renderConversation } from '@/features/content/conversation';

// Live playground for the conversation component, embedded on
// /components/conversation.
//
// The renderer is pure and has no Node dependencies, so the exact module that
// renders blog posts on the server also runs in the browser here: what you edit
// is the shipping output, not a reimplementation of it.

const SAMPLES: { name: string; source: string }[] = [
  {
    name: 'Basics',
    source: [
      '@you me avatar=🙋',
      '@ada label="Ada" accent=#B4603A avatar=🐈',
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
    ].join('\n'),
  },
  {
    name: 'Group',
    source: [
      '@me me label="You"',
      '@ada label="Ada"',
      '@grace label="Grace" accent=#4E7A5E',
      '@alan label="Alan" accent=#7C5CD6',
      '',
      'ada: Ship it?',
      'grace: One thing first.',
      'grace: A run of messages from one person is labelled once, at the top.',
      'grace: Like this. Three bubbles, one name.',
      'alan: And the last bubble of a run squares off the corner nearest its speaker.',
      'me: Right — no drawn tail. Alignment carries the rest.',
      '--- ',
      'ada: Ship it.',
    ].join('\n'),
  },
  {
    name: 'Avatars',
    source: [
      '@you me label="You" accent=#3C5D80',
      '@octo label="Octocat" avatar=https://avatars.githubusercontent.com/u/583231?v=4',
      '@emoji label="Emoji" accent=#B4603A avatar=🐈',
      '@ada label="Ada Lovelace" accent=#4E7A5E',
      '',
      'you: How many avatar forms are there?',
      'octo: A URL — `avatar=https://…`, or any site-relative path.',
      'emoji: A glyph works too.',
      'ada: Write nothing and you get initials; a CJK label takes its last character.',
      '--- ',
      'you: Why is there no avatar on my side?',
      'octo: Because that one is you. Readers do not need reminding what they look like.',
    ].join('\n'),
  },
  {
    // The seam case: the source joins tight and `text-autospace` draws the gap
    // between a CJK character and a Latin one, so no space is ever invented.
    name: 'Mixed',
    source: [
      '@you me label="You"',
      '@tutu label="图图" accent=#B4603A avatar=🐈',
      '',
      'you: 中英混排会不会打架？',
      'tutu: 不会。一个汉字正好 1em，拉丁字母大约',
      '  0.5em，所以同一个 `30em` 既是 30 个汉字，也是 60 个字母。',
      'tutu: 缝隙是排版画出来的，源码里一个空格都没多。',
    ].join('\n'),
  },
  {
    name: 'Stress',
    source: [
      '@a me label="A"',
      '@b label="B"',
      '',
      'a: ok',
      'b: 好',
      'a: A single word bubble still has to look like a bubble and not a stray pill.',
      'b: This one runs long enough to wrap several times, which is the point: a long',
      '  message keeps the same measure instead of turning the whole thread into a',
      '  paragraph with rounded corners — that is where the metaphor dies.',
      'a: https://example.com/a/very/long/unbroken/url/that/must/not/overflow/the/bubble',
    ].join('\n'),
  },
];

const LABEL = 'mb-2 block text-xs font-medium tracking-wide text-foreground/48';

const GROUP = 'flex items-center gap-0.5 rounded-lg bg-foreground/6 p-0.5';

const TOGGLE =
  'flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium ' +
  'text-foreground/60 outline-none transition-colors hover:text-foreground/80 ' +
  'focus-visible:ring-2 focus-visible:ring-ring data-[pressed]:bg-background ' +
  'data-[pressed]:text-foreground data-[pressed]:shadow-sm sm:h-8';

export default function ConversationPlayground(): React.ReactElement {
  const [sample, setSample] = React.useState(SAMPLES[0].name);
  const [source, setSource] = React.useState(SAMPLES[0].source);
  const [avatars, setAvatars] = React.useState(true);
  const [names, setNames] = React.useState(true);
  const stage = React.useRef<HTMLDivElement>(null);

  const html = React.useMemo(() => renderConversation(source), [source]);

  // Both toggles are component behaviour, not playground chrome: the stylesheet
  // reads them off the thread in a real post too.
  React.useEffect(() => {
    const thread = stage.current?.querySelector<HTMLElement>('.conv-thread');
    if (!thread) return;
    thread.dataset.avatars = avatars ? 'on' : 'off';
    thread.dataset.names = names ? 'on' : 'off';
  }, [html, avatars, names]);

  const pick = (name: string) => {
    const found = SAMPLES.find((entry) => entry.name === name);
    if (!found) return;
    setSample(found.name);
    setSource(found.source);
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

        {/* Pressed toggles, not checkboxes: these two switch what the thread
            shows, so they belong in the same pill language as the samples. */}
        <ToggleGroup
          multiple
          value={[avatars ? 'avatars' : '', names ? 'names' : ''].filter(Boolean)}
          onValueChange={(value) => {
            setAvatars(value.includes('avatars'));
            setNames(value.includes('names'));
          }}
          className={GROUP}
        >
          <Toggle value="avatars" className={TOGGLE}>
            <CircleUserRound className="size-4" aria-hidden="true" />
            Avatars
          </Toggle>
          <Toggle value="names" className={TOGGLE}>
            <Tag className="size-4" aria-hidden="true" />
            Names
          </Toggle>
        </ToggleGroup>
      </div>

      <label className={LABEL} htmlFor="conv-source">
        Source
      </label>
      <textarea
        id="conv-source"
        spellCheck={false}
        autoComplete="off"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        className="h-64 w-full resize-y rounded-lg border border-foreground/10 bg-foreground/3 px-4 py-3 text-[0.8125rem] leading-relaxed text-foreground outline-none transition-colors focus-visible:border-foreground/24"
        style={{ fontFamily: 'var(--font-code)', tabSize: 2 }}
      />

      <span className={`${LABEL} mt-6`}>Rendered</span>
      {/* Resizable so the container queries can be exercised directly: drag the
          corner and the thread reflows against its own width, not the
          viewport's. */}
      <div
        ref={stage}
        className="max-w-full min-w-48 resize-x overflow-auto rounded-lg border border-dashed border-foreground/12 px-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
