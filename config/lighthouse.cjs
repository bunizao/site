const deploymentUrl = process.env.LHCI_DEPLOYMENT_URL || 'https://buxx.me';
const paths = (process.env.LHCI_PATHS || '/,/mood,/blog')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean);

const urls = paths.map((path) => new URL(path, deploymentUrl).toString());

const settings = {
  // Apply mobile throttling in Chrome. Lantern's post-run simulation inflates
  // the HTTP/3 mood image path even when the recorded request finishes quickly.
  throttlingMethod: 'devtools',
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
      // 5 runs (LHCI keeps the median as the representative run). Applied
      // throttling can expose a slow live request, so the wider sample prevents
      // a single transport outlier from becoming the representative result.
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
