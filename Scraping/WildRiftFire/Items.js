// scrape_items.js
// Node.js + Playwright (Firefox) — extrai dados de itens em https://www.wildriftfire.com/item-list
// Saídas: items_data.json (+ salvamento parcial items_data_partial.json)

const { firefox } = require('playwright');
const fs = require('fs');

// ======= AJUSTES DE TEMPO =======
const HOVER_STABILIZE_MS = 900;            // um pouco mais que o de runas
const TOOLTIP_VISIBLE_TIMEOUT_MS = 3500;   // itens às vezes demoram mais
const CONTENT_READY_TIMEOUT_MS = 3500;     // espera por nome + algum conteúdo
const BETWEEN_ACTIONS_MS = 300;
const RETRY_SLEEP_MS = 800;
const DEFAULT_SLEEP_MS = 300;
const RETRIES = 5;
const BATCH_SIZE = 10;
// =================================

const URL = 'https://www.wildriftfire.com/item-list';

function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

function parseJsonFromClass(className) {
    if (!className) return null;
    const m = className.match(/\{.*?\}/);
    if (!m) return null;
    let s = m[0].replace(/'/g, '"');
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

async function extractItemData(page) {
    const itemLocator = page.locator('.wf-tier-list__tiers .ico-holder.ajax-tooltip');
    const totalItems = await itemLocator.count();
    console.log(`Found ${totalItems} items to process`);

    const allItemsData = [];
    const failedItems = [];

    for (let i = 0; i < totalItems; i++) {
        const item = itemLocator.nth(i);
        let itemId = null;

        try {
            const itemData = {};

            // Info básica via classe
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
            for (let attempt = 0; attempt < RETRIES; attempt++) {
                try {
                    await item.scrollIntoViewIfNeeded();
                    await sleep(DEFAULT_SLEEP_MS);
                    await item.hover();
                    await sleep(HOVER_STABILIZE_MS);

                    // Tooltip visível
                    await page.waitForSelector('#tooltip:not([style*="display: none"])', {
                        timeout: TOOLTIP_VISIBLE_TIMEOUT_MS,
                    });

                    // Conteúdo pronto — nome + (stats OU uniques) disponíveis
                    await page.waitForFunction(() => {
                        const t = document.querySelector('#tooltip');
                        if (!t || t.style.display === 'none') return false;
                        const nameEl = t.querySelector('.tt__info__title span');
                        const anyContent = t.querySelector('.tt__info__stats span, .tt__info__uniques span');
                        return !!(nameEl && nameEl.textContent && nameEl.textContent.trim().length > 0 && anyContent);
                    }, null, { timeout: CONTENT_READY_TIMEOUT_MS });

                    const tooltip = await page.$('#tooltip');
                    if (tooltip) {
                        // Imagem
                        const imgElement = await tooltip.$('.tt__image img');
                        if (imgElement) {
                            itemData.image = await imgElement.getAttribute('src');
                        }

                        // Nome
                        const nameElement = await tooltip.$('.tt__info__title span');
                        if (nameElement) {
                            itemData.name = (await nameElement.textContent() || '').trim();
                        }

                        // Custo
                        const costElement = await tooltip.$('.tt__info__cost span');
                        if (costElement) {
                            const costText = (await costElement.textContent() || '').trim();
                            const numeric = parseInt(costText.replace(/[^\d]/g, ''), 10);
                            itemData.cost = Number.isNaN(numeric) ? costText : numeric;
                        }

                        // Stats
                        const statsElements = await tooltip.$$('.tt__info__stats span');
                        itemData.stats = [];
                        for (const el of statsElements) {
                            const txt = (await el.textContent() || '').trim();
                            if (txt) itemData.stats.push(txt);
                        }

                        // Uniques (HTML do span)
                        const uniquesElement = await tooltip.$('.tt__info__uniques span');
                        if (uniquesElement) {
                            itemData.uniques = (await uniquesElement.innerHTML() || '').trim();
                        }

                        success = true;
                        break;
                    }
                } catch (e) {
                    const msg = e && e.message ? e.message : String(e);
                    console.log(`Attempt ${attempt + 1}/${RETRIES}: issue on item ${i + 1} — ${msg}`);
                }

                // Mouse longe e re-tenta
                await page.mouse.move(0, 0);
                await sleep(RETRY_SLEEP_MS);
            }

            if (success && itemData.name) {
                allItemsData.push(itemData);
                console.log(`Processed item ${i + 1}/${totalItems}: ${itemData.name}`);
            } else {
                failedItems.push(itemId ?? i);
                console.log(`Failed to process item ${i + 1}/${totalItems}`);
            }

            // Salvamento parcial
            if ((i + 1) % BATCH_SIZE === 0 || i === totalItems - 1) {
                fs.writeFileSync('items_data_partial.json', JSON.stringify(allItemsData, null, 2), 'utf8');
                console.log(`Progress saved: ${allItemsData.length} items`);
            }

            await page.mouse.move(0, 0);
            await sleep(BETWEEN_ACTIONS_MS);

        } catch (e) {
            failedItems.push(itemId ?? i);
            console.log(`Unhandled error processing item ${i + 1}: ${e && e.message ? e.message : String(e)}`);
        }
    }

    if (failedItems.length) {
        console.log(`Failed to process ${failedItems.length} items:`, failedItems);
    }

    return allItemsData;
}

(async () => {
    const headless = process.env.HEADLESS === '1' || process.env.HEADLESS === 'true';
    const browser = await firefox.launch({ headless });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    try {
        // Bloqueia ads/trackers
        const blockRe = /(googlesyndication|googleadservices|doubleclick|adservice|analytics|facebook|twitter)\.com/i;
        await page.route('**/*', (route) => {
            const url = route.request().url();
            if (blockRe.test(url)) return route.abort();
            return route.continue();
        });

        console.log(`Navigating to ${URL}`);
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Fecha banners genéricos
        const tryClick = async (sel) => {
            try {
                const el = page.locator(sel).first();
                if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
                    await el.click({ timeout: 1500 });
                }
            } catch { }
        };
        await tryClick('button:has-text("Accept")');
        await tryClick('button:has-text("I agree")');
        await tryClick('[aria-label="dismiss"]');

        await page.waitForSelector('.wf-tier-list__tiers .ico-holder.ajax-tooltip', { timeout: 30000 });

        const itemsData = await extractItemData(page);

        fs.writeFileSync('items_data.json', JSON.stringify(itemsData, null, 2), 'utf8');
        console.log(`Successfully extracted data for ${itemsData.length} items`);
    } catch (err) {
        console.error('Fatal error:', err);
        process.exitCode = 1;
    } finally {
        await context.close();
        await browser.close();
    }
})();
