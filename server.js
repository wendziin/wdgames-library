// --- Importações ---
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Conexão com Banco de Dados ---
const MONGO_URI = process.env.MONGO_URI; 
if (!MONGO_URI) {
  console.error("ERRO: MONGO_URI não definido.");
} else {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('Conectado ao MongoDB Atlas'))
    .catch(err => console.error('Erro MongoDB:', err.message));
}

// --- Schemas ---
const UserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  displayName: String,
  email: String,
  photo: String
});
const User = mongoose.model('User', UserSchema);

const CommentSchema = new mongoose.Schema({
  gameId: { type: Number, required: true, index: true },
  userGoogleId: { type: String, required: true },
  userName: String,
  userPhoto: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
  isApproved: { type: Boolean, default: true }
});
const Comment = mongoose.model('Comment', CommentSchema);

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'segredo',
  resave: false,
  saveUninitialized: false,
  store: MONGO_URI ? MongoStore.create({ mongoUrl: MONGO_URI }) : null,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(passport.initialize());
app.use(passport.session());

// ... (logo após app.use(passport.session()); )

// --- Rota de Health Check (Para o Better Stack) ---
app.get('/ping', (req, res) => {
  res.status(200).send('Pong');
});

// ... (resto do código)


// --- Passport Config ---
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: (process.env.BASE_URL || 'http://localhost:3000') + "/auth/google/callback"
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id });
          if (!user) {
            user = new User({
              googleId: profile.id,
              displayName: profile.displayName,
              email: profile.emails?.[0]?.value,
              photo: profile.photos?.[0]?.value
            });
            await user.save();
          }
          return done(null, user);
        } catch (err) { return done(err); }
      }
    ));
    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch(err) { done(err); }
    });
}

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: 'Login necessário.' });
}

// --- API Externa ---
const api = axios.create({
  baseURL: 'https://api.igamesbr.com',
  headers: {
    'User-Agent': 'okhttp/4.10.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip'
  },
  timeout: 10000 // 10 segundos de timeout para não travar o servidor
});

// --- SISTEMA DE CACHE INTELIGENTE (A Correção) ---
let memoryCache = {
    games: null,
    categories: null,
    lastUpdated: 0
};
const CACHE_DURATION = 1000 * 60 * 60; // 1 hora

// Função auxiliar para pegar dados (do cache ou da API)
async function getCachedData() {
    const now = Date.now();
    
    // Se o cache existe e tem menos de 1 hora, usa ele
    if (memoryCache.games && (now - memoryCache.lastUpdated < CACHE_DURATION)) {
        return { games: memoryCache.games, categories: memoryCache.categories };
    }

    console.log("Cache expirado ou vazio. Buscando novos dados na API iGamesBR...");
    
    try {
        // Busca dados em paralelo
        const [gamesRes, catRes] = await Promise.all([
            api.post('/games/list', {}),
            api.get('/categories/list')
        ]);

        memoryCache.games = gamesRes.data;
        memoryCache.categories = catRes.data;
        memoryCache.lastUpdated = now;
        
        console.log("Cache atualizado com sucesso.");
        return { games: memoryCache.games, categories: memoryCache.categories };
    } catch (error) {
        console.error("Erro ao atualizar cache:", error.message);
        // Se falhar, tenta retornar o cache antigo se existir
        if (memoryCache.games) return { games: memoryCache.games, categories: memoryCache.categories };
        throw error; // Se não tiver cache nenhum, joga o erro
    }
}

// --- Rotas da Aplicação ---

app.get('/api/categories', async (req, res) => {
    try {
        const data = await getCachedData();
        res.json(data.categories);
    } catch (error) {
        res.status(502).json({ message: 'Erro ao obter categorias.' });
    }
});

app.get('/api/games', async (req, res) => {
    try {
        const data = await getCachedData(); // Pega do Cache Inteligente
        const allGames = data.games;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 24;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        const paginatedGames = allGames.slice(startIndex, endIndex);
        const totalPages = Math.ceil(allGames.length / limit);

        res.json({ page, totalPages, totalGames: allGames.length, games: paginatedGames });
    } catch (error) {
        console.error(error);
        res.status(502).json({ message: 'Serviço indisponível temporariamente.' });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const q = req.query.q ? req.query.q.toLowerCase() : '';
        if (!q) return res.redirect('/api/games');

        const data = await getCachedData(); // Pega do Cache Inteligente
        const filteredGames = data.games.filter(game => game.title.toLowerCase().includes(q));

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 24;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        res.json({
            page,
            totalPages: Math.ceil(filteredGames.length / limit),
            totalGames: filteredGames.length,
            games: filteredGames.slice(startIndex, endIndex)
        });
    } catch (error) {
        res.status(502).json({ message: 'Erro na busca.' });
    }
});

app.get('/api/games/category/:id', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id, 10);
        // Nota: A API externa de categoria (/games-cat/list) é rápida e leve, 
        // mas para evitar bloqueio, vamos filtrar do nosso CACHE LOCAL GIGANTE se possível.
        // Se preferir usar a API externa para garantir precisão:
        const response = await api.post('/games-cat/list', { cat: categoryId });
        const games = response.data;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 24;
        const startIndex = (page - 1) * limit;
        
        res.json({
            page,
            totalPages: Math.ceil(games.length / limit),
            totalGames: games.length,
            games: games.slice(startIndex, startIndex + limit)
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar categoria' });
    }
});

// Detalhes, Recomendações e Auth (Mesmo código anterior)
app.get('/api/game/:id', async (req, res) => {
    try {
        const gameId = parseInt(req.params.id, 10);
        const response = await api.post('/gameinfo/get', { userId: 0, gameId: gameId });
        const game = response.data;
        if (req.isAuthenticated()) game.download_url = game.premium_url;
        delete game.premium_url;
        res.json(game);
    } catch (error) { res.status(500).json({ message: 'Erro ao obter detalhes' }); }
});

app.get('/api/game/:id/recommend', async (req, res) => {
    try {
        const gameId = parseInt(req.params.id, 10);
        // Pega o título do cache se possível para economizar 1 request
        let gameTitle = '';
        if (memoryCache.games) {
            const cachedGame = memoryCache.games.find(g => g.id === gameId);
            if (cachedGame) gameTitle = cachedGame.title;
        }
        
        // Se não achou no cache, busca na API
        if (!gameTitle) {
             const info = await api.post('/gameinfo/get', { userId: 0, gameId: gameId });
             gameTitle = info.data.title;
        }

        const response = await api.post('/games/recommend', { game: gameId, title: gameTitle });
        res.json(response.data);
    } catch (error) { res.status(500).json({ message: 'Erro ao obter recomendações' }); }
});

// Rotas de Comentários (Manter as mesmas)
app.get('/api/game/:id/comments', async (req, res) => {
    try {
        const comments = await Comment.find({ gameId: parseInt(req.params.id), isApproved: true }).sort({ timestamp: -1 });
        res.json(comments);
    } catch (err) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/game/:id/comments', isLoggedIn, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.trim().length < 3) return res.status(400).json({ message: 'Muito curto' });
        
        // Toxicidade
        if (process.env.PERSPECTIVE_API_KEY) {
            try {
                const toxRes = await axios.post(`https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${process.env.PERSPECTIVE_API_KEY}`, {
                    comment: { text: text }, languages: ["pt", "en"], requestedAttributes: { TOXICITY: {} }
                });
                if (toxRes.data.attributeScores.TOXICITY.summaryScore.value > 0.7) {
                    return res.status(400).json({ message: 'Comentário ofensivo bloqueado.' });
                }
            } catch (e) { console.error('Erro Perspective API', e.message); }
        }

        const newComment = new Comment({
            gameId: parseInt(req.params.id),
            userGoogleId: req.user.googleId,
            userName: req.user.displayName,
            userPhoto: req.user.photo,
            text
        });
        await newComment.save();
        res.status(201).json(newComment);
    } catch (err) { res.status(500).json({ message: 'Erro ao salvar' }); }
});

app.delete('/api/comments/:commentId', isLoggedIn, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ message: 'Não encontrado' });
        if (comment.userGoogleId !== req.user.googleId) return res.status(403).json({ message: 'Sem permissão' });
        await Comment.findByIdAndDelete(req.params.commentId);
        res.json({ message: 'Deletado' });
    } catch (err) { res.status(500).json({ message: 'Erro' }); }
});

// Auth Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res, next) => { req.logout(err => { if (err) return next(err); res.redirect('/'); }); });
app.get('/api/me', (req, res) => res.json(req.isAuthenticated() ? req.user : null));

// Frontend
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
