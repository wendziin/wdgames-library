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
const MONGO_URI = process.env.MONGO_URI; 
if (!MONGO_URI) {
  console.error("ERRO: A variável de ambiente MONGO_URI não está definida.");
  process.exit(1);
}
mongoose.connect(MONGO_URI)
  .then(() => console.log('Conectado ao MongoDB Atlas'))
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err.message);
  });

// --- Modelos do Banco de Dados (Schemas) ---
const UserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  displayName: String,
  email: String,
  photo: String
});
const User = mongoose.model('User', UserSchema);

const CommentSchema = new mongoose.Schema({
  gameId: { type: Number, required: true, index: true },
  userGoogleId: { type: String, required: true }, // Precisamos disto para a autorização
  userName: String,
  userPhoto: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
  isApproved: { type: Boolean, default: true }
});
const Comment = mongoose.model('Comment', CommentSchema);

// --- Configuração de Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'um_segredo_muito_forte_padrao',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 dias
}));

// --- Configuração do PASSPORT (Autenticação) ---
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // URL de callback absoluta para corrigir o erro de mismatch no Render
    callbackURL: (process.env.BASE_URL || 'http://localhost:3000') + "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (user) {
        return done(null, user);
      } else {
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

passport.serializeUser((user, done) => {
  done(null, user.id);
});

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

// --- Instância da API iGames ---
const api = axios.create({
  baseURL: 'https://api.igamesbr.com',
  headers: {
    'User-Agent': 'okhttp/4.10.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip'
  }
});

// --- Rotas de Autenticação ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => { res.redirect('/'); }
);
app.get('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/');
  });
});
app.get('/api/me', (req, res) => {
  res.json(req.isAuthenticated() ? req.user : null);
});


// --- Rotas da API de Jogos (SEM CACHE) ---

// Rota 1: Listar todas as categorias
app.get('/api/categories', async (req, res) => {
  try {
    const response = await api.get('/categories/list');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar categorias' });
  }
});

// Rota 2: Listar todos os jogos (Paginação no servidor)
app.get('/api/games', async (req, res) => {
  try {
    const response = await api.post('/games/list', {});
    const allGames = response.data;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedGames = allGames.slice(startIndex, endIndex);
    const totalGames = allGames.length;
    const totalPages = Math.ceil(totalGames / limit);

    res.json({ page, totalPages, totalGames, games: paginatedGames });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar todos os jogos' });
  }
});

// Rota 3: Listar jogos por categoria (Paginação no servidor)
app.get('/api/games/category/:id', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    
    const response = await api.post('/games-cat/list', { cat: categoryId });
    const games = response.data;

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedGames = games.slice(startIndex, endIndex);
    const totalGames = games.length;
    const totalPages = Math.ceil(totalGames / limit);

    res.json({ page, totalPages, totalGames, games: paginatedGames });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar jogos da categoria' });
  }
});

// Rota 4: Detalhes do jogo (com lógica de link premium)
app.get('/api/game/:id', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const response = await api.post('/gameinfo/get', { userId: 0, gameId: gameId });
    const game = response.data;

    if (req.isAuthenticated()) {
      game.download_url = game.premium_url;
    }
    delete game.premium_url; 
    
    res.json(game);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar detalhes do jogo', details: error.message });
  }
});

// Rota 5: Recomendações
app.get('/api/game/:id/recommend', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const gameInfoResponse = await api.post('/gameinfo/get', { userId: 0, gameId: gameId });
    const gameTitle = gameInfoResponse.data.title;
    const recommendResponse = await api.post('/games/recommend', { game: gameId, title: gameTitle });
    res.json(recommendResponse.data);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar recomendações', details: error.message });
  }
});

// Rota 6: Pesquisa (Paginação no servidor)
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q ? req.query.q.toLowerCase() : '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;

    if (!q) {
      return res.redirect(`/api/games?page=1&limit=${limit}`);
    }

    const response = await api.post('/games/list', {});
    const allGames = response.data;
    
    const filteredGames = allGames.filter(game =>
      game.title.toLowerCase().includes(q)
    );

    const totalGames = filteredGames.length;
    const totalPages = Math.ceil(totalGames / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedGames = filteredGames.slice(startIndex, endIndex);

    res.json({ page, totalPages, totalGames, games: paginatedGames });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao processar busca' });
  }
});

// --- Rotas de Comentários ---

// 1. Obter comentários
app.get('/api/game/:id/comments', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const comments = await Comment.find({ gameId: gameId, isApproved: true })
                                  .sort({ timestamp: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: 'Erro ao buscar comentários' });
  }
});

// 2. Postar comentário
app.post('/api/game/:id/comments', isLoggedIn, async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const { text } = req.body;
    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Comentário muito curto.' });
    }

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
      isApproved: true
    });
    await newComment.save();
    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ message: 'Erro ao postar comentário' });
  }
});

// 3. Deletar comentário (NOVO!)
app.delete('/api/comments/:commentId', isLoggedIn, async (req, res) => {
  try {
    const { commentId } = req.params;
    
    // Encontra o comentário no banco de dados
    const comment = await Comment.findById(commentId);

    // 1. Se o comentário não existe
    if (!comment) {
      return res.status(404).json({ message: 'Comentário não encontrado.' });
    }

    // 2. Se o usuário logado NÃO for o dono do comentário
    if (comment.userGoogleId !== req.user.googleId) {
      return res.status(403).json({ message: 'Você não tem permissão para deletar este comentário.' });
    }
    
    // 3. Se for o dono, delete o comentário
    await Comment.findByIdAndDelete(commentId);
    
    res.status(200).json({ message: 'Comentário deletado com sucesso.' });

  } catch (err) {
    res.status(500).json({ message: 'Erro ao deletar comentário.' });
  }
});


// --- Função do Filtro de Toxicidade ---
async function checkToxicity(text) {
  const API_KEY = process.env.PERSPECTIVE_API_KEY;
  if (!API_KEY) {
    console.warn("PERSPECTIVE_API_KEY não definida. Pulando filtro de toxicidade.");
    return false;
  }
  const url = `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${API_KEY}`;
  try {
    const response = await axios.post(url, {
      comment: { text: text },
      languages: ["pt", "en"],
      requestedAttributes: { TOXICITY: {} }
    });
    const toxicityScore = response.data.attributeScores.TOXICITY.summaryScore.value;
    console.log(`Pontuação de Toxicidade: ${toxicityScore}`);
    return toxicityScore > 0.7; // Limite de 70%
  } catch (error) {
    console.error("Erro ao chamar a Perspective API:", error.message);
    return false; // Em caso de erro, aprova
  }
}

// --- Rotas do Frontend ---
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Inicia o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
