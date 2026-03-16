import type { APIRoute } from 'astro';
import { svgResponse } from '../../lib/svg-response';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const theme = url.searchParams.get('theme') || 'dark';
  const days = url.searchParams.get('days') || '7';
  const projects = url.searchParams.get('projects') || '0';
  const commits = url.searchParams.get('commits') || '0';
  const added = url.searchParams.get('added') || '0';
  const removed = url.searchParams.get('removed') || '0';
  const net = url.searchParams.get('net') || '0';
  const lph = url.searchParams.get('lph') || '0';

  const colors = theme === 'light'
    ? {
        bg: '#ffffff',
        border: '#e5e5e5',
        text: '#171717',
        label: '#a3a3a3',
        separator: '#e5e5e5',
        green: '#16a34a',
        red: '#dc2626',
      }
    : {
        bg: '#0d1117',
        border: '#30363d',
        text: '#fafafa',
        label: '#525252',
        separator: '#30363d',
        green: '#3fb950',
        red: '#f85149',
      };

  const width = 330;
  const lineHeight = 22;
  const paddingY = 16;
  const paddingX = 20;

  type Line = {
    label: string;
    value?: string;
    custom?: string;
  };

  const lines: Line[] = [
    { label: 'activity scan', value: `last ${days} days` },
    { label: 'active projects', value: projects },
    { label: 'total commits', value: commits },
    {
      label: 'code delta',
      custom: [
        `<tspan fill="${colors.green}">${added}</tspan>`,
        `<tspan fill="${colors.label}"> / </tspan>`,
        `<tspan fill="${colors.red}">${removed}</tspan>`,
        `<tspan fill="${colors.label}"> / net </tspan>`,
        `<tspan fill="${colors.text}">${net}</tspan>`,
      ].join(''),
    },
    { label: 'avg output', value: `${lph} lines/hr` },
  ];

  const height = paddingY * 2 + lines.length * lineHeight;

  const rows = lines.map((line, i) => {
    const y = paddingY + i * lineHeight + 14;
    const separatorY = paddingY + (i + 1) * lineHeight;
    const showSeparator = i < lines.length - 1;
    const valueMarkup = line.custom
      ? `<text x="${width - paddingX}" y="${y}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600" text-anchor="end">${line.custom}</text>`
      : `<text x="${width - paddingX}" y="${y}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600" fill="${colors.text}" text-anchor="end">${line.value}</text>`;
    return `
      <g class="row" style="animation: fadeIn 0.4s ease ${i * 0.08}s both">
        <text x="${paddingX}" y="${y}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="400" fill="${colors.label}">${line.label}</text>
        ${valueMarkup}
        ${showSeparator ? `<line x1="${paddingX}" y1="${separatorY}" x2="${width - paddingX}" y2="${separatorY}" stroke="${colors.separator}" stroke-width="0.5" stroke-dasharray="2,2"/>` : ''}
      </g>
    `;
  }).join('');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .row {
            opacity: 0;
          }
        </style>
      </defs>
      <rect width="${width}" height="${height}" rx="6" fill="${colors.bg}"/>
      ${rows}
    </svg>
  `.trim();

  return svgResponse(svg, 'public, max-age=300, s-maxage=300');
};
