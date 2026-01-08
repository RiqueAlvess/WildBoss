const fs = require('fs');
const config = require('../config/defaults');
const selectors = require('../config/selectors');
const { sleep, parseJsonFromClass } = require('../utils/helpers');

const extractTooltipData = async (page, type = 'item') => {
  const locator = page.locator(selectors.tierList.items);
  const total = await locator.count();
  console.log(`Found ${total} ${type}s to process`);

  const results = [];
  const failed = [];

  for (let i = 0; i < total; i++) {
    const element = locator.nth(i);
    let elementId = null;

    try {
      const data = {};
      const className = await element.getAttribute('class');
      const tooltipData = parseJsonFromClass(className || '');

      if (tooltipData) {
        data.id = tooltipData.i;
        elementId = tooltipData.i;
        data.code = tooltipData.t;
      }

      data.sort = await element.getAttribute('data-sort');
      data.data_id = await element.getAttribute('data-id');

      let success = false;
      for (let attempt = 0; attempt < config.retries.tooltipExtraction; attempt++) {
        try {
          await element.scrollIntoViewIfNeeded();
          await sleep(config.timeouts.default);
          await element.hover();
          await sleep(config.timeouts.hoverStabilize);

          await page.waitForSelector(selectors.tooltip.visible, {
            timeout: config.timeouts.tooltipVisible,
          });

          const contentChecker = type === 'item'
            ? () => {
                const t = document.querySelector('#tooltip');
                if (!t || t.style.display === 'none') return false;
                const nameEl = t.querySelector('.tt__info__title span');
                const content = t.querySelector('.tt__info__stats span, .tt__info__uniques span');
                return !!(nameEl && nameEl.textContent?.trim() && content);
              }
            : () => {
                const t = document.querySelector('#tooltip');
                if (!t || t.style.display === 'none') return false;
                const nameEl = t.querySelector('.tt__info__title span');
                return !!(nameEl && nameEl.textContent?.trim());
              };

          await page.waitForFunction(contentChecker, null, {
            timeout: config.timeouts.contentReady,
          });

          const tooltip = await page.$(selectors.tooltip.container);
          if (tooltip) {
            const imgEl = await tooltip.$(selectors.tooltip.image);
            if (imgEl) data.image = await imgEl.getAttribute('src');

            const nameEl = await tooltip.$(selectors.tooltip.title);
            if (nameEl) data.name = (await nameEl.textContent() || '').trim();

            if (type === 'item') {
              const costEl = await tooltip.$(selectors.tooltip.cost);
              if (costEl) {
                const costText = (await costEl.textContent() || '').trim();
                const numeric = parseInt(costText.replace(/[^\d]/g, ''), 10);
                data.cost = Number.isNaN(numeric) ? costText : numeric;
              }

              const statsEls = await tooltip.$$(selectors.tooltip.stats);
              data.stats = [];
              for (const el of statsEls) {
                const txt = (await el.textContent() || '').trim();
                if (txt) data.stats.push(txt);
              }
            }

            const uniquesEl = await tooltip.$(selectors.tooltip.uniques);
            if (uniquesEl) {
              data[type === 'item' ? 'uniques' : 'description'] =
                (await uniquesEl.innerHTML() || '').trim();
            }

            if (type === 'rune') {
              const ttEl = await tooltip.$('.tt');
              if (ttEl) {
                const ttClass = await ttEl.getAttribute('class');
                data.type = ttClass?.includes('tt--rune') ? 'rune' : 'unknown';
              }
            }

            success = true;
            break;
          }
        } catch (e) {
          console.log(`Attempt ${attempt + 1}/${config.retries.tooltipExtraction}: ${type} ${i + 1} - ${e.message}`);
        }

        await page.mouse.move(0, 0);
        await sleep(config.timeouts.retrySleep);
      }

      if (success && data.name) {
        results.push(data);
        console.log(`Processed ${type} ${i + 1}/${total}: ${data.name}`);
      } else {
        failed.push(elementId ?? i);
        console.log(`Failed ${type} ${i + 1}/${total}`);
      }

      if ((i + 1) % config.scraping.batchSize === 0 || i === total - 1) {
        fs.writeFileSync(`${type}s_data_partial.json`, JSON.stringify(results, null, 2), 'utf8');
        console.log(`Progress saved: ${results.length} ${type}s`);
      }

      await page.mouse.move(0, 0);
      await sleep(config.timeouts.betweenActions);

    } catch (e) {
      failed.push(elementId ?? i);
      console.log(`Error ${type} ${i + 1}: ${e.message}`);
    }
  }

  if (failed.length) {
    console.log(`Failed ${failed.length} ${type}s:`, failed);
  }

  return results;
};

module.exports = { extractTooltipData };
