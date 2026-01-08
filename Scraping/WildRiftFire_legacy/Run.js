const { firefox } = require('playwright');
const fs = require('fs');

function slugFromUrl(u) {
    try {
        const p = new URL(u).pathname.split('/').filter(Boolean);
        return p[p.length - 1] || 'champion';
    } catch {
        return 'champion';
    }
}

async function fastExtractAll(page) {
    return await page.evaluate(() => {
        const statsSection = document.querySelector('.wf-champion__about__stats');
        if (statsSection) {
            statsSection.style.setProperty('display', 'block', 'important');
            statsSection.style.setProperty('visibility', 'visible', 'important');
        }

        const result = {
            statsByLevel: [],
            abilities: [],
            builds: [],
            runesAndSpells: [],
            situationalItems: [],
            skillOrders: []
        };

        // Extract abilities
        document.querySelectorAll('.statsBlock.abilities .statsBlock__block').forEach(block => {
            const nameWrap = block.querySelector('.upper .info .name');
            let key = null, name = null;

            if (nameWrap) {
                const span = nameWrap.querySelector('span');
                if (span) key = span.textContent.trim();
                const cloned = nameWrap.cloneNode(true);
                const spanInClone = cloned.querySelector('span');
                if (spanInClone) spanInClone.remove();
                name = cloned.textContent.replace(/\s+/g, ' ').trim();
            }

            const cooldown = Array.from(block.querySelectorAll('.upper .info .cooldown span')).map(s => s.textContent.trim());
            const cost = Array.from(block.querySelectorAll('.upper .info .cost span')).map(s => s.textContent.trim());
            const lower = block.querySelector('.lower');
            const descriptionHtml = lower ? lower.innerHTML.trim() : null;
            const descriptionText = lower ? lower.textContent.replace(/\s+/g, ' ').trim() : null;
            const iconEl = block.querySelector('.upper img');
            const icon = iconEl ? iconEl.getAttribute('src') : null;

            result.abilities.push({ key, name, cooldown, cost, icon, descriptionHtml, descriptionText });
        });

        // Extract stats for all levels
        const extractStatsForLevel = (level) => {
            const input = document.querySelector('#range');
            if (input) {
                input.value = String(level);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const rawStats = {};
            const stats = {};
            document.querySelectorAll('.statsBlock.champion .statsBlock__block').forEach(b => {
                const nameEl = b.querySelector('.name');
                const valueEl = b.querySelector('.value');
                if (nameEl && valueEl) {
                    const label = nameEl.textContent.replace(/\s+/g, ' ').trim();
                    const valText = valueEl.textContent.replace(/\s+/g, ' ').trim();
                    rawStats[label] = valText;
                    const clean = valText.replace(/,/g, '');
                    const num = parseFloat(clean);
                    stats[label] = Number.isNaN(num) ? valText : num;
                }
            });

            return { level, stats, raw: rawStats };
        };

        for (let level = 1; level <= 15; level++) {
            result.statsByLevel.push(extractStatsForLevel(level));
        }

        // Extract builds
        document.querySelectorAll('.wf-champion__data__items[data-guide-id]').forEach(block => {
            const guideId = block.getAttribute('data-guide-id');
            const isActive = !block.classList.contains('inactive');

            const extractItems = (selector) => {
                return Array.from(block.querySelectorAll(selector)).map(item => {
                    const img = item.querySelector('img');
                    const name = item.querySelector('.name');
                    return img && name ? {
                        name: name.textContent.trim(),
                        image: img.getAttribute('src'),
                        isEnchant: item.classList.contains('enchant') || item.querySelector('.enchant') !== null
                    } : null;
                }).filter(Boolean);
            };

            result.builds.push({
                guideId,
                isActive,
                starting: extractItems('.section.starting .ico-holder'),
                core: extractItems('.section.core .ico-holder'),
                boots: extractItems('.section.boots .ico-holder'),
                final: extractItems('.section.final .ico-holder')
            });
        });

        // Extract runes and spells
        document.querySelectorAll('.wf-champion__data__spells[data-guide-id]').forEach(block => {
            const guideId = block.getAttribute('data-guide-id');
            const isActive = !block.classList.contains('inactive');

            const summonerSpells = Array.from(block.querySelectorAll('.section.spells .ico-holder')).map(item => {
                const img = item.querySelector('img');
                const name = item.querySelector('.name');
                return img && name ? {
                    name: name.textContent.trim(),
                    image: img.getAttribute('src')
                } : null;
            }).filter(Boolean);

            const runes = Array.from(block.querySelectorAll('.section.runes .ico-holder')).map(item => {
                const img = item.querySelector('img');
                const name = item.querySelector('.name');
                return img && name ? {
                    name: name.textContent.trim(),
                    image: img.getAttribute('src'),
                    isKeystone: img.classList.contains('keystone')
                } : null;
            }).filter(Boolean);

            result.runesAndSpells.push({ guideId, isActive, summonerSpells, runes });
        });

        // Extract situational items
        document.querySelectorAll('.wf-champion__data__situational[data-guide-id]').forEach(block => {
            const guideId = block.getAttribute('data-guide-id');
            const isActive = !block.classList.contains('inactive');
            const situations = [];

            block.querySelectorAll('.section.situation').forEach(section => {
                const situationEl = section.querySelector('.situation[name="situation"]');
                if (!situationEl) return;

                const items = Array.from(section.querySelectorAll('.ico-holder')).map(item => {
                    const img = item.querySelector('img');
                    const name = item.querySelector('.name');
                    return img && name ? {
                        name: name.textContent.trim(),
                        image: img.getAttribute('src')
                    } : null;
                }).filter(Boolean);

                if (items.length > 0) {
                    situations.push({
                        situation: situationEl.textContent.trim(),
                        items
                    });
                }
            });

            result.situationalItems.push({ guideId, isActive, situations });
        });

        // Extract skill orders
        document.querySelectorAll('.wf-champion__data__skills[data-guide-id]').forEach(block => {
            const guideId = block.getAttribute('data-guide-id');
            const isActive = !block.classList.contains('inactive');
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
                alt: img.getAttribute('alt')
            }));

            result.skillOrders.push({ guideId, isActive, abilities, quickOrder });
        });

        return result;
    });
}

async function openStatsQuick(page) {
    // Use Playwright selectors for banner dismissal
    const selectors = [
        'button:has-text("Accept")',
        'button:has-text("I agree")',
        '[aria-label="dismiss"]'
    ];

    for (const sel of selectors) {
        await page.locator(sel).first().click({ timeout: 1000 }).catch(() => { });
    }

    // Click show stats button
    await page.locator('.show-champ-stats').first().click({ timeout: 2000 }).catch(() => { });

    // Force show with evaluate
    await page.evaluate(() => {
        const statsSection = document.querySelector('.wf-champion__about__stats');
        if (statsSection) {
            statsSection.style.setProperty('display', 'block', 'important');
            statsSection.style.setProperty('visibility', 'visible', 'important');
        }
    });

    await page.waitForSelector('#range', { timeout: 3000 }).catch(() => { });
}

async function scrapeChampion(page, url) {
    await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
    });

    await openStatsQuick(page);
    const data = await fastExtractAll(page);

    return {
        champion: slugFromUrl(url),
        source: url,
        scrapedAt: new Date().toISOString(),
        ...data
    };
}

(async () => {
    const urls = fs.readFileSync('guides.txt', 'utf8').split('\n').filter(line => line.trim());
    const startTime = Date.now();

    const browser = await firefox.launch({
        headless: process.env.HEADLESS !== '1'
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 }
    });

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