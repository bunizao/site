const categoryThresholds = {
  performance: 0.75,
  accessibility: 0.9,
  'best-practices': 0.9,
  seo: 0.9,
};

const metricThresholds = {
  'first-contentful-paint': 3000,
  'largest-contentful-paint': 4000,
  'total-blocking-time': 300,
  'cumulative-layout-shift': 0.1,
};

const assertions = Object.fromEntries([
  ...Object.entries(categoryThresholds).map(([category, minScore]) => [
    `categories:${category}`,
    ['error', { minScore }],
  ]),
  ...Object.entries(metricThresholds).map(([audit, maxNumericValue]) => [
    audit,
    ['error', { maxNumericValue }],
  ]),
]);

module.exports = {
  assertions,
  categoryThresholds,
  metricThresholds,
};
