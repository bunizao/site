import { profile, meta } from '@/data/site';

export const siteUrl = meta.siteUrl;
export const siteName = meta.siteName;
export const profileName = profile.name;
export const profileAlternateNames = [...profile.alternateNames];
export const siteDescription = meta.description;

export const canonical = (path = '/') => new URL(path, siteUrl).href;

// schema.org `sameAs` is derived from the profile links flagged for it, so the
// social list lives in exactly one place.
const sameAs = profile.links
  .filter((link) => link.sameAs)
  .map((link) => link.canonicalUrl ?? link.url);

export const profileJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  '@id': `${siteUrl}/#profile`,
  url: siteUrl,
  name: siteName,
  description: siteDescription,
  mainEntity: {
    '@type': 'Person',
    '@id': `${siteUrl}/#person`,
    name: profileName,
    alternateName: profileAlternateNames,
    url: siteUrl,
    email: `mailto:${profile.email}`,
    jobTitle: profile.jobTitle,
    affiliation: {
      '@type': 'CollegeOrUniversity',
      name: 'Monash University',
    },
    sameAs,
    knowsAbout: [...profile.knowsAbout],
  },
};

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  url: siteUrl,
  name: siteName,
  description: siteDescription,
  inLanguage: 'en',
  publisher: {
    '@id': `${siteUrl}/#person`,
  },
};
