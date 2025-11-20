// --- Estado Global ---
let currentGameId = null;
const pageLoadingSpinner = document.getElementById('loading-spinner-page');
const gameDetailsContainer = document.getElementById('game-details');
const recommendationsSection = document.getElementById('recommendations-section');
const commentsSection = document.getElementById('comments-section');

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentGameId = urlParams.get('id');

    if (currentGameId) {
        loadGameDetails(currentGameId);
        loadRecommendations(currentGameId);
        loadComments(currentGameId);
        
        const commentForm = document.getElementById('comment-form');
        commentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            postComment(currentGameId);
        });

        const commentsList = document.getElementById('comments-list');
        commentsList.addEventListener('click', handleDeleteClick);

    } else {
        gameDetailsContainer.innerHTML = '<p class="text-red-400 text-center">ID do jogo não encontrado.</p>';
        setPageLoading(false);
    }
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

// --- Detalhes e Avaliação ---

async function loadGameDetails(id) {
    setPageLoading(true);
    try {
        const response = await fetch(`/api/game/${id}`);
        if (!response.ok) throw new Error('Falha ao buscar detalhes');
        const game = await response.json();
        
        renderGameDetails(game);
        loadRating(id); // (NOVO!) Carrega a nota do jogo
        commentsSection.style.display = 'block';
    
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
        gameDetailsContainer.innerHTML = `<p class="text-red-400 text-center">Erro ao carregar detalhes.</p>`;
    } finally {
        setPageLoading(false);
    }
}

function renderGameDetails(game) {
    const isPremium = game.download_url.includes('premium');
    
    gameDetailsContainer.innerHTML = `
        <div class="flex flex-col md:flex-row gap-6">
            <div class="md:w-1/3 lg:w-1/4">
                <img src="${game.cover}" alt="${game.title}" class="rounded-lg shadow-xl w-full">
                <a href="${game.download_url}" 
                   class="block w-full bg-brand-green text-brand-blue text-center font-bold py-3 px-4 rounded-lg mt-4 hover:bg-green-300 transition-colors">
                   Baixar Jogo (${game.size})
                </a>
                <span class="text-xs text-center block mt-2 ${isPremium ? 'text-green-400' : 'text-gray-400'}">
                    ${isPremium ? 'Download Premium Ativado!' : 'Faça login para download premium.'}
                </span>
            </div>

            <div class="md:w-2/3 lg:w-3/4">
                <h1 class="text-3xl md:text-4xl font-bold text-white">${game.title}</h1>
                
                <div class="flex items-center gap-2 my-2" id="rating-area">
                    <div class="flex text-2xl text-yellow-400 cursor-pointer" id="stars-container">
                        ☆☆☆☆☆ 
                    </div>
                    <span class="text-gray-400 text-sm" id="rating-text">(Carregando nota...)</span>
                </div>

                <div class="flex flex-wrap gap-4 text-gray-400 my-3">
                    <span>Ano: <strong class="text-gray-200">${game.year}</strong></span>
                    <span>Idioma: <strong class="text-gray-200">${game.language}</strong></span>
                    <span>Views: <strong class="text-gray-200">${game.views.toLocaleString('pt-BR')}</strong></span>
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

// (NOVO!) Lógica das Estrelas
async function loadRating(gameId) {
    try {
        const res = await fetch(`/api/game/${gameId}/rating`);
        const data = await res.json();
        renderStars(data.average, data.userRating, data.count);
    } catch (e) { console.error("Erro rating", e); }
}

function renderStars(average, userRating, count) {
    const container = document.getElementById('stars-container');
    const text = document.getElementById('rating-text');
    
    // Se o usuário já avaliou, mostramos a nota dele. Se não, mostramos a média.
    const displayScore = userRating > 0 ? userRating : Math.round(average);
    
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        // Estrela cheia (★) ou vazia (☆)
        // Adicionamos um atributo 'data-value' para saber qual estrela foi clicada
        const symbol = i <= displayScore ? '★' : '☆';
        starsHtml += `<span class="hover:text-white transition-colors" onclick="submitRating(${i})">${symbol}</span>`;
    }

    container.innerHTML = starsHtml;
    
    let statusText = `${average} (${count} avaliações)`;
    if (userRating > 0) statusText += ` - Sua nota: ${userRating}`;
    text.textContent = statusText;
}

async function submitRating(score) {
    // Se não estiver logado, currentLoggedInUser é null (do global.js)
    if (!currentLoggedInUser) {
        alert("Faça login para avaliar!");
        return;
    }

    // Feedback visual imediato (otimista)
    renderStars(score, score, 0); // Atualiza visualmente antes de confirmar
    document.getElementById('rating-text').textContent = "Enviando...";

    try {
        const res = await fetch(`/api/game/${currentGameId}/rating`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score })
        });

        if (res.ok) {
            loadRating(currentGameId); // Recarrega para pegar a nova média oficial
        } else {
            alert("Erro ao enviar avaliação.");
        }
    } catch (e) {
        alert("Erro de conexão.");
    }
}

// --- Recomendações e Comentários (Mesmo código de antes) ---
async function loadRecommendations(id) {
    const grid = document.getElementById('recommendations-grid');
    try {
        const response = await fetch(`/api/game/${id}/recommend`);
        const games = await response.json();
        if (games.length > 0) {
            recommendationsSection.style.display = 'block';
            grid.innerHTML = '';
            games.forEach(game => {
                const gameCard = createRecGameCard(game);
                grid.appendChild(gameCard);
            });
        }
    } catch (error) { console.error('Erro recs', error); }
}

function createRecGameCard(game) {
    const card = document.createElement('a');
    card.href = `/game.html?id=${game.id}`;
    card.className = 'game-card';
    card.innerHTML = `
        <img src="${game.cover}" alt="${game.title}" loading="lazy" class="w-full h-auto object-cover aspect-[3/4]">
        <div class="p-3"><h3 class="font-semibold text-white text-sm truncate" title="${game.title}">${game.title}</h3></div>
    `;
    return card;
}

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
        list.innerHTML = '';
        comments.forEach(comment => {
            let deleteButtonHtml = '';
            if (currentLoggedInUser && currentLoggedInUser.googleId === comment.userGoogleId) {
                deleteButtonHtml = `<button class="text-red-500 hover:text-red-400 text-xs font-bold delete-comment-btn" data-comment-id="${comment._id}">Deletar</button>`;
            }
            const commentEl = document.createElement('div');
            commentEl.className = 'flex items-start gap-3 bg-gray-800 p-4 rounded-lg';
            commentEl.innerHTML = `
                <img src="${comment.userPhoto}" alt="${comment.userName}" class="w-10 h-10 rounded-full">
                <div class="w-full">
                    <div class="flex justify-between items-center">
                        <div><strong class="text-white">${comment.userName}</strong><span class="text-gray-400 text-sm ml-2">${new Date(comment.timestamp).toLocaleString('pt-BR')}</span></div>
                        ${deleteButtonHtml}
                    </div>
                    <p class="text-gray-300 mt-1">${comment.text}</p>
                </div>
            `;
            list.appendChild(commentEl);
        });
    } catch (error) { list.innerHTML = '<p class="text-red-400">Erro ao carregar comentários.</p>'; }
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
        if (!response.ok) { errorDiv.textContent = result.message; } else { textarea.value = ''; errorDiv.textContent = ''; loadComments(gameId); }
    } catch (error) { errorDiv.textContent = 'Erro de conexão.'; } finally { submitButton.disabled = false; submitButton.textContent = 'Postar Comentário'; }
}

function handleDeleteClick(event) {
    if (event.target.classList.contains('delete-comment-btn')) {
        const commentId = event.target.dataset.commentId;
        deleteComment(commentId);
    }
}

async function deleteComment(commentId) {
    if (!confirm('Tem certeza?')) return;
    try {
        const response = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Falha');
        loadComments(currentGameId);
    } catch (error) { alert('Erro ao deletar'); }
}
