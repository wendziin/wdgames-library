document.addEventListener('DOMContentLoaded', () => {
    // Configura os listeners e carrega os dados iniciais
    setupSearchListener();
    loadCategories();
    loadData(1, true); // Carga inicial
    setupIntersectionObserver();
});

// Elementos da DOM
const gameGrid = document.getElementById('game-grid');
const categoryList = document.getElementById('category-list');
const gridTitle = document.getElementById('grid-title');
const loadingSpinner = document.getElementById('loading-spinner');
const scrollTrigger = document.getElementById('infinite-scroll-trigger');
const searchInput = document.getElementById('search-input');
const searchForm = document.getElementById('search-form');

// Estado de Paginação e Busca
let currentPage = 1;
let totalPages = 1;
let currentCategoryId = null;   // ID da categoria ativa
let currentSearchTerm = "";   // Termo da busca ativa
let isLoading = false;            // Impede múltiplos carregamentos
const gamesPerPage = 24;          // Deve ser o mesmo valor do 'limit' no server.js

// --- Função de Debounce ---
// (Evita spammar a API a cada tecla digitada)
function debounce(func, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// --- Configuração dos Listeners ---

function setupSearchListener() {
    // Impede o formulário de recarregar a página ao pressionar Enter
    searchForm.addEventListener('submit', (e) => e.preventDefault());

    // Cria uma versão "debounced" da nossa função de carregar dados
    const debouncedLoad = debounce((page, clear) => {
        loadData(page, clear);
    }, 300); // Espera 300ms após o usuário parar de digitar

    searchInput.addEventListener('input', () => {
        // Atualiza o estado da página
        currentSearchTerm = searchInput.value;
        currentCategoryId = null; // A busca anula a seleção de categoria
        
        // Ativa os botões de categoria para "não-selecionado"
        document.querySelectorAll('#category-list button').forEach(btn => {
            btn.className = 'bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-full transition-colors';
        });
        
        // Chama a função debounced para carregar a página 1 (e limpar a grade)
        debouncedLoad(1, true);
    });
}

// Configura o "Scroll Infinito"
function setupIntersectionObserver() {
    const options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.25 // Aciona quando 25% do gatilho estiver visível
    };

    const callback = (entries) => {
        const target = entries[0];
        // Se o gatilho está na tela, não estamos carregando, e ainda há páginas para carregar...
        if (target.isIntersecting && !isLoading && currentPage < totalPages) {
            // Carrega a próxima página (sem limpar a grade)
            loadData(currentPage + 1, false);
        }
    };

    const observer = new IntersectionObserver(callback, options);
    observer.observe(scrollTrigger); // Começa a "assistir" o gatilho
}


// --- Funções de Carregamento de Dados ---

function setLoading(loading) {
    isLoading = loading;
    loadingSpinner.style.display = loading ? 'block' : 'none';
}

// Carrega os botões de categoria
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        
        // Botão "Todos"
        const allButton = document.createElement('button');
        allButton.className = 'bg-brand-green text-brand-blue font-bold py-2 px-4 rounded-full'; // Destaque inicial
        allButton.textContent = 'Todos';
        allButton.onclick = (e) => {
            currentCategoryId = null;
            currentSearchTerm = "";
            searchInput.value = "";
            updateActiveButton(e.target);
            loadData(1, true); // 'true' = limpar grade
        };
        categoryList.appendChild(allButton);

        // Botões das outras categorias
        categories.forEach(cat => {
            const button = document.createElement('button');
            button.className = 'bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-full transition-colors';
            button.textContent = cat.label;
            button.onclick = (e) => {
                currentCategoryId = cat.id;
                currentSearchTerm = "";
                searchInput.value = "";
                updateActiveButton(e.target);
                loadData(1, true); // 'true' = limpar grade
            };
            categoryList.appendChild(button);
        });
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
    }
}

/**
 * Função MESTRA: Carrega dados baseado no estado atual (Busca ou Categoria)
 * @param {number} page - O número da página para buscar
 * @param {boolean} [shouldClearGrid=false] - Se true, limpa a grade antes de adicionar
 */
async function loadData(page, shouldClearGrid = false) {
    if (isLoading) return; // Não faz nada se já estiver carregando
    setLoading(true);

    if (shouldClearGrid) {
        currentPage = 1;
        totalPages = 1;
        gameGrid.innerHTML = '';
        window.scrollTo(0, 0); // Rola a tela de volta para o topo
    }
    
    currentPage = page;
    let url = '';

    // Define qual API usar: busca, categoria ou todos
    if (currentSearchTerm) {
        // Se há um termo de busca, usa a rota de pesquisa
        url = `/api/search?q=${encodeURIComponent(currentSearchTerm)}&page=${page}&limit=${gamesPerPage}`;
        gridTitle.textContent = `Resultados para: "${currentSearchTerm}"`;
    } else if (currentCategoryId) {
        // Se há uma categoria ativa, usa a rota de categoria
        url = `/api/games/category/${currentCategoryId}?page=${page}&limit=${gamesPerPage}`;
        // (Buscando o nome da categoria para o título - opcional)
        const btn = Array.from(categoryList.children).find(b => b.textContent !== 'Todos' && b.onclick.toString().includes(currentCategoryId));
        gridTitle.textContent = `Categoria: ${btn ? btn.textContent : '...'}`;
    } else {
        // Senão, carrega "Todos os Jogos"
        url = `/api/games?page=${page}&limit=${gamesPerPage}`;
        gridTitle.textContent = 'Todos os Jogos';
    }

    try {
        const response = await fetch(url);
        const data = await response.json(); // Espera um objeto { page, totalPages, games }
        
        renderGameGrid(data.games); // Adiciona os novos jogos
        totalPages = data.totalPages;
        currentPage = data.page;

    } catch (error) {
        console.error('Erro ao carregar jogos:', error);
        gameGrid.innerHTML = '<p class="text-red-400 text-center">Não foi possível carregar os jogos.</p>';
    } finally {
        setLoading(false);
    }
}

// --- Funções de Renderização ---

// Atualiza o estilo do botão de categoria ativo
function updateActiveButton(activeButton) {
    // Reseta todos os botões
    document.querySelectorAll('#category-list button').forEach(btn => {
        btn.className = 'bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-full transition-colors';
    });
    // Ativa o botão clicado
    activeButton.className = 'bg-brand-green text-brand-blue font-bold py-2 px-4 rounded-full';
}

// Renderiza a grade de jogos (APENAS ADICIONA, NÃO LIMPA)
function renderGameGrid(games) {
    if (games.length === 0 && currentPage === 1) {
        gameGrid.innerHTML = '<p class="text-gray-400 text-center">Nenhum jogo encontrado para esta busca.</p>';
        return;
    }
    
    // Adiciona os novos jogos à grade existente
    games.forEach(game => {
        const gameCard = createGameCard(game);
        gameGrid.appendChild(gameCard);
    });
}

// Cria o HTML para um card de jogo
function createGameCard(game) {
    const card = document.createElement('a');
    card.href = `/game.html?id=${game.id}`; 
    card.className = 'game-card'; // Classe definida em input.css
    
    card.innerHTML = `
        <img src="${game.cover}" alt="${game.title}" loading="lazy" class="w-full h-auto object-cover aspect-[3/4]">
        <div class="p-3">
            <h3 class="font-semibold text-white text-sm truncate" title="${game.title}">
                ${game.title}
            </h3>
            <p class="text-xs text-gray-400">Views: ${game.views.toLocaleString('pt-BR')}</p>
        </div>
    `;
    return card;
}
