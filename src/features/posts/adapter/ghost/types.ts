export interface GhostNavigationItem {
  label: string;
  url: string;
}

export interface GhostSiteSettings {
  title: string;
  description: string | null;
  url: string | null;
  lang: string | null;
  timezone?: string | null;
  logo: string | null;
  icon: string | null;
  accent_color: string | null;
  cover_image: string | null;
  navigation: GhostNavigationItem[];
  secondary_navigation: GhostNavigationItem[];
  meta_title: string | null;
  meta_description: string | null;
  twitter?: string | null;
  facebook?: string | null;
  og_image?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  twitter_image?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
  members_support_address?: string | null;
  codeinjection_head: string | null;
  codeinjection_foot: string | null;
}
