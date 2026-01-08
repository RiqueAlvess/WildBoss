// scrape_runes.js
// Node.js + Playwright (Firefox) — extrai dados de runas em https://www.wildriftfire.com/rune-list
// Saídas: runes_data.json (+ salvamento parcial runes_data_partial.json)

const { firefox } = require('playwright');
const fs = require('fs');

// ======= AJUSTES DE TEMPO =======
const HOVER_STABILIZE_MS = 800;            // tempo após hover antes de procurar o tooltip
const TOOLTIP_VISIBLE_TIMEOUT_MS = 3000;   // tempo máx. para #tooltip ficar visível
const CONTENT_READY_TIMEOUT_MS = 3000;     // tempo máx. para conteúdo (nome) aparecer
const BETWEEN_ACTIONS_MS = 250;            // pausas curtas entre ações
const RETRY_SLEEP_MS = 700;                // tempo após falha antes de tentar de novo
const DEFAULT_SLEEP_MS = 300;              // sleep base dentro do loop
const RETRIES = 5;                         // tentativas por runa
const BATCH_SIZE = 10;                     // salvar parcial a cada X itens
// =================================

const URL = 'https://www.wildriftfire.com/rune-list';

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

async function extractRuneData(page) {
    const runeLocator = page.locator('.wf-tier-list__tiers .ico-holder.ajax-tooltip');
    const totalRunes = await runeLocator.count();
    console.log(`Found ${totalRunes} runes to process`);

    const allRunesData = [];
    const failedRunes = [];

    for (let i = 0; i < totalRunes; i++) {
        const rune = runeLocator.nth(i);
        let runeId = null;

        try {
            const runeData = {};

            // Basico da classe (há um JSON-like dentro da class)
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
            for (let attempt = 0; attempt < RETRIES; attempt++) {
                try {
                    await rune.scrollIntoViewIfNeeded();
                    await sleep(DEFAULT_SLEEP_MS);
                    await rune.hover();
                    await sleep(HOVER_STABILIZE_MS);

                    // Espera tooltip ficar visível
                    await page.waitForSelector('#tooltip:not([style*="display: none"])', {
                        timeout: TOOLTIP_VISIBLE_TIMEOUT_MS,
                    });

                    // Espera conteúdo (nome) estar pronto
                    await page.waitForFunction(() => {
                        const t = document.querySelector('#tooltip');
                        if (!t || t.style.display === 'none') return false;
                        const nameEl = t.querySelector('.tt__info__title span');
                        return !!(nameEl && nameEl.textContent && nameEl.textContent.trim().length > 0);
                    }, null, { timeout: CONTENT_READY_TIMEOUTMS = CONTENT_READY_TIMEOUT_MS });

                    const tooltip = await page.$('#tooltip');
                    if (tooltip) {
                        // Imagem
                        const imgElement = await tooltip.$('.tt__image img');
                        if (imgElement) {
                            runeData.image = await imgElement.getAttribute('src');
                        }

                        // Nome
                        const nameElement = await tooltip.$('.tt__info__title span');
                        if (nameElement) {
                            runeData.name = (await nameElement.textContent() || '').trim();
                        }

                        // Descrição/efeitos (para runas)
                        const uniquesEl = await tooltip.$('.tt__info__uniques span');
                        if (uniquesEl) {
                            runeData.description = (await uniquesEl.innerHTML() || '').trim();
                        }

                        // Tipo
                        const ttElement = await tooltip.$('.tt');
                        if (ttElement) {
                            const ttClass = await ttElement.getAttribute('class');
                            runeData.type = (ttClass && ttClass.includes('tt--rune')) ? 'rune' : 'unknown';
                        }

                        success = true;
                        break;
                    }
                } catch (e) {
                    const msg = e && e.message ? e.message : String(e);
                    console.log(`Attempt ${attempt + 1}/${RETRIES}: issue on rune ${i + 1} — ${msg}`);
                }

                // Move mouse para longe e tenta de novo
                await page.mouse.move(0, 0);
                await sleep(RETRY_SLEEP_MS);
            }

            if (success && runeData.name) {
                allRunesData.push(runeData);
                console.log(`Processed rune ${i + 1}/${totalRunes}: ${runeData.name}`);
            } else {
                failedRunes.push(runeId ?? i);
                console.log(`Failed to process rune ${i + 1}/${totalRunes}`);
            }

            // Salvamento parcial
            if ((i + 1) % BATCH_SIZE === 0 || i === totalRunes - 1) {
                fs.writeFileSync('runes_data_partial.json', JSON.stringify(allRunesData, null, 2), 'utf8');
                console.log(`Progress saved: ${allRunesData.length} runes`);
            }

            await page.mouse.move(0, 0);
            await sleep(BETWEEN_ACTIONS_MS);

        } catch (e) {
            failedRunes.push(runeId ?? i);
            console.log(`Unhandled error processing rune ${i + 1}: ${e && e.message ? e.message : String(e)}`);
        }
    }

    if (failedRunes.length) {
        console.log(`Failed to process ${failedRunes.length} runes:`, failedRunes);
    }

    return allRunesData;
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

        // Fecha banners genéricos (best-effort)
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

        const runesData = await extractRuneData(page);

        fs.writeFileSync('runes_data.json', JSON.stringify(runesData, null, 2), 'utf8');
        console.log(`Successfully extracted data for ${runesData.length} runes`);
    } catch (err) {
        console.error('Fatal error:', err);
        process.exitCode = 1;
    } finally {
        await context.close();
        await browser.close();
    }
})();
