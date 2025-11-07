// --- Importações ---
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');        // Para o MongoDB
const passport = require('passport');      // Para autenticação
const GoogleStrategy = require('passport-google-oauth20').Strategy; // Estratégia do Google
const session = require('express-session'); // Para gerenciar logins
const MongoStore = require('connect-mongo'); // Para salvar sessões no DB
require('dotenv').config(); // Para variáveis de ambiente (chaves secretas)

// --- Configuração Inicial ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Conexão com Banco de Dados ---
// CRIE UM ARQUIVO .env na raiz do projeto e adicione seu MONGO_URI
const MONGO_URI = process.env.MONGO_URI; 
mongoose.connect(MONGO_URI)
  .then(() => console.log('Conectado ao MongoDB Atlas'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// --- Modelos do Banco de Dados (Schemas) ---
// Usuário (para salvar quem logou com Google)
const UserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  displayName: String,
  email: String,
  photo: String
});
const User = mongoose.model('User', UserSchema);

// Comentário
const CommentSchema = new mongoose.Schema({
  gameId: { type: Number, required: true, index: true }, // Index para buscas rápidas
  userGoogleId: { type: String, required: true },
  userName: String,
  userPhoto: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
  isApproved: { type: Boolean, default: true } // Para moderação futura
});
const Comment = mongoose.model('Comment', CommentSchema);

// --- Configuração de Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de SESSÃO
// (Precisa vir ANTES do passport)
app.use(session({
  secret: process.env.SESSION_SECRET || 'um_segredo_muito_forte', // CRIE UM SESSION_SECRET no seu .env
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }), // Salva a sessão no MongoDB
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 dias
  }
}));

// Configuração do PASSPORT (Autenticação)
app.use(passport.initialize());
app.use(passport.session());

// CRIE GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Google Cloud Console
// e adicione-os ao seu .env
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback" // Esta é a URL de callback
  },
  async (accessToken, refreshToken, profile, done) => {
    // Isso é chamado quando o Google retorna o perfil do usuário
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (user) {
        // Usuário já existe
        return done(null, user);
      } else {
        // Criar novo usuário
        const newUser = new User({
          googleId: profile.id,
          displayName: profile.displayName,
          email: profile.emails[0].value,
          photo: profile.photos[0].value
        });
        await newUser.save();
        return done(null, newUser);
      }
    } catch (err) {
      return done(err);
    }
  }
));

// Salva o usuário na sessão
passport.serializeUser((user, done) => {
  done(null, user.id); // Salva o ID do MongoDB na sessão
});

// Carrega o usuário da sessão
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Middleware para checar se o usuário está logado
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Você precisa estar logado para fazer isso.' });
}

// --- Cache da API iGames (como antes) ---
let allGamesCache = [];
let categoriesCache = [];
const api = axios.create({ /* ... (configuração do axios igual a antes) ... */ });

async function cacheData() { /* ... (função de cache igual a antes) ... */ }

// --- Rotas de Autenticação (NOVAS!) ---

// 1. Inicia o login com Google
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }) // Pede perfil e email
);

// 2. Callback do Google (para onde o Google redireciona)
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Sucesso! Redireciona de volta para a home.
    res.redirect('/');
  }
);

// 3. Rota de Logout
app.get('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

// 4. Rota para o Frontend saber quem está logado
app.get('/api/me', (req, res) => {
  if (req.isAuthenticated()) {
    // Se logado, envia os dados do usuário
    res.json(req.user);
  } else {
    // Se não logado, envia null
    res.json(null);
  }
});


// --- Rotas da API (ATUALIZADAS) ---

// Rotas /api/categories, /api/games, /api/games/category/:id, /api/search
// (Cole suas rotas de paginação e busca aqui, elas funcionam como estão)

// ... (cole as rotas 1, 2, 3, 6 daqui) ...
// Exemplo (Rota 2):
app.get('/api/games', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 24; 
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedGames = allGamesCache.slice(startIndex, endIndex);
  const totalGames = allGamesCache.length;
  const totalPages = Math.ceil(totalGames / limit);
  res.json({
    page: page,
    totalPages: totalPages,
    totalGames: totalGames,
    games: paginatedGames
  });
});

// Rota 4: Obter detalhes do jogo (ATUALIZADA PARA LINK PREMIUM!)
app.get('/api/game/:id', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const response = await api.post('/gameinfo/get', { userId: 0, gameId: gameId });
    const game = response.data;

    // AQUI ESTÁ A MÁGICA DO LOGIN:
    if (req.isAuthenticated()) {
      // Se o usuário está LOGADO, troque o link de download pelo premium
      game.download_url = game.premium_url;
    }
    
    // Remove o link premium da resposta para não confundir o frontend
    delete game.premium_url; 
    
    res.json(game);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar detalhes do jogo', details: error.message });
  }
});

// Rota 5: Recomendações (igual a antes)
// ... (cole sua rota 5 aqui) ...


// --- Rotas de Comentários (NOVAS!) ---

// 1. Obter comentários de um jogo
app.get('/api/game/:id/comments', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const comments = await Comment.find({ gameId: gameId, isApproved: true })
                                  .sort({ timestamp: -1 }); // Mais novos primeiro
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: 'Erro ao buscar comentários' });
  }
});

// 2. Postar um novo comentário (requer login!)
app.post('/api/game/:id/comments', isLoggedIn, async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const { text } = req.body;

    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Comentário muito curto.' });
    }

    // --- FILTRO DE TOXICIDADE (PERSPECTIVE API) ---
    // (Este é o Passo 3, veja abaixo como obter a chave)
    const isToxic = await checkToxicity(text);
    if (isToxic) {
      return res.status(400).json({ message: 'Seu comentário foi bloqueado por conter linguagem ofensiva.' });
    }

    const newComment = new Comment({
      gameId: gameId,
      userGoogleId: req.user.googleId,
      userName: req.user.displayName,
      userPhoto: req.user.photo,
      text: text,
      isApproved: true // Aprovamos por padrão, já que filtramos
    });

    await newComment.save();
    res.status(201).json(newComment);

  } catch (err) {
    res.status(500).json({ message: 'Erro ao postar comentário' });
  }
});


// --- Função do Filtro de Toxicidade (NOVO!) ---
async function checkToxicity(text) {
  const API_KEY = process.env.PERSPECTIVE_API_KEY; // Adicione ao .env
  if (!API_KEY) {
    console.warn("PERSPECTIVE_API_KEY não definida. Pulando filtro de toxicidade.");
    return false; // Se a chave não existe, aprova tudo
  }

  const url = `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${API_KEY}`;
  
  try {
    const response = await axios.post(url, {
      comment: { text: text },
      languages: ["pt", "en"], // Analisa em Português e Inglês
      requestedAttributes: { TOXICITY: {} }
    });

    const toxicityScore = response.data.attributeScores.TOXICITY.summaryScore.value;
    console.log(`Pontuação de Toxicidade: ${toxicityScore}`);

    // Nosso limite: 70% de chance de ser tóxico
    return toxicityScore > 0.7; 

  } catch (error) {
    console.error("Erro ao chamar a Perspective API:", error.message);
    return false; // Em caso de erro na API, aprova o comentário
  }
}


// --- Rotas do Frontend (igual a antes) ---
app.get('/game', (req, res) => { /* ... */ });
app.get('*', (req, res) => { /* ... */ });

// --- Inicia o Servidor e o Cache ---
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  cacheData();
});
