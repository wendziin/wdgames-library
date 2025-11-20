const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- CONFIGURAÇÕES ---
const CONCURRENCY_LIMIT = 10; // Baixa 10 jogos ao mesmo tempo (Seguro e Rápido)
const BATCH_DELAY = 500;      // Espera 0.5s entre cada lote para a API respirar

const api = axios.create({
    baseURL: 'https://api.igamesbr.com',
    headers: {
        'User-Agent': 'okhttp/4.10.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    },
    timeout: 20000 // 20 segundos de tolerância
});

// Função de espera
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function downloadData() {
    console.time("Tempo Total"); // Cronômetro
    console.log("🚀 Iniciando Snapshot Total (Modo Turbo)...");

    // Criar pastas
    const dirs = ['data', 'data/categories', 'data/details'];
    dirs.forEach(dir => {
        const fullPath = path.join(__dirname, '../', dir);
        if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    });

    try {
        // 1. Baixar Lista de Categorias
        console.log("\n📦 [1/3] Baixando categorias...");
        const catRes = await api.get('/categories/list');
        fs.writeFileSync(path.join(__dirname, '../data/categories.json'), JSON.stringify(catRes.data));
        console.log(`✅ ${catRes.data.length} categorias salvas.`);

        // 2. Baixar Jogos por Categoria + Lista Geral
        console.log("\n📂 [2/3] Baixando listas de jogos...");
        
        // Baixa lista geral
        const allGamesRes = await api.post('/games/list', {});
        const allGames = allGamesRes.data;
        fs.writeFileSync(path.join(__dirname, '../data/games.json'), JSON.stringify(allGames));
        console.log(`✅ Lista mestre salva: ${allGames.length} jogos.`);

        // Baixa listas por categoria (pode ser rápido, fazemos sequencial para garantir)
        for (const cat of catRes.data) {
            try {
                const res = await api.post('/games-cat/list', { cat: cat.id });
                fs.writeFileSync(
                    path.join(__dirname, `../data/categories/${cat.id}.json`), 
                    JSON.stringify(res.data)
                );
            } catch (e) { console.error(`Erro categoria ${cat.label}`); }
        }

        // 3. Baixar DETALHES (AQUI ESTÁ A OTIMIZAÇÃO ASSÍNCRONA)
        console.log(`\n📝 [3/3] Baixando detalhes de ${allGames.length} jogos em lotes de ${CONCURRENCY_LIMIT}...`);
        
        let successCount = 0;
        let errorCount = 0;

        // Função auxiliar para baixar UM jogo (retorna uma Promise)
        const downloadGame = async (game) => {
            const filePath = path.join(__dirname, `../data/details/${game.id}.json`);
            try {
                const detailRes = await api.post('/gameinfo/get', { userId: 0, gameId: game.id });
                fs.writeFileSync(filePath, JSON.stringify(detailRes.data));
                process.stdout.write("."); // Mostra um pontinho para cada sucesso
                successCount++;
            } catch (e) {
                process.stdout.write("x"); // Mostra um x para erro
                errorCount++;
                // console.error(`\nErro ID ${game.id}: ${e.message}`);
            }
        };

        // Loop em LOTES (Batches)
        for (let i = 0; i < allGames.length; i += CONCURRENCY_LIMIT) {
            const batch = allGames.slice(i, i + CONCURRENCY_LIMIT);
            
            // Inicia todas as requisições do lote ao mesmo tempo!
            await Promise.all(batch.map(game => downloadGame(game)));

            // Pequena pausa entre lotes para não bloquear o IP
            if (i + CONCURRENCY_LIMIT < allGames.length) {
                await delay(BATCH_DELAY);
            }
            
            // Log de progresso
            // console.log(`\nLote ${Math.min(i + CONCURRENCY_LIMIT, allGames.length)}/${allGames.length} processado.`);
        }

        console.log("\n\n🎉 Snapshot Concluído!");
        console.log(`✅ Sucessos: ${successCount}`);
        console.log(`❌ Erros: ${errorCount}`);
        console.timeEnd("Tempo Total");

    } catch (error) {
        console.error("\n❌ Erro fatal:", error.message);
    }
}

downloadData();
