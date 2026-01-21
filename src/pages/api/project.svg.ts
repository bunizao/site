import type { APIRoute } from 'astro';
import { fetchGitHubRepo } from '../../lib/github';
import { svgResponse } from '../../lib/svg-response';

interface ProjectData {
  name: string;
  repo: string;
  description: string;
  tags: string[];
  role: string;
}

const projects: Record<string, ProjectData> = {
  'tutubetterrules': {
    name: 'TutuBetterRules',
    repo: 'bunizao/TutuBetterRules',
    description: 'Proxy rules for Surge, Clash, and other proxy tools',
    tags: ['Proxy', 'Network'],
    role: 'Author'
  },
  'attegi': {
    name: 'Attegi',
    repo: 'bunizao/Attegi',
    description: 'A minimal and elegant Ghost theme',
    tags: ['Ghost', 'Theme', 'TailwindCSS'],
    role: 'Author'
  },
  'mirrored': {
    name: 'Mirrored',
    repo: 'bunizao/Mirrored',
    description: 'Automated mirror sync for container registries',
    tags: ['CI/CD', 'Python', 'Automation'],
    role: 'Author'
  },
  'ogis': {
    name: 'ogis',
    repo: 'bunizao/ogis',
    description: 'Open Graph image generation service',
    tags: ['Next.js', 'React', 'TypeScript'],
    role: 'Author'
  },
  'always-attend': {
    name: 'always-attend',
    repo: 'bunizao/always-attend',
    description: 'Automated attendance check-in tool',
    tags: ['Python', 'CLI', 'Automation'],
    role: 'Author'
  }
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ url, locals }) => {
  const projectId = url.searchParams.get('project') || 'tutubetterrules';
  const theme = url.searchParams.get('theme') || 'dark';

  const project = projects[projectId.toLowerCase()];

  if (!project) {
    return new Response('Project not found', { status: 404 });
  }

  // Fetch live GitHub stars
  const githubData = await fetchGitHubRepo(project.repo, import.meta.env, locals?.runtime?.env);
  const stars = githubData?.stars ?? null;

  // Theme colors
  const colors = theme === 'light'
    ? {
        bg: '#ffffff',
        border: '#e5e5e5',
        text: '#171717',
        muted: '#737373',
        tagBg: '#f5f5f5',
        roleBg: '#f5f5f5',
        starColor: '#fbbf24'
      }
    : {
        bg: '#0a0a0a',
        border: '#262626',
        text: '#fafafa',
        muted: '#a3a3a3',
        tagBg: '#171717',
        roleBg: '#171717',
        starColor: '#fbbf24'
      };

  const svg = `
    <svg width="400" height="160" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&amp;display=swap');

          .project-card {
            font-family: 'JetBrains Mono', monospace;
          }
        </style>
      </defs>

      <rect width="400" height="160" rx="12" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1"/>

      <!-- Project Name -->
      <text x="20" y="35" font-family="JetBrains Mono, monospace" font-size="16" font-weight="600" fill="${colors.text}">
        ${escapeXml(project.name)}
      </text>

      <!-- Stars (if available) -->
      ${stars !== null ? `
        <g transform="translate(350, 25)">
          <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"
                fill="${colors.starColor}" transform="scale(0.8)"/>
          <text x="16" y="10" font-family="JetBrains Mono, monospace" font-size="11" font-weight="500" fill="${colors.muted}">
            ${stars}
          </text>
        </g>
      ` : ''}

      <!-- Description -->
      <text x="20" y="60" font-family="JetBrains Mono, monospace" font-size="12" fill="${colors.muted}">
        ${escapeXml(project.description.substring(0, 50))}
      </text>
      ${project.description.length > 50 ? `
        <text x="20" y="78" font-family="JetBrains Mono, monospace" font-size="12" fill="${colors.muted}">
          ${escapeXml(project.description.substring(50, 100))}
        </text>
      ` : ''}

      <!-- Role Badge -->
      <g transform="translate(20, 100)">
        <rect width="60" height="20" rx="4" fill="${colors.roleBg}" stroke="${colors.border}" stroke-width="1"/>
        <text x="30" y="14" font-family="JetBrains Mono, monospace" font-size="9" font-weight="600" fill="${colors.muted}" text-anchor="middle">
          ${project.role.toUpperCase()}
        </text>
      </g>

      <!-- Tags -->
      ${project.tags.slice(0, 3).map((tag, i) => `
        <text x="${90 + i * 80}" y="114" font-family="JetBrains Mono, monospace" font-size="10" fill="${colors.muted}">
          ${escapeXml(tag)}${i < Math.min(project.tags.length, 3) - 1 ? ' ·' : ''}
        </text>
      `).join('')}

      <!-- Arrow Icon -->
      <g transform="translate(365, 130)">
        <path d="M7 7h10m0 0V17m0-10L7 17" stroke="${colors.muted}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </g>
    </svg>
  `.trim();

  return svgResponse(svg, 'public, max-age=3600, s-maxage=3600');
};
