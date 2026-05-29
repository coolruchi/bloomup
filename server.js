require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDB } = require('./db');
const { attachUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// VIEW ENGINE
// ============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Session
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'bloomup-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};

// Use pg session store in production
if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
  try {
    const pgSession = require('connect-pg-simple')(session);
    sessionConfig.store = new pgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true
    });
  } catch (e) {
    console.warn('pg session store not available, using memory store');
  }
}

app.use(session(sessionConfig));

// Attach user to all views
app.use(attachUser);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ============================================
// ROUTES
// ============================================
app.use('/', require('./routes/index'));

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('pages/error', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong. Please try again.',
    code: 500
  });
});

// ============================================
// START
// ============================================
async function start() {
  if (process.env.DATABASE_URL) {
    await initDB();
  } else {
    console.warn('⚠️  DATABASE_URL not set — running without database (demo mode)');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════╗
║     🌱 BloomUp is running!           ║
║     http://localhost:${PORT}           ║
╚══════════════════════════════════════╝`);
  });
}

start().catch(console.error);
