import type { ForwardedFrom, Reaction } from '@bunizao/contracts/content';

export interface Comment {
  id: string;
  author: string;
  authorAvatar?: string;
  datetime: string;
  content: string;
  reactions: Reaction[];
}

export interface Post {
  id: string;
  title: string;
  type: 'text' | 'service';
  datetime: string;
  tags: string[];
  text: string;
  content: string;
  forwardedFrom?: ForwardedFrom;
  reactions: Reaction[];
  comments?: Comment[];
  commentsCount?: number;
}

export interface ChannelInfo {
  posts: Post[];
  title: string;
  titleHTML: string;
  description: string;
  descriptionHTML: string;
  avatar: string;
}
