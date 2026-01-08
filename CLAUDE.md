# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal bio/portfolio website built with:
- **SolidJS** - Reactive UI framework
- **Vite** - Build tool and dev server
- **vite-plugin-ssr** - SSR/SSG framework for file-based routing with prerendering
- **UnoCSS** - Atomic CSS engine with presets for icons, typography, and utilities
- **TypeScript** - Type-safe development

The site is deployed on Netlify and integrates with Vercel Analytics.

## Development Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Start development server
pnpm dev

# Build for production (runs TypeScript compiler + Vite build)
pnpm build

# Preview production build locally
pnpm preview
```

## Architecture

### SSR/SSG Pattern with vite-plugin-ssr

The project uses **vite-plugin-ssr** (v0.4.54) for server-side rendering with static prerendering enabled. This means:
- Pages are pre-rendered at build time to static HTML
- Client-side hydration happens for interactivity
- The framework uses file-based routing

### Key Directories

- **`pages/`** - Page routes and components
  - `pages/index/` - Home page route
    - `index.page.tsx` - Main page component
    - `_components/` - Page-specific components (Hero, Projects, Posts, Footer, Socials)
    - `api.ts` - Data fetching logic (Ghost CMS integration)
    - `hello.ts` - Internationalized greeting strings
- **`renderer/`** - SSR rendering logic (shared across all pages)
  - `_default.page.server.tsx` - Server-side rendering with meta tags and HTML structure
  - `_default.page.client.tsx` - Client-side hydration and Vercel Analytics injection
  - `types.ts` - Shared TypeScript types for page context
- **`assets/`** - Global styles and fonts
  - `main.css` - Custom CSS styles
  - `font.css` - Font-face declarations
  - Font files (IBM Plex Sans, Hubot Sans)
- **`public/`** - Static assets served as-is

### Rendering Flow

1. **Server-side (build time)**: `_default.page.server.tsx` renders each page to HTML string using SolidJS's `renderToString()`
2. **HTML generation**: Injects meta tags, title, and hydration script into HTML template
3. **Client-side**: `_default.page.client.tsx` hydrates the static HTML using SolidJS's `hydrate()` function
4. **Analytics**: Vercel Analytics is injected on the client side

### Component Patterns

- Components use **SolidJS** syntax (not React)
- Use `Index` from `solid-js` for list rendering (not `.map()`)
- Components are functional with arrow function syntax
- No hooks like `useState` - use SolidJS signals/stores if needed

### Styling

- **UnoCSS** with multiple presets:
  - `presetUno` - Tailwind-compatible utilities with media-based dark mode
  - `presetAttributify` - Attribute mode for utilities
  - `presetIcons` - Icon components via Iconify (e.g., `i-ri-arrow-right-up-line`)
  - `presetTypography` - Prose styling with custom link styles
- Custom CSS in `assets/main.css` for additional styling
- Class names follow Tailwind/UnoCSS conventions

### Data Fetching

- External data is fetched in `pages/index/api.ts`
- Currently integrates with Ghost CMS API for blog posts
- API key stored in `.env` as `VITE_GHOST_CONTENT_APIKEY`
- Uses standard `fetch()` API

### Environment Variables

- `VITE_GHOST_CONTENT_APIKEY` - Ghost CMS content API key for fetching blog posts
- Accessed via `import.meta.env.VITE_*` (Vite convention)

## Build Output

- Production build outputs to `dist/client/` (configured in netlify.toml)
- TypeScript compilation runs before Vite build
- Target is `esnext` for modern browsers

## Important Notes

- **Package manager**: This project uses **pnpm** (v9.15.0+), not npm or yarn
- **JSX**: Uses SolidJS JSX (`jsxImportSource: "solid-js"`), not React
- **No test suite**: There are no test commands or testing framework configured
- **No linting**: No ESLint or Prettier configuration present
- **Deployment**: Configured for Netlify with custom build command in `netlify.toml`
