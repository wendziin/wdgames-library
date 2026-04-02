# 🎮 WDGames PSP — Biblioteca de Jogos

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

Uma plataforma completa e elegante para explorar, avaliar e baixar jogos de PSP. O **WDGames PSP** combina a velocidade de um banco de dados local em JSON com a interatividade social do MongoDB.

---

## ✨ Funcionalidades

- 📂 **Catálogo Completo:** Navegue por centenas de jogos organizados por categorias.
- 🔍 **Busca Inteligente:** Encontre seus títulos favoritos instantaneamente.
- 🔐 **Autenticação Google:** Login seguro via Google OAuth2 para uma experiência personalizada.
- 💬 **Sistema de Comentários:** Interaja com outros usuários e deixe seu feedback sobre os jogos.
- ⭐ **Avaliações (Rating):** Sistema de 1 a 5 estrelas para classificar os melhores títulos.
- 💎 **Downloads Premium:** Links de download exclusivos liberados automaticamente para usuários logados.
- 🚀 **Performance:** Carregamento ultra-rápido utilizando snapshots de dados locais.
- 📱 **Design Responsivo:** Interface moderna construída com Tailwind CSS, adaptável para qualquer dispositivo.

---

## 🛠️ Tecnologias Utilizadas

### **Backend**
- **Node.js & Express:** Servidor robusto e escalável.
- **Mongoose:** Modelagem de dados para MongoDB (Usuários, Comentários e Ratings).
- **Passport.js:** Estratégia de autenticação Google.
- **Express-Session:** Gerenciamento de sessões persistentes.

### **Frontend**
- **Vanilla JavaScript:** Lógica leve e eficiente no lado do cliente.
- **Tailwind CSS:** Estilização moderna e utilitária.
- **Axios:** Requisições de API simplificadas.

---

## 🚀 Como Executar o Projeto

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/wendziin/wdgames-library.git
   cd wdgames-library
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   Crie um arquivo `.env` na raiz e adicione:
   ```env
   PORT=3000
   MONGO_URI=seu_link_do_mongodb
   GOOGLE_CLIENT_ID=seu_client_id
   GOOGLE_CLIENT_SECRET=seu_client_secret
   SESSION_SECRET=uma_chave_secreta_qualquer
   BASE_URL=http://localhost:3000
   ```

4. **Inicie o servidor:**
   ```bash
   npm start
   ```
   Ou para desenvolvimento com auto-reload:
   ```bash
   npm run dev
   ```

---

## 📁 Estrutura do Projeto

- `/data`: Contém os snapshots JSON dos jogos e categorias.
- `/public`: Arquivos estáticos (HTML, JS, CSS compilado).
- `/src`: Arquivos fonte do CSS (Tailwind).
- `/scripts`: Utilitários para manutenção do banco de dados local.
- `server.js`: O coração da aplicação (Rotas e Middleware).

---

## 🤝 Contribuições

Contribuições são sempre bem-vindas! Sinta-se à vontade para abrir uma **Issue** ou enviar um **Pull Request**.

---

## 👤 Autor

**Wendziin**  
GitHub: [@wendziin](https://github.com/wendziin)

---
*Desenvolvido com ❤️ para a comunidade retrogamer.*
