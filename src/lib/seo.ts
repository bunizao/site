export const siteUrl = 'https://buxx.me';
export const siteName = 'Bunizao';
export const profileName = 'Lucian Tutu';
export const profileAlternateNames = ['Bunizao', 'Tutu', 'Collapsar'];
export const siteDescription =
  'Personal website of Lucian Tutu, a computer science student and developer building frontend, proxy, automation, and open-source projects.';

export const canonical = (path = '/') => new URL(path, siteUrl).href;

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
    email: 'mailto:me@buxx.me',
    jobTitle: 'Student / Developer / Blogger',
    affiliation: {
      '@type': 'CollegeOrUniversity',
      name: 'Monash University',
    },
    sameAs: [
      'https://blog.buxx.me',
      'https://github.com/bunizao',
      'https://tuu.cat/gh',
      'https://tuu.cat/tg',
      'https://tuu.cat/ig',
    ],
    knowsAbout: [
      'Frontend design',
      'Proxy systems',
      'Open source software',
      'Automation',
      'Performance optimization',
    ],
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
