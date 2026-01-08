const config = require('../config/defaults');
const { toAbsoluteUrl, sleep } = require('../utils/helpers');

const extractLinks = async (page) => {
  return page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')).filter(Boolean));
};

const scrollPage = async (page) => {
  try {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let y = 0;
        const step = () => {
          y += Math.floor(window.innerHeight * 0.8);
          window.scrollTo(0, y);
          if (y < document.body.scrollHeight) {
            setTimeout(step, 120);
          } else {
            setTimeout(resolve, 200);
          }
        };
        step();
      });
    });
  } catch {}
};

const crawlGuides = async (page, startUrl) => {
  const domain = new URL(startUrl).origin;
  const queue = [{ url: startUrl, depth: 0 }];
  const visited = new Set();
  const discovered = new Set();
  const guideLinks = new Set();

  let pagesVisited = 0;

  while (queue.length && pagesVisited < config.scraping.maxPages) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      pagesVisited += 1;
      await scrollPage(page);

      const hrefs = (await extractLinks(page)) || [];
      for (const href of hrefs) {
        const abs = toAbsoluteUrl(href, url, domain);
        if (!abs) continue;

        if (abs.includes('/guide/')) guideLinks.add(abs);

        if (depth < config.scraping.maxDepth && !discovered.has(abs)) {
          const isStaticAsset = abs.match(/\.(png|jpe?g|webp|gif|svg|ico|css|js|json|xml|mp4|webm)$/i);
          if (!isStaticAsset) {
            discovered.add(abs);
            queue.push({ url: abs, depth: depth + 1 });
          }
        }
      }

      await sleep(config.scraping.betweenVisits);
    } catch (err) {
      console.error(`Error crawling ${url}:`, err.message);
    }
  }

  return {
    pagesVisited,
    guideLinks: Array.from(guideLinks).sort(),
  };
};

module.exports = { crawlGuides };
