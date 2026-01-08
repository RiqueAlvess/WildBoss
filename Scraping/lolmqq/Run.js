const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ChampionDataProcessor = require('./processChampions');

async function getRawJson() {
    const rawFilePath = path.join(__dirname, 'rank_data_raw.json');
    const processedFilePath = path.join(__dirname, 'rank_data_processed.json');

    // URL exata com parâmetros padrão para trazer a lista completa
    const url = "https://mlol.qt.qq.com/go/lgame_battle_info/hero_rank_list_v2?area=0&position=0&channel=0";

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://lolm.qq.com/'
    };

    try {
        console.log("🌐 Solicitando dados da API lolmqq...");
        const response = await axios.get(url, { headers });

        // Salva o JSON bruto
        console.log("💾 Salvando JSON bruto...");
        fs.writeFileSync(rawFilePath, JSON.stringify(response.data, null, 4), 'utf-8');
        console.log("✅ JSON bruto salvo: rank_data_raw.json");

        // Processa os dados
        console.log("\n⚙️  Iniciando processamento dos dados...");
        const processor = new ChampionDataProcessor();
        const processedData = processor.processFile(rawFilePath, processedFilePath);

        console.log("\n🎉 Processo completo!");
        console.log("📁 Arquivos gerados:");
        console.log("   - rank_data_raw.json (dados brutos)");
        console.log("   - rank_data_processed.json (dados processados e traduzidos)");

        return processedData;
    } catch (error) {
        console.error("❌ Erro:", error.message);
        throw error;
    }
}

// Executa se for chamado diretamente
if (require.main === module) {
    getRawJson();
}

module.exports = { getRawJson };