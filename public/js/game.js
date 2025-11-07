// --- Estado Global ---
let currentGameId = null;
const pageLoadingSpinner = document.getElementById('loading-spinner-page');
const gameDetailsContainer = document.getElementById('game-details');
const recommendationsSection = document.getElementById('recommendations-section');
const commentsSection = document.getElementById('comments-section');

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    // Pega o ID do jogo da URL
    const urlParams = new URLSearchParams(window.location.search);
    currentGameId = urlParams.get('id');

    if (currentGameId) {
        loadGameDetails(currentGameId);
        loadRecommendations(currentGameId);
        loadComments(currentGameId); // Carrega os comentários
        
        // Adiciona listener ao formulário de comentário
        const commentForm = document.getElementById('comment-form');
        commentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            postComment(currentGameId);
        });
    } else {
        gameDetailsContainer.innerHTML = '<p class="text-red-400 text-center">ID do jogo não encontrado.</p>';
        setPageLoading(false);
    }
    
    // A função checkLoginStatus() do global.js já está rodando
    // e vai mostrar/esconder o #comment-form quando terminar
});

function setPageLoading(isLoading) {
    if (isLoading) {
        pageLoadingSpinner.style.display = 'block';
        gameDetailsContainer.innerHTML = '';
        recommendationsSection.style.display = 'none';
        commentsSection.style.display = 'none';
    } else {
        pageLoadingSpinner.style.display = 'none';
    }
}

// --- Carregamento de Dados (Jogo e Recomendações) ---

async function loadGameDetails(id) {
    setPageLoading(true);
    try {
        // A rota /api/game/:id já tem a lógica de link premium/normal
        const response = await fetch(`/api/game/${id}`);
        if (!response.ok) throw new Error('Falha ao buscar detalhes');
        const game = await response.json();
        
        renderGameDetails(game);
        commentsSection.style.display = 'block'; // Mostra a seção de comentários
    
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
        gameDetailsContainer.innerHTML = `<p class="text-red-400 text-center">Não foi possível carregar os detalhes do jogo.</p>`;
    } finally {
        setPageLoading(false);
    }
}

function renderGameDetails(game) {
    // O link de download aqui já é o correto (premium ou normal)
    // A lógica foi feita no server.js
    gameDetailsContainer.innerHTML = `
        <div class="flex flex-col md:flex-row gap-6">
            <div class="md:w-1/3 lg:w-1/4">
                <img src="${game.cover}" alt="${game.title}" class="rounded-lg shadow-xl w-full">
                <a href="${game.download_url}" 
                   class="block w-full bg-brand-green text-brand-blue text-center font-bold py-3 px-4 rounded-lg mt-4 hover:bg-green-300 transition-colors">
                   Baixar Jogo (${game.size})
                </a>
                <span class="text-xs text-center block mt-2 text-gray-400">
                    ${game.download_url.includes('premium') ? 'Download Premium Ativado!' : 'Faça login para download premium.'}
                </span>
            </div>

            <div class="md:w-2/3 lg:w-3/4">
                <h1 class="text-3xl md:text-4xl font-bold text-white">${game.title}</h1>
                
                <div class="flex flex-wrap gap-4 text-gray-400 my-3">
                    <span>Ano: <strong class="text-gray-200">${game.year}</strong></span>
                    <span>Idioma: <strong class="text-gray-200">${game.language}</strong></span>
                    <span>Views: <strong class="text-gray-200">${game.views.toLocaleString('pt-BR')}</strong></span>
                    <span>Rating: <strong class="text-yellow-400">${game.rate.toFixed(1)} / 5.0</strong></span>
                </div>
                
                <h2 class="text-2xl font-semibold text-white mt-6 mb-2 border-b border-gray-700 pb-2">Descrição</h2>
                <p class="text-gray-300 whitespace-pre-line leading-relaxed">${game.description}</p>
                
                <h2 class="text-2xl font-semibold text-white mt-8 mb-2 border-b border-gray-700 pb-2">Galeria</h2>
                
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    ${game.prints.map(printUrl => `
                        <a href="${printUrl}" target="_blank">
                            <img src="${printUrl}" alt="Game Screenshot" class="rounded-lg shadow-md transition-transform hover:scale-105" loading="lazy">
                        </a>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    document.title = game.title;
}

async function loadRecommendations(id) {
    const grid = document.getElementById('recommendations-grid');
    try {
        const response = await fetch(`/api/game/${id}/recommend`);
        if (!response.ok) throw new Error('Falha ao buscar recomendações');
        const games = await response.json();

        if (games.length > 0) {
            recommendationsSection.style.display = 'block';
            grid.innerHTML = '';
            games.forEach(game => {
                const gameCard = createRecGameCard(game);
                grid.appendChild(gameCard);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar recomendações:', error);
    }
}

function createRecGameCard(game) { // Card de Recomendação
    const card = document.createElement('a');
    card.href = `/game.html?id=${game.id}`;
    card.className = 'game-card';
    card.innerHTML = `
        <img src="${game.cover}" alt="${game.title}" loading="lazy" class="w-full h-auto object-cover aspect-[3/4]">
        <div class="p-3">
            <h3 class="font-semibold text-white text-sm truncate" title="${game.title}">
                ${game.title}
            </h3>
        </div>
    `;
    return card;
}

// --- Lógica de Comentários ---

async function loadComments(gameId) {
    const list = document.getElementById('comments-list');
    list.innerHTML = '<p class="text-gray-400">Carregando comentários...</p>';
    try {
        const response = await fetch(`/api/game/${gameId}/comments`);
        const comments = await response.json();

        if (comments.length === 0) {
            list.innerHTML = '<p class="text-gray-400">Seja o primeiro a comentar!</p>';
            return;
        }

        list.innerHTML = ''; // Limpa
        comments.forEach(comment => {
            const commentEl = document.createElement('div');
            commentEl.className = 'flex items-start gap-3 bg-gray-800 p-4 rounded-lg';
            commentEl.innerHTML = `
                <img src="${comment.userPhoto}" alt="${comment.userName}" class="w-10 h-10 rounded-full">
                <div>
                    <strong class="text-white">${comment.userName}</strong>
                    <span class="text-gray-400 text-sm ml-2">${new Date(comment.timestamp).toLocaleString('pt-BR')}</span>
                    <p class="text-gray-300 mt-1">${comment.text}</p>
                </div>
            `;
            list.appendChild(commentEl);
        });
    } catch (error) {
        list.innerHTML = '<p class="text-red-400">Erro ao carregar comentários.</p>';
    }
}

async function postComment(gameId) {
    const textarea = document.getElementById('comment-text');
    const errorDiv = document.getElementById('comment-error');
    const submitButton = document.querySelector('#comment-form button[type="submit"]');
    const text = textarea.value;

    submitButton.disabled = true;
    submitButton.textContent = 'Postando...';
    errorDiv.textContent = '';

    try {
        const response = await fetch(`/api/game/${gameId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        const result = await response.json();

        if (!response.ok) {
            // Mostra erro (ex: "comentário tóxico" ou "muito curto")
            errorDiv.textContent = result.message;
        } else {
            // Sucesso!
            textarea.value = ''; // Limpa o campo
            loadComments(gameId); // Recarrega a lista de comentários
        }
    } catch (error) {
        errorDiv.textContent = 'Erro de conexão. Tente novamente.';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Postar Comentário';
    }
}
