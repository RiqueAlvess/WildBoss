module.exports = {
  timeouts: {
    navigation: 20000,
    hoverStabilize: 800,
    tooltipVisible: 3500,
    contentReady: 3500,
    betweenActions: 300,
    retrySleep: 800,
    default: 300,
  },

  retries: {
    tooltipExtraction: 5,
  },

  scraping: {
    batchSize: 10,
    maxDepth: 2,
    maxPages: 200,
    betweenVisits: 350,
  },

  browser: {
    viewport: { width: 1280, height: 900 },
    headless: process.env.HEADLESS === '1',
  },
};
