const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function getRawJson() {
    const filePath = path.join(__dirname, 'rank_data_raw.json');
    
    // URL exata com parâmetros padrão para trazer a lista completa
    const url = "https://mlol.qt.qq.com/go/lgame_battle_info/hero_rank_list_v2?area=0&position=0&channel=0";

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://lolm.qq.com/'
    };

    try {
        console.log("Solicitando JSON...");
        const response = await axios.get(url, { headers });

        // Salva o JSON bruto
        fs.writeFileSync(filePath, JSON.stringify(response.data, null, 4), 'utf-8');
        
        console.log("✅ Sucesso! Arquivo salvo como: rank_data_raw.json");
        console.log("Verifique os dados no arquivo gerado.");
    } catch (error) {
        console.error("❌ Erro na requisição:", error.message);
    }
}

getRawJson();