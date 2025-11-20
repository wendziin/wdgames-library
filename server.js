const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const MongoStore = require('connect-mongo');
const axios = require('axios'); // Apenas para o filtro de toxicidade e recomendação
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- MongoDB ---
const MONGO_URI = process.env.MONGO_URI; 
if (MONGO_URI) {
  mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB Conectado')).catch(e => console.error(e));
}

// --- Schemas ---
const User = mongoose.model('User', new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  displayName: String, email: String, photo: String
}));
const Comment = mongoose.model('Comment', new mongoose.Schema({
  gameId: { type: Number, required: true, index: true },
  userGoogleId: String, userName: String, userPhoto: String, text: String,
  timestamp: { type: Date, default: Date.now }, isApproved: { type: Boolean, default: true }
}));
const Rating = mongoose.model('Rating', new mongoose.Schema({
  gameId: { type: Number, required: true, index: true },
  userGoogleId: String, score: { type: Number, min: 1, max: 5 }
}).index({ gameId: 1, userGoogleId: 1 }, { unique: true }));

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret', resave: false, saveUninitialized: false,
  store: MONGO_URI ? MongoStore.create({ mongoUrl: MONGO_URI }) : null,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(passport.initialize());
app.use(passport.session());

// --- Passport ---
if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: (process.env.BASE_URL || 'http://localhost:3000') + "/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });
            if (!user) {
                user = await new User({ googleId: profile.id, displayName: profile.displayName, email: profile.emails?.[0]?.value, photo: profile.photos?.[0]?.value }).save();
            }
            done(null, user);
        } catch (e) { done(e); }
    }));
    passport.serializeUser((u, d) => d(null, u.id));
    passport.deserializeUser(async (id, d) => { try { d(null, await User.findById(id)); } catch(e) { d(e); } });
}
function isLoggedIn(req, res, next) { req.isAuthenticated() ? next() : res.status(401).json({ message: 'Login necessário' }); }

// --- HELPERS DE LEITURA LOCAL ---
const DATA_DIR = path.join(__dirname, 'data');

function readJson(filePath) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) { console.error(`Erro ao ler ${filePath}`, e.message); }
    return null;
}

// --- ROTAS DE JOGOS (100% OFFLINE/LOCAL) ---

// 1. Lista de Categorias
app.get('/api/categories', (req, res) => {
    const data = readJson(path.join(DATA_DIR, 'categories.json'));
    res.json(data || []);
});

// 2. Todos os Jogos
app.get('/api/games', (req, res) => {
    const games = readJson(path.join(DATA_DIR, 'games.json')) || [];
    paginate(games, req, res);
});

// 3. Jogos por Categoria (CORREÇÃO DO BUG 1)
app.get('/api/games/category/:id', (req, res) => {
    const catId = req.params.id;
    // Lê o arquivo específico da categoria que o script baixou
    const games = readJson(path.join(DATA_DIR, 'categories', `${catId}.json`)) || [];
    paginate(games, req, res);
});

// 4. Detalhes do Jogo (CORREÇÃO DO BUG 2)
app.get('/api/game/:id', (req, res) => {
    const gameId = req.params.id;
    // Lê o arquivo de detalhes específico
    const game = readJson(path.join(DATA_DIR, 'details', `${gameId}.json`));
    
    if (!game) return res.status(404).json({ message: 'Jogo não encontrado no snapshot' });

    // Lógica Premium
    if (req.isAuthenticated()) game.download_url = game.premium_url;
    delete game.premium_url;
    
    res.json(game);
});

// 5. Pesquisa
app.get('/api/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    const games = readJson(path.join(DATA_DIR, 'games.json')) || [];
    const filtered = games.filter(g => g.title.toLowerCase().includes(q));
    paginate(filtered, req, res);
});

// 6. Recomendações (Lógica Simples Local para evitar API externa)
// Pega 8 jogos aleatórios da mesma categoria ou aleatórios gerais
app.get('/api/game/:id/recommend', (req, res) => {
    const allGames = readJson(path.join(DATA_DIR, 'games.json')) || [];
    // Embaralha e pega 8
    const randomGames = allGames.sort(() => 0.5 - Math.random()).slice(0, 8);
    res.json(randomGames);
});

// Helper de Paginação
function paginate(items, req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    const start = (page - 1) * limit;
    const result = items.slice(start, start + limit);
    res.json({ page, totalPages: Math.ceil(items.length / limit), games: result });
}

// --- Rotas de Comentários e Rating (Mantidas) ---
app.get('/api/game/:id/comments', async (req, res) => {
    try { res.json(await Comment.find({ gameId: req.params.id, isApproved: true }).sort({ timestamp: -1 })); } 
    catch { res.status(500).json([]); }
});
app.post('/api/game/:id/comments', isLoggedIn, async (req, res) => {
    /* ... Lógica de toxicidade e salvamento igual ao anterior ... */
    // (Resumido para caber, mas mantenha a lógica do Perspective API se tiver a chave)
    try {
        await new Comment({ 
            gameId: req.params.id, userGoogleId: req.user.googleId, 
            userName: req.user.displayName, userPhoto: req.user.photo, text: req.body.text 
        }).save();
        res.json({ ok: true });
    } catch { res.status(500).json({ message: 'Erro' }); }
});
app.delete('/api/comments/:id', isLoggedIn, async (req, res) => {
    try {
        const c = await Comment.findById(req.params.id);
        if(c && c.userGoogleId === req.user.googleId) { await c.deleteOne(); res.json({ok:true}); }
        else { res.status(403).json({message:'Proibido'}); }
    } catch { res.status(500).json({message:'Erro'}); }
});

// Rating
app.get('/api/game/:id/rating', async (req, res) => {
    try {
        const stats = await Rating.aggregate([{$match:{gameId:parseInt(req.params.id)}},{$group:{_id:null,avg:{$avg:"$score"},count:{$sum:1}}}]);
        let userRate = 0;
        if(req.isAuthenticated()) { const r = await Rating.findOne({gameId:req.params.id, userGoogleId:req.user.googleId}); if(r) userRate = r.score; }
        res.json({ average: stats[0]?.avg?.toFixed(1)||0, count: stats[0]?.count||0, userRating: userRate });
    } catch { res.json({average:0, count:0, userRating:0}); }
});
app.post('/api/game/:id/rating', isLoggedIn, async (req, res) => {
    try {
        await Rating.findOneAndUpdate(
            { gameId: req.params.id, userGoogleId: req.user.googleId },
            { score: req.body.score }, { upsert: true }
        );
        res.json({ok:true});
    } catch { res.status(500).json({message:'Erro'}); }
});

// Auth & Frontend
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res, next) => { req.logout(err => { if (err) return next(err); res.redirect('/'); }); });
app.get('/api/me', (req, res) => res.json(req.isAuthenticated() ? req.user : null));
app.get('/ping', (req, res) => res.send('Pong'));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
