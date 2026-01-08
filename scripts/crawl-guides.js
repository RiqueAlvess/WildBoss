const fs = require('fs');
const path = require('path');
const { createBrowser } = require('../lib/utils/browser');
const { crawlGuides } = require('../lib/scrapers/guideCrawler');

const START_URL = 'https://www.wildriftfire.com/';

(async () => {
  const { browser, context } = await createBrowser({ headless: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const { pagesVisited, guideLinks } = await crawlGuides(page, START_URL);

  const outTxt = path.resolve(process.cwd(), 'guides.txt');
  const outJson = path.resolve(process.cwd(), 'guides.json');

  fs.writeFileSync(outTxt, guideLinks.join('\n') + '\n', 'utf8');
  fs.writeFileSync(outJson, JSON.stringify(guideLinks, null, 2), 'utf8');

  console.log(`Visited ${pagesVisited} pages`);
  console.log(`Found ${guideLinks.length} guide links`);
  console.log(`Files saved:\n- ${outTxt}\n- ${outJson}`);

  await browser.close();
})();
