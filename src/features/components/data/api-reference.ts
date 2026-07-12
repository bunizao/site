export interface ApiReferenceItem {
  name: string;
  type: string;
  default?: string;
  description: string;
}

export interface ComponentApiReference {
  name: string;
  description?: string;
  items: ApiReferenceItem[];
}

export const componentApiReferences: Record<string, ComponentApiReference[]> = {
  badge: [
    {
      name: 'BadgeProps',
      description: 'Extends React.HTMLAttributes<HTMLDivElement>.',
      items: [
        {
          name: 'variant',
          type: "'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'",
          default: "'default'",
          description: 'Controls the badge color and emphasis.',
        },
        {
          name: 'className',
          type: 'string',
          description: 'Adds classes to the badge element.',
        },
        {
          name: 'children',
          type: 'React.ReactNode',
          description: 'Content rendered inside the badge.',
        },
      ],
    },
  ],
  button: [
    {
      name: 'ButtonProps',
      description: 'Extends React.ButtonHTMLAttributes<HTMLButtonElement>.',
      items: [
        {
          name: 'variant',
          type: "'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'",
          default: "'default'",
          description: 'Controls the button color and emphasis.',
        },
        {
          name: 'size',
          type: "'default' | 'sm' | 'lg' | 'icon'",
          default: "'default'",
          description: 'Controls the button height and horizontal padding.',
        },
        {
          name: 'asChild',
          type: 'boolean',
          default: 'false',
          description: 'Merges button behavior into the child element through Radix Slot.',
        },
        {
          name: 'className',
          type: 'string',
          description: 'Adds classes to the button element.',
        },
      ],
    },
  ],
  card: [
    {
      name: 'Card components',
      description: 'Card, CardHeader, CardTitle, CardDescription, CardContent, and CardFooter share the same div attributes.',
      items: [
        {
          name: 'className',
          type: 'string',
          description: 'Adds classes to the selected card element.',
        },
        {
          name: 'children',
          type: 'React.ReactNode',
          description: 'Content rendered inside the selected card element.',
        },
        {
          name: 'ref',
          type: 'React.Ref<HTMLDivElement>',
          description: 'Forwards a ref to the underlying div.',
        },
      ],
    },
  ],
  'contact-links': [
    {
      name: 'ContactLinks',
      description: 'A self-contained Astro component with no component props.',
      items: [],
    },
  ],
  'decode-text': [
    {
      name: 'decodeText',
      description: 'decodeText(root, options) starts the reveal and resolves with a DecodeController.',
      items: [
        {
          name: 'root',
          type: 'HTMLElement',
          description: 'The element whose text is decoded.',
        },
        {
          name: 'options',
          type: 'DecodeOptions',
          default: '{}',
          description: 'Controls layout, timing, glyphs, ordering, and completion behavior.',
        },
      ],
    },
    {
      name: 'DecodeOptions',
      items: [
        { name: 'charset', type: 'string', default: "'__-—/\\\\|<>'", description: 'Glyph pool used while scrambling.' },
        { name: 'cursorChar', type: 'string', default: "'-'", description: 'Glyph shown before a character begins scrambling.' },
        { name: 'layout', type: "'grow' | 'static'", default: "'grow'", description: 'Chooses condensing monospace lines or fixed-width character cells.' },
        { name: 'order', type: "'ltr' | 'shuffle'", default: "'shuffle'", description: 'Controls the order in which characters enter the reveal.' },
        { name: 'showPower', type: 'number', default: '0.5', description: 'Shapes the front that makes character cursors visible.' },
        { name: 'mashPower', type: 'number', default: '2', description: 'Shapes the front that starts character scrambling.' },
        { name: 'donePower', type: 'number', default: '15', description: 'Shapes the front that resolves characters to their final value.' },
        { name: 'scrambleFromText', type: 'boolean', default: 'true', description: 'Adds ASCII characters from the source text to the glyph pool.' },
        { name: 'durationPerChar', type: 'number', default: '0.024', description: 'Sets line duration in seconds per character.' },
        { name: 'minLineDuration', type: 'number', default: '0.5', description: 'Sets the minimum duration of one line in seconds.' },
        { name: 'maxLineDuration', type: 'number', default: '1.8', description: 'Sets the maximum duration of one line in seconds.' },
        { name: 'lineStagger', type: 'number', default: '0.16', description: 'Offsets each line by a fraction of preceding line durations.' },
        { name: 'mutationHz', type: 'number', default: '18', description: 'Sets scramble mutations per second for each cell.' },
        { name: 'ease', type: '(t: number) => number', default: 'easeInOutQuint', description: 'Maps linear progress onto animation progress.' },
        { name: 'fontTimeout', type: 'number', default: '400', description: 'Limits the wait for document fonts before measurement, in milliseconds.' },
        { name: 'respectReducedMotion', type: 'boolean', default: 'true', description: 'Skips the reveal when reduced motion is requested.' },
        { name: 'onComplete', type: '() => void', description: 'Runs after the reveal finishes.' },
      ],
    },
  ],
  'github-activity': [
    {
      name: 'Props',
      items: [
        { name: 'username', type: 'string', default: "'bunizao'", description: 'GitHub username shown below the contribution wave.' },
        { name: 'contributionDays', type: 'number', default: '30', description: 'Number of recent contribution days to render.' },
        { name: 'endpoint', type: 'string', default: "'/api/github/contributions'", description: 'JSON endpoint used to load contribution data.' },
      ],
    },
  ],
  'list-hover': [
    {
      name: 'ListHover',
      description: 'A self-contained Astro specimen with no component props.',
      items: [],
    },
  ],
  listening: [
    {
      name: 'Props',
      items: [
        { name: 'track', type: 'ListeningTrack', description: 'Track metadata, artwork, links, and optional preview audio.' },
        { name: 'static', type: 'boolean', default: 'false', description: 'Disables client-side live refresh and keeps the supplied track fixed.' },
      ],
    },
  ],
  mascot: [
    {
      name: 'Composition functions',
      items: [
        { name: 'compose', type: '(base: Grid, ...layers: LayerLike[]) => Grid', description: 'Stacks one or more sparse or full-size layers onto a base grid.' },
        { name: 'applyLook', type: '(grid: Grid, look?: Look) => Grid', description: 'Applies recoloring and an optional overlay to a grid.' },
        { name: 'resolveLayer', type: '(layer: LayerLike, width: number, height: number) => Grid', description: 'Resolves a layer into a full grid of the requested dimensions.' },
      ],
    },
  ],
  'mobile-reading-bar': [
    {
      name: 'MobileReadingBar',
      description: 'A self-contained Astro component with no component props.',
      items: [],
    },
  ],
  'mood-wheel': [
    {
      name: 'mountTimelineWheel',
      description: 'mountTimelineWheel(root, dependencies) binds the dial and returns a cleanup function.',
      items: [
        { name: 'root', type: 'HTMLElement', description: 'The timeline wheel root element.' },
        { name: 'dependencies.feed', type: 'HTMLElement', description: 'The scrollable feed used to determine wheel progress.' },
        { name: 'dependencies.list', type: 'HTMLElement', description: 'The dated list observed for content and layout changes.' },
        { name: 'returns', type: '() => void', description: 'Removes observers, listeners, animations, and timers.' },
      ],
    },
  ],
  'projects-deck': [
    {
      name: 'ProjectStackProps',
      items: [
        { name: 'className', type: 'string', description: 'Adds classes to the project stack root.' },
      ],
    },
  ],
  'tag-cards': [
    {
      name: 'TagCards',
      description: 'A self-contained Astro specimen with no component props.',
      items: [],
    },
  ],
  'update-pills': [
    {
      name: 'UpdatePills',
      description: 'A self-contained Astro specimen with no component props.',
      items: [],
    },
  ],
};
