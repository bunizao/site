const deploymentUrl = process.env.LHCI_DEPLOYMENT_URL || 'https://buxx.me';
const paths = (process.env.LHCI_PATHS || '/,/mood')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean);

const urls = paths.map((path) => new URL(path, deploymentUrl).toString());
const extraHeaders = {};

if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  extraHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  extraHeaders['x-vercel-set-bypass-cookie'] = 'true';
}

const settings = {
  chromeFlags: '--headless=new --no-sandbox',
};

if (Object.keys(extraHeaders).length > 0) {
  settings.extraHeaders = JSON.stringify(extraHeaders);
}

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
