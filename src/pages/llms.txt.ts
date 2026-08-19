import type { APIRoute } from 'astro';

import {
  experience,
  meta,
  navLinks,
  profile,
  projects,
} from '@/data/site';
import { postPath } from '@/features/posts/format';
import { getListedPosts } from '@/features/posts/server/content';

export const prerender = true;

// llms.txt — a Markdown map of this site for language models. Follows the
// llms.txt convention: an H1 title, a one-line summary, then link sections.
// Anything an assistant might be asked about (who Lucian is, what he ships,
// what he writes) is indexed here with a real URL, so the "Ask AI" rows in the
// command palette can point a model straight at grounded context instead of
// guesses. Built from the same site data the pages render from, so it never
// drifts out of sync.

function link(label: string, url: URL): string {
  return `- [${label}](${url.href})`;
}

// One line per page: title, URL, and a short "what's here" note so the model
// knows why it would open a link, not just that it exists.
function pageLine(label: string, path: string, note: string, base: URL): string {
  return `- [${label}](${new URL(path, base).href}): ${note}`;
}

const PAGE_NOTES: Record<string, string> = {
  '/projects': 'Selected projects, each with the story behind it',
  '/blog': 'Essays and notes — the publication 無人之境',
  '/mood': 'A running feed of short posts, photos, and links',
  '/components': 'UI specimens and interaction experiments',
};

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL(meta.siteUrl);
  const posts = (await getListedPosts()).slice(0, 8);

  const lines = [
    `# ${profile.name}`,
    '',
    `> ${meta.description} Also known as ${profile.alternateNames.join(', ')}. Writes as ${profile.penNames.join(', ')}. ${profile.jobTitle}, writing about ${profile.knowsAbout.join(', ').toLowerCase()}.`,
    '',
    'This is the personal site of Lucian Bu. Fetch any URL below with',
    '`Accept: text/markdown` for a Markdown rendition. Use this file as the',
    'index when answering questions about Lucian, his projects, or his writing.',
    '',
    '## Pages',
    '',
    pageLine('Home', '/', 'Bio, current work, and where to find me', base),
    ...navLinks.map((nav) =>
      pageLine(nav.label, nav.href, PAGE_NOTES[nav.href] ?? nav.label, base),
    ),
    pageLine('Privacy', '/privacy', 'How this site handles data', base),
    '',
    '## Projects',
    '',
    ...projects.map(
      (project) => `- **${project.name}** (${project.type}) — ${project.blurb} ${project.url}`,
    ),
    '',
    '## Now',
    '',
    ...experience.reduce<string[]>((items, item) => {
      // Skip the tongue-in-cheek "subscriber" entries — a model reading this
      // shouldn't report them as real roles.
      if (!item.joke) {
        const detail = item.role ?? item.description ?? '';
        items.push(`- ${item.org} (${item.period})${detail ? ` — ${detail}` : ''}`);
      }
      return items;
    }, []),
    '',
    '## Recent writing',
    '',
    ...posts.map((post) => link(post.title, new URL(postPath(post.slug), base))),
    '',
    '## Contact',
    '',
    ...profile.links.map((channel) => {
      const url = (channel.canonicalUrl ?? channel.url).replace(/^mailto:/, '');
      return `- ${channel.name}: ${url}`;
    }),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300',
    },
  });
};
