// --- Importações ---
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // Para ler os arquivos locais (Snapshot)
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
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
    .catch(err => console.error('❌ Erro MongoDB:', err.message));
} else {
  console.warn("⚠️ MONGO_URI não definido. Login e Comentários não funcionarão.");
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
  secret: process.env.SESSION_SECRET || 'segredo_padrao',
  resave: false,
  saveUninitialized: false,
  store: MONGO_URI ? MongoStore.create({ mongoUrl: MONGO_URI }) : null,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(passport.initialize());
app.use(passport.session());

// --- Passport Config ---
if (process.env.GOOGLE_CLIENT_ID) {
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
        try { const user = await User.findById(id); done(null, user); } catch(err) { done(err); }
    });
}

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: 'Login necessário.' });
}

// --- CARREGAMENTO DE DADOS LOCAIS (SNAPSHOT) ---
// Isso contorna o bloqueio de IP da API externa para a lista principal
let localGames = [];
let localCategories = [];

function loadLocalData() {
    try {
        const gamesPath = path.join(__dirname, 'data', 'games.json');
        const catsPath = path.join(__dirname, 'data', 'categories.json');
        
        if (fs.existsSync(gamesPath)) {
            localGames = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
            console.log(`📂 Dados locais carregados: ${localGames.length} jogos.`);
        } else {
            console.warn("⚠️ data/games.json não encontrado. O site ficará vazio até você rodar 'node scripts/update-db.js'");
        }

        if (fs.existsSync(catsPath)) {
            localCategories = JSON.parse(fs.readFileSync(catsPath, 'utf8'));
        }
    } catch (error) {
        console.error("❌ Erro ao ler dados locais:", error.message);
    }
}
loadLocalData(); // Carrega ao iniciar

// Axios para chamadas individuais (Detalhes/Diagnóstico)
const api = axios.create({
  baseURL: 'https://api.igamesbr.com',
  headers: {
    'User-Agent': 'okhttp/4.10.0',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip'
  },
  timeout: 10000
});

// ==================================================================
// ROTAS DA API
// ==================================================================

// 1. ROTA DE DIAGNÓSTICO (Para testar se o Render está bloqueado)
app.get('/api/diagnose', async (req, res) => {
    try {
        const start = Date.now();
        // Tenta acessar uma rota leve da API externa
        const response = await axios.get('https://api.igamesbr.com/categories/list', {
            headers: {
                'User-Agent': 'okhttp/4.10.0', // Mesmo user-agent do Android
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip'
            },
            timeout: 10000,
            validateStatus: () => true // Permite ver o erro 403/429 sem cair no catch
        });
        const duration = Date.now() - start;

        res.json({
            diagnostico: "Teste de Conexão Render -> API Externa",
            status_code: response.status,
            status_text: response.statusText,
            tempo_resposta: `${duration}ms`,
            bloqueado: response.status === 403 || response.status === 406 || response.status === 429,
            headers_recebidos: response.headers,
            dados_amostra: response.data ? "Recebido (OK)" : "Vazio"
        });

    } catch (error) {
        res.status(500).json({
            status: "ERRO FATAL",
            mensagem: error.message,
            codigo: error.code
        });
    }
});

// 2. Categorias (Lê do arquivo local para velocidade)
app.get('/api/categories', (req, res) => {
    res.json(localCategories);
});

// 3. Todos os Jogos (Lê do arquivo local + Paginação)
app.get('/api/games', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    const startIndex = (page - 1) * limit;
    
    // Se não tiver dados locais, retorna vazio (não tenta API externa para evitar crash)
    if (localGames.length === 0) {
        return res.json({ page, totalPages: 0, totalGames: 0, games: [] });
    }

    const paginatedGames = localGames.slice(startIndex, startIndex + limit);
    const totalPages = Math.ceil(localGames.length / limit);

    res.json({ page, totalPages, totalGames: localGames.length, games: paginatedGames });
});

// 4. Pesquisa (Filtra o arquivo local)
app.get('/api/search', (req, res) => {
    const q = req.query.q ? req.query.q.toLowerCase() : '';
    if (!q) return res.redirect('/api/games');

    const filteredGames = localGames.filter(game => game.title.toLowerCase().includes(q));
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    const startIndex = (page - 1) * limit;

    res.json({
        page,
        totalPages: Math.ceil(filteredGames.length / limit),
        totalGames: filteredGames.length,
        games: filteredGames.slice(startIndex, startIndex + limit)
    });
});

// 5. Jogos por Categoria (Híbrido: Tenta filtrar localmente primeiro)
app.get('/api/games/category/:id', async (req, res) => {
    // Como o JSON local "todososjogos.json" geralmente NÃO tem a lista de categorias dentro de cada jogo,
    // precisamos tentar a API externa. Se ela falhar (bloqueio), retornamos erro.
    try {
        const response = await api.post('/games-cat/list', { cat: parseInt(req.params.id) });
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
        console.error("Erro categoria (API externa):", error.message);
        // Fallback: Retorna vazio para não quebrar o site
        res.json({ page: 1, totalPages: 0, totalGames: 0, games: [] });
    }
});

// 6. Detalhes do Jogo (API externa - geralmente não bloqueia ID único)
app.get('/api/game/:id', async (req, res) => {
    try {
        const response = await api.post('/gameinfo/get', { userId: 0, gameId: parseInt(req.params.id) });
        const game = response.data;
        
        // Link Premium
        if (req.isAuthenticated()) game.download_url = game.premium_url;
        delete game.premium_url;
        
        res.json(game);
    } catch (error) { res.status(500).json({ message: 'Erro ao obter detalhes' }); }
});

// 7. Recomendações
app.get('/api/game/:id/recommend', async (req, res) => {
    try {
        const gameId = parseInt(req.params.id);
        // Tenta pegar título do cache local
        const localGame = localGames.find(g => g.id === gameId);
        let gameTitle = localGame ? localGame.title : null;
        
        // Se não tiver local, busca na API
        if (!gameTitle) {
             const info = await api.post('/gameinfo/get', { userId: 0, gameId: gameId });
             gameTitle = info.data.title;
        }

        const response = await api.post('/games/recommend', { game: gameId, title: gameTitle });
        res.json(response.data);
    } catch (error) { res.status(500).json({ message: 'Erro recomendações' }); }
});

// --- Comentários & Auth ---
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
                const url = `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${process.env.PERSPECTIVE_API_KEY}`;
                const toxRes = await axios.post(url, { comment: { text }, languages: ["pt"], requestedAttributes: { TOXICITY: {} } });
                if (toxRes.data.attributeScores.TOXICITY.summaryScore.value > 0.7) return res.status(400).json({ message: 'Bloqueado.' });
            } catch (e) { console.error('Erro Perspective', e.message); }
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

// Auth
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res, next) => { req.logout(err => { if (err) return next(err); res.redirect('/'); }); });
app.get('/api/me', (req, res) => res.json(req.isAuthenticated() ? req.user : null));
app.get('/ping', (req, res) => res.send('Pong'));

// Frontend
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
