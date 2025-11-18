const axios = require('axios');

async function teste() {
    console.log("Tentando conectar a api.igamesbr.com...");
    try {
        const response = await axios.post('https://api.igamesbr.com/games/list', {}, {
            headers: {
                'User-Agent': 'okhttp/4.10.0', // Estamos fingindo ser um app Android
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip',
                'Content-Type': 'application/json'
            },
            timeout: 5000
        });
        console.log("SUCESSO! Status:", response.status);
        console.log("Jogos encontrados:", response.data.length);
    } catch (error) {
        console.error("FALHA!");
        if (error.response) {
            // O servidor respondeu com um erro (4xx, 5xx)
            console.error("Status:", error.response.status);
            console.error("Dados:", error.response.data);
            console.error("Headers:", error.response.headers);
        } else if (error.request) {
            // O servidor não respondeu (Timeout ou Bloqueio de Rede)
            console.error("Sem resposta do servidor (Provável bloqueio de IP ou Timeout)");
        } else {
            console.error("Erro:", error.message);
        }
    }
}

teste();
