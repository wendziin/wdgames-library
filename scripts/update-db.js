const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- CONFIGURAÇÕES ---
const CONCURRENCY_LIMIT = 15; // Aumentei um pouco para ser mais rápido
const BATCH_DELAY = 200;      // Delay menor

const api = axios.create({
    baseURL: 'https://api.igamesbr.com',
    headers: {
        'User-Agent': 'okhttp/4.10.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    },
    timeout: 30000
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function downloadData() {
    console.time("Tempo Total");
    console.log("🚀 Iniciando Atualização Completa (Jogos + Detalhes)...");

    // Garante que as pastas existem
    const dirs = ['data', 'data/categories', 'data/details'];
    dirs.forEach(dir => {
        const fullPath = path.join(__dirname, '../', dir);
        if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    });

    try {
        // 1. Baixar Categorias
        console.log("📦 [1/3] Atualizando categorias...");
        const catRes = await api.get('/categories/list');
        fs.writeFileSync(path.join(__dirname, '../data/categories.json'), JSON.stringify(catRes.data));

        // 2. Baixar Lista Geral
        console.log("🎮 [2/3] Atualizando lista mestre de jogos...");
        const allGamesRes = await api.post('/games/list', {});
        const allGames = allGamesRes.data;
        fs.writeFileSync(path.join(__dirname, '../data/games.json'), JSON.stringify(allGames));
        
        // Atualiza listas por categoria também
        for (const cat of catRes.data) {
            try {
                const res = await api.post('/games-cat/list', { cat: cat.id });
                fs.writeFileSync(path.join(__dirname, `../data/categories/${cat.id}.json`), JSON.stringify(res.data));
            } catch (e) {}
        }

        // 3. Baixar DETALHES (Onde estava faltando atualização)
        console.log(`📝 [3/3] Atualizando detalhes de ${allGames.length} jogos...`);
        
        let updatedCount = 0;
        let errorCount = 0;

        const downloadGameDetail = async (game) => {
            const filePath = path.join(__dirname, `../data/details/${game.id}.json`);
            try {
                // SEMPRE baixa e sobrescreve, garantindo atualização
                const detailRes = await api.post('/gameinfo/get', { userId: 0, gameId: game.id });
                fs.writeFileSync(filePath, JSON.stringify(detailRes.data));
                updatedCount++;
                if (updatedCount % 50 === 0) process.stdout.write(`[${updatedCount}]`);
            } catch (e) {
                errorCount++;
            }
        };

        // Executa em lotes para não travar
        for (let i = 0; i < allGames.length; i += CONCURRENCY_LIMIT) {
            const batch = allGames.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.all(batch.map(g => downloadGameDetail(g)));
            if (i + CONCURRENCY_LIMIT < allGames.length) await delay(BATCH_DELAY);
        }

        console.log(`\n\n🎉 Atualização Concluída!`);
        console.log(`✅ Jogos Atualizados: ${updatedCount}`);
        console.log(`❌ Falhas: ${errorCount}`);
        console.timeEnd("Tempo Total");

    } catch (error) {
        console.error("\n❌ Erro Crítico:", error.message);
        process.exit(1); // Força erro para o GitHub Actions saber que falhou
    }
}

downloadData();
