import type { MoodFeedItem } from '@bunizao/contracts/mood';
import { getCriticalInitialPosts, hasRenderableMoodFeedMedia } from '@/features/mood/shared/initial-feed';
import { findTooBigVideoMedia, hasStructuredMoodFeedMedia } from '@/features/mood/shared/feed-media';
import { getMoodGallerySizes } from '@/features/mood/shared/gallery-render';
import { resolveMoodFeedImageLayout } from '@/features/mood/shared/feed-thumbnail';
import { buildArchiveSrcSet, getMoodFeedThumbSizes } from '@/features/mood/shared/image-srcset';

export interface MoodPreloadImage {
  href: string;
  imageSrcSet?: string;
  imageSizes?: string;
}

// Derive the LCP preload from the exact post FeedShell renders with
// fetchpriority=high: the first critical post carrying renderable media. Only
// plain image thumbs and galleries surface a real high-priority <img>; video,
// too-big, and structured-media posts get no preload so we never fetch a wasted
// candidate at high priority. Mirror the media-branch selection in FeedShell.astro
// exactly — if that render logic changes, this must follow.
export function getMoodFeedPreloadImage(
  posts: MoodFeedItem[],
  anchorId = '',
): MoodPreloadImage | null {
  const priorityPost = getCriticalInitialPosts(posts, anchorId).find(hasRenderableMoodFeedMedia);
  if (!priorityPost) return null;

  const tooBigVideoMedia = findTooBigVideoMedia(priorityPost.media);
  const feedMedia = tooBigVideoMedia
    ? priorityPost.media.filter((item) => item !== tooBigVideoMedia)
    : priorityPost.media;
  const hasStructuredMedia = hasStructuredMoodFeedMedia(feedMedia);
  const mediaHtml = priorityPost.mediaHtml.trim();
  const isTooBigVideoPreview = priorityPost.previewMediaType === 'too-big-video' || Boolean(tooBigVideoMedia);
  const hasGalleryPreview =
    !hasStructuredMedia
    && !mediaHtml
    && !isTooBigVideoPreview
    && (priorityPost.gallery?.items.length ?? 0) > 1;

  if (hasGalleryPreview && priorityPost.gallery) {
    const first = priorityPost.gallery.items[0];
    if (!first?.src) return null;
    // Match the rendered priority gallery slide (gallery-render.ts) so the
    // preload picks the same responsive candidate the slide will request.
    const responsive = buildArchiveSrcSet(first.src, { sizes: getMoodGallerySizes('feed') });
    return { href: first.src, imageSrcSet: responsive.srcset, imageSizes: responsive.sizes };
  }

  // Anything that renders a video, too-big card, or structured media never
  // yields a high-priority <img> worth preloading.
  if (hasStructuredMedia || mediaHtml || isTooBigVideoPreview) return null;
  if (!priorityPost.image) return null;

  // Same sizes as the rendered thumb (FeedShell.astro), or the preload and the
  // <img> pick different responsive candidates and both get downloaded.
  const thumbLayout = resolveMoodFeedImageLayout(
    priorityPost.imageLayout,
    priorityPost.imageWidth,
    priorityPost.imageHeight,
  );
  const responsive = buildArchiveSrcSet(priorityPost.image, {
    sizes: getMoodFeedThumbSizes(
      thumbLayout,
      priorityPost.imageKind,
      priorityPost.imageWidth,
      priorityPost.imageHeight,
    ),
  });
  return { href: priorityPost.image, imageSrcSet: responsive.srcset, imageSizes: responsive.sizes };
}
