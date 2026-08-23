/* Shared shapes for the blog reaction bar and comment thread.
   Kept out of the .astro files so pages can import the types without
   importing the components. */

export interface Reactor {
  name: string;
  avatar?: string;
}

/** The signed-in reader, as far as the compose box needs to know them. */
export interface Viewer {
  name: string;
  avatar?: string;
}

export interface BlogComment {
  id: string;
  author: string;
  /** Already formatted relative to now, e.g. "3d". */
  date: string;
  text: string;
  /** The post's author, marked so readers can find the reply that matters. */
  byAuthor?: boolean;
  /** Held by the moderation classifier; visible to its writer only. */
  pending?: boolean;
  isReply?: boolean;
}
