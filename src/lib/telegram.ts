import { $fetch } from 'ofetch';
import * as cheerio from 'cheerio';
import type { CheerioAPI, Element } from 'cheerio';
import { LRUCache } from 'lru-cache';
import flourite from 'flourite';
import Prism from 'prismjs';

// Import Prism language components
import 'prismjs-components-importer/cjs/prism-c';
import 'prismjs-components-importer/cjs/prism-clojure';
import 'prismjs-components-importer/cjs/prism-cpp';
import 'prismjs-components-importer/cjs/prism-csharp';
import 'prismjs-components-importer/cjs/prism-css';
import 'prismjs-components-importer/cjs/prism-dart';
import 'prismjs-components-importer/cjs/prism-docker';
import 'prismjs-components-importer/cjs/prism-elixir';
import 'prismjs-components-importer/cjs/prism-go';
import 'prismjs-components-importer/cjs/prism-markup';
import 'prismjs-components-importer/cjs/prism-java';
import 'prismjs-components-importer/cjs/prism-javascript';
import 'prismjs-components-importer/cjs/prism-json';
import 'prismjs-components-importer/cjs/prism-julia';
import 'prismjs-components-importer/cjs/prism-kotlin';
import 'prismjs-components-importer/cjs/prism-lua';
import 'prismjs-components-importer/cjs/prism-markdown';
import 'prismjs-components-importer/cjs/prism-pascal';
import 'prismjs-components-importer/cjs/prism-php';
import 'prismjs-components-importer/cjs/prism-python';
import 'prismjs-components-importer/cjs/prism-ruby';
import 'prismjs-components-importer/cjs/prism-rust';
import 'prismjs-components-importer/cjs/prism-sql';
import 'prismjs-components-importer/cjs/prism-typescript';
import 'prismjs-components-importer/cjs/prism-yaml';

// Types
export interface Post {
  id: string;
  title: string;
  type: 'text' | 'service';
  datetime: string;
  tags: string[];
  text: string;
  content: string;
}

export interface ChannelInfo {
  posts: Post[];
  title: string;
  description: string;
  descriptionHTML: string;
  avatar: string;
}

interface ContentProcessorConfig {
  staticProxy: string;
  id?: string;
  index?: number;
  title?: string;
  channel?: string;
}

// LRU Cache for Telegram API responses
const cache = new LRUCache<string, ChannelInfo | Post>({
  ttl: 1000 * 60 * 5, // 5 minutes
  maxSize: 50 * 1024 * 1024, // 50MB
  sizeCalculation: (item) => {
    return JSON.stringify(item).length;
  },
});

// Helper function to get environment variables
function getEnv(env: ImportMetaEnv, Astro: any, name: string): string {
  return env[name] ?? Astro.locals?.runtime?.env?.[name] ?? '';
}

// Content processors
function getVideoStickers($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  return $(item)
    .find('.js-videosticker_video')
    ?.map((_index, video) => {
      const url = $(video)?.attr('src');
      const imgurl = $(video).find('img')?.attr('src');
      return `
    <div style="background-image: none; width: 256px;">
      <video src="${staticProxy + url}" width="100%" height="100%" alt="Video Sticker" preload muted autoplay loop playsinline disablepictureinpicture >
        <img class="sticker" src="${staticProxy + imgurl}" alt="Video Sticker" loading="${(index ?? 0) > 15 ? 'eager' : 'lazy'}" />
      </video>
    </div>
    `;
    })
    ?.get()
    ?.join('') ?? '';
}

function getImageStickers($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  return $(item)
    .find('.tgme_widget_message_sticker')
    ?.map((_index, image) => {
      const url = $(image)?.attr('data-webp');
      return `<img class="sticker" src="${staticProxy + url}" style="width: 256px;" alt="Sticker" loading="${(index ?? 0) > 15 ? 'eager' : 'lazy'}" />`;
    })
    ?.get()
    ?.join('') ?? '';
}

function getImages($: CheerioAPI, item: Element, { staticProxy, id, index, title }: ContentProcessorConfig): string {
  const images = $(item)
    .find('.tgme_widget_message_photo_wrap')
    ?.map((_index, photo) => {
      const url = $(photo).attr('style')?.match(/url\(["'](.*?)["']/)?.[1];
      const popoverId = `modal-${id}-${_index}`;
      return `
      <button class="image-preview-button image-preview-wrap" popovertarget="${popoverId}" popovertargetaction="show">
        <img src="${staticProxy + url}" alt="${title}" loading="${(index ?? 0) > 15 ? 'eager' : 'lazy'}" />
      </button>
      <button class="image-preview-button modal" id="${popoverId}" popovertarget="${popoverId}" popovertargetaction="hide" popover>
        <img class="modal-img" src="${staticProxy + url}" alt="${title}" loading="lazy" />
      </button>
    `;
    })
    ?.get() ?? [];
  return images.length ? `<div class="image-list-container ${images.length % 2 === 0 ? 'image-list-even' : 'image-list-odd'}">${images?.join('')}</div>` : '';
}

function getVideo($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  const video = $(item).find('.tgme_widget_message_video_wrap video');
  video
    ?.attr('src', staticProxy + video?.attr('src'))
    ?.attr('controls', 'true')
    ?.attr('preload', (index ?? 0) > 15 ? 'auto' : 'metadata')
    ?.attr('playsinline', 'true')
    .attr('webkit-playsinline', 'true');

  const roundVideo = $(item).find('.tgme_widget_message_roundvideo_wrap video');
  roundVideo
    ?.attr('src', staticProxy + roundVideo?.attr('src'))
    ?.attr('controls', 'true')
    ?.attr('preload', (index ?? 0) > 15 ? 'auto' : 'metadata')
    ?.attr('playsinline', 'true')
    .attr('webkit-playsinline', 'true');
  return $.html(video) + $.html(roundVideo);
}

function getAudio($: CheerioAPI, item: Element, { staticProxy }: ContentProcessorConfig): string {
  const audio = $(item).find('.tgme_widget_message_voice');
  audio?.attr('src', staticProxy + audio?.attr('src'))?.attr('controls', 'true');
  return $.html(audio);
}

function getLinkPreview($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  const link = $(item).find('.tgme_widget_message_link_preview');
  const title = $(item).find('.link_preview_title')?.text() || $(item).find('.link_preview_site_name')?.text();
  const description = $(item).find('.link_preview_description')?.text();

  link?.attr('target', '_blank').attr('rel', 'noopener').attr('title', description);

  const image = $(item).find('.link_preview_image');
  const src = image?.attr('style')?.match(/url\(["'](.*?)["']/i)?.[1];
  const imageSrc = src ? staticProxy + src : '';
  image?.replaceWith(`<img class="link_preview_image" alt="${title}" src="${imageSrc}" loading="${(index ?? 0) > 15 ? 'eager' : 'lazy'}" />`);
  return $.html(link);
}

function getReply($: CheerioAPI, item: Element, { channel }: ContentProcessorConfig): string {
  const reply = $(item).find('.tgme_widget_message_reply');
  reply?.wrapInner('<small></small>')?.wrapInner('<blockquote></blockquote>');

  const href = reply?.attr('href');
  if (href && channel) {
    const url = new URL(href);
    reply?.attr('href', `${url.pathname}`.replace(new RegExp(`/${channel}/`, 'i'), '/mood/'));
  }

  return $.html(reply);
}

function modifyHTMLContent($: CheerioAPI, content: any, { index }: { index?: number } = {}): any {
  $(content).find('.emoji')?.removeAttr('style');
  $(content)
    .find('a')
    ?.each((_index, a) => {
      $(a)?.attr('title', $(a)?.text())?.removeAttr('onclick');
    });
  $(content)
    .find('tg-spoiler')
    ?.each((_index, spoiler) => {
      const id = `spoiler-${index}-${_index}`;
      $(spoiler)
        ?.attr('id', id)
        ?.wrap('<label class="spoiler-button"></label>')
        ?.before(`<input type="checkbox" />`);
    });
  $(content)
    .find('pre')
    .each((_index, pre) => {
      try {
        $(pre).find('br')?.replaceWith('\n');

        const code = $(pre).text();
        const language = (flourite(code, { shiki: true, noUnknown: true }) as any)?.language || 'text';
        const highlightedCode = Prism.highlight(code, Prism.languages[language] || Prism.languages.text, language);
        $(pre).html(`<code class="language-${language}">${highlightedCode}</code>`);
      } catch (error) {
        console.error(error);
      }
    });
  return content;
}

function getPost($: CheerioAPI, item: Element | null, { channel, staticProxy, index = 0 }: ContentProcessorConfig & { channel: string }): Post {
  const messageItem = item ? $(item).find('.tgme_widget_message') : $('.tgme_widget_message');
  const content =
    $(messageItem).find('.js-message_reply_text')?.length > 0
      ? modifyHTMLContent($, $(messageItem).find('.tgme_widget_message_text.js-message_text'), { index })
      : modifyHTMLContent($, $(messageItem).find('.tgme_widget_message_text'), { index });
  const title = content?.text()?.match(/^.*?(?=[。\n]|http\S)/g)?.[0] ?? content?.text() ?? '';
  const id = $(messageItem).attr('data-post')?.replace(new RegExp(`${channel}/`, 'i'), '') ?? '';

  const tags =
    $(content)
      .find('a[href^="?q="]')
      ?.each((_index, a) => {
        $(a)?.attr('href', `/mood?tag=${encodeURIComponent($(a)?.text() ?? '')}`);
      })
      ?.map((_index, a) => $(a)?.text()?.replace('#', '') ?? '')
      ?.get() ?? [];

  return {
    id,
    title,
    type: $(messageItem).attr('class')?.includes('service_message') ? 'service' : 'text',
    datetime: $(messageItem).find('.tgme_widget_message_date time')?.attr('datetime') ?? '',
    tags,
    text: content?.text() ?? '',
    content: [
      getReply($, messageItem as Element, { channel, staticProxy }),
      getImages($, messageItem as Element, { staticProxy, id, index, title }),
      getVideo($, messageItem as Element, { staticProxy, index }),
      getAudio($, messageItem as Element, { staticProxy }),
      content?.html(),
      getImageStickers($, messageItem as Element, { staticProxy, index }),
      getVideoStickers($, messageItem as Element, { staticProxy, index }),
      $(messageItem).find('.tgme_widget_message_poll')?.html(),
      $.html($(messageItem).find('.tgme_widget_message_document_wrap')),
      $.html($(messageItem).find('.tgme_widget_message_video_player.not_supported')),
      $.html($(messageItem).find('.tgme_widget_message_location_wrap')),
      getLinkPreview($, messageItem as Element, { staticProxy, index }),
    ]
      .filter(Boolean)
      .join('')
      .replace(/(url\(["'])((https?:)?\/\/)/g, (match, p1, p2, _p3) => {
        if (p2 === '//') {
          p2 = 'https://';
        }
        if (p2?.startsWith('t.me')) {
          return match;
        }
        return `${p1}${staticProxy}${p2}`;
      }),
  };
}

const unnecessaryHeaders = ['host', 'cookie', 'origin', 'referer'];

export async function getChannelInfo(
  Astro: any,
  { before = '', after = '', q = '', type = 'list', id = '' }: { before?: string; after?: string; q?: string; type?: string; id?: string } = {}
): Promise<ChannelInfo | Post> {
  const cacheKey = JSON.stringify({ before, after, q, type, id });
  const cachedResult = cache.get(cacheKey);

  if (cachedResult) {
    console.info('Match Cache', { before, after, q, type, id });
    return JSON.parse(JSON.stringify(cachedResult));
  }

  const host = getEnv(import.meta.env, Astro, 'TELEGRAM_HOST') || 't.me';
  const channel = getEnv(import.meta.env, Astro, 'CHANNEL');
  const staticProxy = getEnv(import.meta.env, Astro, 'STATIC_PROXY') || '';

  const url = id ? `https://${host}/${channel}/${id}?embed=1&mode=tme` : `https://${host}/s/${channel}`;
  const headers = Object.fromEntries(Astro.request.headers);

  Object.keys(headers).forEach((key) => {
    if (unnecessaryHeaders.includes(key)) {
      delete headers[key];
    }
  });

  console.info('Fetching', url, { before, after, q, type, id });
  const html = await $fetch<string>(url, {
    headers,
    query: {
      before: before || undefined,
      after: after || undefined,
      q: q || undefined,
    },
    retry: 3,
    retryDelay: 100,
  });

  const $ = cheerio.load(html, {}, false);
  if (id) {
    const post = getPost($, null, { channel, staticProxy });
    cache.set(cacheKey, post);
    return post;
  }
  const posts =
    $('.tgme_channel_history  .tgme_widget_message_wrap')
      ?.map((index, item) => {
        return getPost($, item, { channel, staticProxy, index });
      })
      ?.get()
      ?.reverse()
      .filter((post: Post) => ['text'].includes(post.type) && post.id && post.content) ?? [];

  const channelInfo: ChannelInfo = {
    posts,
    title: $('.tgme_channel_info_header_title')?.text() ?? '',
    description: $('.tgme_channel_info_description')?.text() ?? '',
    descriptionHTML: modifyHTMLContent($, $('.tgme_channel_info_description'))?.html() ?? '',
    avatar: $('.tgme_page_photo_image img')?.attr('src') ?? '',
  };

  cache.set(cacheKey, channelInfo);
  return channelInfo;
}
