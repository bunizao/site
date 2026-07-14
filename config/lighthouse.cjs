const deploymentUrl = process.env.LHCI_DEPLOYMENT_URL || 'https://buxx.me';
const paths = (process.env.LHCI_PATHS || '/,/mood,/blog/')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean);

const urls = paths.map((path) => new URL(path, deploymentUrl).toString());

const settings = {
  // Headless Chrome can otherwise throttle renderer frames as if the audit tab
  // were backgrounded. That creates exact one-second paint stalls on GitHub
  // runners and turns the same deployment into alternating green/red medians.
  chromeFlags: [
    '--headless=new',
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ].join(' '),
};

module.exports = {
  ci: {
    collect: {
      // 5 runs (LHCI keeps the median as the representative run). Lighthouse's
      // simulated throttling amplifies the runner's CPU jitter, so a median of 3
      // can still be dragged by a single noisy run — TBT was swinging ~900ms
      // between back-to-back runs of the same URL. A wider sample tightens it.
      url: urls,
      numberOfRuns: Number(process.env.LHCI_RUNS || 5),
      settings,
    },
    upload: {
      target: 'filesystem',
      outputDir: './.lighthouseci/reports',
    },
  },
};
