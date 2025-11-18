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
  console.error("ERRO: MONGO_URI não definido no .env");
} else {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
    .catch(err => console.error('❌ Erro MongoDB:', err.message));
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

// --- API Externa (CONFIGURAÇÃO EXATA DO SEU TESTE) ---
const api = axios.create({
  baseURL: 'https://api.igamesbr.com',
  headers: {
    'User-Agent': 'okhttp/4.10.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/json' // ADICIONADO: Igual ao seu teste
  },
  timeout: 10000
});

// --- SISTEMA DE CACHE INTELIGENTE (LAZY CACHE) ---
// Isso evita chamar a API externa toda hora e ser bloqueado
let memoryCache = {
    games: null,
    categories: null,
    lastUpdated: 0
};
const CACHE_DURATION = 1000 * 60 * 60; // 1 hora

async function getCachedData() {
    const now = Date.now();
    
    // Se o cache é válido, usa ele
    if (memoryCache.games && (now - memoryCache.lastUpdated < CACHE_DURATION)) {
        console.log("⚡ Usando cache da memória (Rápido)");
        return { games: memoryCache.games, categories: memoryCache.categories };
    }

    console.log("🔄 Cache expirado ou vazio. Buscando na API externa...");
    
    try {
        // Busca dados (exatamente como o seu script de teste)
        const [gamesRes, catRes] = await Promise.all([
            api.post('/games/list', {}),
            api.get('/categories/list')
        ]);

        console.log(`✅ Sucesso! Jogos baixados: ${gamesRes.data.length}`);

        memoryCache.games = gamesRes.data;
        memoryCache.categories = catRes.data;
        memoryCache.lastUpdated = now;
        
        return { games: memoryCache.games, categories: memoryCache.categories };
    } catch (error) {
        console.error("❌ Erro ao atualizar cache:", error.message);
        if (error.response) {
            console.error("Status do Erro:", error.response.status);
        }
        // Se falhar, tenta usar o cache antigo se existir
        if (memoryCache.games) return { games: memoryCache.games, categories: memoryCache.categories };
        throw error;
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
    console.log(`📥 Requisição recebida para /api/games (Página: ${req.query.page})`);
    try {
        const data = await getCachedData();
        const allGames = data.games;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 24;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        const paginatedGames = allGames.slice(startIndex, endIndex);
        const totalPages = Math.ceil(allGames.length / limit);

        res.json({ page, totalPages, totalGames: allGames.length, games: paginatedGames });
    } catch (error) {
        console.error("Erro na rota /api/games:", error.message);
        res.status(502).json({ message: 'Serviço indisponível temporariamente.' });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const q = req.query.q ? req.query.q.toLowerCase() : '';
        if (!q) return res.redirect('/api/games');

        const data = await getCachedData();
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
        // Usa a API externa para garantir precisão na categoria
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
        let gameTitle = '';
        if (memoryCache.games) {
            const cachedGame = memoryCache.games.find(g => g.id === gameId);
            if (cachedGame) gameTitle = cachedGame.title;
        }
        if (!gameTitle) {
             const info = await api.post('/gameinfo/get', { userId: 0, gameId: gameId });
             gameTitle = info.data.title;
        }
        const response = await api.post('/games/recommend', { game: gameId, title: gameTitle });
        res.json(response.data);
    } catch (error) { res.status(500).json({ message: 'Erro ao obter recomendações' }); }
});

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

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res, next) => { req.logout(err => { if (err) return next(err); res.redirect('/'); }); });
app.get('/api/me', (req, res) => res.json(req.isAuthenticated() ? req.user : null));
app.get('/ping', (req, res) => res.status(200).send('Pong'));

app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
