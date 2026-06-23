import { getGhostClient } from './client';
import {
  type GhostAdapterOptions,
  getGhostRuntimeConfig,
} from './config';
import type { GhostNavigationItem, GhostSiteSettings } from './types';

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeNavigation(
  items: unknown,
  siteUrl: string | null,
): GhostNavigationItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const { label, url } = item as { label?: unknown; url?: unknown };

    if (typeof label !== 'string' || typeof url !== 'string') {
      return [];
    }

    if (siteUrl) {
      try {
        return [{ label, url: new URL(url, siteUrl).pathname || url }];
      } catch {
        return [{ label, url }];
      }
    }

    return [{ label, url }];
  });
}

function normalizeSiteSettings(raw: unknown): GhostSiteSettings | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const settings = raw as Record<string, unknown>;
  const title = readOptionalString(settings.title);
  const siteUrl = readOptionalString(settings.url);

  if (!title) {
    return null;
  }

  return {
    title,
    description: readOptionalString(settings.description),
    url: siteUrl,
    lang: readOptionalString(settings.lang),
    timezone: readOptionalString(settings.timezone),
    logo: readOptionalString(settings.logo),
    icon: readOptionalString(settings.icon),
    accent_color: readOptionalString(settings.accent_color),
    cover_image: readOptionalString(settings.cover_image),
    navigation: normalizeNavigation(settings.navigation, siteUrl),
    secondary_navigation: normalizeNavigation(
      settings.secondary_navigation,
      siteUrl,
    ),
    meta_title: readOptionalString(settings.meta_title),
    meta_description: readOptionalString(settings.meta_description),
    twitter: readOptionalString(settings.twitter),
    facebook: readOptionalString(settings.facebook),
    og_image: readOptionalString(settings.og_image),
    og_title: readOptionalString(settings.og_title),
    og_description: readOptionalString(settings.og_description),
    twitter_image: readOptionalString(settings.twitter_image),
    twitter_title: readOptionalString(settings.twitter_title),
    twitter_description: readOptionalString(settings.twitter_description),
    members_support_address: readOptionalString(settings.members_support_address),
    codeinjection_head: readOptionalString(settings.codeinjection_head),
    codeinjection_foot: readOptionalString(settings.codeinjection_foot),
  };
}

export async function getSiteSettings(
  options: GhostAdapterOptions = {},
): Promise<GhostSiteSettings | null> {
  const client = getGhostClient(options);

  if (!client) {
    return null;
  }

  const settings = await client.settings.browse();

  return normalizeSiteSettings(settings);
}

export function isGhostConfigured(options: GhostAdapterOptions = {}): boolean {
  return getGhostRuntimeConfig(options).isConfigured;
}
