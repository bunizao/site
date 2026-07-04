export interface E2EProject {
  name: string;
  url: string;
  description: string;
  role: 'Author' | 'Contributor';
  tags: string[];
  stars: number | null;
}

export interface E2EGitHubContributionDay {
  date: string;
  count: number;
  level: number;
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

export function createE2EGitHubContributions(): {
  total: { lastYear: number };
  contributions: E2EGitHubContributionDay[];
} {
  const contributions = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 5, 5 + index));
    const count = index % 6;

    return {
      date: date.toISOString().slice(0, 10),
      count,
      level: Math.min(count, 4),
    };
  });

  return {
    total: {
      lastYear: contributions.reduce((sum, day) => sum + day.count, 0),
    },
    contributions,
  };
}
