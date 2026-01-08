const { firefox } = require('playwright');
const config = require('../config/defaults');
const selectors = require('../config/selectors');

const createBrowser = async (options = {}) => {
  const browser = await firefox.launch({
    headless: options.headless ?? config.browser.headless,
  });

  const context = await browser.newContext({
    viewport: options.viewport ?? config.browser.viewport,
  });

  await context.route(
    /(googlesyndication|googleadservices|doubleclick|adservice|googletagmanager|google-analytics|adthrive|cpmstar|facebook|twitter)\.com/i,
    (route) => route.abort()
  );

  return { browser, context };
};

const dismissBanners = async (page) => {
  for (const selector of selectors.banners) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click({ timeout: 1500 });
      }
    } catch {}
  }
};

module.exports = {
  createBrowser,
  dismissBanners,
};
