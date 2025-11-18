const axios = require('axios');
const fs = require('fs');
const path = require('path');

const api = axios.create({
    baseURL: 'https://api.igamesbr.com',
    headers: {
        'User-Agent': 'okhttp/4.10.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json'
    },
    timeout: 20000
});

async function downloadData() {
    console.log("🚀 Iniciando download dos dados...");

    try {
        // 1. Baixar Categorias
        console.log("📦 Baixando categorias...");
        const catRes = await api.get('/categories/list');
        fs.writeFileSync(
            path.join(__dirname, '../data/categories.json'), 
            JSON.stringify(catRes.data, null, 2)
        );
        console.log(`✅ ${catRes.data.length} categorias salvas.`);

        // 2. Baixar Jogos
        console.log("🎮 Baixando lista de jogos...");
        const gameRes = await api.post('/games/list', {});
        fs.writeFileSync(
            path.join(__dirname, '../data/games.json'), 
            JSON.stringify(gameRes.data, null, 2)
        );
        console.log(`✅ ${gameRes.data.length} jogos salvos.`);

        console.log("\n🎉 Sucesso! Agora faça o 'git push' para enviar os dados.");

    } catch (error) {
        console.error("❌ Erro ao baixar dados:", error.message);
    }
}

downloadData();
