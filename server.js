// --- Importações ---
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

// (NOVO!) Schema de Avaliação
const RatingSchema = new mongoose.Schema({
  gameId: { type: Number, required: true, index: true },
  userGoogleId: { type: String, required: true },
  score: { type: Number, required: true, min: 1, max: 5 }
});
// Garante que um usuário só pode dar UMA nota por jogo
RatingSchema.index({ gameId: 1, userGoogleId: 1 }, { unique: true });
const Rating = mongoose.model('Rating', RatingSchema);


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

// --- CARREGAMENTO DE DADOS LOCAIS ---
let localGames = [];
let localCategories = [];
try {
    const gamesPath = path.join(__dirname, 'data', 'games.json');
    const catsPath = path.join(__dirname, 'data', 'categories.json');
    if (fs.existsSync(gamesPath)) localGames = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
    if (fs.existsSync(catsPath)) localCategories = JSON.parse(fs.readFileSync(catsPath, 'utf8'));
} catch (e) { console.error(e); }

const api = axios.create({ baseURL: 'https://api.igamesbr.com', headers: { 'User-Agent': 'okhttp/4.10.0' }, timeout: 5000 });

// --- ROTAS DA API ---

app.get('/api/categories', (req, res) => res.json(localCategories));

app.get('/api/games', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    const start = (page - 1) * limit;
    const paginated = localGames.slice(start, start + limit);
    res.json({ page, totalPages: Math.ceil(localGames.length / limit), games: paginated });
});

app.get('/api/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.redirect('/api/games');
    const filtered = localGames.filter(g => g.title.toLowerCase().includes(q));
    res.json({ page: 1, totalPages: 1, games: filtered.slice(0, 24) });
});

app.get('/api/games/category/:id', async (req, res) => {
    // Fallback simples para categorias
    try {
        const resp = await api.post('/games-cat/list', { cat: parseInt(req.params.id) });
        res.json({ page: 1, totalPages: 1, games: resp.data });
    } catch (e) { res.json({ games: [] }); }
});

app.get('/api/game/:id', async (req, res) => {
    try {
        const response = await api.post('/gameinfo/get', { userId: 0, gameId: parseInt(req.params.id) });
        const game = response.data;
        if (req.isAuthenticated()) game.download_url = game.premium_url;
        delete game.premium_url;
        res.json(game);
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.get('/api/game/:id/recommend', async (req, res) => {
    try {
        const gameId = parseInt(req.params.id);
        let gameTitle = localGames.find(g => g.id === gameId)?.title;
        if (!gameTitle) {
             const info = await api.post('/gameinfo/get', { userId: 0, gameId });
             gameTitle = info.data.title;
        }
        const response = await api.post('/games/recommend', { game: gameId, title: gameTitle });
        res.json(response.data);
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

// --- Comentários ---
app.get('/api/game/:id/comments', async (req, res) => {
    try {
        const comments = await Comment.find({ gameId: parseInt(req.params.id), isApproved: true }).sort({ timestamp: -1 });
        res.json(comments);
    } catch (err) { res.status(500).json({ message: 'Erro' }); }
});
app.post('/api/game/:id/comments', isLoggedIn, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.trim().length < 3) return res.status(400).json({ message: 'Curto demais' });
        if (process.env.PERSPECTIVE_API_KEY) {
             try {
                const url = `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${process.env.PERSPECTIVE_API_KEY}`;
                const r = await axios.post(url, { comment: { text }, languages: ["pt"], requestedAttributes: { TOXICITY: {} } });
                if (r.data.attributeScores.TOXICITY.summaryScore.value > 0.7) return res.status(400).json({ message: 'Bloqueado' });
             } catch (e) {}
        }
        const c = new Comment({ gameId: parseInt(req.params.id), userGoogleId: req.user.googleId, userName: req.user.displayName, userPhoto: req.user.photo, text });
        await c.save();
        res.status(201).json(c);
    } catch (err) { res.status(500).json({ message: 'Erro' }); }
});
app.delete('/api/comments/:commentId', isLoggedIn, async (req, res) => {
    try {
        const c = await Comment.findById(req.params.commentId);
        if (!c) return res.status(404).json({ message: 'Não encontrado' });
        if (c.userGoogleId !== req.user.googleId) return res.status(403).json({ message: 'Sem permissão' });
        await Comment.findByIdAndDelete(req.params.commentId);
        res.json({ message: 'Deletado' });
    } catch (err) { res.status(500).json({ message: 'Erro' }); }
});

// --- SISTEMA DE AVALIAÇÃO (NOVO!) ---

// 1. Pegar a média e a nota do usuário
app.get('/api/game/:id/rating', async (req, res) => {
    try {
        const gameId = parseInt(req.params.id);
        
        // Calcula a média
        const stats = await Rating.aggregate([
            { $match: { gameId: gameId } },
            { $group: { _id: null, average: { $avg: "$score" }, count: { $sum: 1 } } }
        ]);
        
        let userRating = 0;
        if (req.isAuthenticated()) {
            const myRating = await Rating.findOne({ gameId: gameId, userGoogleId: req.user.googleId });
            if (myRating) userRating = myRating.score;
        }

        res.json({
            average: stats[0] ? Math.round(stats[0].average * 10) / 10 : 0, // Arredonda 1 casa decimal
            count: stats[0] ? stats[0].count : 0,
            userRating: userRating
        });
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar avaliações' });
    }
});

// 2. Postar uma nota
app.post('/api/game/:id/rating', isLoggedIn, async (req, res) => {
    try {
        const gameId = parseInt(req.params.id);
        const { score } = req.body;
        
        if (!score || score < 1 || score > 5) {
            return res.status(400).json({ message: 'Nota inválida (1-5)' });
        }

        // Upsert: Cria se não existe, atualiza se já existe
        await Rating.findOneAndUpdate(
            { gameId: gameId, userGoogleId: req.user.googleId },
            { score: score },
            { upsert: true, new: true }
        );

        res.json({ message: 'Avaliação salva!' });
    } catch (err) {
        res.status(500).json({ message: 'Erro ao salvar avaliação' });
    }
});


// Auth Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res, next) => { req.logout(err => { if (err) return next(err); res.redirect('/'); }); });
app.get('/api/me', (req, res) => res.json(req.isAuthenticated() ? req.user : null));
app.get('/ping', (req, res) => res.send('Pong'));

// Frontend
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
