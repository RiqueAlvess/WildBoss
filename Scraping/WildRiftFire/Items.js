const { firefox } = require('playwright');
const fs = require('fs');

const URL = 'https://www.wildriftfire.com/item-list';
const HOVER_MS = 900;
const TOOLTIP_TIMEOUT_MS = 3500;
const BETWEEN_ACTIONS_MS = 300;
const RETRY_SLEEP_MS = 800;
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

const extractItemData = async (page) => {
    const itemLocator = page.locator('.wf-tier-list__tiers .ico-holder.ajax-tooltip');
    const totalItems = await itemLocator.count();
    console.log(`Encontrados ${totalItems} itens para processar`);

    const allItems = [];
    const failed = [];

    for (let i = 0; i < totalItems; i++) {
        const item = itemLocator.nth(i);
        let itemId = null;

        try {
            const itemData = {};
            const className = await item.getAttribute('class');
            const tooltipData = parseJsonFromClass(className || '');

            if (tooltipData) {
                itemData.id = tooltipData.i;
                itemId = tooltipData.i;
                itemData.code = tooltipData.t;
            }

            itemData.sort = await item.getAttribute('data-sort');
            itemData.data_id = await item.getAttribute('data-id');

            let success = false;
            for (let attempt = 0; attempt < RETRIES && !success; attempt++) {
                try {
                    await item.scrollIntoViewIfNeeded();
                    await sleep(300);
                    await item.hover();
                    await sleep(HOVER_MS);

                    await page.waitForSelector('#tooltip:not([style*="display: none"])', { timeout: TOOLTIP_TIMEOUT_MS });

                    await page.waitForFunction(() => {
                        const t = document.querySelector('#tooltip');
                        if (!t || t.style.display === 'none') return false;
                        const name = t.querySelector('.tt__info__title span');
                        const content = t.querySelector('.tt__info__stats span, .tt__info__uniques span');
                        return name?.textContent?.trim() && content;
                    }, null, { timeout: TOOLTIP_TIMEOUT_MS });

                    const tooltip = await page.$('#tooltip');
                    if (tooltip) {
                        itemData.image = await tooltip.$eval('.tt__image img', el => el.getAttribute('src')).catch(() => null);
                        itemData.name = await tooltip.$eval('.tt__info__title span', el => el.textContent.trim()).catch(() => null);

                        const costText = await tooltip.$eval('.tt__info__cost span', el => el.textContent.trim()).catch(() => null);
                        if (costText) {
                            const num = parseInt(costText.replace(/[^\d]/g, ''), 10);
                            itemData.cost = Number.isNaN(num) ? costText : num;
                        }

                        const statsElements = await tooltip.$$('.tt__info__stats span');
                        itemData.stats = await Promise.all(statsElements.map(el => el.textContent()));
                        itemData.stats = itemData.stats.map(s => s.trim()).filter(Boolean);

                        itemData.uniques = await tooltip.$eval('.tt__info__uniques span', el => el.innerHTML.trim()).catch(() => null);

                        success = true;
                    }
                } catch (e) {
                    console.log(`Tentativa ${attempt + 1}/${RETRIES} falhou para item ${i + 1}: ${e.message}`);
                }

                if (!success) {
                    await page.mouse.move(0, 0);
                    await sleep(RETRY_SLEEP_MS);
                }
            }

            if (success && itemData.name) {
                allItems.push(itemData);
                console.log(`Processado item ${i + 1}/${totalItems}: ${itemData.name}`);
            } else {
                failed.push(itemId ?? i);
                console.log(`Falha ao processar item ${i + 1}/${totalItems}`);
            }

            if ((i + 1) % BATCH_SIZE === 0 || i === totalItems - 1) {
                fs.writeFileSync('items_data_partial.json', JSON.stringify(allItems, null, 2), 'utf8');
                console.log(`Progresso salvo: ${allItems.length} itens`);
            }

            await page.mouse.move(0, 0);
            await sleep(BETWEEN_ACTIONS_MS);

        } catch (e) {
            failed.push(itemId ?? i);
            console.log(`Erro não tratado no item ${i + 1}: ${e.message}`);
        }
    }

    if (failed.length) console.log(`Falha em ${failed.length} itens:`, failed);
    return allItems;
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

        const itemsData = await extractItemData(page);
        fs.writeFileSync('items_data.json', JSON.stringify(itemsData, null, 2), 'utf8');
        console.log(`Extração concluída: ${itemsData.length} itens salvos em items_data.json`);
    } catch (err) {
        console.error('Erro fatal:', err);
        process.exitCode = 1;
    } finally {
        await context.close();
        await browser.close();
    }
})();
