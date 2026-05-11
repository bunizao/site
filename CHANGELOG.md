# Changelog

Generated from the full git history from `2026-01-08` to `2026-05-12` across `790` commits.

Overall breakdown: Foundation 1 · Feature 185 · Fix 259 · Performance 14 · Refactor 128 · Style 53 · Docs 38 · Test 18 · Maintenance 60 · CI 3 · Revert 6 · Merge 15 · Other 10.

Each entry keeps the full commit record, grouped into a readable timeline by month and day.

## 2026-01

282 commits. Foundation 1 · Feature 94 · Fix 27 · Performance 3 · Refactor 60 · Style 46 · Docs 14 · Maintenance 31 · Merge 4 · Other 2.

### 2026-01-08

- **Foundation** `7351f38` Bootstrapped the site repository.
- **Refactor** `7cd13fe` removing UnoCSS integration with Tailwind CSS and React
- **Refactor** `b646b2b` updated social links styling
- **Feature** `5cb117f` github contribution
- **Feature** `2a11f25` enhance GitHub contributions display with activity wave and streak calculations
- **Feature** `f37d74d` update Hero component to include TechMarquee and reorganize tech skills display
- **Refactor** `afbf1a4` improve project display layout and styling in Projects component
- **Feature** `c3866f1` add TechMarquee component for scrolling technology display
- **Style** `257495c` update section-label and add tech-divider and tech-stack styles
- **Refactor** `bf927ba` writing section
- **Feature** `dfca965` enhance Projects component with GitHub data fetching and improved project details display
- **Feature** `8487359` enhance Posts component to include post tags and improve metadata display
- **Style** `49fafe2` rename post-tags class to post-tag for consistency in Posts component
- **Style** `98b6d5d` update link elements in Posts and Projects components for consistency and improved hover effects
- **Style** `da7c992` redesign Footer component with improved layout, new links, and enhanced styling
- **Feature** `c4c8a84` implement dynamic loading and display of GitHub contributions with improved user feedback

### 2026-01-09

- **Style** `b7812c1` update footer copyright name and adjust font weight for improved readability
- **Feature** `3767516` update Hero component with new social link for Instagram, enhance tech stack, and revise personal bio
- **Feature** `a47dfe9` update Projects component with new project entries, enhance tags for existing projects, and adjust font weight for better readability
- **Maintenance** `612a3e7` change font from IBM Plex Mono to JetBrains Mono
- **Style** `14066e8` add font-weight to tech items for improved readability
- **Style** `5f71fe0` adjust padding and font weights in Posts component for improved readability
- **Style** `d424e03` update font family to JetBrains Mono and enhance h1 styling with font weight utilities
- **Style** `7eb7cfa` refine layout and spacing in GitHub contributions component for better responsiveness and readability
- **Style** `0ed06b4` adjust header layout and typography for improved responsiveness and readability in Hero component
- **Style** `be6764b` enhance layout and spacing in Posts component for improved responsiveness and readability across different screen sizes
- **Style** `72e0b43` refine layout and spacing in Projects component for improved responsiveness and readability across different screen sizes
- **Style** `cc4836e` adjust layout and spacing in TechMarquee component for improved responsiveness and readability across different screen sizes
- **Style** `965b81a` adjust section padding and theme toggle dimensions for improved responsiveness and consistency across screen sizes
- **Fix** `a9d8b3d` update social media links in Hero component with shortened links
- **Feature** `eac225b` add tooltip functionality to GitHub contributions component
- **Refactor** `f7504f4` brand new card design and fancy motion lol
- **Style** `ae97b76` update Hero component header class and add responsive styling for hero section
- **Style** `0a66af8` enhance visibility and animation effects in Posts component with scroll reveal functionality
- **Style** `2ad1072` implement scroll reveal animations and enhance visibility for Projects section
- **Feature** `eed151c` add dynamic status text rotation in Hero component with animation effects
- **Docs** `6a2cd0a` update docs to Astro with React integration and TailwindCSS for styling
- **Style** `170ebdb` simplify layout in Hero component by removing unnecessary max-width constraints
- **Feature** `525bf81` add MagneticButton and ScrambleText components with GSAP animations; implement ParallaxWrapper for enhanced scrolling effects
- **Feature** `59b01e0` add Vercel configuration for routing and redirection to blog
- **Maintenance** `09751a1` update title and description in index.astro to reflect new personal branding and interests
- **Feature** `531ada8` add Open Graph and Twitter meta tags
- **Feature** `0350441` replace Open Graph image
- **Feature** `bfc11ea` update imageAlt and title for personal branding consistency
- **Feature** `afe38c8` update Open Graph image and add dimensions for better rendering
- **Feature** `382fa97` enhance Open Graph and Twitter meta tags with image type and secure URL
- **Feature** `00b4803` implement Moods component to display latest posts from Telegram channel and create mood detail pages
- **Feature** `a861079` enhance Moods component with image previews and improved layout for better user experience
- **Feature** `5816f9f` improve Moods component by sorting latest posts and enhancing date formatting and text previews
- **Feature** `3d1d0dc` enhance Moods component with pagination, improved loading controls, and refined mood item display
- **Feature** `1b1df91` add new API route for fetching sorted mood posts with image previews and error handling
- **Feature** `d05092b` redesign bookmark card styles in mood posts for improved layout and interactivity
- **Feature** `9cb0590` update Astro configuration for server output and add Node adapter; disable prerendering for mood pages
- **Feature** `99fa287` change Astro output to hybrid and refactor Moods component

### 2026-01-10

- **Feature** `290e80d` update pnpm-lock.yaml with new dependencies and versions for improved compatibility and performance
- **Feature** `95ffecb` change Astro output configuration from hybrid to static
- **Feature** `3bfbf02` rename project to 'buxx.me', update version to 1.0.0, and upgrade @astrojs/node dependency to 9.5.1
- **Feature** `ee0c08c` refactor Moods component to group moods by date, enhance item display with media checks, and improve date formatting
- **Feature** `42a0b8b` add missing route handler in Vercel configuration for improved request handling
- **Feature** `c7433fc` enhance media handling in Moods component by introducing complex media checks, refactor video and audio processing, and improve back navigation in mood detail view
- **Feature** `db5dd11` enhance mood content processing by integrating cheerio for HTML parsing, improving media preview handling, and refining text preview extraction
- **Feature** `c67451b` update Vercel configuration to replace routes with redirects for improved URL handling
- **Maintenance** `1ae2b2d` Add environment variables for Ghost and Telegram
- **Feature** `0733d5b` refactor Moods component to utilize new mood-utils for improved media handling, enhance mood item rendering with inline media previews, and streamline error handling in mood loading
- **Refactor** `218343c` update Vercel configuration
- **Merge** `f96930c` Merged branch 'main' of github.com:bunizao/site
- **Feature** `974fe0e` enhance Moods component by increasing skeleton count, improving layout and styling, and refining mood item rendering with updated time formatting and error handling
- **Maintenance** `7f49ab6` update .gitignore to include .vercel and .env*.local, remove unused dependencies from package.json and pnpm-lock.yaml
- **Feature** `d7eb69c` redesign Moods component layout to utilize a three-column grid for improved readability, enhance skeleton loading styles, and refine mood item rendering with updated time formatting and meta content display
- **Maintenance** `86a6d2b` update Astro configuration to switch from Node adapter to Vercel adapter, update package dependencies, and refine Vercel routing settings for improved deployment compatibility
- **Feature** `5da9e57` implement GSAP for scroll reveal animations in Projects component, enhance 3D tilt effect with gyroscope support, and clean up CSS transitions for improved performance
- **Refactor** `2d206d6` removing gyroscope support and related mobile handling code
- **Feature** `b643b30` implement GSAP animations for Hero, Moods, and Posts components, enhancing entrance effects and scroll reveal functionality while cleaning up CSS transitions for improved performance
- **Maintenance** `6241b59` update LICENSE file
- **Feature** `554e2bb` add data-parallax attribute to Moods and Posts sections, update ParallaxWrapper to exclude sections with parallax off, and enhance CSS for scroll reveal animations based on JS class
- **Refactor** `2653523` update mood page layout and loading/error states, enhance CSS for improved user experience, and streamline mood item rendering logic
- **Refactor** `07a8fb4` adjust mood and mood post card styles for improved responsiveness and visual consistency, including padding, border radius, and background color updates
- **Feature** `ade3dad` implement static proxy for Telegram
- **Feature** `e355b14` enhance mood component with reactions support, including new reaction data structure, updated rendering logic, and improved image handling for portrait images
- **Feature** `f68257a` add support for rendering custom emojis
- **Fix** `0c52a2f` update Vercel routing configuration to include 'static' directory in the route exclusions
- **Refactor** `c9fc4a7` enhancing theme toggle functionality
- **Fix** `eeebdbe` improve video styling in mood component

### 2026-01-11

- **Feature** `01faaeb` implement static proxy route for handling requests with URL normalization and header management
- **Feature** `0b3ab43` add SVG API endpoints for project details and status updates, including dynamic GitHub stars and animated status messages
- **Feature** `a5a1f0a` create SVG API endpoint for dynamic site badge generation with customizable themes and styles
- **Refactor** `30ff4d8` improve theme toggle logic and add content type reference
- **Refactor** `c77bb6d` enhance theme toggle with View Transitions API and improve CSS animations
- **Refactor** `adfb279` improve mood component rendering with GSAP animations and skeleton fade-out effect
- **Refactor** `ae0efdc` adjust height calculation for GitHub contributions bars to improve visual representation
- **Feature** `82373c2` add RSS feed support to mood page with dynamic link and styling enhancements
- **Feature** `7a584ea` add dynamic Telegram link to mood page based on environment variable
- **Refactor** `98bf4fb` enhance mood component skeleton loading with dynamic patterns and improved animations
- **Refactor** `cac64cb` implement dynamic loading placeholders and enhance loading animations in mood component

### 2026-01-12

- **Docs** `b929e77` update README with site badge, SVG API endpoints, project structure, and licensing details
- **Maintenance** `c309861` replace PolyForm Noncommercial License with GNU Affero General Public License v3 to ensure compliance and community cooperation
- **Refactor** `ad443f3` remove load more button from mood component and implement inline loading indicators for improved user experience
- **Feature** `ff819d4` add SVG API documentation detailing available endpoints, parameters, and features for status badges, tech stack banners, site badges, and project cards
- **Feature** `153aa22` create OG image generator HTML template with responsive design and instructions for capturing screenshots
- **Maintenance** `794df6b` Change Dependabot update interval from weekly to daily
- **Docs** `bb4359d` update README to include new acknowledgement
- **Merge** `ef5bfa9` Merged branch 'main' of github.com:bunizao/site
- **Docs** `cf6ff5f` add new acknowledgement
- **Feature** `e19e02b` add personal information section to Hero component with styling for better user engagement
- **Maintenance** `83e896d` Add CodeQL analysis workflow configuration
- **Maintenance** `d4cfa25` Add OSSAR workflow for static analysis
- **Maintenance** `01daef7` update path-to-regexp dependency to version 6.3.0 and add overrides in package.json and pnpm-lock.yaml
- **Merge** `b66206f` Merged branch 'main' of github.com:bunizao/site
- **Refactor** `558d869` enhance HTML stripping functionality in stripHtml function using Cheerio for improved text extraction

### 2026-01-16

- **Refactor** `94f4885` optimize MagneticButton component for pointer events and improve GSAP integration
- **Maintenance** `ad21c89` update astro dependency to version 5.16.10 and related packages
- **Refactor** `ad206d8` enhance emoji handling in Telegram integration by optimizing HTML content modification and hydration processes
- **Feature** `f7eb989` add optional emojiId property to ReactionData interface for enhanced emoji management
- **Refactor** `4335a31` improve emoji rendering logic in Telegram integration by adding fallback text handling and enhancing HTML structure
- **Feature** `2da143a` implement animated emoji support in Telegram integration with loading and hydration management
- **Feature** `fc26712` add emojiId to reactions in moods API for improved emoji data handling
- **Feature** `900f3a3` implement animated emoji hydration and rendering logic in mood posts for enhanced user experience
- **Maintenance** `83cbe67` Delete .github/workflows/ossar.yml
- **Maintenance** `68735bc` Delete .github/workflows/codeql.yml
- **Maintenance** `c8d1121` refine mood item image styles for motion support
- **Maintenance** `7a898ff` remove unused reference to content.d.ts in types definition

### 2026-01-17

- **Feature** `07a5797` enhance social links with glassmorphism hover tooltips
- **Maintenance** [deps] `4d3763c` bump tar in the npm_and_yarn group across 1 directory

### 2026-01-19

- **Fix** `7ca8537` make mood stream links clickable
- **Feature** `842a247` show mood reactions in detail view
- **Fix** `ae34ced` skip mood placeholder on image-only cards
- **Style** `7e2fc13` move mood reactions to footer
- **Maintenance** `f88c92a` update development instructions in README to use Bun
- **Style** `2fa0bba` update link styles in mood pages
- **Feature** `92ccae1` add support for forwarded message data
- **Style** `b0de2d1` adjust spacing and margins in mood page components for improved layout
- **Style** `aebc44f` refine spacing, margins, and padding in mood page components for better visual consistency
- **Refactor** `6841971` card layout and refine spacing in mood components
- **Style** `be1f16e` enhance image handling and hover effects in mood components
- **Style** `6a104bf` update image preview styles and enhance layout in mood components
- **Style** `bfc2c2e` remove hover transform effect from mood thumbnails
- **Style** `5875b7f` update mood component styles by removing border-radius and enhancing hover effects
- **Style** `eeb5abf` enhance mood component styles with text clamping and detail links for long previews

### 2026-01-20

- **Style** `df98593` refine mood component styles with responsive adjustments, improved spacing, and hover effects
- **Style** `7deae64` update mood component and page styles with responsive adjustments, improved spacing, and hover effects
- **Style** `cf3fa1b` adjust border and add box-shadow to loading placeholders in mood component for improved visual depth
- **Refactor** `6ea2d0e` consolidate Telegram domain whitelisting and enhance proxy response handling

### 2026-01-21

- **Merge** `cb18658` Merged pull request #2 from bunizao/dependabot/npm_and_yarn/npm_and_yarn-bb754c2437
- **Feature** `91e20e7` add quote preview functionality and associated styles to mood component
- **Style** `fe35a75` refine mood component styles with adjustments to padding, border-radius, and font properties for improved aesthetics
- **Style** `5bd2973` simplify page container styles by consolidating max-width properties for improved responsiveness
- **Feature** `f636df1` implement linkification of text and HTML previews in mood component, enhancing user interaction with clickable links
- **Style** `bb18cbf` update link styles in mood components for improved visibility and hover effects
- **Style** `6b8ff3d` enhance social links layout in Hero component for better responsiveness and visual clarity
- **Style** `417d7fc` add hover and focus styles for mood item quotes to enhance interactivity and visual feedback
- **Maintenance** `6305aaa` migrate project from pnpm to Bun as the package manager
- **Maintenance** `b13d4c0` update development commands and package manager references to use Bun
- **Maintenance** `b57ba6c` remove CLAUDE.md file as it is no longer needed for project documentation
- **Maintenance** `76891b6` restore CLAUDE.md file to reference AGENTS.md for project documentation
- **Docs** `f5f37b2` update README with environment variable details and improve link formatting for better clarity
- **Docs** `3332209` clarify requirement for GITHUB_TOKEN in SVG-API documentation for live star count feature
- **Refactor** `14a7f82` replace direct GitHub API calls with centralized fetchGitHubRepo function for improved maintainability
- **Maintenance** `31d1b15` remove unused gsap import from ScrambleText
- **Refactor** `c92bde5` replace MagneticButton island with native magnetic effect
- **Performance** `7e59481` lazy-load gsap animations and honor reduced motion
- **Performance** `36a350a` defer vercel analytics injection
- **Fix** `31bfd89` always init parallax gsap
- **Fix** `fa9982c` restore gsap reveals for writing and moods
- **Refactor** `dd84f05` enhance fetchGitHubRepo function to support both GraphQL and REST API calls for improved flexibility
- **Fix** `2ac8269` restore gsap init for writing
- **Fix** `076451e` restore gsap init for moods
- **Performance** `7086767` load gsap upfront for projects
- **Feature** `bb3d8d2` add ice particles and cursor trail effects with GSAP animations
- **Maintenance** `a62ec27` update astro version to 5.16.11 and remove unused content type reference
- **Refactor** `354ea4e` replace mouse-based floating sections with GSAP scroll-triggered animations for smoother parallax effects
- **Style** `b14859a` disable mobile tap effects in global styles for improved user experience

### 2026-01-22

- **Feature** `c0f1d72` enhance theme toggle functionality with system mode and icon updates
- **Style** `0f86f59` update initial visibility states for projects section and cards to prevent layout shift
- **Refactor** `caaceee` remove ice particles and cursor trail effects to streamline ParallaxWrapper component
- **Refactor** `e08aa5d` dynamically import GSAP and optimize font loading for improved performance
- **Feature** `b7dd784` add @vercel/speed-insights dependency and integrate component into layout for performance monitoring
- **Maintenance** `ef2c910` update deployment configuration from Netlify to Vercel and enhance analytics integration
- **Refactor** `21c97e2` adjust parallax behavior and improve initial visibility states for projects section
- **Style** `5e7fdb2` add word-break and overflow-wrap properties to mood text for better text handling
- **Refactor** `e7c959f` update hero animation styles and remove GSAP-based entrance effects for improved performance and accessibility
- **Style** `97a34bd` enhance project list layout with responsive padding and max-width adjustments for better mobile display

### 2026-01-24

- **Feature** `ac56392` add media URL normalization and video attribute handling for improved media processing
- **Style** `277c176` enhance mood item media styles with overflow handling and radial gradient masking for improved visual presentation
- **Docs** `8b262d1` update API documentation to include JSON and SVG endpoints with detailed response structures and query parameters
- **Feature** `6e533ce` enhance quote preview functionality with author hiding and name stripping options for improved content presentation
- **Feature** `3bd582f` implement channel title handling and author normalization for improved quote display and content filtering
- **Style** `9ddcda7` update mood page styles with improved font sizes, padding, and line heights for better readability and visual consistency

### 2026-01-25

- **Feature** `8bfce91` enhance video element handling by adding source URL normalization and improved poster extraction for better media display
- **Style** `52175c9` adjust font sizes, padding, and line heights on mood page for improved readability and visual consistency
- **Feature** `08f0b25` implement mood hero section with dynamic avatar and channel info hydration for enhanced user experience
- **Feature** `308eb5d` add titleHTML to ChannelInfo and improve video attribute handling context for enhanced media processing
- **Feature** `331ef4d` add support for custom emoji in channel titles and enhance mood page styles with new emoji handling
- **Feature** `8a04862` optimize animation handling on mood page with visibility control and concurrent limit for improved performance
- **Feature** `6d4bbad` improve mood loading and rendering logic with enhanced caching and batching for better performance
- **Feature** `a1a0802` refine mood fetching and rendering process with improved post staging and flushing logic for enhanced performance
- **Refactor** `a180211` redesign mood loading state with a card-based skeleton structure for improved user experience and visual consistency
- **Feature** `6854e21` implement image and iframe loading optimizations with priority and lazy loading hints
- **Maintenance** `47ed02a` ignore Astro cache
- **Maintenance** `33897f5` add .astro to .gitignore to exclude Astro cache files
- **Maintenance** `5b0dd34` add .claude to .gitignore to exclude additional files
- **Fix** `f8953b2` update mood timeline role attribute for improved accessibility
- **Fix** `86e621f` update role attributes for mood components to enhance accessibility
- **Feature** `a56ce5a` enhance global header actions with theme dropdown and RSS/Telegram buttons for improved user interaction
- **Maintenance** `b907b66` add .playwright-mcp to .gitignore to exclude Playwright configuration files
- **Docs** `2c087fe` add image upload guidelines to AGENTS.md for better asset management
- **Feature** `50aa6aa` integrate GSAP for enhanced header button animations and update button structure for improved interactivity
- **Fix** `d44410a` update theme icon visibility in CSS for light and dark modes
- **Refactor** `0b441c7` replace GSAP CDN with module import for header animations and clean up related code

### 2026-01-28

- **Feature** `fa830e9` implement mobile header button auto-collapse on scroll past hero using GSAP
- **Feature** `00584ef` enhance theme dropdown with checkmark indicator for active items and adjust background styles
- **Feature** `2d5b877` implement comments section for mood posts
- **Fix** `25fd841` improve loading state handling and comments list management in mood posts
- **Fix** `20faccd` update comment parsing logic to handle different post ID attributes and improve avatar retrieval
- **Fix** `8759fd0` enhance comment parsing and loading logic to support pagination and improve UI responsiveness

### 2026-01-29

- **Refactor** `3f5c8d2` streamline mood comments section styles and enhance UI elements for better user experience
- **Refactor** `b378b51` remove unnecessary hover transition styles from mood comment components to simplify CSS
- **Refactor** `471b912` replace loading spinner with skeleton loading UI for mood comments to enhance user experience
- **Refactor** `069a6eb` simplify mood comments header layout and update styles for improved readability
- **Feature** `f15a576` add comments count feature to mood posts and enhance UI for comments display
- **Feature** `7645142` integrate Telegram MTProto support for comments count retrieval and enhance configuration options

### 2026-01-30

- **Refactor** `0588bf9` adjust spacing, sizing, and styles for mood comment components to enhance visual consistency
- **Maintenance** `3d4a69f` add .codex to .gitignore to prevent tracking of Codex-related files
- **Other** `df2f70d` Revert "feat: integrate Telegram MTProto support for comments count retrieval and enhance configuration options"
- **Refactor** `299314b` update styles for mood comment components to improve spacing, sizing, and overall visual consistency
- **Refactor** `d7295dc` enhance mood post content styles for improved readability and visual consistency
- **Refactor** `f9759d1` adjust padding for mood comment blockquotes to improve visual consistency
- **Refactor** `5fd327c` refine mood post styles for improved spacing, padding, and font sizes to enhance overall visual consistency
- **Refactor** `8ac0d58` enhance mobile styles for mood post and comments sections, improving spacing, font sizes, and overall visual consistency
- **Refactor** `8daa7a4` update spacing and padding for mood comments section to enhance visual consistency across different screen sizes
- **Refactor** `b30c422` update margin and padding for mood post header and comments sections to improve visual consistency across screen sizes
- **Refactor** `d3e9b1e` adjust margin, padding, and font sizes for mood post and reactions sections to enhance visual consistency across different screen sizes
- **Refactor** `eb2031d` increase font size for mood post content to enhance readability and visual consistency
- **Refactor** `f14124e` update ALWAYS_LOADING constant to use environment variable for improved debugging flexibility
- **Refactor** `5ff917e` improve skeleton loading styles for mood comments, enhancing visual consistency and user experience
- **Refactor** `2dd73d8` adjust skeleton loading styles for mood comments
- **Refactor** `d5898ed` modify margin and padding
- **Docs** `27b33a4` add commit message guidelines in AGENTS.md
- **Docs** `2bb2c78` update commit message examples in AGENTS.md
- **Feature** `dbaf473` implement comments popover for mood section, enhancing user interaction with comments display and loading states
- **Refactor** `871452f` enhance styles for mood comments popover, improving visual aesthetics and user experience
- **Refactor** `15a3ca4` update styles for mood comments popover, enhancing background, blur effects, and box shadows for improved aesthetics
- **Feature** `ed555a4` add oembed support to Layout component for mood page, enabling rich media embedding
- **Refactor** `4586054` streamline mood page embed handling by simplifying redirect logic and removing unused code

### 2026-01-31

- **Refactor** `2b9b8b6` simplify embed mode handling in mood page by updating redirect logic and variable naming
- **Refactor** `d879b4f` enhance image handling in mood pages by adding ultra-tall detection and updating styles for better responsiveness
- **Refactor** `8b5d061` improve avatar handling in channel info retrieval and streamline redirect logic in mood pages
- **Refactor** `3d350d7` remove unused formatTime import in mood embed component to clean up code
- **Refactor** `e4692f1` improve avatar URL handling by introducing proxy function and updating channel info retrieval logic
- **Docs** `c64e3a3` add oEmbed section to README with endpoint details and documentation links
- **Refactor** `b79f8f9` update mood reaction styles by removing transitions and adding border-radius for improved aesthetics
- **Fix** `3e44833` add oembed discovery on mood detail
- **Fix** `fcb505a` sanitize mood embed redirect
- **Fix** `8fc3557` embed mood detail in oembed
- **Fix** `2e3ba20` use dynamic oembed url on mood page
- **Fix** `ccbe430` add oembed preflight handler
- **Fix** `65ca9ea` validate oembed url host
- **Fix** `0249d44` drop invalid frame header
- **Fix** `8b29bcc` derive embed base from script url
- **Fix** `bd5a402` clamp embed refresh and disable cache
- **Fix** `7c9f150` update embed height on cached images
- **Fix** `73704d6` localize embed timestamps client-side
- **Docs** `c138f43` clarify oembed constraints
- **Feature** `d989cbf` extract stickers from comments in parseComment function
- **Fix** `6e0909b` parse mood detail path without regex
- **Feature** `53ae6ba` add frame parameter support for mood embeds and enhance iframe resizing
- **Docs** `8fab5af` add frame parameter to OEMBED API documentation and clarify iframe resizing instructions
- **Feature** `4ae361e` enhance OEMBED API with new parameters for density, font, origin, and link; improve height estimation and iframe resizing logic
- **Docs** `e393565` update OEMBED API documentation to improve iframe examples with responsive styles and lazy loading attributes
- **Feature** `495364c` enhance image handling in mood components by adding responsive srcset and dimensions support
- **Other** `e93ce7f` Revert "feat: enhance image handling in mood components by adding responsive srcset and dimensions support"
- **Feature** `d180bbb` implement HD image proxy support and fallback mechanism for image URLs in mood components
- **Feature** `cc83ed9` update Telegram message forwarding to use a temporary chat ID and increase rate limit delay
- **Maintenance** `39095c3` update KV namespace ID for Telegram image proxy configuration
- **Feature** `3612a23` add expand icon and detail link to mood items for improved navigation
- **Feature** `800e291` implement floating expand button for non-clickable mood items to enhance user interaction
- **Style** `ec7e20b` refine floating expand button appearance and behavior for mood items, adjusting dimensions and hover effects
- **Feature** `96e82d8` update floating expand button implementation to apply to all mood items, enhancing user accessibility
- **Feature** `55b8db8` add Telegram comment link and enhance comment section styling for mood items
- **Style** `2c8af29` update Telegram comment avatar to use an SVG logo and add timestamp to comment header for improved clarity
- **Style** `08d3f7a` enhance mood comment hover effects with gradient background, updated border color, and added box shadow
- **Style** `aff4c05` add aspect-ratio support for image previews and improve comment loading behavior to prevent layout shifts
- **Feature** `c23466d` implement selectLargestPhoto function to improve photo selection logic in Telegram history and webhook handling

## 2026-02

125 commits. Feature 47 · Fix 37 · Refactor 11 · Style 3 · Docs 5 · Test 5 · Maintenance 14 · Revert 1 · Merge 1 · Other 1.

### 2026-02-01

- **Feature** `08c949d` enhance image fetching logic with resizing and quality control for Telegram image proxy
- **Feature** `eeb3d7d` add responsive image handling with srcset and sizes attributes for improved display in Telegram image proxy
- **Maintenance** `9311121` add tsx dependency to package.json and bun.lock for improved TypeScript support
- **Feature** `2dd8374` implement responsive image handling for mood images, enhancing loading performance and display quality
- **Feature** `6eb14ef` optimize mood data fetching and enhance responsive image handling with srcset and sizes attributes
- **Style** `127b0b7` refine mood item layout with adjusted padding and hover effects, and remove unused popover arrow styling
- **Feature** `680dfc1` integrate MoodTimelineWheel component
- **Refactor** `ff0fe27` update MoodTimelineWheel component to display only the right arc, enhancing visibility and interaction; adjust styles and JavaScript for improved functionality

### 2026-02-04

- **Feature** `c99bc4c` add Cloudflare Worker for serving high-resolution Telegram images, including documentation and environment variable updates for improved image handling
- **Docs** `6ccdf3c` add IMAGE-QUALITY-UPGRADE documentation and update README for telegram-image-proxy to reflect improved image quality handling

### 2026-02-06

- **Refactor** `7693779` enhance MoodTimelineWheel component with improved arc masking, notch highlighting, and label styling for better user interaction and visual appeal
- **Refactor** `c3eb62f` update MoodTimelineWheel component to use feed element for scroll calculations, improving accuracy of progress tracking
- **Refactor** `512cd7a` enhance MoodTimelineWheel component with improved visual feedback, refined notch highlighting, and optimized rotation physics for smoother user interaction
- **Style** `133a296` simplify mood reaction styles by removing hover effects and transitions for a cleaner visual presentation
- **Feature** `b235c0e` implement loading skeleton for MoodTimelineWheel component, enhancing user experience during data fetching with animated notches and visibility adjustments
- **Feature** `982cd33` enhance loading state management in MoodTimelineWheel component with animated loading spin and synchronization for improved user experience during data fetching
- **Feature** `4de91ad` implement GSAP-driven loading animations in MoodTimelineWheel component, enhancing visual feedback with synchronized shimmer and pendulum effects during data fetching
- **Feature** `b0e7f75` add center sweep indicator to MoodTimelineWheel component, enhancing loading state visuals with a pulsing effect for improved user feedback during data fetching
- **Refactor** `d97ef5c` rename AGENTS.md to CLAUDE.md and update content to provide specific guidance for Claude Code, including streamlined code standards and enhanced project architecture details

### 2026-02-10

- **Feature** `bc15690` add mood update watcher and refresh notice
- **Feature** `5dd5c8e` add mood email notification pipeline
- **Feature** `960798b` split notify sender name and email
- **Fix** `b177201` adjust cron schedule for hobby plan
- **Feature** `4c92652` add mood email delivery scheduling
- **Maintenance** `51f31b3` update license and README
- **Feature** `84d825b` add shared api rate limiting
- **Fix** `7b68e3c` harden static proxy redirect handling
- **Fix** `05d7cfa` sanitize telegram content parsing
- **Fix** `a2b5f46` harden notify secret checks
- **Fix** `a8baea6` render mood comments with safe dom
- **Feature** `d7f6a65` add turnstile guard in notify subscribe
- **Refactor** `97bc7af` enhance mood update notice with dismiss button and improved styles
- **Maintenance** `5a661a2` add Turnstile configuration keys to .env and documentation
- **Feature** `ea6a08a` refine mood refresh notice animation
- **Maintenance** `7a1c118` add playwright e2e tooling
- **Test** `4eeb739` add api e2e behavior coverage
- **Test** `34d51e9` add page e2e behavior coverage
- **Fix** `2d372db` correct svg endpoint runtime params
- **Feature** `4a00bc5` implement notification subscription panel with Turnstile integration
- **Maintenance** `dc9e47f` update Astro configuration for improved build performance and HTML compression
- **Style** `84f7ebb` adjust padding and layout for mood update notice and action label
- **Refactor** `8d8cb2d` simplify mood update notice logic by removing dismiss button and related animations
- **Fix** `b47f135` update mood update notice text for clarity
- **Fix** `c771648` accept instant notify delivery alias
- **Fix** `238fe42` return already subscribed status
- **Feature** `55e6361` add email notification template preview and rendering logic
- **Fix** `53a2914` adjust notify panel behavior
- **Feature** `39e403c` redesign mood notification email card
- **Maintenance** `6a642b0` remove preview update flow
- **Fix** `72ce026` adjust iOS notify input scaling
- **Feature** `d13d5ab` add mood subscribe modal route
- **Docs** `eac4ac4` streamline README sections and env template comments
- **Feature** `9ce5321` add live notify preview and media markers
- **Fix** `610d5bc` keep notify panel open on already subscribed
- **Docs** `8f93025` add framework links in acknowledgements
- **Maintenance** `ae33064` add .tmp to .gitignore
- **Fix** `6790b33` proxy notify email image urls
- **Fix** `d199b04` proxy notify preview avatar url
- **Refactor** `08f769a` switch notify storage to Cloudflare D1
- **Test** `a9258f9` adapt notify e2e mock to D1
- **Maintenance** `ef737ec` add notify D1 schema and migration script
- **Docs** `ea4b60d` update notify D1 env and setup guide

### 2026-02-11

- **Fix** `1b4bad6` align mood feed images on mobile
- **Fix** `86ec4ef` normalize mobile mood item spacing
- **Maintenance** `03bcd46` checkpoint current changes
- **Maintenance** `ece321d` limit checkpoint scope
- **Feature** `9282032` add notify email media previews
- **Feature** `e1c0641` update interface radius and channel avatar proxy

### 2026-02-15

- **Fix** `729fd26` ignore custom emoji images in mood media detection
- **Fix** `607b7e3` narrow emoji media detection changes
- **Fix** `b71d3b3` restore mood feed image fallback selection
- **Fix** `0a64b1d` refine mood image extraction selectors
- **Fix** `47eb590` parse photo wrap background image in mood thumbnails

### 2026-02-18

- **Fix** `7c1d759` preserve emoji-only mood detail navigation
- **Fix** `5fef731` keep custom emoji in mood previews
- **Fix** `e40b327` normalize l0 custom emoji size
- **Merge** `52328bb` Merged pull request #4 from bunizao/codex/-mood-l1
- **Maintenance** `3a4269d` remove unused font assets
- **Feature** `f9bcbbe` self-host JetBrains Mono
- **Refactor** `657199e` use local font in generated content
- **Other** `2600794` security: restrict font sources in CSP

### 2026-02-19

- **Fix** `937778a` preserve line breaks in mood quotes
- **Fix** `40c0398` adjust confirm email button contrast
- **Fix** `efd3f00` preserve newsletter preview line breaks
- **Fix** `b8c3a8f` refine notify panel turnstile layout
- **Fix** `daca869` refine notify subscribe button UI

### 2026-02-26

- **Maintenance** `5eec503` add .agents to .gitignore
- **Feature** `57450ee` liquid glass refraction effect on social link tooltips
- **Fix** `f4029a6` remove button hover surface, raise tooltip opacity
- **Fix** `5dbc7fd` preserve rich text formatting in L1 mood feed
- **Fix** `0be3645` simplify rich text tag preservation, avoid replaceWith bug
- **Revert** `de74d15` remove social link tooltip dropdown
- **Fix** `eff19b2` lighten nav style, remove scroll-to-show
- **Feature** `9664a8f` vertical nav animation on scroll, hide on mood L1
- **Maintenance** `25c9725` update dev script to use op run with environment variable
- **Docs** `b2a4f13` update EMAIL-NOTIFY.md to reflect changes in Telegram image ingest and remove CLOUDFLARE_KV_NAMESPACE_ID requirement
- **Feature** `9bc1a5e` add backfill script for mood images from Telegram public pages
- **Maintenance** `6b1a6ec` update .env file to clarify legacy Cloudflare KV namespace usage and remove unnecessary comments
- **Feature** `befdeee` route webhook image indexing through worker ingest
- **Feature** `f0b552c` remove kv fallback from telegram image worker
- **Test** `6f65904` add worker image fallback e2e coverage
- **Feature** `6d376bd` add staggered typewriter + magnetic hover vertical nav
- **Feature** `8b8b8ab` make image worker return 404 on r2 miss
- **Feature** `1f0c1e8` add static proxy fallback on mood images
- **Test** `c661d33` cover static fallback on mood feed image

### 2026-02-27

- **Feature** `3911818` enhance vertical navigation with index indicators and scramble typewriter effect
- **Feature** [nav] `48d7797` V1 — 3D perspective tilt on container hover
- **Feature** [nav] `99c6d8e` V2 — cursor-tracking inner glow
- **Feature** [nav] `912e457` V3 — shimmering border light
- **Feature** [nav] `2f213a9` V4 — scale breathe + intensified backdrop
- **Feature** [nav] `623d1c8` V5 — combined polish with refined parameters
- **Fix** [nav] `95d4460` replace GSAP transform tweens with CSS custom properties
- **Feature** [nav] `5a8d36d` redesign container hover with spring physics ticker
- **Fix** [nav] `19a232c` align active indicator with correct positioning
- **Refactor** [nav] `7c48486` simplify vertical navigation by removing hover effects and physics
- **Feature** `be01e86` enhance vertical navigation with index indicators and scramble typewriter effect
- **Feature** [nav] `4047d5f` V1 — 3D perspective tilt on container hover
- **Feature** [nav] `33bd557` V2 — cursor-tracking inner glow
- **Feature** [nav] `18171bc` V3 — shimmering border light
- **Feature** [nav] `776a9a6` V4 — scale breathe + intensified backdrop
- **Feature** [nav] `712d191` V5 — combined polish with refined parameters
- **Fix** [nav] `bf323b5` replace GSAP transform tweens with CSS custom properties
- **Feature** [nav] `b9d70cb` redesign container hover with spring physics ticker
- **Fix** [nav] `87dcea6` align active indicator with correct positioning
- **Refactor** [nav] `28042bf` simplify vertical navigation by removing hover effects and physics

## 2026-03

96 commits. Feature 13 · Fix 29 · Performance 4 · Refactor 9 · Style 3 · Docs 9 · Test 4 · Maintenance 9 · CI 2 · Revert 3 · Merge 6 · Other 5.

### 2026-03-08

- **Fix** `161343b` preserve comment rich text
- **Docs** `c8fc8c9` add mood subscribe privacy policy
- **Style** `84e59d6` align privacy page with mood theme
- **Feature** `a4e6c68` add privacy page route
- **Style** `b5e8cf8` refine privacy page layout
- **Fix** `d9fa876` adjust privacy page navigation
- **Fix** `25ee32c` correct privacy page light theme
- **Feature** `34bf46f` add privacy links
- **Docs** `f3e1970` expand privacy policy scope
- **Merge** `9d3d40a` Merged pull request #5 from bunizao/privacy-policy
- **Feature** `4bf21ad` add office pixel MVP
- **Performance** [nav] `7287f9c` simplify collapse reveal timing
- **Fix** [nav] `34621a4` hide indicator outside vertical state
- **Performance** [nav] `3cb63a9` simplify collapse reveal timing
- **Fix** [nav] `f566b68` hide indicator outside vertical state
- **Fix** `502326a` refine global scrollbar behavior
- **Fix** [nav] `9fd47ca` sync indicator with active section
- **Revert** `aa18717` drop global scrollbar tweaks

### 2026-03-09

- **Fix** `ec3c95c` unify comment reply quotes
- **Fix** `54f3e5f` unify comment reply quotes
- **Feature** [nav] `fb9e2cd` add mobile privacy header bar
- **Style** [nav] `b3986be` tighten mobile privacy header
- **Fix** `e0a7383` refine comment reply preview
- **Fix** `203487a` align comment reactions
- **Fix** `6422683` rename privacy home link
- **Other** `9212c4a` Hide navbar on small screens
- **Maintenance** `7f0f03b` Update privacy navbar styling
- **Merge** `79bb73f` Merged pull request #6 from bunizao/fix/navbar-speed-indicator
- **Other** `add53bb` Merge remote-tracking branch 'origin/main'
- **Revert** `b27e27b` remove office page MVP
- **Test** `2ecca44` cover rich comment popover rendering
- **Refactor** `54b562a` unify comment content rendering
- **Merge** `7039275` Merged pull request #7 from bunizao/codex/fix-comment-rich-text-display
- **Maintenance** `b71674e` remove footer Astro credit
- **Other** `b46f281` Merge remote-tracking branch 'origin/main'
- **Other** `96cf9a8` Refactor privacy page to markdown
- **Refactor** `0575cfd` enhance comment rendering and styling

### 2026-03-10

- **Feature** `97b1024` add detailed reply card rendering for Telegram messages
- **Feature** `85b01a8` enhance Telegram post processing with reply variant support
- **Fix** `42e1294` update mood post content styling for improved layout
- **Other** `e3e087f` redesign: flat semi-transparent quote box on mood detail page
- **Feature** `988cd50` add hide site nav prop
- **Refactor** `c7b7f50` align mood quote markup classes

### 2026-03-11

- **Fix** `6b77db3` restore bot-backed mood image ingest
- **Refactor** `a589250` update mood post content styling for blockquotes and code blocks
- **Refactor** `cf61280` adjust mood post content typography and styles
- **Refactor** `1f47c55` improve mood post content layout and typography
- **Refactor** `817892c` refine mood post content typography and styles

### 2026-03-13

- **Feature** `c5db9af` load homepage projects from pinned repos
- **Fix** `da41315` fallback to GitHub profile pins

### 2026-03-14

- **Fix** `cae54cd` harden telegram image ingest
- **Fix** `3ed67af` index telegram media groups
- **Maintenance** `f2ace0c` update vulnerable dependencies
- **Maintenance** `ab0b959` update dependencies and add overrides for undici
- **Maintenance** `3129a5b` add E2E testing fixtures
- **Fix** `ec9f689` implement fallback mood ID in E2E tests
- **Maintenance** `80e884c` update dependencies and configuration for testing
- **Test** `80dd7c4` expand site e2e coverage
- **Maintenance** `0a53a72` upgrade Astro 6 toolchain
- **Test** `ee2e3d2` pin Playwright Astro Node runtime

### 2026-03-15

- **Fix** `543ee60` remove Astro 6 runtime drift
- **Merge** `db6c608` Merged pull request #8 from bunizao/codex/astro6-upgrade-plan
- **Maintenance** `6a3abe2` add type check baselines
- **Fix** `b2e1d70` resolve astro check errors

### 2026-03-16

- **Docs** `f832fa0` streamline AGENTS.md by removing redundant sections and clarifying architecture details
- **Feature** `e37ce68` add preview smoke workflow
- **Fix** `77913e0` refresh worker lockfile
- **Maintenance** `6c93dc2` run dev with bun
- **CI** `1e17f44` add pr test workflow
- **Fix** `42850ae` use node 22 in pr tests
- **Fix** `ee7bd7c` bypass protected preview smoke checks
- **Merge** `85ab0bc` Merged pull request #9 from bunizao/codex/astro6-type-cleanup
- **Fix** `2916b46` remove stroke from SVG rectangle in activity panel
- **Merge** `7169a38` Merged pull request #10 from bunizao/svg-enhancement
- **Docs** `eed476d` update SVG API documentation with new endpoints and parameters, enhance theme support using <picture> element

### 2026-03-17

- **Feature** `7a40dc9` add activity panel signature auth
- **Docs** `e0c1e32` document image ingest base url
- **Test** `821af99` add image ops health checks
- **CI** `f188092` add ops health workflow

### 2026-03-18

- **Fix** `c8df8e6` harden webhook image ingest transport
- **Feature** `5d79e7c` add worker telegram webhook

### 2026-03-19

- **Fix** `b9213b9` stabilize ops health image probe
- **Feature** `246db89` add hero grid highlight effect
- **Feature** `20d8f95` add global spotlight grid overlay
- **Refactor** `2e4d046` simplify spotlight highlight
- **Performance** `8cb2b91` smooth spotlight overlay animation
- **Performance** `5bd4ccc` tighten spotlight animation smoothing
- **Fix** `c1459ad` fade spotlight on mouse idle
- **Fix** `5bdee68` fade spotlight immediately after pointer stops
- **Fix** `36d0570` shorten spotlight idle fade

### 2026-03-20

- **Docs** `81496d5` add implementation architecture docs
- **Docs** `07e4ccf` update architecture documentation and remove outdated implementation files
- **Docs** `34beca2` fix formatting of file links in SECURITY.md
- **Docs** `e2d5ae0` add office runtime architecture link Co-authored-by: Codex <noreply@openai.com>
- **Revert** [main] `7b0f089` remove office auth draft

### 2026-03-21

- **Refactor** `fc74d81` enhance spotlight animation dynamics and styling adjustments

## 2026-04

169 commits. Feature 13 · Fix 111 · Performance 3 · Refactor 24 · Docs 8 · Test 4 · Maintenance 3 · Merge 2 · Other 1.

### 2026-04-06

- **Fix** `05f716e` replace not_supported video player with styled Telegram link card

### 2026-04-07

- **Docs** [telegram] `c91e9f8` add live photo issue
- **Fix** [telegram] `eaa0740` ingest live photo stills
- **Fix** `c15baf2` style not_supported video as blurred thumbnail with overlay
- **Fix** `bc7ba78` use css grid stacking for video-too-big, reset link border
- **Feature** [moods] `c4640e7` stabilize home preview loading
- **Fix** [mood] `e9e8a2d` prefer still previews in feed
- **Fix** [telegram] `8c24c13` fallback unsupported media
- **Fix** [mood] `c97c7fe` repair video preview layout
- **Other** `e7ed031` merge(pr-16): integrate oversized video handling
- **Fix** [worker] `bfd954e` repair mood image variants
- **Test** [worker] `01d7f4f` cover variant repair flow
- **Fix** [moods] `ee82c74` load smaller home thumbnails
- **Fix** [mood] `03f0ffd` separate oversized feed previews
- **Fix** [mood] `0ad0776` stabilize oversized detail cards

### 2026-04-08

- **Docs** [mood] `d0f3a02` add decoupling plan
- **Fix** [moods] `cff5048` stabilize home preview loading
- **Fix** [mood] `aa37bd4` refine video card alignment
- **Fix** [mood] `ad28739` wrap feed videos in frames
- **Fix** `9cf14e7` avoid duplicate live photo fallback
- **Test** `a2653f2` add telegram media fallback regressions
- **Fix** [mood] `c5d8e40` stabilize image layout loading
- **Fix** [mood] `3acd38b` improve telegram media fallbacks
- **Fix** `96d125a` align mood feed video preview
- **Fix** `8ad7a41` match mood feed video card style
- **Fix** [mood] `3abc2f4` tighten quote media thumbnails
- **Fix** `cf31e7a` tighten media-only quote cards
- **Fix** `f03a2a6` correct mood fallback image sizing
- **Feature** `a058225` add mixed-media quote layout
- **Feature** [mood] `5e678f3` refine quote media layout
- **Fix** `52720b5` prevent mood feed video card shrink
- **Fix** `69bc846` reduce mood feed video preview size
- **Fix** [mood] `f705bad` align media quote content left
- **Fix** `a12519c` stop inferred reply thumbnails
- **Fix** `bfaee87` tighten Telegram unsupported media fallback
- **Fix** `93ba3ba` stop inferred quote thumbnails
- **Fix** `62e24de` render live photo fallback image
- **Test** `8e5bfab` cover live photo fallback health

### 2026-04-09

- **Fix** `c5b5026` recover live photo detail fallbacks
- **Fix** `a75e7b0` recover live photo mood feed previews
- **Feature** `b6baed0` add mood gallery
- **Fix** `c544b32` respect mood gallery aspect ratios
- **Fix** `15d844b` remove mood gallery placeholder frames
- **Fix** `3d6f25d` keep single mood images upstream
- **Fix** `2e26be9` match mood gallery image bounds
- **Fix** `6033e71` remove mood gallery badges

### 2026-04-10

- **Fix** `7d750ab` use lightbox layout for mood detail galleries
- **Fix** `f020e01` stack mood detail galleries
- **Fix** `45dda33` reduce overlap in mood detail stacks
- **Fix** `7d31438` fan out mood detail stacks
- **Feature** `255a4e6` use justified layout for mood detail galleries
- **Fix** `39860d9` widen side images in mood detail collage
- **Fix** `58184f0` remove custom mood detail collage
- **Fix** `799beef` use natural ratios in mood detail layout
- **Fix** `05069e1` enlarge mood detail justified gallery
- **Fix** `325dcbe` remove mood detail row heuristics

### 2026-04-12

- **Refactor** [mood] `827a018` migrate stage one routes
- **Refactor** [mood] `5693153` extract server services
- **Refactor** [mood] `80c98f9` extract client utility modules
- **Refactor** `76defe1` extract mood detail shells
- **Refactor** `3b43e9c` extract mood notify shell
- **Refactor** `7b136e1` extract mood feed shells
- **Refactor** `773502f` rename mood shell components
- **Fix** `9ef4805` render emoji comment reactions
- **Refactor** `1e5e014` share animated emoji manager
- **Refactor** `73dc4f1` extract mood feed controller
- **Fix** `2dc7e95` constrain comment emoji reactions
- **Refactor** `2947ce4` unify mood reaction styles
- **Fix** `49879b5` stabilize unresolved mood feed images
- **Refactor** `d40199e` move mood ui into feature boundary
- **Refactor** `a50a995` move notify into feature boundary
- **Refactor** `7d097be` move home ui into feature boundary
- **Refactor** `86bbca5` align feature-private utility ui
- **Refactor** `9d126c4` split feature e2e fixtures
- **Refactor** `be0ccef` move mood utils into feature boundary
- **Maintenance** `deeecb4` remove unused ui files
- **Refactor** `5d58338` move mood comment helpers into feature
- **Refactor** `b961856` move telegram parser into mood feature
- **Fix** `f98999a` align mood detail parser import
- **Maintenance** `f41a482` remove unused shadcn files
- **Maintenance** `44ab4da` drop unused ui dependencies
- **Feature** [mood] `0bd53d4` add shared route helper primitives
- **Feature** `032005b` add apple music listening demo
- **Fix** `64c7fc1` stack listening header controls

### 2026-04-15

- **Fix** `ce795c0` extend ops health timeout

### 2026-04-18

- **Fix** [mood] `9d40955` harden telegram media helpers
- **Fix** [home] `44de118` sync listening panel state
- **Fix** [mood] `5871736` address code scanning comments
- **Fix** [mood] `d3567b3` satisfy worker body types
- **Refactor** [mood] `2ef0b58` extract feed comments popover
- **Refactor** [mood] `68a4301` extract feed update watcher
- **Refactor** [mood] `5c8cda8` extract feed media hydration
- **Refactor** [mood] `6015904` extract feed renderer
- **Fix** [mood] `93402f9` guard feed renderer bindings

### 2026-04-19

- **Merge** `348d629` Merged pull request #19 from bunizao/codex/mood-decoupling
- **Docs** `a4c9f7d` sync mood architecture docs

### 2026-04-25

- **Refactor** `34f0828` redesign hero listening status
- **Refactor** `b3c4cc0` simplify listening controls
- **Feature** `ebd2781` animate active listening state

### 2026-04-26

- **Feature** `9866ad8` add animated listening artwork
- **Feature** `1aa58e3` add lastfm listening source
- **Fix** `cf31931` refine listening tonearm
- **Fix** `1a9164a` enlarge listening record art
- **Fix** `6805ee4` tighten listening record spacing
- **Fix** `71bee8b` refine listening record texture
- **Fix** `2068278` strengthen listening record sheen
- **Fix** `210a7a5` park listening tonearm off record
- **Fix** `1557e89` reposition listening tonearm pivot
- **Fix** `12dd11d` restore listening tonearm state
- **Fix** `88870b0` disable astro dev toolbar
- **Fix** `62f078d` soften listening hover motion
- **Fix** `9ed08c1` move listening hover to tonearm
- **Fix** `ec6c7ef` split listening live and preview states
- **Fix** `a8e113b` scroll long listening titles
- **Fix** `8869198` soften listening status dot
- **Fix** `8c09889` refine listening text rhythm
- **Fix** `479738f` inline compact listening tracks
- **Fix** `ecd86b4` loosen listening heading spacing
- **Fix** `8cc9fed` constrain stacked listening text
- **Test** `33fcf18` cover listening responsive layout
- **Fix** `a9b5f8c` remove legacy listening panel remnants
- **Fix** `8639556` clear listening check errors
- **Fix** `7ec2e3d` remove listening record spindle
- **Fix** `839a78b` improve mobile hero spacing
- **Fix** `75e4ede` tighten mobile hero activity spacing
- **Merge** `4fea00f` Merged pull request #20 from bunizao/codex/listening-widget
- **Docs** `37eb3a3` update acknowledgements
- **Docs** `96eaac5` restore acknowledgement entries
- **Performance** [home] `c160b76` reduce hero LCP delay
- **Performance** [home] `d27ce06` defer below fold work
- **Performance** [mood] `6015c5d` avoid static proxy redirects
- **Docs** `1dade92` add acknowledgements references
- **Fix** `3860441` defer home listening island
- **Fix** `694192c` restore hero entrance animation
- **Fix** `9c9f8a0` hydrate listening from client
- **Feature** `4d84aa2` extract listening accent with vibrant

### 2026-04-27

- **Fix** `d20d863` animate listening preview state
- **Fix** [mood] `402ac3d` keep sticker media from fallback
- **Fix** [mood] `701e026` stabilize home preview cards
- **Fix** [mood] `c9dedfb` constrain sticker feed thumbnails
- **Fix** [mood] `76afc38` use video posters for quote thumbs
- **Fix** [mood] `390753c` constrain detail comments width
- **Fix** [mood] `10fdf42` render media in detail comments
- **Fix** [mood] `7c0a1b8` compact comment media previews
- **Fix** [mood] `0c08271` collapse header actions on compact scroll

### 2026-04-28

- **Docs** `f19bbcc` update listening privacy policy
- **Fix** `8dfa10e` resolve ops health image URLs

### 2026-04-29

- **Fix** `693ca64` align mood embed rich text
- **Fix** `f71cd30` render newsletter rich previews
- **Fix** `884cc99` reject reserved notify emails
- **Fix** `3872407` render newsletter bookmark cards
- **Fix** `b5f76e6` align mood detail quote cards
- **Fix** `a89d98a` refine bookmark card hierarchy
- **Fix** `6f65d8a` hide internal mood quote authors
- **Fix** `04bfa41` soften digest separators
- **Fix** `516d086` flatten mood detail quote surface
- **Fix** `5f32d23` constrain mood detail quote text
- **Fix** `c331b31` dedupe bookmark digest previews
- **Fix** `fbb18b0` separate mood detail quote from text
- **Fix** `ae8f305` remove digest post cta
- **Fix** `5f8ffce` refine mood detail quote layout
- **Fix** `c7c62cd` stack mood detail quotes
- **Fix** `af8cdbd` rebalance mood detail text scale
- **Fix** `2c1d6e5` render detail quotes in mood embeds
- **Fix** `c3bbed2` align embed image rendering

### 2026-04-30

- **Docs** [mood] `0f8a51f` add LLM discovery file
- **Fix** [config] `2aa6e7d` restrict blog redirects
- **Feature** [mood] `637c9c9` add agent markdown feed
- **Feature** [mood] `70db663` add agent post markdown

## 2026-05

118 commits. Feature 18 · Fix 55 · Performance 4 · Refactor 24 · Style 1 · Docs 2 · Test 5 · Maintenance 3 · CI 1 · Revert 2 · Merge 2 · Other 1.

### 2026-05-01

- **Feature** [error-page] `2bfaf90` add animated 404 page
- **Refactor** [error-page] `998326d` simplify pixel 404 design
- **Feature** [error-page] `877d2f1` add geist pixel canvas motion
- **Refactor** [error-page] `625f717` tune displacement line effect
- **Refactor** [error-page] `04a5b20` restore solid canvas motion
- **Refactor** [error-page] `b6fff18` amplify canvas motion
- **Refactor** [error-page] `5a4d6ef` simplify visual treatment
- **Refactor** [error-page] `c6b2f06` tune mono callback
- **Refactor** [error-page] `bc34ce8` self-host geist mono
- **Refactor** [error-page] `3ea7772` add hover feedback
- **Refactor** [error-page] `c577282` refine hover motion
- **Refactor** [error-page] `dcad683` trigger callback on hover leave
- **Fix** [error-page] `295bf3e` remove duplicate hover text
- **Refactor** [error-page] `0bced09` add idle number motion

### 2026-05-02

- **Refactor** [error-page] `3911e14` add trace interaction
- **Refactor** [error-page] `d550bdf` soften dark mode contrast
- **Fix** [error-page] `42382a0` align footer copy

### 2026-05-03

- **Fix** `bb9297d` tighten mood oembed width
- **Fix** `f511dea` render mood embed video media

### 2026-05-04

- **Feature** [notify] `e93f1f9` harden unsubscribe flow
- **Test** [notify] `784a4bf` cover unsubscribe audit flow
- **CI** `4bc248e` run notify unit tests
- **Fix** [home] `f164d81` narrow listening palette candidates
- **Feature** [notify] `d435c81` alert admin on subscription changes
- **Feature** [notify] `a47efed` send welcome and cancel emails
- **Feature** [notify] `29e725c` preview welcome and cancel emails
- **Fix** [dev] `84fa590` skip analytics injection in development

### 2026-05-06

- **Maintenance** `6b5ee13` add root verification file
- **Feature** `576841d` add pixel logo mascots
- **Fix** `b42c000` remove peek from hero
- **Fix** `1f84973` use peek as site logo
- **Feature** `9174a19` rebuild pixel navbar
- **Other** `c2fdf5a` Revert "feat: rebuild pixel navbar"
- **Fix** `7c775b4` scope pixel navbar
- **Fix** `f2d456b` constrain home navbar modes
- **Fix** `960c61d` refine peek navbar interactions
- **Fix** `2f8af84` sequence mobile navbar labels

### 2026-05-07

- **Fix** `c7906c2` refine desktop navbar motion
- **Fix** `d402bb6` keep peek anchored in desktop nav
- **Fix** `17ffe34` remove desktop nav cursor clutter
- **Fix** `31487f3` reposition desktop home nav rail
- **Fix** [favicon] `4bdd290` invert peek in dark mode
- **Fix** `90d93a8` adjust mobile nav spacing
- **Fix** `72fbc46` align mobile brand text
- **Fix** `4435a5f` restore mobile brand logo size
- **Fix** `c8544cc` loosen mobile brand spacing
- **Fix** `0203cd5` unify mobile nav theme action
- **Fix** `34d40b8` restore mobile brand lockup
- **Fix** `ffe044d` scroll brand click home

### 2026-05-08

- **Performance** [mood] `61f30c2` preload initial home and feed payloads
- **Feature** [nav] `5814e0b` spring physics for peek logo — pointer-follow + idle bob
- **Fix** [nav] `8a2ad1a` raise z-index and isolate stacking context

### 2026-05-09

- **Performance** `3f2d680` reduce realtime duplicate requests
- **Test** `f507ac6` restore realtime route fixtures
- **Maintenance** [deps] `f7dace5` update astro stack
- **Merge** `95226ae` Merged pull request #22 from bunizao/codex/perf-initial-payloads
- **Feature** [dev] `4390015` add mascot preview routes
- **Feature** [peek] `1735fbd` redesign mascot to γ-pose 20×14 with 7 animations
- **Feature** [peek] `36b87bc` wire nav interactions to mascot expressions
- **Fix** [peek] `17d3163` redesign pixel grid — compact head, 1×2 eyes, centered ears
- **Revert** [peek] `4d8a835` restore original 10×7 head-only design
- **Fix** [favicon] `0f0d6a3` bump cache-bust version to force favicon refresh
- **Feature** [404] `0745f65` add peek mascot above 404 with nav-synced expressions
- **Refactor** [404] `d853973` rework peek placement and CTA layout
- **Fix** [peek] `dda2f86` rewrite nap frames — solid body, nose-only pulse, 3 fps
- **Refactor** [dev] `c18ca85` unify preview route
- **Refactor** [peek] `62031e4` organize mascot gallery states
- **Feature** [peek] `a86c9af` add tracking pose demo
- **Feature** [peek] `c68bf61` vendor mascot lab preview
- **Fix** [peek] `7b3e2ab` restore motion preview alongside lookbook
- **Feature** [404] `b5c8da9` show requested path and animate peek
- **Fix** [peek] `1a26cb1` scope vendored lab to peek only
- **Refactor** [peek] `c8f6ced` fold added looks into preview

### 2026-05-10

- **Docs** `e07293b` describe mascot catalog split
- **Refactor** `d1ff7ad` add peek mascot catalog
- **Refactor** `b47383e` wire peek mascot consumers
- **Test** `53fbafc` cover peek mascot catalog
- **Refactor** `28ceb5a` split peek mascot assets
- **Refactor** `fa4d45a` remove shared peek model stubs
- **Style** `8d68e4c` polish peek navbar states
- **Fix** `c326633` satisfy mascot astro check
- **Fix** `501b71a` avoid 404 layout thrash
- **Feature** `e322cdf` fold peek into 404 home cta
- **Fix** `a010e37` prevent mobile nav label clipping
- **Fix** `4977b7b` align mood navbar mobile behavior
- **Revert** `0443ad6` remove mood sticky navbar
- **Fix** `5cf724a` scope mobile theme toggle style
- **Fix** `211573d` extend home header actions privacy
- **Refactor** [dev-preview] `7721345` rebuild mascot console with site design language
- **Refactor** [notify] `9212fb1` restyle template preview, match dev console chrome
- **Fix** `a60b21c` align hero spacing with safe area
- **Fix** `514c322` increase mobile hero top offset
- **Fix** `1bc3823` stabilize mobile navbar brand
- **Fix** `160f1b1` release navbar brand space
- **Fix** `5da3782` offset safari navbar safe area
- **Fix** `4f97247` hide preview navbar
- **Test** `e79afee` cover navbar regressions
- **Fix** [mood] `793c2f4` stabilize home preview placeholder
- **Fix** [navbar] `a6b1ea4` center mobile scroll state
- **Fix** [navbar] `48d3481` center mobile link group between brand and theme button

### 2026-05-11

- **Docs** `8752db2` simplify mascot guide
- **Feature** `2aa9e80` add seo discovery metadata
- **Maintenance** `fa7c764` remove ascii moon dev page
- **Fix** [nav] `72e05e8` align privacy brand chrome
- **Fix** [nav] `b44920d` tune privacy brand gap
- **Fix** `2289665` use stable mood detail titles
- **Refactor** [nav] `acf92a9` share brand chrome tokens
- **Fix** `9e52dbb` slim peek navbar runtime
- **Performance** [navbar] `c3ca431` reduce client side work
- **Fix** [navbar] `8388c63` hide logo frame payload
- **Fix** [listening] `a9e3f46` restore artwork accent sampling
- **Fix** [listening] `bb31aa5` select accent swatch
- **Fix** [mood] `87fdf24` track roulette date sections

### 2026-05-12

- **Fix** [mood] `c579751` use inline reply thumbnails
- **Fix** [mood] `0f0dc2b` harden quote thumbnails
- **Test** [mood] `a5f45a2` cover quote media matrix
- **Performance** [mood] `740f3d0` smooth roulette scroll tracking
- **Merge** `f85e0cb` sync origin/main
