const deploymentUrl = process.env.LHCI_DEPLOYMENT_URL || 'https://buxx.me';
const paths = (process.env.LHCI_PATHS || '/,/mood')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean);

const urls = paths.map((path) => new URL(path, deploymentUrl).toString());

const settings = {
  chromeFlags: '--headless=new --no-sandbox',
};

module.exports = {
  ci: {
    collect: {
      url: urls,
      numberOfRuns: Number(process.env.LHCI_RUNS || 3),
      settings,
    },
    upload: {
      target: 'filesystem',
      outputDir: './.lighthouseci/reports',
    },
  },
};
