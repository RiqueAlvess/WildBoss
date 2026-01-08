// scrape_champ_strict_physical_click.js
// Clica SOMENTE em .show-champ-stats com espera física (hover + hold).
// Abre os stats, espera 3s e então itera níveis e coleta stats/abilities.

const { firefox } = require('playwright');
const fs = require('fs');

const URL = 'https://www.wildriftfire.com/guide/caitlyn';

// ======= TEMPOS E TENTATIVAS =======
const BEFORE_CLICK_BIND_MS = 500;   // espera fixa antes do 1º clique (dar tempo dos handlers/carregamento)
const HOVER_MS = 700;               // tempo “parado” com o mouse sobre o botão antes de clicar
const HOLD_MS = 140;                // quanto tempo manter o botão do mouse pressionado
const BETWEEN_ATTEMPTS_MS = 650;    // pausa entre tentativas de abrir
const OPEN_TIMEOUT_MS = 5500;       // esperar stats aparecer após clicar
const MAX_OPEN_ATTEMPTS = 7;        // quantas tentativas de clique
const WAIT_AFTER_OPEN_MS = 3000;    // aguarda 3s depois que abrir, como pedido
// ===================================

function slugFromUrl(u) {
    try {
        const p = new URL(u).pathname.split('/').filter(Boolean);
        return p[p.length - 1] || 'champion';
    } catch {
        return 'champion';
    }
}

async function isStatsOpen(page) {
    return await page.evaluate(() => {
        const s = document.querySelector('.wf-champion__about__stats');
        if (!s) return false;
        const cs = window.getComputedStyle(s);
        const visible = cs.display !== 'none' && s.clientHeight > 0 && s.offsetParent !== null;
        // Em algumas páginas, #range estando anexado já é um bom sinal
        const hasRange = !!document.querySelector('#range');
        return visible || hasRange;
    });
}

async function physicalClickByClass(page, classSelector = '.show-champ-stats') {
    // Reconsulta o botão a cada tentativa para evitar handle “stale”
    const btn = page.locator(classSelector).first();

    // precisa existir no DOM
    await btn.waitFor({ state: 'attached', timeout: 5000 }).catch(() => { });
    const count = await btn.count();
    if (!count) return false;

    // verifica visibilidade “real” (não basta estar no DOM)
    const visible = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const cs = getComputedStyle(el);
        const notHidden = cs.display !== 'none' && cs.visibility !== 'hidden';
        const inFlow = el.offsetParent !== null || cs.position === 'fixed';
        return notHidden && inFlow && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    }, classSelector);
    if (!visible) return false;

    // rola até o elemento
    try { await btn.scrollIntoViewIfNeeded(); } catch { }

    // bounding box
    const box = await btn.boundingBox().catch(() => null);
    if (!box) return false;

    // move o mouse até o centro, espera, “hold” e solta
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    try {
        await page.mouse.move(cx, cy, { steps: 16 });
        await page.waitForTimeout(HOVER_MS);
        await page.mouse.down();
        await page.waitForTimeout(HOLD_MS);
        await page.mouse.up();
        return true;
    } catch {
        // fallback: tentar um click normal (force) no mesmo seletor
        try {
            await btn.click({ timeout: 1500, force: true });
            return true;
        } catch {
            return false;
        }
    }
}

async function ensureStatsOpenByClass(page) {
    // seção presente?
    await page.locator('.wf-champion__about__stats').waitFor({ state: 'attached', timeout: 15000 }).catch(() => { });
    if (await isStatsOpen(page)) return; // já aberta

    // espera inicial para garantir bind dos handlers
    await page.waitForTimeout(BEFORE_CLICK_BIND_MS);

    for (let attempt = 1; attempt <= MAX_OPEN_ATTEMPTS; attempt++) {
        // Clicar “fisicamente” no botão da classe exigida
        const clicked = await physicalClickByClass(page, '.show-champ-stats');

        // Se o botão sumiu após o clique, pode ser sinal de que abriu
        const btnStillThere = await page.locator('.show-champ-stats').first().count().catch(() => 0);

        // aguarda abrir de fato (#range anexado OU seção visível) — corrida com timeout
        let opened = false;
        try {
            await Promise.race([
                page.waitForSelector('#range', { state: 'attached', timeout: OPEN_TIMEOUT_MS }),
                page.waitForFunction(() => {
                    const s = document.querySelector('.wf-champion__about__stats');
                    if (!s) return false;
                    const cs = getComputedStyle(s);
                    return cs.display !== 'none' && s.clientHeight > 0;
                }, null, { timeout: OPEN_TIMEOUT_MS }),
            ]);
            opened = true;
        } catch {
            opened = false;
        }

        if (opened || (!btnStillThere && await isStatsOpen(page))) {
            return;
        }

        // se não abriu, dá um respiro e tenta de novo
        await page.mouse.move(0, 0);
        await page.waitForTimeout(BETWEEN_ATTEMPTS_MS);
    }

    // fallback hard: força exibição (último recurso)
    if (!(await isStatsOpen(page))) {
        await page.evaluate(() => {
            const s = document.querySelector('.wf-champion__about__stats');
            if (s) s.style.setProperty('display', 'block', 'important');
        });
        // valida o slider
        await page.waitForSelector('#range', { state: 'attached', timeout: 5000 }).catch(() => { });
    }
}

async function setLevel(page, level) {
    await page.evaluate((lvl) => {
        const input = document.querySelector('#range');
        if (!input) return;
        input.value = String(lvl);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, level);

    await page.waitForFunction(
        (lvl) => {
            const el = document.querySelector('#stat-level');
            return el && el.textContent && el.textContent.trim() === String(lvl);
        },
        level,
        { timeout: 7000 }
    );

    await page.waitForTimeout(200); // pequeno debounce para repaints
}

function numberOrString(text) {
    const t = (text ?? '').toString().trim();
    const clean = t.replace(/,/g, '');
    const num = parseFloat(clean);
    return Number.isNaN(num) ? t : num;
}

async function extractStatsForCurrentLevel(page) {
    return await page.evaluate(() => {
        const out = {};
        const blocks = document.querySelectorAll('.statsBlock.champion .statsBlock__block');
        blocks.forEach((b) => {
            const nameEl = b.querySelector('.name');
            const valueEl = b.querySelector('.value');
            if (!nameEl || !valueEl) return;
            const label = nameEl.textContent.replace(/\s+/g, ' ').trim();
            const valText = valueEl.textContent.replace(/\s+/g, ' ').trim();
            out[label] = valText;
        });
        return out;
    });
}

async function extractAbilities(page) {
    return await page.evaluate(() => {
        const abilityBlocks = document.querySelectorAll('.statsBlock.abilities .statsBlock__block');
        const abilities = [];
        abilityBlocks.forEach((block) => {
            const nameWrap = block.querySelector('.upper .info .name');
            let key = null;
            let name = null;
            if (nameWrap) {
                const span = nameWrap.querySelector('span');
                if (span) key = span.textContent.trim();
                const cloned = nameWrap.cloneNode(true);
                const spanInClone = cloned.querySelector('span');
                if (spanInClone) spanInClone.remove();
                name = cloned.textContent.replace(/\s+/g, ' ').trim();
            }
            const cooldownSpans = Array.from(block.querySelectorAll('.upper .info .cooldown span'));
            const costSpans = Array.from(block.querySelectorAll('.upper .info .cost span'));
            const cooldown = cooldownSpans.map((s) => s.textContent.trim());
            const cost = costSpans.map((s) => s.textContent.trim());
            const lower = block.querySelector('.lower');
            const descriptionHtml = lower ? lower.innerHTML.trim() : null;
            const descriptionText = lower ? lower.textContent.replace(/\s+/g, ' ').trim() : null;
            const iconEl = block.querySelector('.upper img');
            const icon = iconEl ? iconEl.getAttribute('src') : null;

            abilities.push({ key, name, cooldown, cost, icon, descriptionHtml, descriptionText });
        });
        return abilities;
    });
}

(async () => {
    const headless = process.env.HEADLESS === '1' || process.env.HEADLESS === 'true';
    const browser = await firefox.launch({ headless });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    // Bloqueia alguns domínios de ads/trackers p/ estabilizar a página
    await page.route(/(googlesyndication|googleadservices|doubleclick|adservice|googletagmanager|google-analytics|adthrive|cpmstar|facebook|twitter)\.com/i,
        route => route.abort());

    try {
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForLoadState('networkidle', { timeout: 60000 });

        // Fecha banners comuns (best-effort)
        for (const sel of ['button:has-text("Accept")', 'button:has-text("I agree")', '[aria-label="dismiss"]']) {
            await page.locator(sel).first().click({ timeout: 1500 }).catch(() => { });
        }

        // Abre stats com clique físico no .show-champ-stats
        await ensureStatsOpenByClass(page);

        // Espera +3s após abrir, como você pediu
        await page.waitForTimeout(WAIT_AFTER_OPEN_MS);

        // Garante o slider
        await page.waitForSelector('#range', { state: 'attached', timeout: 10000 });

        // Captura habilidades (uma vez)
        const abilities = await extractAbilities(page);

        // Itera níveis 1..15
        const statsByLevel = [];
        for (let level = 1; level <= 15; level++) {
            await setLevel(page, level);
            const rawStats = await extractStatsForCurrentLevel(page);
            const stats = Object.fromEntries(Object.entries(rawStats).map(([k, v]) => [k, numberOrString(v)]));
            statsByLevel.push({ level, stats, raw: rawStats });
        }

        const result = {
            champion: slugFromUrl(URL),
            source: URL,
            scrapedAt: new Date().toISOString(),
            statsByLevel,
            abilities,
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
