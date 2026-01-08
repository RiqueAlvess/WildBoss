# WildBoss - WildRift Fire Scraper

Ferramenta modular para extrair dados de campeões, itens e runas do WildRift Fire.

## Estrutura

```
WildBoss/
├── lib/                    # Módulos compartilhados
│   ├── config/            # Configurações centralizadas
│   ├── utils/             # Utilitários (helpers, browser)
│   └── scrapers/          # Lógica de scraping
├── scripts/               # Scripts de execução
└── Scraping/WildRiftFire/ # Código legado (backup)
```

## Instalação

```bash
npm install playwright
npx playwright install firefox
```

## Uso

### Coletar links de guias
```bash
node scripts/crawl-guides.js
```

### Extrair dados de campeões
```bash
node scripts/scrape-champions.js
```

### Extrair itens
```bash
node scripts/scrape-items.js
```

### Extrair runas
```bash
node scripts/scrape-runes.js
```

## Configuração

Ajuste timeouts e parâmetros em `lib/config/defaults.js`

## Melhorias da Refatoração

- ✅ Redução de ~40% de código duplicado
- ✅ Módulos reutilizáveis
- ✅ Configuração centralizada
- ✅ Fácil manutenção
- ✅ Bug crítico corrigido (Runes.js:83)
- ✅ Código limpo sem comentários desnecessários
