# LOL MQQ - Processador de Dados de Campeões

Sistema para capturar e processar dados de campeões do League of Legends da API lolmqq (China) com tradução automática para PT-BR.

## Estrutura do Projeto

```
lolmqq/
├── Run.js                          # Script principal
├── processChampions.js             # Processador de dados
├── translations.json               # Dicionário de traduções PT-BR
├── rank_data_raw.json             # JSON bruto da API (gerado)
└── rank_data_processed.json       # JSON processado e traduzido (gerado)
```

## Como Usar

### 1. Executar o script principal

```bash
cd Scraping/lolmqq
node Run.js
```

Este comando irá:
1. Baixar os dados da API lolmqq
2. Salvar o JSON bruto em `rank_data_raw.json`
3. Processar e traduzir os dados automaticamente
4. Salvar o resultado em `rank_data_processed.json`

### 2. Usar apenas o processador

Se você já tem um arquivo JSON bruto, pode processar diretamente:

```javascript
const ChampionDataProcessor = require('./processChampions');

const processor = new ChampionDataProcessor();
processor.processFile('rank_data_raw.json', 'rank_data_processed.json');
```

## Estrutura dos Dados

### Dados de Entrada (API lolmqq)

```json
{
    "result": 0,
    "data": {
        "0": {              // Role index (0-4)
            "1": [...],     // Dan 1 (Diamante+)
            "2": [...],     // Dan 2 (Mestre+)
            "3": [...],     // Dan 3 (Desafiante)
            "4": [...]      // Dan 4 (Topo do Servidor)
        }
    }
}
```

### Dados de Saída (Processados)

```json
{
    "result": 0,
    "timestamp": "2026-01-08T...",
    "meta": {
        "source": "lolmqq (China)",
        "language": "pt-BR"
    },
    "data": {
        "Mid": {
            "Diamante+": [
                {
                    "heroId": 10001,
                    "heroName": "Garen",
                    "pickRate": 0.25,
                    "winRate": 0.52,
                    "banRate": 0.03,
                    "appearRate": 0.27,
                    "rankCount": 15000,
                    "tier": "S"
                }
            ],
            "Mestre+": [...],
            "Desafiante": [...],
            "Topo do Servidor": [...]
        },
        "Top": {...},
        "Bot": {...},
        "Support": {...},
        "Jungle": {...}
    }
}
```

## Traduções Aplicadas

### Roles (Rotas)
- `1` → Mid
- `2` → Top
- `3` → Bot
- `4` → Support
- `5` → Jungle

### Dans (Divisões Ranqueadas)
- `1` → Diamante+
- `2` → Mestre+
- `3` → Desafiante
- `4` → Topo do Servidor

### Tiers
- `1` → S
- `2` → A
- `3` → B
- `4` → C
- `5` → D

### Heroes (Campeões)
Mais de 100 campeões traduzidos (ver `translations.json`)

## Métricas

Todas as taxas são convertidas para valores decimais (0-1):
- `pickRate`: Taxa de escolha do campeão
- `winRate`: Taxa de vitória
- `banRate`: Taxa de banimento
- `appearRate`: Taxa de aparição

Exemplo: `2500` → `0.25` (25%)

## Estatísticas

Ao processar, o sistema exibe:
- Número de roles processadas
- Divisões por role
- Total de campeões

## Notas

- A API pode retornar erro 503 temporariamente
- Os dados são atualizados regularmente pela fonte
- Arquivos de exemplo estão disponíveis para testes
