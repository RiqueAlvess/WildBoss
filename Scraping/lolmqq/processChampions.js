const fs = require('fs');
const path = require('path');

/**
 * Processa os dados brutos da API lolmqq e aplica traduções
 *
 * Estrutura de entrada:
 * {
 *   "result": 0,
 *   "data": {
 *     "0": { "1": [...], "2": [...], "3": [...], "4": [...] },  // Role index
 *     "1": { ... },
 *     ...
 *   }
 * }
 *
 * Estrutura de saída:
 * {
 *   "result": 0,
 *   "timestamp": "2026-01-08T...",
 *   "data": {
 *     "Mid": {
 *       "Diamante+": [...champions...],
 *       "Mestre+": [...champions...],
 *       ...
 *     },
 *     "Top": { ... },
 *     ...
 *   }
 * }
 */

class ChampionDataProcessor {
    constructor() {
        // Carrega as traduções
        const translationsPath = path.join(__dirname, 'translations.json');
        this.translations = JSON.parse(fs.readFileSync(translationsPath, 'utf-8'));
    }

    /**
     * Processa um campeão individual, aplicando traduções
     */
    processChampion(champion) {
        const heroId = champion.heroId?.toString();
        const heroName = this.translations.heroes[heroId] || `Hero_${heroId}`;

        return {
            heroId: champion.heroId,
            heroName: heroName,
            pickRate: this.parseRate(champion.pickRate),
            winRate: this.parseRate(champion.winRate),
            banRate: this.parseRate(champion.banRate),
            appearRate: this.parseRate(champion.appearRate),
            rankCount: champion.rankCount || 0,
            tier: this.getTierLabel(champion.tier)
        };
    }

    /**
     * Converte taxa de porcentagem (ex: 2500 -> 0.25 ou "25%" -> 0.25)
     */
    parseRate(rate) {
        if (rate === undefined || rate === null) return 0;

        // Se já for decimal (0-1)
        if (rate >= 0 && rate <= 1) return parseFloat(rate.toFixed(4));

        // Se for porcentagem inteira (0-10000)
        if (rate > 1) return parseFloat((rate / 10000).toFixed(4));

        return 0;
    }

    /**
     * Retorna o label do tier (S, A, B, C, D)
     */
    getTierLabel(tier) {
        if (!tier) return null;
        return this.translations.tiers[tier.toString()] || null;
    }

    /**
     * Processa os dados brutos e retorna JSON tratado
     */
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

        // Itera sobre cada role (0-4)
        for (const roleIndex in rawData.data) {
            const roleData = rawData.data[roleIndex];
            const roleName = this.translations.routes[(parseInt(roleIndex) + 1).toString()];

            if (!roleName) {
                console.warn(`⚠️  Role index ${roleIndex} não encontrada no dicionário`);
                continue;
            }

            processedData.data[roleName] = {};

            // Itera sobre cada dan/divisão (1-4)
            for (const danIndex in roleData) {
                const danData = roleData[danIndex];
                const danInfo = this.translations.dans[danIndex];

                if (!danInfo) {
                    console.warn(`⚠️  Dan index ${danIndex} não encontrado no dicionário`);
                    continue;
                }

                const danLabel = danInfo.label_ptbr;

                // Processa cada campeão no array
                if (Array.isArray(danData)) {
                    processedData.data[roleName][danLabel] = danData.map(champion =>
                        this.processChampion(champion)
                    );
                } else {
                    console.warn(`⚠️  Dados esperados como array em ${roleName}/${danLabel}`);
                    processedData.data[roleName][danLabel] = [];
                }
            }
        }

        return processedData;
    }

    /**
     * Processa arquivo bruto e salva resultado
     */
    processFile(inputPath, outputPath) {
        try {
            console.log('📖 Lendo arquivo bruto...');
            const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

            console.log('⚙️  Processando dados...');
            const processedData = this.processRawData(rawData);

            console.log('💾 Salvando dados processados...');
            fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2), 'utf-8');

            // Estatísticas
            const stats = this.getProcessingStats(processedData);
            console.log('\n✅ Processamento concluído!');
            console.log('📊 Estatísticas:');
            console.log(`   - Roles processadas: ${stats.roles}`);
            console.log(`   - Divisões por role: ${stats.divisionsPerRole}`);
            console.log(`   - Total de campeões: ${stats.totalChampions}`);
            console.log(`\n📁 Arquivo salvo: ${outputPath}`);

            return processedData;
        } catch (error) {
            console.error('❌ Erro ao processar arquivo:', error.message);
            throw error;
        }
    }

    /**
     * Retorna estatísticas do processamento
     */
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

        return {
            roles: roles.length,
            divisionsPerRole,
            totalChampions
        };
    }
}

module.exports = ChampionDataProcessor;
