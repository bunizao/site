import type { APIRoute } from 'astro';
import { svgResponse } from '../../lib/svg-response';

export const prerender = false;

const statusWords = [
  'Wondering',
  'Building',
  'Learning',
  'Exploring',
  'Creating',
  'Thinking',
  'Coding',
  'Designing',
  'Reading',
  'Writing',
  'Debugging',
  'Shipping',
  'Dreaming',
  'Hacking',
  'Optimizing',
  'Iterating',
  'Refactoring',
  'Brewing',
  'Crafting',
  'Tinkering',
  'Pondering',
  'Researching',
  'Prototyping',
  'Deploying',
  'Solving'
];

export const GET: APIRoute = ({ url }) => {
  const theme = url.searchParams.get('theme') || 'dark';

  // Random status based on current time (changes every 10 seconds)
  const index = Math.floor(Date.now() / 10000) % statusWords.length;
  const status = statusWords[index];

  // Theme colors
  const colors = theme === 'light'
    ? {
        bg: '#ffffff',
        border: '#e5e5e5',
        text: '#171717',
        muted: '#737373',
        dot: '#22c55e'
      }
    : {
        bg: '#0a0a0a',
        border: '#262626',
        text: '#fafafa',
        muted: '#a3a3a3',
        dot: '#22c55e'
      };

  const svg = `
    <svg width="200" height="40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @font-face {
            font-family: 'Geist Mono';
            src:
              url('/fonts/geist-mono-variable.woff2') format('woff2-variations'),
              url('/fonts/geist-mono-variable.woff2') format('woff2');
            font-weight: 100 900;
            font-style: normal;
          }

          @font-face {
            font-family: 'Geist';
            src:
              url('/fonts/geist-sans-variable.woff2') format('woff2-variations'),
              url('/fonts/geist-sans-variable.woff2') format('woff2');
            font-weight: 100 900;
            font-style: normal;
          }

          .status-container {
            font-family: 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }

          .status-dot {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }

          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        </style>
      </defs>

      <rect width="200" height="40" rx="8" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1"/>

      <circle class="status-dot" cx="20" cy="20" r="4" fill="${colors.dot}"/>

      <text x="32" y="25" font-family="Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" font-weight="500" fill="${colors.text}">
        ${status}
      </text>
    </svg>
  `.trim();

  return svgResponse(svg, 'public, max-age=10, s-maxage=10');
};
