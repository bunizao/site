# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Code Standards

**IMPORTANT: Language Requirements**
- All code comments MUST be written in English
- All documentation MUST be written in English
- All commit messages MUST be written in English
- All variable names, function names, and identifiers MUST use English words
- No exceptions - English is the required language for all code-related content

## Project Overview

This is a personal bio/portfolio website built with:
- **Astro** - Static site generator with component-based architecture
- **React** - UI components via @astrojs/react integration
- **TailwindCSS** - Utility-first CSS framework with custom theme
- **TypeScript** - Type-safe development

The site is deployed on Netlify and integrates with Vercel Analytics.

## Development Commands

```bash
# Install dependencies (uses Bun)
bun install

# Start development server (runs on http://localhost:4321)
bun dev

# Build for production
bun run build

# Preview production build locally
bun preview
```

## Architecture

### Static Site Generation with Astro

The project uses **Astro** (v5.0+) for static site generation. Key characteristics:
- Pages are pre-rendered at build time to static HTML
- Client-side JavaScript is minimal and only loaded when needed
- React components are used for interactive UI elements (via @astrojs/react)
- Build output goes to `dist/` directory

### Key Directories

- **`src/pages/`** - Page routes (file-based routing)
  - `index.astro` - Home page that composes all sections
- **`src/components/`** - Reusable components
  - `Hero.astro` - Hero section with typewriter effect and status rotation
  - `Projects.astro` - Project showcase with GitHub API integration
  - `Posts.astro` - Blog posts from Ghost CMS
  - `GitHubContributions.astro` - GitHub contribution graph
  - `TechMarquee.astro` - Animated tech stack marquee
  - `Footer.astro` - Footer section
  - `Typewriter.astro` - Typewriter animation component
  - `Marquee.astro` - Base marquee component
  - `ui/` - React UI components (shadcn/ui style)
- **`src/layouts/`** - Layout templates
  - `Layout.astro` - Base layout with meta tags, theme toggle, and analytics
- **`src/styles/`** - Global styles
  - `globals.css` - Global CSS with Tailwind directives and custom styles

### Component Patterns

- **Astro Components** (`.astro` files):
  - Use Astro's component syntax with frontmatter (code between `---`)
  - Can fetch data at build time in the frontmatter
  - Support scoped `<style>` blocks and inline `<script>` tags
  - Use `<slot />` for content projection
- **React Components** (`.tsx` files):
  - Used for interactive UI elements (buttons, badges, etc.)
  - Imported from `lucide-react` for icons
  - Follow shadcn/ui patterns for styling

### Styling

- **TailwindCSS** with custom configuration:
  - Custom color system using CSS variables (HSL format)
  - Dark mode support via `class` strategy
  - Custom font family: JetBrains Mono (loaded from Google Fonts)
  - `tailwindcss-animate` plugin for animations
- **Scoped styles** in Astro components for component-specific styling
- **Global styles** in `src/styles/globals.css` for base styles and utilities

### Data Fetching

External data is fetched at build time in Astro component frontmatter:

1. **Ghost CMS Integration** (`Posts.astro`):
   - Fetches latest blog posts from Ghost CMS API
   - Uses `GHOST_URL` and `GHOST_CONTENT_APIKEY` environment variables
   - Displays post title, primary tag, and publish date

2. **GitHub API Integration** (`Projects.astro`):
   - Fetches repository data (description, stars) from GitHub API
   - Falls back to hardcoded descriptions if API fails
   - No authentication required (public API)

3. **GitHub Contributions** (`GitHubContributions.astro`):
   - Fetches contribution data from external API
   - Displays contribution graph with hover effects

### Environment Variables

- `GHOST_URL` - Ghost CMS instance URL (default: https://blog.buxx.me)
- `GHOST_CONTENT_APIKEY` - Ghost CMS content API key for fetching blog posts
- Accessed via `import.meta.env.*` (Vite/Astro convention)

### Animations and Interactions

The site features several custom animations:

1. **Scroll Reveal Animations**:
   - Uses Intersection Observer API to trigger animations on scroll
   - Staggered animations for lists (projects, posts)
   - Implemented in component `<script>` tags

2. **3D Tilt Effect** (`Projects.astro`):
   - Mouse-tracking tilt effect on project cards
   - Smooth interpolation using `requestAnimationFrame`
   - Glare effect that follows mouse position

3. **Typewriter Effect** (`Typewriter.astro`):
   - Animated typing effect for hero name
   - Cycles through multiple names

4. **Status Text Rotation** (`Hero.astro`):
   - Rotates through status words with slide animation
   - Updates every 3 seconds

5. **Theme Toggle** (`Layout.astro`):
   - Dark/light mode toggle with localStorage persistence
   - Respects system preference as fallback
   - Inline script to prevent flash of unstyled content

## Build Output

- Production build outputs to `dist/` directory
- Configured in `netlify.toml` for Netlify deployment
- Build command: `bun install && bun run build`

## Important Notes

- **Package manager**: This project uses **Bun** (v1.0+), not npm, yarn, or pnpm
- **Framework**: Uses **Astro** (not SolidJS or vite-plugin-ssr)
- **React integration**: React components are used selectively via @astrojs/react
- **No test suite**: There are no test commands or testing framework configured
- **No linting**: No ESLint or Prettier configuration present
- **Deployment**: Configured for Netlify with custom build command
