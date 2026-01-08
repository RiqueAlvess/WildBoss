const { firefox } = require('playwright');
const fs = require('fs');

const URL = 'https://www.wildriftfire.com/rune-list';
const HOVER_MS = 800;
const TOOLTIP_TIMEOUT_MS = 3000;
const BETWEEN_ACTIONS_MS = 250;
const RETRY_SLEEP_MS = 700;
const RETRIES = 5;
const BATCH_SIZE = 10;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

const parseJsonFromClass = (className) => {
    if (!className) return null;
    const match = className.match(/\{.*?\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0].replace(/'/g, '"'));
    } catch { return null; }
};

const extractRuneData = async (page) => {
    const runeLocator = page.locator('.wf-tier-list__tiers .ico-holder.ajax-tooltip');
    const totalRunes = await runeLocator.count();
    console.log(`Encontradas ${totalRunes} runas para processar`);

    const allRunes = [];
    const failed = [];

    for (let i = 0; i < totalRunes; i++) {
        const rune = runeLocator.nth(i);
        let runeId = null;

        try {
            const runeData = {};
            const className = await rune.getAttribute('class');
            const tooltipData = parseJsonFromClass(className || '');

            if (tooltipData) {
                runeData.id = tooltipData.i;
                runeId = tooltipData.i;
                runeData.code = tooltipData.t;
            }

            runeData.sort = await rune.getAttribute('data-sort');
            runeData.data_id = await rune.getAttribute('data-id');

            let success = false;
            for (let attempt = 0; attempt < RETRIES && !success; attempt++) {
                try {
                    await rune.scrollIntoViewIfNeeded();
                    await sleep(300);
                    await rune.hover();
                    await sleep(HOVER_MS);

                    await page.waitForSelector('#tooltip:not([style*="display: none"])', { timeout: TOOLTIP_TIMEOUT_MS });

                    await page.waitForFunction(() => {
                        const t = document.querySelector('#tooltip');
                        if (!t || t.style.display === 'none') return false;
                        const name = t.querySelector('.tt__info__title span');
                        return name?.textContent?.trim();
                    }, null, { timeout: TOOLTIP_TIMEOUT_MS });

                    const tooltip = await page.$('#tooltip');
                    if (tooltip) {
                        runeData.image = await tooltip.$eval('.tt__image img', el => el.getAttribute('src')).catch(() => null);
                        runeData.name = await tooltip.$eval('.tt__info__title span', el => el.textContent.trim()).catch(() => null);
                        runeData.description = await tooltip.$eval('.tt__info__uniques span', el => el.innerHTML.trim()).catch(() => null);

                        const ttClass = await tooltip.$eval('.tt', el => el.getAttribute('class')).catch(() => '');
                        runeData.type = ttClass?.includes('tt--rune') ? 'rune' : 'unknown';

                        success = true;
                    }
                } catch (e) {
                    console.log(`Tentativa ${attempt + 1}/${RETRIES} falhou para runa ${i + 1}: ${e.message}`);
                }

                if (!success) {
                    await page.mouse.move(0, 0);
                    await sleep(RETRY_SLEEP_MS);
                }
            }

            if (success && runeData.name) {
                allRunes.push(runeData);
                console.log(`Processada runa ${i + 1}/${totalRunes}: ${runeData.name}`);
            } else {
                failed.push(runeId ?? i);
                console.log(`Falha ao processar runa ${i + 1}/${totalRunes}`);
            }

            if ((i + 1) % BATCH_SIZE === 0 || i === totalRunes - 1) {
                fs.writeFileSync('runes_data_partial.json', JSON.stringify(allRunes, null, 2), 'utf8');
                console.log(`Progresso salvo: ${allRunes.length} runas`);
            }

            await page.mouse.move(0, 0);
            await sleep(BETWEEN_ACTIONS_MS);

        } catch (e) {
            failed.push(runeId ?? i);
            console.log(`Erro não tratado na runa ${i + 1}: ${e.message}`);
        }
    }

    if (failed.length) console.log(`Falha em ${failed.length} runas:`, failed);
    return allRunes;
};

(async () => {
    const headless = process.env.HEADLESS === '1';
    const browser = await firefox.launch({ headless });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    try {
        await page.route(/(googlesyndication|googleadservices|doubleclick|adservice|analytics|facebook|twitter)\.com/i,
            route => route.abort());

        console.log(`Navegando para ${URL}`);
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        for (const sel of ['button:has-text("Accept")', 'button:has-text("I agree")', '[aria-label="dismiss"]']) {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
                await el.click({ timeout: 1500 }).catch(() => {});
            }
        }

        await page.waitForSelector('.wf-tier-list__tiers .ico-holder.ajax-tooltip', { timeout: 30000 });

        const runesData = await extractRuneData(page);
        fs.writeFileSync('runes_data.json', JSON.stringify(runesData, null, 2), 'utf8');
        console.log(`Extração concluída: ${runesData.length} runas salvas em runes_data.json`);
    } catch (err) {
        console.error('Erro fatal:', err);
        process.exitCode = 1;
    } finally {
        await context.close();
        await browser.close();
    }
})();
