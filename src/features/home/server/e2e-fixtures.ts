export interface E2EProject {
  name: string;
  url: string;
  description: string;
  role: 'Author' | 'Contributor';
  tags: string[];
  stars: number | null;
}

export interface E2EWritingTag {
  id: string;
  name: string;
  slug: string;
  visibility: 'public' | 'internal';
}

export interface E2EWritingPost {
  id: string;
  title: string;
  slug: string;
  published_at: string;
  tags: E2EWritingTag[];
}

export function createE2EProjects(): E2EProject[] {
  return [
    {
      name: 'TutuBetterRules',
      url: 'https://github.com/bunizao/TutuBetterRules',
      description: 'Proxy rules for Surge, Clash, and other proxy tools',
      role: 'Author',
      tags: ['Proxy', 'Network'],
      stars: 128,
    },
    {
      name: 'Attegi',
      url: 'https://github.com/bunizao/Attegi',
      description: 'A minimal and elegant Ghost theme',
      role: 'Author',
      tags: ['Ghost', 'Theme', 'TailwindCSS'],
      stars: 64,
    },
  ];
}

export function createE2EWritingPosts(): E2EWritingPost[] {
  return [
    {
      id: 'ghost-post-1',
      title: 'Designing a fast personal site',
      slug: 'designing-a-fast-personal-site',
      published_at: '2026-02-01T08:00:00.000Z',
      tags: [
        {
          id: 'tag-design',
          name: 'Design',
          slug: 'design',
          visibility: 'public',
        },
      ],
    },
    {
      id: 'ghost-post-2',
      title: 'Running Telegram mood feeds at scale',
      slug: 'running-telegram-mood-feeds-at-scale',
      published_at: '2026-01-15T08:00:00.000Z',
      tags: [
        {
          id: 'tag-automation',
          name: 'Automation',
          slug: 'automation',
          visibility: 'public',
        },
      ],
    },
  ];
}
