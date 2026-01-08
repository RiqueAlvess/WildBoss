const fs = require('fs');
const path = require('path');

class ChampionDataProcessor {
    constructor() {
        const translationsPath = path.join(__dirname, 'translations.json');
        this.translations = JSON.parse(fs.readFileSync(translationsPath, 'utf-8'));
    }

    /**
     * Processa um campeão individual, suportando snake_case da API e camelCase
     */
    processChampion(champion) {
        // A API usa hero_id. Tentamos ambos para garantir compatibilidade.
        const rawId = champion.hero_id || champion.heroId;
        const heroId = rawId?.toString();
        const heroName = this.translations.heroes[heroId] || `Hero_${heroId}`;

        return {
            heroId: rawId ? parseInt(rawId) : null,
            heroName: heroName,
            // Mapeamento das taxas suportando o padrão snake_case da API
            pickRate: this.parseRate(champion.pick_rate || champion.pickRate),
            winRate: this.parseRate(champion.win_rate || champion.winRate),
            banRate: this.parseRate(champion.forbid_rate || champion.ban_rate || champion.banRate),
            appearRate: this.parseRate(champion.appear_rate || champion.appearRate),
            rankCount: champion.rank_count || champion.rankCount || 0,
            tier: this.getTierLabel(champion.t_level || champion.tier)
        };
    }

    /**
     * Converte taxa de porcentagem (ex: 2500 -> 0.25)
     */
    parseRate(rate) {
        if (rate === undefined || rate === null) return 0;
        
        const numRate = parseFloat(rate);
        if (isNaN(numRate)) return 0;

        // Se for um valor inteiro grande (ex: 5000 para 50%), divide por 10000
        if (numRate > 1) return parseFloat((numRate / 10000).toFixed(4));
        
        return parseFloat(numRate.toFixed(4));
    }

    getTierLabel(tier) {
        if (!tier) return null;
        return this.translations.tiers[tier.toString()] || null;
    }

    processRawData(rawData) {
        if (!rawData || rawData.result !== 0) {
            throw new Error('Dados inválidos ou erro na resposta da API');
        }

        const processedData = {
            result: 0,
            timestamp: new Date().toISOString(),
            meta: {
                source: this.translations.meta.source,
                language: this.translations.meta.language
            },
            data: {}
        };

        for (const roleIndex in rawData.data) {
            const roleData = rawData.data[roleIndex];
            // As chaves no JSON de tradução para rotas são "1" a "5"
            const routeKey = (parseInt(roleIndex) + 1).toString();
            const roleName = this.translations.routes[routeKey];

            if (!roleName) {
                continue;
            }

            processedData.data[roleName] = {};

            for (const danIndex in roleData) {
                const danData = roleData[danIndex];
                const danInfo = this.translations.dans[danIndex];

                if (!danInfo) continue;

                const danLabel = danInfo.label_ptbr;

                if (Array.isArray(danData)) {
                    processedData.data[roleName][danLabel] = danData.map(champion =>
                        this.processChampion(champion)
                    );
                } else {
                    processedData.data[roleName][danLabel] = [];
                }
            }
        }

        return processedData;
    }

    processFile(inputPath, outputPath) {
        try {
            console.log('📖 Lendo arquivo bruto...');
            const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

            console.log('⚙️  Processando dados...');
            const processedData = this.processRawData(rawData);

            console.log('💾 Salvando dados processados...');
            fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2), 'utf-8');

            const stats = this.getProcessingStats(processedData);
            console.log('\n✅ Processamento concluído!');
            console.log(`📊 Total de campeões: ${stats.totalChampions}`);

            return processedData;
        } catch (error) {
            console.error('❌ Erro ao processar arquivo:', error.message);
            throw error;
        }
    }

    getProcessingStats(processedData) {
        const roles = Object.keys(processedData.data);
        let totalChampions = 0;
        let divisionsPerRole = 0;

        if (roles.length > 0) {
            const firstRole = processedData.data[roles[0]];
            divisionsPerRole = Object.keys(firstRole).length;

            for (const role of roles) {
                for (const division in processedData.data[role]) {
                    totalChampions += processedData.data[role][division].length;
                }
            }
        }

        return { roles: roles.length, divisionsPerRole, totalChampions };
    }
}

module.exports = ChampionDataProcessor;