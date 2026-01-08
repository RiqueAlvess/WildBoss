const fs = require('fs');
const { createBrowser, dismissBanners } = require('../lib/utils/browser');
const { extractTooltipData } = require('../lib/scrapers/tooltipScraper');
const selectors = require('../lib/config/selectors');

const URL = 'https://www.wildriftfire.com/item-list';

(async () => {
  const { browser, context } = await createBrowser();
  const page = await context.newPage();

  try {
    console.log(`Navigating to ${URL}`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dismissBanners(page);
    await page.waitForSelector(selectors.tierList.items, { timeout: 30000 });

    const itemsData = await extractTooltipData(page, 'item');

    fs.writeFileSync('items_data.json', JSON.stringify(itemsData, null, 2), 'utf8');
    console.log(`Successfully extracted ${itemsData.length} items`);
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
})();
