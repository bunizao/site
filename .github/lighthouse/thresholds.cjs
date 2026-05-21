const categoryThresholds = {
  performance: 0.75,
  accessibility: 0.9,
  'best-practices': 0.9,
};

const metricThresholds = {
  'first-contentful-paint': 3000,
  'largest-contentful-paint': 4000,
  'total-blocking-time': 300,
  'cumulative-layout-shift': 0.1,
};

function getCategoryThresholds(url) {
  const thresholds = { ...categoryThresholds };
  const hostname = new URL(url).hostname;

  if (hostname === 'buxx.me') {
    thresholds.seo = 0.9;
  }

  return thresholds;
}

module.exports = {
  categoryThresholds,
  getCategoryThresholds,
  metricThresholds,
};
