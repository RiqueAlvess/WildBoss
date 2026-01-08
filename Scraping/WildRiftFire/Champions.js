const { firefox } = require('playwright');
const fs = require('fs');

const URL = 'https://www.wildriftfire.com/guide/caitlyn';
const HOVER_MS = 700;
const HOLD_MS = 140;
const WAIT_AFTER_OPEN_MS = 3000;

const slugFromUrl = (url) => {
    try {
        const parts = new URL(url).pathname.split('/').filter(Boolean);
        return parts[parts.length - 1] || 'champion';
    } catch { return 'champion'; }
};

const isStatsOpen = async (page) => {
    return await page.evaluate(() => {
        const stats = document.querySelector('.wf-champion__about__stats');
        if (!stats) return false;
        const cs = window.getComputedStyle(stats);
        return cs.display !== 'none' && stats.clientHeight > 0 && stats.offsetParent !== null;
    });
};

const physicalClick = async (page, selector = '.show-champ-stats') => {
    const btn = page.locator(selector).first();
    await btn.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

    if (await btn.count() === 0) return false;

    const visible = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' &&
               el.offsetParent !== null && el.getBoundingClientRect().width > 0;
    }, selector);

    if (!visible) return false;

    await btn.scrollIntoViewIfNeeded().catch(() => {});
    const box = await btn.boundingBox().catch(() => null);
    if (!box) return false;

    try {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 16 });
        await page.waitForTimeout(HOVER_MS);
        await page.mouse.down();
        await page.waitForTimeout(HOLD_MS);
        await page.mouse.up();
        return true;
    } catch {
        await btn.click({ timeout: 1500, force: true }).catch(() => {});
        return true;
    }
};

const ensureStatsOpen = async (page) => {
    await page.locator('.wf-champion__about__stats').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    if (await isStatsOpen(page)) return;

    await page.waitForTimeout(500);

    for (let attempt = 1; attempt <= 7; attempt++) {
        await physicalClick(page);

        try {
            await page.waitForSelector('#range', { state: 'attached', timeout: 5500 });
            return;
        } catch {}

        await page.mouse.move(0, 0);
        await page.waitForTimeout(650);
    }

    if (!(await isStatsOpen(page))) {
        await page.evaluate(() => {
            const s = document.querySelector('.wf-champion__about__stats');
            if (s) s.style.setProperty('display', 'block', 'important');
        });
        await page.waitForSelector('#range', { state: 'attached', timeout: 5000 }).catch(() => {});
    }
};

const setLevel = async (page, level) => {
    await page.evaluate((lvl) => {
        const input = document.querySelector('#range');
        if (input) {
            input.value = String(lvl);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, level);

    await page.waitForFunction((lvl) => {
        const el = document.querySelector('#stat-level');
        return el?.textContent?.trim() === String(lvl);
    }, level, { timeout: 7000 });

    await page.waitForTimeout(200);
};

const extractStats = async (page) => {
    return await page.evaluate(() => {
        const stats = {};
        document.querySelectorAll('.statsBlock.champion .statsBlock__block').forEach(b => {
            const label = b.querySelector('.name')?.textContent.replace(/\s+/g, ' ').trim();
            const valText = b.querySelector('.value')?.textContent.replace(/\s+/g, ' ').trim();
            if (label && valText) stats[label] = valText;
        });
        return stats;
    });
};

const extractAbilities = async (page) => {
    return await page.evaluate(() => {
        const abilities = [];
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

            abilities.push({
                key, name, cooldown, cost, icon,
                descriptionHtml: lower?.innerHTML.trim(),
                descriptionText: lower?.textContent.replace(/\s+/g, ' ').trim()
            });
        });
        return abilities;
    });
};

(async () => {
    const headless = process.env.HEADLESS === '1';
    const browser = await firefox.launch({ headless });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.route(/(googlesyndication|googleadservices|doubleclick|adservice|googletagmanager|google-analytics|adthrive|cpmstar|facebook|twitter)\.com/i,
        route => route.abort());

    try {
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForLoadState('networkidle', { timeout: 60000 });

        for (const sel of ['button:has-text("Accept")', 'button:has-text("I agree")', '[aria-label="dismiss"]']) {
            await page.locator(sel).first().click({ timeout: 1500 }).catch(() => {});
        }

        await ensureStatsOpen(page);
        await page.waitForTimeout(WAIT_AFTER_OPEN_MS);
        await page.waitForSelector('#range', { state: 'attached', timeout: 10000 });

        const abilities = await extractAbilities(page);
        const statsByLevel = [];

        for (let level = 1; level <= 15; level++) {
            await setLevel(page, level);
            const rawStats = await extractStats(page);
            const stats = Object.fromEntries(
                Object.entries(rawStats).map(([k, v]) => {
                    const num = parseFloat(v.replace(/,/g, ''));
                    return [k, Number.isNaN(num) ? v : num];
                })
            );
            statsByLevel.push({ level, stats, raw: rawStats });
        }

        const result = {
            champion: slugFromUrl(URL),
            source: URL,
            scrapedAt: new Date().toISOString(),
            statsByLevel,
            abilities
        };

        fs.writeFileSync('champ.json', JSON.stringify(result, null, 2), 'utf8');
        console.log('✅ Arquivo salvo: champ.json');
    } catch (err) {
        console.error('❌ Erro:', err);
        process.exitCode = 1;
    } finally {
        await context.close();
        await browser.close();
    }
})();
