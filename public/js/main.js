document.addEventListener('DOMContentLoaded', () => {
    // Configura os listeners e carrega os dados iniciais
    setupSearchListener();
    loadCategories();
    loadData(1, true); // Carga inicial
    setupIntersectionObserver();
    // A função checkLoginStatus() foi movida para global.js
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
    searchForm.addEventListener('submit', (e) => e.preventDefault());
    const debouncedLoad = debounce((page, clear) => loadData(page, clear), 300);

    searchInput.addEventListener('input', () => {
        currentSearchTerm = searchInput.value;
        currentCategoryId = null; // A busca anula a seleção de categoria
        
        // Coloca o botão "Todos" como ativo visualmente
        const allButton = categoryList.querySelector('button'); // O primeiro botão é "Todos"
        if (allButton) updateActiveButton(allButton);
        
        debouncedLoad(1, true);
    });
}

function setupIntersectionObserver() {
    const options = { root: null, rootMargin: '0px', threshold: 0.25 };
    const callback = (entries) => {
        const target = entries[0];
        if (target.isIntersecting && !isLoading && currentPage < totalPages) {
            loadData(currentPage + 1, false);
        }
    };
    const observer = new IntersectionObserver(callback, options);
    observer.observe(scrollTrigger);
}

// --- Funções de Carregamento de Dados ---

function setLoading(loading) {
    isLoading = loading;
    // O spinner principal é controlado por `shouldClearGrid`
    // Este `setLoading` agora controla apenas o spinner de scroll infinito
    loadingSpinner.style.display = loading ? 'block' : 'none';
}

async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        
        const allButton = document.createElement('button');
        allButton.className = 'bg-brand-green text-brand-blue font-bold py-2 px-4 rounded-full'; // Destaque inicial
        allButton.textContent = 'Todos';
        allButton.onclick = (e) => {
            currentCategoryId = null;
            currentSearchTerm = "";
            searchInput.value = "";
            updateActiveButton(e.target);
            loadData(1, true); 
        };
        categoryList.appendChild(allButton);

        categories.forEach(cat => {
            const button = document.createElement('button');
            button.className = 'bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-full transition-colors';
            button.textContent = cat.label;
            button.onclick = (e) => {
                currentCategoryId = cat.id;
                currentSearchTerm = "";
                searchInput.value = "";
                updateActiveButton(e.target);
                loadData(1, true);
            };
            categoryList.appendChild(button);
        });
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
    }
}

async function loadData(page, shouldClearGrid = false) {
    if (isLoading && !shouldClearGrid) return; // Se está carregando scroll infinito, não faz nada
    
    // Se for uma nova busca (limpar grid), permite o carregamento
    isLoading = true; 
    
    if (shouldClearGrid) {
        currentPage = 1;
        totalPages = 1;
        // Mostra um spinner de carregamento inicial
        gameGrid.innerHTML = `<p class="text-white text-center col-span-full text-lg">Carregando jogos...</p>`;
        window.scrollTo(0, 0); 
    } else {
        // Se for scroll infinito, mostra o spinner de baixo
        loadingSpinner.style.display = 'block';
    }
    
    currentPage = page;
    let url = '';

    // Define qual API usar: busca, categoria ou todos
    if (currentSearchTerm) {
        url = `/api/search?q=${encodeURIComponent(currentSearchTerm)}&page=${page}&limit=${gamesPerPage}`;
        gridTitle.textContent = `Resultados para: "${currentSearchTerm}"`;
    } else if (currentCategoryId) {
        url = `/api/games/category/${currentCategoryId}?page=${page}&limit=${gamesPerPage}`;
        const btn = Array.from(categoryList.children).find(b => b.textContent !== 'Todos' && b.onclick.toString().includes(currentCategoryId));
        gridTitle.textContent = `Categoria: ${btn ? btn.textContent : '...'}`;
    } else {
        url = `/api/games?page=${page}&limit=${gamesPerPage}`;
        gridTitle.textContent = 'Todos os Jogos';
    }

    try {
        const response = await fetch(url);
        const data = await response.json(); 
        
        // Se limpamos a grade, o spinner ainda está lá. Limpe de novo.
        if (shouldClearGrid) {
            gameGrid.innerHTML = '';
        }

        renderGameGrid(data.games); 
        totalPages = data.totalPages;
        currentPage = data.page;

    } catch (error) {
        console.error('Erro ao carregar jogos:', error);
        gameGrid.innerHTML = '<p class="text-red-400 text-center col-span-full">Não foi possível carregar os jogos.</p>';
    } finally {
        isLoading = false;
        loadingSpinner.style.display = 'none'; // Esconde o spinner de scroll infinito
    }
}

// --- Funções de Renderização ---

function updateActiveButton(activeButton) {
    document.querySelectorAll('#category-list button').forEach(btn => {
        btn.className = 'bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-full transition-colors';
    });
    activeButton.className = 'bg-brand-green text-brand-blue font-bold py-2 px-4 rounded-full';
}

function renderGameGrid(games) {
    if (games.length === 0 && currentPage === 1) {
        gameGrid.innerHTML = '<p class="text-gray-400 text-center col-span-full">Nenhum jogo encontrado.</p>';
        return;
    }
    
    games.forEach(game => {
        const gameCard = createGameCard(game);
        gameGrid.appendChild(gameCard);
    });
}

function createGameCard(game) {
    const card = document.createElement('a');
    card.href = `/game.html?id=${game.id}`; 
    card.className = 'game-card';
    
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
