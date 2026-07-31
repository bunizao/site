import type {
  AuthorData,
  PageRecord,
  PostRecord,
  SiteData,
  TagData,
  TierData,
} from '../types/index';

const MOCK_SITE_URL = 'http://127.0.0.1:4321';

export const mockSite: SiteData = {
  title: 'Attegi Astro',
  description: 'A headless Astro port of the Attegi Ghost theme, verified locally with mock content.',
  url: MOCK_SITE_URL,
  locale: 'en',
  logo: '/mock/logo.svg',
  icon: '/mock/icon.svg',
  coverImage: '/mock/home-cover.svg',
  accentColor: '#5EEAD4',
  metaTitle: 'Attegi Astro',
  metaDescription: 'Ghost content rendered directly in Astro with the original interaction layer intact.',
  twitter: null,
  facebook: null,
  navigation: [
    { label: 'Home', url: '/' },
    { label: 'About', url: '/about/' },
    { label: 'Links', url: '/links/' },
    { label: 'Topics', url: '/tags/' },
  ],
  secondaryNavigation: [],
  codeInjectionHead: null,
  codeInjectionFoot: null,
};

export const mockAuthors: AuthorData[] = [
  {
    id: 'author-iris',
    slug: 'iris-zhang',
    name: 'Iris Zhang',
    url: '/author/iris-zhang/',
    bio: 'Builds product surfaces that stay elegant after the fourth rewrite.',
    profileImage: '/mock/author-iris.svg',
    coverImage: '/mock/tag-systems.svg',
    website: 'https://example.com/iris',
    twitter: null,
    facebook: null,
    postCount: 5,
  },
  {
    id: 'author-sam',
    slug: 'sam-lin',
    name: 'Sam Lin',
    url: '/author/sam-lin/',
    bio: 'Cuts abstractions until the code can breathe again.',
    profileImage: '/mock/author-sam.svg',
    coverImage: '/mock/tag-craft.svg',
    website: 'https://example.com/sam',
    twitter: null,
    facebook: null,
    postCount: 4,
  },
];

const systemsTagIcon = `
<template data-tag-icon>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="7" height="7" rx="2"></rect>
    <rect x="14" y="4" width="7" height="7" rx="2"></rect>
    <rect x="8.5" y="13" width="7" height="7" rx="2"></rect>
    <path d="M10 7.5h4"></path>
    <path d="M12 11v2"></path>
  </svg>
</template>
`.trim();

const craftTagIcon = `
<template data-tag-icon>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 20l5.5-1.5L20 8c.8-.8.8-2 0-2.8l-1.2-1.2c-.8-.8-2-.8-2.8 0L5.5 14.5 4 20z"></path>
    <path d="M13.5 6.5l4 4"></path>
  </svg>
</template>
`.trim();

export const mockTags: TagData[] = [
  {
    id: 'tag-systems',
    slug: 'systems',
    name: 'Systems',
    url: '/tag/systems/',
    description: 'Architecture, migration strategy, and making complex systems boring again.',
    featureImage: '/mock/tag-systems.svg',
    accentColor: '#38BDF8',
    visibility: 'public',
    codeInjectionHead: systemsTagIcon,
    postCount: 5,
  },
  {
    id: 'tag-craft',
    slug: 'craft',
    name: 'Craft',
    url: '/tag/craft/',
    description: 'Small decisions with outsized UX consequences.',
    featureImage: '/mock/tag-craft.svg',
    accentColor: '#F59E0B',
    visibility: 'public',
    codeInjectionHead: craftTagIcon,
    postCount: 4,
  },
  {
    id: 'tag-not-by-ai',
    slug: 'hash-not-by-ai',
    name: '#not-by-ai',
    url: '/tag/hash-not-by-ai/',
    description: null,
    featureImage: null,
    accentColor: null,
    visibility: 'internal',
    codeInjectionHead: null,
    postCount: 1,
  },
  {
    id: 'tag-no-toc',
    slug: 'hash-no-toc',
    name: '#no-toc',
    url: '/tag/hash-no-toc/',
    description: null,
    featureImage: null,
    accentColor: null,
    visibility: 'internal',
    codeInjectionHead: null,
    postCount: 1,
  },
];

export const mockTiers: TierData[] = [
  {
    id: 'tier-free',
    slug: 'free',
    name: 'Free',
    description: 'Occasional essays, links, and public notes.',
    active: true,
    type: 'free',
    welcomePageUrl: null,
    monthlyPrice: null,
    yearlyPrice: null,
    currency: null,
    benefits: ['Public posts', 'Search access'],
    visibility: 'public',
  },
  {
    id: 'tier-supporter',
    slug: 'supporter',
    name: 'Supporter',
    description: 'A placeholder paid tier for headless member flows.',
    active: true,
    type: 'paid',
    welcomePageUrl: null,
    monthlyPrice: 500,
    yearlyPrice: 5000,
    currency: 'usd',
    benefits: ['Everything in Free', 'Support the blog'],
    visibility: 'public',
  },
];

const demoCommentsHtml = `
<div class="mock-comments-list">
  <article class="mock-comment">
    <h4>Alex</h4>
    <p>The lightbox, TOC, and footnotes all behaving in one page is suspiciously civilized.</p>
  </article>
  <article class="mock-comment">
    <h4>June</h4>
    <p>The poem card surviving the migration is the kind of small weird thing worth keeping.</p>
  </article>
</div>
`.trim();

const demoEffectsHtml = `
<p>This post is the local proving ground for the original Attegi interaction layer. Every effect here exists for a reason, not because someone had extra JavaScript and poor impulse control.</p>
<div class="kg-card kg-callout-card kg-callout-card-accent">
  <div class="kg-callout-emoji">⚙️</div>
  <div class="kg-callout-text">Ghost HTML is rendered directly. The Astro layer owns layout, routing, and runtime behavior.</div>
</div>
<h2>Gallery and lightbox</h2>
<p>The gallery keeps Ghost’s ratio contract, then the lightbox upgrades only when gallery markup is actually present.</p>
<figure class="kg-card kg-gallery-card">
  <div class="kg-gallery-container">
    <div class="kg-gallery-row">
      <div class="kg-gallery-image"><img src="/mock/gallery-aurora.svg" width="1200" height="800" alt="Aurora gradient" loading="lazy" /></div>
      <div class="kg-gallery-image"><img src="/mock/gallery-grid.svg" width="1200" height="800" alt="Grid composition" loading="lazy" /></div>
      <div class="kg-gallery-image"><img src="/mock/gallery-portrait.svg" width="800" height="1200" alt="Portrait illustration" loading="lazy" /></div>
    </div>
  </div>
  <figcaption>Ghost gallery markup with a portrait item mixed in.</figcaption>
</figure>
<h2>Embeds, code, and footnotes</h2>
<p>Responsive wrappers, syntax highlighting, copy buttons, and footnote relinking all depend on the content being rendered as final HTML.</p>
<figure class="kg-card kg-embed-card">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/aqz-KE-bpKQ?si=tQKOVK7KG4nQut7S" title="YouTube video player" allowfullscreen loading="lazy"></iframe>
</figure>
<p>An Apple Music embed is promoted to the listening card — vinyl, not chrome.</p>
<figure class="kg-card kg-embed-card">
  <iframe width="660" height="175" src="https://embed.music.apple.com/us/album/all-the-love/1888707282?i=1888707290" title="ALL THE LOVE" allow="autoplay *; encrypted-media *;" loading="lazy"></iframe>
</figure>
<figure class="kg-card kg-code-card">
  <pre><code class="language-ts">const migration = {
  renderer: 'astro',
  cms: 'ghost',
  rule: 'do not invent extra layers'
};

export function keepItBoring() {
  return migration;
}</code></pre>
</figure>
<p>The migration also keeps footnotes alive.<sup>[1]</sup></p>
<hr />
<ol>
  <li>Footnotes should link both ways after the HTML lands in Astro. <a href="#fnref1">↩︎</a></li>
</ol>
<h2>Portrait media and poem cards</h2>
<p>A portrait image should earn its modifier class, and the poem blockquote should stop pretending to be a quote.</p>
<figure class="kg-card kg-image-card">
  <img class="kg-image" src="/mock/gallery-portrait.svg" width="800" height="1200" alt="Portrait mock artwork" loading="lazy" />
</figure>
<figure class="kg-card kg-video-card">
  <video controls preload="metadata" playsinline muted width="540" height="960">
    <source src="/mock/portrait-demo.mp4" type="video/mp4" />
  </video>
  <figcaption>A portrait clip; its caption sits centered below, not beside it.</figcaption>
</figure>
<blockquote>
  <p>[!poem] Build Notes [center]</p>
  <p>Move the shell first.</p>
  <p>Then move the habits.</p>
  <p>Let the markup stay recognizable.</p>
  <p>— The migration log</p>
</blockquote>
<blockquote>
  <p>[!poem] Field Notes</p>
  <p>The left rule keeps the ragged right honest,</p>
  <p>and a long line that runs past the measure wraps with a hanging indent so the eye knows it is one thought.</p>
  <p>Short lines stay short.</p>
  <p>— Author, somewhere quieter</p>
</blockquote>
<h2>Mood embed</h2>
<p>A Ghost HTML card can embed a buxx.me mood post. The author hardcodes a short height with overflow hidden; the runtime listens for the embed's resize message and grows the frame so nothing clips.</p>
<!--kg-card-begin: html-->
<div style="margin:2rem 0;text-align:center;">
  <iframe
    class="js-mood-embed"
    src="/mood/embed?id=3284&link=false"
    width="500"
    style="display:inline-block;width:500px;max-width:100%;height:260px;border:0;overflow:hidden;vertical-align:top"
    loading="lazy"
    frameborder="0"
    scrolling="no"
    title="Mood Embed"
  ></iframe>
</div>
<!--kg-card-end: html-->
<h2>Bookmark cards and nested headings</h2>
<p>The TOC needs enough headings to matter, while bookmark cards need the old theme skin to remain intact.</p>
<h3>Bookmark card</h3>
<figure class="kg-card kg-bookmark-card">
  <a class="kg-bookmark-container" href="https://docs.astro.build/en/guides/cms/ghost/" target="_blank" rel="noopener noreferrer">
    <div class="kg-bookmark-content">
      <div class="kg-bookmark-title">Astro Ghost guide</div>
      <div class="kg-bookmark-description">The shortest official path to rendering Ghost content in Astro without making a mess of it.</div>
      <div class="kg-bookmark-metadata">
        <img class="kg-bookmark-icon" src="/mock/icon.svg" alt="" />
        <span class="kg-bookmark-author">Astro</span>
        <span class="kg-bookmark-publisher">Docs</span>
      </div>
    </div>
    <div class="kg-bookmark-thumbnail">
      <img src="/mock/gallery-grid.svg" alt="Docs preview" loading="lazy" />
    </div>
  </a>
</figure>
<h3>Secondary heading</h3>
<p>The TOC should pick this up and the back-to-top control should stay hidden while the TOC owns the floating action slot.</p>
<h4>Detail heading</h4>
<p>Because h4 exists in the theme TOC rules, it gets to stay in the test payload too.</p>
<p>[!authors ai="anthropic/claude-opus-4-6" note="produced the first draft"]</p>
<p>[!authors ai="anthropic/claude-opus-4-6" note="translated it from Chinese"]</p>
`.trim();

const aboutPageHtml = `
<p>About pages keep the standard page shell, Ghost HTML rendering, and the lighter page-specific runtime.</p>
<figure class="kg-card kg-code-card">
  <pre><code class="language-js">export const stance = 'preserve the contract first';</code></pre>
</figure>
<figure class="kg-card kg-embed-card">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/kPa7bsKwL-c" title="Astro intro" allowfullscreen loading="lazy"></iframe>
</figure>
`.trim();

const linksPageHtml = `
<figure class="kg-card kg-bookmark-card">
  <a class="kg-bookmark-container" href="https://astro.build" target="_blank" rel="noopener noreferrer">
    <div class="kg-bookmark-content">
      <div class="kg-bookmark-title">Astro</div>
      <div class="kg-bookmark-description">Content-focused frontend framework with an extremely healthy hatred of unnecessary JavaScript.</div>
      <div class="kg-bookmark-metadata">
        <img class="kg-bookmark-icon" src="/mock/icon.svg" alt="" />
        <span class="kg-bookmark-author">Astro</span>
        <span class="kg-bookmark-publisher">astro.build</span>
      </div>
    </div>
    <div class="kg-bookmark-thumbnail">
      <img src="/mock/gallery-aurora.svg" alt="Astro preview" loading="lazy" />
    </div>
  </a>
</figure>
<div class="link-card">
  <a href="https://ghost.org/docs/content-api/" class="link-card-container" target="_blank" rel="noopener noreferrer">
    <div class="link-card-content">
      <div class="link-card-title">Ghost Content API</div>
      <div class="link-card-description">The data source. No guessing, no scraping, no handcrafted markdown transforms.</div>
      <div class="link-card-meta">
        <img class="link-card-icon" src="/mock/icon.svg" alt="" />
        <span class="link-card-author">Ghost</span>
      </div>
    </div>
    <div class="link-card-image">
      <img src="/mock/tag-systems.svg" alt="Ghost docs" loading="lazy" />
    </div>
  </a>
</div>
`.trim();

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// CJK scripts have no inter-word spaces, so whitespace splitting collapses a
// whole Chinese article to a handful of "words" and pins it at "1 min read".
// Count CJK characters directly (~350/min) and the remaining Latin runs by
// whitespace word (~220/min), then sum the two estimates.
const CJK_RE = /[㐀-鿿豈-﫿぀-ヿ가-힯]/g;

function readingTimeFromText(text: string): string {
  const cjkChars = (text.match(CJK_RE) || []).length;
  const words = text.replace(CJK_RE, ' ').split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(cjkChars / 350 + words / 220));

  return minutes === 1 ? '1 min read' : `${minutes} min read`;
}

function createPost(
  input: Omit<
    PostRecord,
    | 'type'
    | 'plaintext'
    | 'readingTime'
    | 'visibility'
    | 'access'
    | 'commentId'
    | 'commentsEnabled'
    | 'commentsHtml'
  > &
    Partial<
      Pick<
        PostRecord,
        'visibility' | 'access' | 'commentId' | 'commentsEnabled' | 'commentsHtml'
      >
    >,
): PostRecord {
  const plaintext = stripHtml(input.html);

  return {
    ...input,
    type: 'post',
    visibility: input.visibility ?? 'public',
    access: input.access ?? true,
    commentId: input.commentId ?? null,
    plaintext,
    readingTime: readingTimeFromText(plaintext),
    commentsEnabled: input.commentsEnabled ?? false,
    commentsHtml: input.commentsHtml ?? null,
  };
}

function createPage(
  input: Omit<
    PageRecord,
    'type' | 'plaintext' | 'readingTime' | 'visibility' | 'access' | 'commentId'
  > &
    Partial<Pick<PageRecord, 'visibility' | 'access' | 'commentId'>>,
): PageRecord {
  const plaintext = stripHtml(input.html);

  return {
    ...input,
    type: 'page',
    visibility: input.visibility ?? 'public',
    access: input.access ?? true,
    commentId: input.commentId ?? null,
    plaintext,
    readingTime: readingTimeFromText(plaintext),
  };
}

export const mockPosts: PostRecord[] = [
  createPost({
    id: 'post-members-only',
    slug: 'members-only-notes',
    title: 'Members-only notes',
    url: '/members-only-notes/',
    html: '<p>This fixture must never reach public blog routes.</p>',
    excerpt: 'Private fixture used to guard public route filtering.',
    customExcerpt: null,
    featureImage: null,
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-06-01T10:30:00.000Z',
    updatedAt: '2026-06-01T10:30:00.000Z',
    featured: false,
    visibility: 'members',
    access: false,
    primaryAuthorSlug: 'iris-zhang',
    primaryTagSlug: 'systems',
    authorSlugs: ['iris-zhang'],
    tagSlugs: ['systems'],
  }),
  createPost({
    id: 'post-demo-effects',
    slug: 'demo-effects',
    title: 'Astro migration effect sandbox',
    url: '/demo-effects/',
    html: demoEffectsHtml,
    excerpt: 'One post carrying the gallery, TOC, footnotes, poem cards, comments, and lightbox contract.',
    customExcerpt: null,
    featureImage: '/mock/post-cover-bright.svg',
    featureImageAlt: 'Bright abstract cover',
    featureImageCaption: 'A deliberately bright cover to exercise contrast detection.',
    publishedAt: '2026-04-09T10:30:00.000Z',
    updatedAt: '2026-04-09T10:30:00.000Z',
    featured: true,
    primaryAuthorSlug: 'iris-zhang',
    primaryTagSlug: 'systems',
    authorSlugs: ['iris-zhang', 'sam-lin'],
    tagSlugs: ['systems', 'craft', 'hash-not-by-ai'],
    commentsEnabled: true,
    commentsHtml: demoCommentsHtml,
  }),
  createPost({
    id: 'post-quiet-architecture',
    slug: 'quiet-architecture',
    title: 'Quiet architecture is still architecture',
    url: '/quiet-architecture/',
    html: '<p>Small seams, explicit data, and no ceremonial indirection. That is the whole pitch.</p>',
    excerpt: 'The best structure is the one future-you can debug half asleep.',
    customExcerpt: null,
    featureImage: '/mock/tag-systems.svg',
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-08T10:30:00.000Z',
    updatedAt: '2026-04-08T10:30:00.000Z',
    featured: false,
    primaryAuthorSlug: 'sam-lin',
    primaryTagSlug: 'systems',
    authorSlugs: ['sam-lin'],
    tagSlugs: ['systems', 'hash-no-toc'],
    commentsEnabled: false,
    commentsHtml: null,
  }),
  createPost({
    id: 'post-links-lab',
    slug: 'notes-from-the-links-lab',
    title: 'Notes from the links lab',
    url: '/notes-from-the-links-lab/',
    html: '<p>Bookmark cards are not a side quest. They are content too.</p>',
    excerpt: 'The links page matters because it exposes every bookmark edge case at once.',
    customExcerpt: null,
    featureImage: '/mock/tag-craft.svg',
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-07T10:30:00.000Z',
    updatedAt: '2026-04-07T10:30:00.000Z',
    featured: false,
    primaryAuthorSlug: 'iris-zhang',
    primaryTagSlug: 'craft',
    authorSlugs: ['iris-zhang'],
    tagSlugs: ['craft'],
    commentsEnabled: false,
    commentsHtml: null,
  }),
  createPost({
    id: 'post-shell-work',
    slug: 'shell-work-before-polish',
    title: 'Shell work before polish',
    url: '/shell-work-before-polish/',
    html: '<p>The shell decides whether the rest of the migration feels inevitable or cursed.</p>',
    excerpt: 'Move the shell first, because style without structure is theater.',
    customExcerpt: null,
    featureImage: '/mock/home-cover.svg',
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-06T10:30:00.000Z',
    updatedAt: '2026-04-06T10:30:00.000Z',
    featured: false,
    primaryAuthorSlug: 'sam-lin',
    primaryTagSlug: 'systems',
    authorSlugs: ['sam-lin'],
    tagSlugs: ['systems'],
    commentsEnabled: false,
    commentsHtml: null,
  }),
  createPost({
    id: 'post-css-contract',
    slug: 'the-kg-contract-stays',
    title: 'The .kg contract stays',
    url: '/the-kg-contract-stays/',
    html: '<p>Do not rebuild Ghost cards when Ghost already did the rendering. That is fake purity.</p>',
    excerpt: 'Preserve the existing card contract first, then prune dead branches later.',
    customExcerpt: null,
    featureImage: '/mock/gallery-grid.svg',
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-05T10:30:00.000Z',
    updatedAt: '2026-04-05T10:30:00.000Z',
    featured: false,
    primaryAuthorSlug: 'iris-zhang',
    primaryTagSlug: 'craft',
    authorSlugs: ['iris-zhang'],
    tagSlugs: ['craft'],
    commentsEnabled: false,
    commentsHtml: null,
  }),
  createPost({
    id: 'post-search-decision',
    slug: 'search-needs-a-real-decision',
    title: 'Search needs a real decision',
    url: '/search-needs-a-real-decision/',
    html: '<p>Buttons that open nothing are not product strategy. They are just lying in CSS.</p>',
    excerpt: 'Headless migrations need an actual search experience, not dead Ghost hooks.',
    customExcerpt: null,
    featureImage: '/mock/home-cover.svg',
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-04T10:30:00.000Z',
    updatedAt: '2026-04-04T10:30:00.000Z',
    featured: false,
    primaryAuthorSlug: 'sam-lin',
    primaryTagSlug: 'systems',
    authorSlugs: ['sam-lin'],
    tagSlugs: ['systems'],
    commentsEnabled: false,
    commentsHtml: null,
  }),
  createPost({
    id: 'post-members',
    slug: 'members-without-portal-theater',
    title: 'Members without Portal theater',
    url: '/members-without-portal-theater/',
    html: '<p>Headless mode gets explicit routes and forms instead of pretending Ghost modal helpers still exist.</p>',
    excerpt: 'Replace broken modal hooks with flows you can actually own.',
    customExcerpt: null,
    featureImage: '/mock/page-cover.svg',
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-03T10:30:00.000Z',
    updatedAt: '2026-04-03T10:30:00.000Z',
    featured: false,
    primaryAuthorSlug: 'iris-zhang',
    primaryTagSlug: 'systems',
    authorSlugs: ['iris-zhang'],
    tagSlugs: ['systems', 'craft'],
    commentsEnabled: false,
    commentsHtml: null,
  }),
  createPost({
    id: 'post-author-archive',
    slug: 'archive-pages-deserve-respect',
    title: 'Archive pages deserve respect',
    url: '/archive-pages-deserve-respect/',
    html: '<p>Author and tag archives are not just leftovers from the template tree. They shape how content is discovered.</p>',
    excerpt: 'Archive pages need first-class Astro routes, not an apologetic afterthought.',
    customExcerpt: null,
    featureImage: '/mock/tag-craft.svg',
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-02T10:30:00.000Z',
    updatedAt: '2026-04-02T10:30:00.000Z',
    featured: false,
    primaryAuthorSlug: 'sam-lin',
    primaryTagSlug: 'craft',
    authorSlugs: ['sam-lin'],
    tagSlugs: ['craft'],
    commentsEnabled: false,
    commentsHtml: null,
  }),
  createPost({
    id: 'post-finale',
    slug: 'verification-beats-vibes',
    title: 'Verification beats vibes',
    url: '/verification-beats-vibes/',
    html: '<p>If it is not running in a browser, it is still a theory. That is the whole reason this mock dataset exists.</p>',
    excerpt: 'Preview it, click it, break it, fix it. Theory is cheap.',
    customExcerpt: null,
    featureImage: '/mock/gallery-aurora.svg',
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-01T10:30:00.000Z',
    updatedAt: '2026-04-01T10:30:00.000Z',
    featured: false,
    primaryAuthorSlug: 'iris-zhang',
    primaryTagSlug: 'craft',
    authorSlugs: ['iris-zhang'],
    tagSlugs: ['craft'],
    commentsEnabled: false,
    commentsHtml: null,
  }),
];

export const mockPages: PageRecord[] = [
  createPage({
    id: 'page-about',
    slug: 'about',
    title: 'About this migration',
    url: '/about/',
    html: aboutPageHtml,
    excerpt: 'A plain page template with embeds and code highlight.',
    customExcerpt: 'The project structure, the rules, and the reason the migration stays boring.',
    featureImage: '/mock/page-cover.svg',
    featureImageAlt: 'Page cover',
    featureImageCaption: null,
    publishedAt: '2026-04-09T09:00:00.000Z',
    updatedAt: '2026-04-09T09:00:00.000Z',
    featured: false,
    primaryAuthorSlug: 'iris-zhang',
    primaryTagSlug: null,
    authorSlugs: ['iris-zhang'],
    tagSlugs: [],
    template: 'default',
    showTitleAndFeatureImage: true,
  }),
  createPage({
    id: 'page-links',
    slug: 'links',
    title: 'Links',
    url: '/links/',
    html: linksPageHtml,
    excerpt: 'A dedicated links page styled around bookmark cards and custom link cards.',
    customExcerpt: 'A small set of references worth keeping around.',
    featureImage: null,
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-09T09:10:00.000Z',
    updatedAt: '2026-04-09T09:10:00.000Z',
    featured: false,
    primaryAuthorSlug: 'sam-lin',
    primaryTagSlug: null,
    authorSlugs: ['sam-lin'],
    tagSlugs: [],
    template: 'links',
    showTitleAndFeatureImage: false,
  }),
  createPage({
    id: 'page-tags',
    slug: 'tags',
    title: 'Topics',
    url: '/tags/',
    html: '',
    excerpt: 'A dedicated tag directory page with icons, accent colors, and post previews.',
    customExcerpt: null,
    featureImage: null,
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-09T09:15:00.000Z',
    updatedAt: '2026-04-09T09:15:00.000Z',
    featured: false,
    primaryAuthorSlug: 'iris-zhang',
    primaryTagSlug: null,
    authorSlugs: ['iris-zhang'],
    tagSlugs: [],
    template: 'tags',
    showTitleAndFeatureImage: false,
  }),
];
