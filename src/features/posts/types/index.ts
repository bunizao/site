export interface Author {
  id: string;
  slug: string;
  name: string;
  url: string;
  bio: string | null;
  location?: string | null;
  profileImage: string | null;
  coverImage: string | null;
  website: string | null;
  twitter: string | null;
  facebook: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  ogImage?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  twitterImage?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  postCount: number;
}

export type AuthorData = Author;

export interface Tag {
  id: string;
  slug: string;
  name: string;
  url: string;
  description: string | null;
  featureImage: string | null;
  accentColor: string | null;
  visibility: 'public' | 'internal';
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  twitterImage?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  codeInjectionHead: string | null;
  codeInjectionFoot?: string | null;
  canonicalUrl?: string | null;
  postCount: number;
}

export type TagData = Tag;

export interface BaseContentRecord {
  id: string;
  slug: string;
  title: string;
  url: string;
  html: string;
  markdown?: string | null;
  excerpt: string | null;
  customExcerpt: string | null;
  featureImage: string | null;
  featureImageAlt: string | null;
  featureImageCaption: string | null;
  publishedAt: string;
  updatedAt: string;
  featured: boolean;
  visibility: 'public' | 'members' | 'paid' | string;
  access: boolean;
  commentId: string | null;
  primaryAuthorSlug: string | null;
  primaryTagSlug: string | null;
  authorSlugs: string[];
  tagSlugs: string[];
  plaintext: string;
  readingTime: string;
  canonicalUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  twitterImage?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  codeInjectionHead?: string | null;
  codeInjectionFoot?: string | null;
  customTemplate?: string | null;
}

interface BaseContentData
  extends Omit<
    BaseContentRecord,
    'authorSlugs' | 'tagSlugs' | 'primaryAuthorSlug' | 'primaryTagSlug'
  > {
  authors: Author[];
  tags: Tag[];
  primaryAuthor: Author | null;
  primaryTag: Tag | null;
}

export interface PostRecord extends BaseContentRecord {
  type: 'post';
  commentsEnabled: boolean;
  commentsHtml: string | null;
  emailSubject?: string | null;
}

export type PostDirectiveMeta = Record<string, Array<Record<string, string>>>;

export interface PostData extends BaseContentData, Omit<PostRecord, keyof BaseContentRecord> {
  directiveMeta?: PostDirectiveMeta;
}
export type Post = PostData;

export interface TagDirectoryEntry extends Tag {
  posts: Post[];
}

export interface TagArchiveResult {
  tag: Tag;
  posts: Post[];
}

export interface ContentProvider {
  getAccessiblePosts(): Promise<Post[]>;
  getListedPosts(): Promise<Post[]>;
  getPostBySlug(slug: string): Promise<Post | null>;
  getTagArchive(slug: string): Promise<TagArchiveResult | null>;
  getTagDirectory(): Promise<TagDirectoryEntry[]>;
}
