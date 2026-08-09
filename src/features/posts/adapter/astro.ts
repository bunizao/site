import type { AstroIntegration } from 'astro';

import {
  createGhostContentProvider,
  getGhostImagePatterns,
  type GhostAdapterOptions,
  getGhostRuntimeConfig,
} from './index';

const VIRTUAL_PROVIDER_ID = 'virtual:site-posts/provider';
const RESOLVED_VIRTUAL_PROVIDER_ID = `\0${VIRTUAL_PROVIDER_ID}`;

export function ghostAdapter(
  options: GhostAdapterOptions = {},
): AstroIntegration {
  return {
    name: 'site-posts/ghost-adapter',
    hooks: {
      'astro:config:setup'({ updateConfig }) {
        const runtimeConfig = getGhostRuntimeConfig({
          ...options,
        });
        const resolvedOptions = {
          ...options,
          url: options.url ?? runtimeConfig.url,
          key: options.key ?? runtimeConfig.key,
          version: options.version ?? runtimeConfig.version,
        };

        updateConfig({
          image: {
            remotePatterns: getGhostImagePatterns(
              resolvedOptions.url,
            ),
          },
          vite: {
            plugins: [
              {
                name: 'site-posts/provider',
                resolveId(id) {
                  if (id === VIRTUAL_PROVIDER_ID) {
                    return RESOLVED_VIRTUAL_PROVIDER_ID;
                  }

                  return null;
                },
                load(id) {
                  if (id !== RESOLVED_VIRTUAL_PROVIDER_ID) {
                    return null;
                  }

                  const serializedOptions = JSON.stringify(resolvedOptions);

                  return `
                    import { createGhostContentProvider } from '@/features/posts/adapter';
                    const provider = createGhostContentProvider(${serializedOptions});
                    export default provider;
                    export const getSiteData = provider.getSiteData;
                    export const getAccessiblePosts = provider.getAccessiblePosts;
                    export const getListedPosts = provider.getListedPosts;
                    export const getAllPages = provider.getAllPages;
                    export const getAllTags = provider.getAllTags;
                    export const getAllAuthors = provider.getAllAuthors;
                    export const getTiers = provider.getTiers;
                    export const getTierBySlug = provider.getTierBySlug;
                    export const getHomepage = provider.getHomepage;
                    export const getPostBySlug = provider.getPostBySlug;
                    export const getPageBySlug = provider.getPageBySlug;
                    export const getRootContentBySlug = provider.getRootContentBySlug;
                    export const getAdjacentPosts = provider.getAdjacentPosts;
                    export const getRecentPosts = provider.getRecentPosts;
                    export const getTagBySlug = provider.getTagBySlug;
                    export const getAuthorBySlug = provider.getAuthorBySlug;
                    export const getTagArchive = provider.getTagArchive;
                    export const getAuthorArchive = provider.getAuthorArchive;
                    export const getTagDirectory = provider.getTagDirectory;
                    export const getSearchDocuments = provider.getSearchDocuments;
                  `;
                },
              },
            ],
          },
        });
      },
    },
  };
}

export { createGhostContentProvider };
