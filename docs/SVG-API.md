# SVG API Endpoints

This site exposes several SVG endpoints that can be embedded in GitHub READMEs or other markdown files.

## Available Endpoints

### 1. Status Badge

**Endpoint:** `/api/status.svg`

Displays a rotating status word with a pulsing green dot indicator.

**Parameters:**
- `theme` (optional): `light` or `dark` (default: `dark`)

**Example:**
```markdown
![Status](https://buxx.me/api/status.svg?theme=dark)
```

**Features:**
- Rotates through 25 different status words
- Updates every 10 seconds
- Animated pulsing dot
- JetBrains Mono font
- Cache: 10 seconds

---

### 2. Tech Stack Banner

**Endpoint:** `/api/tech-stack.svg`

Displays an animated horizontal scrolling banner of technologies.

**Parameters:**
- `theme` (optional): `light` or `dark` (default: `dark`)

**Example:**
```markdown
![Tech Stack](https://buxx.me/api/tech-stack.svg?theme=dark)
```

**Features:**
- Infinite scrolling animation
- 15 technology tags
- JetBrains Mono font
- Cache: 1 hour

---

### 3. Site Badge

**Endpoint:** `/api/site-badge.svg`

Small badge linking to buxx.me website.

**Parameters:**
- `theme` (optional): `light` or `dark` (default: `dark`)

**Example:**
```markdown
[![Visit Site](https://buxx.me/api/site-badge.svg?theme=dark)](https://buxx.me)
```

**Features:**
- Compact size (120x28)
- Arrow icon
- JetBrains Mono font
- Cache: 1 hour

---

### 4. Project Card

**Endpoint:** `/api/project.svg`

Displays a styled project card with live GitHub data.

**Parameters:**
- `project` (required): Project identifier
  - `tutubetterrules`
  - `attegi`
  - `mirrored`
  - `ogis`
  - `always-attend`
- `theme` (optional): `light` or `dark` (default: `dark`)

**Example:**
```markdown
[![TutuBetterRules](https://buxx.me/api/project.svg?project=tutubetterrules&theme=dark)](https://github.com/bunizao/TutuBetterRules)
```

**Features:**
- Live GitHub star count
- Project description
- Role badge (Author/Contributor)
- Technology tags
- JetBrains Mono font
- Cache: 1 hour

---

## Theme Support with Picture Element

For automatic dark/light mode switching based on user preference:

```markdown
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/status.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/status.svg?theme=light">
  <img src="https://buxx.me/api/status.svg?theme=dark" alt="Status" />
</picture>
```

This works for all endpoints that support the `theme` parameter.

---

## Color Scheme

### Dark Theme
- Background: `#0a0a0a`
- Border: `#262626`
- Text: `#fafafa`
- Muted: `#a3a3a3`
- Accent: `#22c55e` (green dot)

### Light Theme
- Background: `#ffffff`
- Border: `#e5e5e5`
- Text: `#171717`
- Muted: `#737373`
- Accent: `#22c55e` (green dot)

---

## Notes

- SVG endpoints are server-side rendered
- GitHub caches images, so updates may take a few minutes to reflect
- Status words rotate based on server time
- Project data is fetched from GitHub API at request time
