import type { APIRoute } from 'astro';
import { svgResponse } from '../../lib/svg-response';

export const prerender = false;

const techStack = [
  'TypeScript',
  'JavaScript',
  'Python',
  'C#',
  'C++',
  'React',
  'TailwindCSS',
  'Astro',
  'Frontend',
  'BGP',
  'Proxy',
  'Docker',
  'Linux',
  'Web3',
  'Optimization'
];

export const GET: APIRoute = ({ url }) => {
  const theme = url.searchParams.get('theme') || 'dark';

  // Theme colors
  const colors = theme === 'light'
    ? {
        bg: '#ffffff',
        border: '#e5e5e5',
        text: '#171717',
        muted: '#737373',
        tagBg: '#f5f5f5'
      }
    : {
        bg: '#0a0a0a',
        border: '#262626',
        text: '#fafafa',
        muted: '#a3a3a3',
        tagBg: '#171717'
      };

  // Calculate positions for tags
  const tagSpacing = 120;
  const totalWidth = techStack.length * tagSpacing;
  const svgWidth = 800;

  const svg = `
    <svg width="${svgWidth}" height="60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&amp;display=swap');

          .tech-tag {
            font-family: 'JetBrains Mono', monospace;
            animation: scroll ${techStack.length * 3}s linear infinite;
          }

          @keyframes scroll {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-${totalWidth}px);
            }
          }
        </style>
      </defs>

      <rect width="${svgWidth}" height="60" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1" rx="8"/>

      <g class="tech-tag">
        ${techStack.map((tech, i) => {
          const x = i * tagSpacing + 20;
          return `
            <g transform="translate(${x}, 20)">
              <rect width="100" height="24" rx="6" fill="${colors.tagBg}" stroke="${colors.border}" stroke-width="1"/>
              <text x="50" y="16" font-family="JetBrains Mono, monospace" font-size="11" font-weight="500" fill="${colors.text}" text-anchor="middle">
                ${tech}
              </text>
            </g>
          `;
        }).join('')}
        ${techStack.map((tech, i) => {
          const x = totalWidth + i * tagSpacing + 20;
          return `
            <g transform="translate(${x}, 20)">
              <rect width="100" height="24" rx="6" fill="${colors.tagBg}" stroke="${colors.border}" stroke-width="1"/>
              <text x="50" y="16" font-family="JetBrains Mono, monospace" font-size="11" font-weight="500" fill="${colors.text}" text-anchor="middle">
                ${tech}
              </text>
            </g>
          `;
        }).join('')}
      </g>
    </svg>
  `.trim();

  return svgResponse(svg, 'public, max-age=3600, s-maxage=3600');
};
