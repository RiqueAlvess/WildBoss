const { firefox } = require('playwright');
const fs = require('fs');

const slugFromUrl = (url) => {
    try {
        const parts = new URL(url).pathname.split('/').filter(Boolean);
        return parts[parts.length - 1] || 'champion';
    } catch { return 'champion'; }
};

const dismissBanners = async (page) => {
    const selectors = ['button:has-text("Accept")', 'button:has-text("I agree")', '[aria-label="dismiss"]'];
    for (const sel of selectors) {
        await page.locator(sel).first().click({ timeout: 1000 }).catch(() => {});
    }
};

const ensureStatsVisible = async (page) => {
    await dismissBanners(page);
    await page.locator('.show-champ-stats').first().click({ timeout: 2000 }).catch(() => {});

    await page.evaluate(() => {
        const stats = document.querySelector('.wf-champion__about__stats');
        if (stats) {
            stats.style.setProperty('display', 'block', 'important');
            stats.style.setProperty('visibility', 'visible', 'important');
        }
    });

    await page.waitForSelector('#range', { timeout: 3000 }).catch(() => {});
};

const extractAllData = async (page) => {
    return await page.evaluate(() => {
        const result = { statsByLevel: [], abilities: [], builds: [], runesAndSpells: [], situationalItems: [], skillOrders: [] };

        // Abilities
        document.querySelectorAll('.statsBlock.abilities .statsBlock__block').forEach(block => {
            const nameWrap = block.querySelector('.upper .info .name');
            let key = null, name = null;

            if (nameWrap) {
                const span = nameWrap.querySelector('span');
                if (span) key = span.textContent.trim();
                const clone = nameWrap.cloneNode(true);
                clone.querySelector('span')?.remove();
                name = clone.textContent.replace(/\s+/g, ' ').trim();
            }

            const cooldown = Array.from(block.querySelectorAll('.upper .info .cooldown span')).map(s => s.textContent.trim());
            const cost = Array.from(block.querySelectorAll('.upper .info .cost span')).map(s => s.textContent.trim());
            const lower = block.querySelector('.lower');
            const icon = block.querySelector('.upper img')?.getAttribute('src');

            result.abilities.push({
                key, name, cooldown, cost, icon,
                descriptionHtml: lower?.innerHTML.trim(),
                descriptionText: lower?.textContent.replace(/\s+/g, ' ').trim()
            });
        });

        // Stats by level
        const extractStats = (level) => {
            const input = document.querySelector('#range');
            if (input) {
                input.value = String(level);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const rawStats = {}, stats = {};
            document.querySelectorAll('.statsBlock.champion .statsBlock__block').forEach(b => {
                const label = b.querySelector('.name')?.textContent.replace(/\s+/g, ' ').trim();
                const valText = b.querySelector('.value')?.textContent.replace(/\s+/g, ' ').trim();
                if (label && valText) {
                    rawStats[label] = valText;
                    const num = parseFloat(valText.replace(/,/g, ''));
                    stats[label] = Number.isNaN(num) ? valText : num;
                }
            });

            return { level, stats, raw: rawStats };
        };

        for (let level = 1; level <= 15; level++) {
            result.statsByLevel.push(extractStats(level));
        }

        // Builds
        const extractItems = (block, selector) => {
            return Array.from(block.querySelectorAll(selector)).map(item => {
                const img = item.querySelector('img');
                const name = item.querySelector('.name');
                return img && name ? {
                    name: name.textContent.trim(),
                    image: img.getAttribute('src'),
                    isEnchant: item.classList.contains('enchant') || !!item.querySelector('.enchant')
                } : null;
            }).filter(Boolean);
        };

        document.querySelectorAll('.wf-champion__data__items[data-guide-id]').forEach(block => {
            result.builds.push({
                guideId: block.getAttribute('data-guide-id'),
                isActive: !block.classList.contains('inactive'),
                starting: extractItems(block, '.section.starting .ico-holder'),
                core: extractItems(block, '.section.core .ico-holder'),
                boots: extractItems(block, '.section.boots .ico-holder'),
                final: extractItems(block, '.section.final .ico-holder')
            });
        });

        // Runes and Spells
        document.querySelectorAll('.wf-champion__data__spells[data-guide-id]').forEach(block => {
            const extractTooltip = (selector, extraCheck = {}) => {
                return Array.from(block.querySelectorAll(selector)).map(item => {
                    const img = item.querySelector('img');
                    const name = item.querySelector('.name');
                    return img && name ? {
                        name: name.textContent.trim(),
                        image: img.getAttribute('src'),
                        ...extraCheck(img)
                    } : null;
                }).filter(Boolean);
            };

            result.runesAndSpells.push({
                guideId: block.getAttribute('data-guide-id'),
                isActive: !block.classList.contains('inactive'),
                summonerSpells: extractTooltip('.section.spells .ico-holder', () => ({})),
                runes: extractTooltip('.section.runes .ico-holder', (img) => ({ isKeystone: img.classList.contains('keystone') }))
            });
        });

        // Situational Items
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

                if (items.length) situations.push({ situation: situationEl.textContent.trim(), items });
            });

            result.situationalItems.push({ guideId: block.getAttribute('data-guide-id'), isActive: !block.classList.contains('inactive'), situations });
        });

        // Skill Orders
        document.querySelectorAll('.wf-champion__data__skills[data-guide-id]').forEach(block => {
            const abilities = [];
            block.querySelectorAll('.skills-mod__abilities__row:not(.skills-mod__abilities__row--passive)').forEach(row => {
                const abilityName = row.querySelector('span')?.textContent.trim();
                if (abilityName) {
                    const levels = Array.from(row.querySelectorAll('li.lit')).map(li => {
                        const level = li.getAttribute('level');
                        return level ? parseInt(level) : null;
                    }).filter(Boolean);
                    abilities.push({ name: abilityName, levels });
                }
            });

            const quickOrder = Array.from(block.querySelectorAll('.skills-mod__quick__order .ico-holder img'))
                .map(img => ({ image: img.getAttribute('src'), alt: img.getAttribute('alt') }));

            result.skillOrders.push({ guideId: block.getAttribute('data-guide-id'), isActive: !block.classList.contains('inactive'), abilities, quickOrder });
        });

        return result;
    });
};

const scrapeChampion = async (page, url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await ensureStatsVisible(page);
    const data = await extractAllData(page);

    return {
        champion: slugFromUrl(url),
        source: url,
        scrapedAt: new Date().toISOString(),
        ...data
    };
};

(async () => {
    const urls = fs.readFileSync('guides.txt', 'utf8').split('\n').filter(line => line.trim());
    const startTime = Date.now();

    const browser = await firefox.launch({ headless: process.env.HEADLESS !== '1' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    await context.route(/(googlesyndication|googleadservices|doubleclick|adservice|googletagmanager|google-analytics|adthrive|cpmstar|facebook|twitter)\.com/i,
        route => route.abort());

    const results = [];
    const total = urls.length;

    for (let i = 0; i < total; i++) {
        const url = urls[i];
        const championName = slugFromUrl(url);
        console.log(`Processando ${i + 1}/${total}: ${championName}`);

        const page = await context.newPage();

        try {
            const start = Date.now();
            const result = await scrapeChampion(page, url);
            const duration = ((Date.now() - start) / 1000).toFixed(1);

            results.push(result);
            console.log(`Concluido ${championName} - ${duration}s`);
        } catch (err) {
            console.log(`Erro ${championName}: ${err.message}`);
        } finally {
            await page.close();
        }
    }

    await context.close();
    await browser.close();

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    fs.writeFileSync('all_champions.json', JSON.stringify(results, null, 2), 'utf8');

    console.log(`\nConcluido! ${results.length}/${total} campeões em ${totalTime}s`);
    console.log(`Média: ${(totalTime / results.length).toFixed(1)}s por campeão`);
    console.log(`Arquivo salvo: all_champions.json`);
})();
