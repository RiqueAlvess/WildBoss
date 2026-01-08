const fs = require('fs');
const { createBrowser } = require('../lib/utils/browser');
const { scrapeChampion } = require('../lib/scrapers/championScraper');
const { slugFromUrl } = require('../lib/utils/helpers');

(async () => {
  const urls = fs.readFileSync('guides.txt', 'utf8').split('\n').filter(line => line.trim());
  const startTime = Date.now();

  const { browser, context } = await createBrowser();
  const results = [];
  const total = urls.length;

  for (let i = 0; i < total; i++) {
    const url = urls[i];
    const championName = slugFromUrl(url);
    console.log(`Processing ${i + 1}/${total}: ${championName}`);

    const page = await context.newPage();

    try {
      const start = Date.now();
      const result = await scrapeChampion(page, url);
      const duration = ((Date.now() - start) / 1000).toFixed(1);

      results.push(result);
      console.log(`Completed ${championName} - ${duration}s`);
    } catch (err) {
      console.log(`Error ${championName}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await context.close();
  await browser.close();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  fs.writeFileSync('all_champions.json', JSON.stringify(results, null, 2), 'utf8');

  console.log(`\nCompleted! ${results.length}/${total} champions in ${totalTime}s`);
  console.log(`Average: ${(totalTime / results.length).toFixed(1)}s per champion`);
  console.log(`File saved: all_champions.json`);
})();
