declare module '@tryghost/content-api' {
  export interface GhostContentAPIOptions {
    url: string;
    key: string;
    version: string;
  }

  export interface GhostBrowseOptions {
    include?: string;
    fields?: string;
    filter?: string;
    limit?: number | 'all';
    page?: number;
    order?: string;
    formats?: string | string[];
    visibility?: 'all' | 'public';
  }

  export interface GhostReadOptions {
    include?: string;
    fields?: string;
    formats?: string | string[];
  }

  export interface GhostPagination {
    page: number;
    limit: number;
    pages: number;
    total: number;
    next: number | null;
    prev: number | null;
  }

  export type GhostBrowseResponse<T> = T[] & {
    meta?: {
      pagination?: GhostPagination;
    };
  };

  export interface GhostCollectionResource<T> {
    browse(options?: GhostBrowseOptions): Promise<GhostBrowseResponse<T>>;
    read(data: { id?: string; slug?: string }, options?: GhostReadOptions): Promise<T>;
  }

  export interface GhostSettingsResource<T> {
    browse(): Promise<T>;
  }

  export default class GhostContentAPI {
    constructor(options: GhostContentAPIOptions);

    posts: GhostCollectionResource<Record<string, unknown>>;
    pages: GhostCollectionResource<Record<string, unknown>>;
    authors: GhostCollectionResource<Record<string, unknown>>;
    tags: GhostCollectionResource<Record<string, unknown>>;
    tiers: GhostCollectionResource<Record<string, unknown>>;
    newsletters: GhostCollectionResource<Record<string, unknown>>;
    offers: GhostCollectionResource<Record<string, unknown>>;
    settings: GhostSettingsResource<Record<string, unknown>>;
  }
}
