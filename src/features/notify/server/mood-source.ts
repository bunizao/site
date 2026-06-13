import type { NotifyRequestContext } from './service';

export interface NotifyMoodPost {
  id: string;
  type?: string;
  datetime: string;
  text?: string;
  content: string;
}

export interface NotifyChannelMeta {
  title?: string;
  avatarUrl?: string;
}

export interface NotifyEmailRelatedLink {
  url: string;
  type: 'link' | 'image';
}

export interface NotifyMoodEmailContent {
  previewText: string;
  previewHtml: string;
  relatedLinks: NotifyEmailRelatedLink[];
}

export interface NotifyMoodSource {
  loadPost(context: NotifyRequestContext, postId: string): Promise<NotifyMoodPost | null>;
  loadLatestPost(context: NotifyRequestContext): Promise<NotifyMoodPost | null>;
  loadPostsInWindow(
    context: NotifyRequestContext,
    input: { since: Date; until: Date }
  ): Promise<NotifyMoodPost[]>;
  loadChannelMeta(context: NotifyRequestContext): Promise<NotifyChannelMeta | null>;
  renderPostForEmail(
    context: NotifyRequestContext,
    post: NotifyMoodPost,
    options: { relatedLinkMaxCount: number }
  ): NotifyMoodEmailContent;
}
