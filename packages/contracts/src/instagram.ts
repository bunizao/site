// The Instagram profile behind the homepage card. site-api reads it from
// Instagram on a schedule and stores the last read that passed validation;
// a failed read never replaces it. `refreshedAt` says how old that read is,
// `lastAttempt` how the most recent try went.

export interface InstagramProfileCounts {
  posts: number;
  followers: number;
  following: number;
}

export interface InstagramProfileAvatar {
  /** Absolute URL of the stored picture, served by site-api. */
  url: string;
  contentType: string;
  bytes: number;
  /** Hex SHA-256 of the stored bytes; the avatar route sends it as the ETag. */
  sha256: string;
}

export interface InstagramProfileAttempt {
  at: string;
  ok: boolean;
  /** Why the attempt failed, e.g. `profile:401`; null when it succeeded. */
  error: string | null;
}

export interface InstagramProfile {
  username: string;
  fullName: string;
  profileUrl: string;
  avatar: InstagramProfileAvatar;
  counts: InstagramProfileCounts;
  /** When the stored profile was last read from Instagram. */
  refreshedAt: string;
  lastAttempt: InstagramProfileAttempt;
}
