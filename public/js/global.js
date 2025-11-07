// Este script é carregado em TODAS as páginas (index.html e game.html)
let currentLoggedInUser = null; // (NOVO!) Variável global para guardar o usuário

document.addEventListener('DOMContentLoaded', () => {
    checkLoginStatus();
});

/**
 * Verifica se o usuário está logado (/api/me) e atualiza o cabeçalho.
 * Também decide se mostra o formulário de comentário.
 */
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/me');
        const user = await response.json();
        const authContainer = document.getElementById('auth-status');
        const commentForm = document.getElementById('comment-form'); // Só existe em game.html

        if (user) {
            // Usuário está LOGADO
            currentLoggedInUser = user; // (NOVO!) Salva o usuário na variável global
            authContainer.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-white hidden sm:block">${user.displayName}</span>
                    <img src="${user.photo}" alt="${user.displayName}" class="w-10 h-10 rounded-full">
                    <a href="/auth/logout" class="text-gray-400 hover:text-white text-sm">Logout</a>
                </div>
            `;
            if (commentForm) {
                commentForm.style.display = 'block'; // Mostra o form de comentar
            }
        } else {
            // Usuário está DESLOGADO
            currentLoggedInUser = null; // (NOVO!) Garante que está nulo
            authContainer.innerHTML = `
                <a href="/auth/google" class="bg-brand-green text-brand-blue font-bold py-2 px-4 rounded hover:bg-green-300 transition-colors">
                    Login com Google
                </a>
            `;
            if (commentForm) {
                commentForm.style.display = 'none'; // Esconde o form de comentar
            }
        }
    } catch (error) {
        console.error('Erro ao checar status de login:', error);
         const authContainer = document.getElementById('auth-status');
         authContainer.innerHTML = `<a href="/auth/google" class="bg-gray-500 text-white font-bold py-2 px-4 rounded">Erro de Login</a>`;
    }
}
