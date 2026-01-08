const config = require('../config/defaults');
const selectors = require('../config/selectors');
const { dismissBanners } = require('../utils/browser');
const { slugFromUrl } = require('../utils/helpers');

const ensureStatsVisible = async (page) => {
  await dismissBanners(page);
  await page.locator(selectors.champion.showStatsButton).first().click({ timeout: 2000 }).catch(() => {});

  await page.evaluate(() => {
    const stats = document.querySelector('.wf-champion__about__stats');
    if (stats) {
      stats.style.setProperty('display', 'block', 'important');
      stats.style.setProperty('visibility', 'visible', 'important');
    }
  });

  await page.waitForSelector(selectors.champion.rangeInput, { timeout: 3000 }).catch(() => {});
};

const extractData = async (page) => {
  return await page.evaluate(() => {
    const extractAbilities = () => {
      const abilities = [];
      document.querySelectorAll('.statsBlock.abilities .statsBlock__block').forEach(block => {
        const nameWrap = block.querySelector('.upper .info .name');
        let key = null, name = null;

        if (nameWrap) {
          const span = nameWrap.querySelector('span');
          if (span) key = span.textContent.trim();
          const cloned = nameWrap.cloneNode(true);
          const spanClone = cloned.querySelector('span');
          if (spanClone) spanClone.remove();
          name = cloned.textContent.replace(/\s+/g, ' ').trim();
        }

        const cooldown = Array.from(block.querySelectorAll('.upper .info .cooldown span')).map(s => s.textContent.trim());
        const cost = Array.from(block.querySelectorAll('.upper .info .cost span')).map(s => s.textContent.trim());
        const lower = block.querySelector('.lower');
        const icon = block.querySelector('.upper img')?.getAttribute('src');

        abilities.push({
          key,
          name,
          cooldown,
          cost,
          icon,
          descriptionHtml: lower?.innerHTML.trim(),
          descriptionText: lower?.textContent.replace(/\s+/g, ' ').trim(),
        });
      });
      return abilities;
    };

    const extractStatsByLevel = () => {
      const statsByLevel = [];
      const extractStatsForLevel = (level) => {
        const input = document.querySelector('#range');
        if (input) {
          input.value = String(level);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const stats = {};
        const raw = {};
        document.querySelectorAll('.statsBlock.champion .statsBlock__block').forEach(b => {
          const nameEl = b.querySelector('.name');
          const valueEl = b.querySelector('.value');
          if (nameEl && valueEl) {
            const label = nameEl.textContent.replace(/\s+/g, ' ').trim();
            const valText = valueEl.textContent.replace(/\s+/g, ' ').trim();
            raw[label] = valText;
            const num = parseFloat(valText.replace(/,/g, ''));
            stats[label] = Number.isNaN(num) ? valText : num;
          }
        });

        return { level, stats, raw };
      };

      for (let level = 1; level <= 15; level++) {
        statsByLevel.push(extractStatsForLevel(level));
      }
      return statsByLevel;
    };

    const extractBuilds = () => {
      const builds = [];
      document.querySelectorAll('.wf-champion__data__items[data-guide-id]').forEach(block => {
        const extractItems = (selector) => {
          return Array.from(block.querySelectorAll(selector)).map(item => {
            const img = item.querySelector('img');
            const name = item.querySelector('.name');
            return img && name ? {
              name: name.textContent.trim(),
              image: img.getAttribute('src'),
              isEnchant: item.classList.contains('enchant') || !!item.querySelector('.enchant'),
            } : null;
          }).filter(Boolean);
        };

        builds.push({
          guideId: block.getAttribute('data-guide-id'),
          isActive: !block.classList.contains('inactive'),
          starting: extractItems('.section.starting .ico-holder'),
          core: extractItems('.section.core .ico-holder'),
          boots: extractItems('.section.boots .ico-holder'),
          final: extractItems('.section.final .ico-holder'),
        });
      });
      return builds;
    };

    const extractRunesAndSpells = () => {
      const runesAndSpells = [];
      document.querySelectorAll('.wf-champion__data__spells[data-guide-id]').forEach(block => {
        const summonerSpells = Array.from(block.querySelectorAll('.section.spells .ico-holder')).map(item => {
          const img = item.querySelector('img');
          const name = item.querySelector('.name');
          return img && name ? { name: name.textContent.trim(), image: img.getAttribute('src') } : null;
        }).filter(Boolean);

        const runes = Array.from(block.querySelectorAll('.section.runes .ico-holder')).map(item => {
          const img = item.querySelector('img');
          const name = item.querySelector('.name');
          return img && name ? {
            name: name.textContent.trim(),
            image: img.getAttribute('src'),
            isKeystone: img.classList.contains('keystone'),
          } : null;
        }).filter(Boolean);

        runesAndSpells.push({
          guideId: block.getAttribute('data-guide-id'),
          isActive: !block.classList.contains('inactive'),
          summonerSpells,
          runes,
        });
      });
      return runesAndSpells;
    };

    const extractSituationalItems = () => {
      const situationalItems = [];
      document.querySelectorAll('.wf-champion__data__situational[data-guide-id]').forEach(block => {
        const situations = [];
        block.querySelectorAll('.section.situation').forEach(section => {
          const situationEl = section.querySelector('.situation[name="situation"]');
          if (!situationEl) return;

          const items = Array.from(section.querySelectorAll('.ico-holder')).map(item => {
            const img = item.querySelector('img');
            const name = item.querySelector('.name');
            return img && name ? { name: name.textContent.trim(), image: img.getAttribute('src') } : null;
          }).filter(Boolean);

          if (items.length > 0) {
            situations.push({ situation: situationEl.textContent.trim(), items });
          }
        });

        situationalItems.push({
          guideId: block.getAttribute('data-guide-id'),
          isActive: !block.classList.contains('inactive'),
          situations,
        });
      });
      return situationalItems;
    };

    const extractSkillOrders = () => {
      const skillOrders = [];
      document.querySelectorAll('.wf-champion__data__skills[data-guide-id]').forEach(block => {
        const abilities = [];
        block.querySelectorAll('.skills-mod__abilities__row:not(.skills-mod__abilities__row--passive)').forEach(row => {
          const abilityName = row.querySelector('span')?.textContent.trim();
          if (!abilityName) return;

          const levels = Array.from(row.querySelectorAll('li.lit')).map(li => {
            const level = li.getAttribute('level');
            return level ? parseInt(level) : null;
          }).filter(Boolean);

          abilities.push({ name: abilityName, levels });
        });

        const quickOrder = Array.from(block.querySelectorAll('.skills-mod__quick__order .ico-holder img')).map(img => ({
          image: img.getAttribute('src'),
          alt: img.getAttribute('alt'),
        }));

        skillOrders.push({
          guideId: block.getAttribute('data-guide-id'),
          isActive: !block.classList.contains('inactive'),
          abilities,
          quickOrder,
        });
      });
      return skillOrders;
    };

    return {
      abilities: extractAbilities(),
      statsByLevel: extractStatsByLevel(),
      builds: extractBuilds(),
      runesAndSpells: extractRunesAndSpells(),
      situationalItems: extractSituationalItems(),
      skillOrders: extractSkillOrders(),
    };
  });
};

const scrapeChampion = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });
  await ensureStatsVisible(page);
  const data = await extractData(page);

  return {
    champion: slugFromUrl(url),
    source: url,
    scrapedAt: new Date().toISOString(),
    ...data,
  };
};

module.exports = { scrapeChampion };
