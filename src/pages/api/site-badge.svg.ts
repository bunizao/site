import type { APIRoute } from 'astro';
import { svgResponse } from '../../lib/svg-response';

export const prerender = false;

export const GET: APIRoute = ({ url, request }) => {
  // Parse query parameters from URL
  const searchParams = new URL(request.url).searchParams;
  const theme = searchParams.get('theme') || 'dark';
  const style = searchParams.get('style') || 'default';

  // Theme configurations
  const themes: Record<string, any> = {
    light: {
      bg: '#ffffff',
      bgGradientStart: '#ffffff',
      bgGradientEnd: '#f5f5f5',
      border: '#e5e5e5',
      text: '#171717',
      textShadow: 'rgba(0,0,0,0.1)',
      arrow: '#737373',
      arrowHover: '#171717',
      shadow: 'rgba(0,0,0,0.1)',
      glow: 'rgba(0,0,0,0.05)'
    },
    dark: {
      bg: '#0a0a0a',
      bgGradientStart: '#0a0a0a',
      bgGradientEnd: '#171717',
      border: '#262626',
      text: '#fafafa',
      textShadow: 'rgba(255,255,255,0.1)',
      arrow: '#a3a3a3',
      arrowHover: '#fafafa',
      shadow: 'rgba(0,0,0,0.5)',
      glow: 'rgba(255,255,255,0.1)'
    },
    glass: {
      bg: 'rgba(255,255,255,0.1)',
      bgGradientStart: 'rgba(255,255,255,0.15)',
      bgGradientEnd: 'rgba(255,255,255,0.05)',
      border: 'rgba(255,255,255,0.2)',
      text: '#ffffff',
      textShadow: 'rgba(0,0,0,0.3)',
      arrow: '#ffffff',
      arrowHover: '#ffffff',
      shadow: 'rgba(0,0,0,0.3)',
      glow: 'rgba(255,255,255,0.2)'
    },
    neon: {
      bg: '#0a0a0a',
      bgGradientStart: '#1a0a2e',
      bgGradientEnd: '#0a0a0a',
      border: '#6366f1',
      text: '#a5b4fc',
      textShadow: 'rgba(99,102,241,0.5)',
      arrow: '#818cf8',
      arrowHover: '#c7d2fe',
      shadow: 'rgba(99,102,241,0.3)',
      glow: 'rgba(99,102,241,0.4)'
    }
  };

  const colors = themes[theme] || themes.dark;
  const useGradient = style === 'gradient' || style === 'glass' || style === 'neon';

  const svg = `
    <svg width="130" height="32" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @font-face {
            font-family: 'JetBrains Mono';
            src:
              url('/fonts/jetbrains-mono-variable.woff2') format('woff2-variations'),
              url('/fonts/jetbrains-mono-variable.woff2') format('woff2');
            font-weight: 100 800;
            font-style: normal;
          }

          .badge-text {
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: -0.02em;
          }
        </style>

        ${useGradient ? `
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${colors.bgGradientStart};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${colors.bgGradientEnd};stop-opacity:1" />
        </linearGradient>
        ` : ''}

        ${style === 'neon' ? `
        <linearGradient id="neonGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${colors.border};stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:${colors.arrow};stop-opacity:0.8" />
        </linearGradient>
        ` : ''}

        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
          <feOffset dx="0" dy="1" result="offsetblur"/>
          <feFlood flood-color="${colors.shadow}"/>
          <feComposite in2="offsetblur" operator="in"/>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        ${style === 'neon' ? `
        <filter id="neonGlow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        ` : ''}

        ${style === 'glass' ? `
        <filter id="glass-blur">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.5"/>
        </filter>
        ` : ''}
      </defs>

      <!-- Background -->
      <rect
        width="130"
        height="32"
        rx="8"
        fill="${useGradient ? 'url(#bgGradient)' : colors.bg}"
        stroke="${style === 'neon' ? 'url(#neonGlow)' : colors.border}"
        stroke-width="1.5"
        ${style === 'glass' ? 'filter="url(#glass-blur)"' : ''}
        ${style === 'neon' ? 'filter="url(#neonGlow)"' : 'filter="url(#shadow)"'}
      />

      ${style === 'glass' ? `
      <!-- Glass shine effect -->
      <rect
        x="2"
        y="2"
        width="126"
        height="14"
        rx="6"
        fill="url(#bgGradient)"
        opacity="0.3"
      />
      ` : ''}

      <!-- Text -->
      <text
        x="14"
        y="21"
        class="badge-text"
        fill="${colors.text}"
      >
        buxx.me
      </text>

      <!-- Arrow icon -->
      <g transform="translate(104, 12)">
        <!-- Simple external link arrow -->
        <line x1="0" y1="8" x2="8" y2="0" stroke="${colors.arrow}" stroke-width="1.8" stroke-linecap="round"/>
        <polyline points="4,0 8,0 8,4" stroke="${colors.arrow}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </g>
    </svg>
  `.trim();

  return svgResponse(svg, 'public, max-age=86400, s-maxage=86400');
};
