export interface NavigationItem {
  label: string;
  url: string;
}

export interface Site {
  title: string;
  description: string | null;
  url: string;
  locale: string;
  timezone?: string | null;
  logo: string | null;
  icon: string | null;
  coverImage: string | null;
  accentColor: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  twitterImage?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  membersSupportAddress?: string | null;
  twitter: string | null;
  facebook: string | null;
  navigation: NavigationItem[];
  secondaryNavigation: NavigationItem[];
  codeInjectionHead: string | null;
  codeInjectionFoot: string | null;
}

export type SiteData = Site;

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

export interface Tier {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  type: 'free' | 'paid';
  welcomePageUrl: string | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  currency: string | null;
  benefits: string[];
  visibility: 'public' | 'none';
}

export type TierData = Tier;

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

export interface PageRecord extends BaseContentRecord {
  type: 'page';
  template: 'default' | 'links' | 'tags';
  showTitleAndFeatureImage: boolean;
}

export interface PageData extends BaseContentData, Omit<PageRecord, keyof BaseContentRecord> {}
export type Page = PageData;

export interface Pagination {
  page: number;
  pages: number;
  total: number;
  limit: number;
  next: number | null;
  prev: number | null;
}

export type PaginationData = Pagination;

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedPosts {
  posts: Post[];
  pagination: Pagination;
}

export interface ArchiveData {
  posts: Post[];
  pagination: Pagination;
}

export interface TagDirectoryEntry extends Tag {
  posts: Post[];
}

export interface SearchDocument {
  title: string;
  url: string;
  excerpt: string;
  type: 'post' | 'page';
}

export type RootContent =
  | { kind: 'post'; data: Post }
  | { kind: 'page'; data: Page };

export interface TagArchiveResult {
  tag: Tag;
  archive: ArchiveData;
}

export interface AuthorArchiveResult {
  author: Author;
  archive: ArchiveData;
}

export interface ContentProvider {
  getSite(): Promise<Site>;
  getPosts(options?: PaginationQuery): Promise<Post[]>;
  getPost(slug: string): Promise<Post | null>;
  getPages(options?: PaginationQuery): Promise<Page[]>;
  getPage(slug: string): Promise<Page | null>;
  getTags(): Promise<Tag[]>;
  getAuthors(): Promise<Author[]>;
  getTiers(): Promise<Tier[]>;
  getTierBySlug(slug: string): Promise<Tier | null>;
  getSiteData(): Promise<Site>;
  getAccessiblePosts(): Promise<Post[]>;
  getListedPosts(): Promise<Post[]>;
  getAllPages(): Promise<Page[]>;
  getAllTags(): Promise<Tag[]>;
  getAllAuthors(): Promise<Author[]>;
  getHomepage(page?: number, limit?: number): Promise<PaginatedPosts>;
  getPostBySlug(slug: string): Promise<Post | null>;
  getPageBySlug(slug: string): Promise<Page | null>;
  getRootContentBySlug(slug: string): Promise<RootContent | null>;
  getAdjacentPosts(slug: string): Promise<{
    nextPost: Post | null;
    prevPost: Post | null;
  }>;
  getRecentPosts(limit?: number, excludeSlug?: string): Promise<Post[]>;
  getTagBySlug(slug: string): Promise<Tag | null>;
  getAuthorBySlug(slug: string): Promise<Author | null>;
  getTagArchive(slug: string, page?: number, limit?: number): Promise<TagArchiveResult | null>;
  getAuthorArchive(
    slug: string,
    page?: number,
    limit?: number,
  ): Promise<AuthorArchiveResult | null>;
  getTagDirectory(): Promise<TagDirectoryEntry[]>;
  getSearchDocuments(): Promise<SearchDocument[]>;
}
