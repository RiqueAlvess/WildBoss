const fs = require('fs');
const path = require('path');
const { firefox } = require('playwright');

const START_URL = 'https://www.wildriftfire.com/';
const DOMAIN = new URL(START_URL).origin;
const MAX_DEPTH = 2;
const MAX_PAGES = 200;
const NAV_TIMEOUT = 30000;
const BETWEEN_VISITS_MS = 350;

const toAbsolute = (href, base) => {
    try {
        const abs = new URL(href, base).toString();
        return abs.startsWith(DOMAIN) ? abs.split('#')[0] : null;
    } catch { return null; }
};

const extractLinks = async (page) => {
    return page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')).filter(Boolean));
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const autoScroll = async (page) => {
    await page.evaluate(async () => {
        await new Promise(resolve => {
            let y = 0;
            const step = () => {
                y += Math.floor(window.innerHeight * 0.8);
                window.scrollTo(0, y);
                if (y < document.body.scrollHeight) {
                    setTimeout(step, 120);
                } else {
                    setTimeout(resolve, 200);
                }
            };
            step();
        });
    });
};

(async () => {
    const browser = await firefox.launch({ headless: true });
    const ctx = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);

    const queue = [{ url: START_URL, depth: 0 }];
    const visited = new Set();
    const discovered = new Set();
    const guideLinks = new Set();

    let pagesVisited = 0;

    while (queue.length && pagesVisited < MAX_PAGES) {
        const { url, depth } = queue.shift();
        if (visited.has(url)) continue;
        visited.add(url);

        try {
            await page.goto(url, { waitUntil: 'networkidle' });
            pagesVisited++;

            await autoScroll(page).catch(() => {});

            const hrefs = await extractLinks(page) || [];
            for (const href of hrefs) {
                const abs = toAbsolute(href, url);
                if (!abs) continue;

                if (abs.includes('/guide/')) guideLinks.add(abs);

                if (depth < MAX_DEPTH && !discovered.has(abs)) {
                    const isStatic = abs.match(/\.(png|jpe?g|webp|gif|svg|ico|css|js|json|xml|mp4|webm)$/i);
                    if (!isStatic) {
                        discovered.add(abs);
                        queue.push({ url: abs, depth: depth + 1 });
                    }
                }
            }

            await sleep(BETWEEN_VISITS_MS);
        } catch (err) {
            console.error(`[ERRO] ${url}: ${err.message}`);
        }
    }

    const outTxt = path.resolve(process.cwd(), 'guides.txt');
    const outJson = path.resolve(process.cwd(), 'guides.json');
    const sorted = Array.from(guideLinks).sort();

    fs.writeFileSync(outTxt, sorted.join('\n') + '\n', 'utf8');
    fs.writeFileSync(outJson, JSON.stringify(sorted, null, 2), 'utf8');

    console.log(`Visitadas ${pagesVisited} páginas.`);
    console.log(`Encontrados ${sorted.length} links com "/guide/".`);
    console.log(`Arquivos salvos:\n- ${outTxt}\n- ${outJson}`);

    await browser.close();
})();
