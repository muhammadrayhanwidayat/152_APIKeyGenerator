
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'uwuntu_api.db');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// session (simple in-memory; replace for production)
app.use(session({
  secret: 'replace_with_a_strong_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// === Database ===
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('❌ Database error:', err.message);
  else console.log(chalk.hex('#00ff88')('💾 Database connected: uwuntu_api.db'));
});

// create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstname TEXT NOT NULL,
      lastname TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      is_online INTEGER DEFAULT 0,
      last_seen DATETIME DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS apikeys (
      id INTEGER PRIMARY KEY, -- will equal users.id (one-to-one)
      api_key TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
});

function logCyber(message, color = 'cyan') {
  const time = new Date().toLocaleTimeString();
  const neon = color === 'pink' ? chalk.hex('#ff007c') : color === 'blue' ? chalk.hex('#00fff0') : chalk.hex('#00ff88');
  console.log(neon(`[${time}] ⚡ ${message}`));
}

// Utility: generate an API key (DO NOT save it in this route)
function makeApiKey() {
  const randomBytes = crypto.randomBytes(8).toString('hex').toUpperCase(); // 16 hex chars
  return `UWUNTU-API-${randomBytes}`;
}

// --- Public API ---
app.get('/api/test', (req, res) => {
  logCyber('/api/test requested', 'blue');
  res.json({ status: 'ok', message: 'UwUntu Cyber API aktif', time: new Date().toISOString() });
});

// Generate an API key but DO NOT store it yet
app.get('/api/generate-key', (req, res) => {
  const apiKey = makeApiKey();
  logCyber(`Generated key (not saved): ${apiKey}`, 'pink');
  res.json({ apiKey, createdAt: new Date().toISOString() });
});

// Save user + api key into DB. The apikey row's id will equal user.id
app.post('/api/save-user', (req, res) => {
  const { firstname, lastname, email, apiKey } = req.body;
  if (!firstname || !lastname || !email || !apiKey) return res.status(400).json({ error: 'firstname, lastname, email and apiKey required' });

  const insertUser = `INSERT INTO users (firstname, lastname, email) VALUES (?,?,?)`;
  db.run(insertUser, [firstname, lastname, email], function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      return res.status(500).json({ error: 'DB insert user failed', details: err.message });
    }

    const userId = this.lastID;
    const insertKey = `INSERT INTO apikeys (id, api_key) VALUES (?,?)`;
    db.run(insertKey, [userId, apiKey], function(err2) {
      if (err2) {
        // rollback user
        db.run('DELETE FROM users WHERE id = ?', [userId]);
        return res.status(500).json({ error: 'DB insert apikey failed', details: err2.message });
      }

      db.get(`SELECT u.id, u.firstname, u.lastname, u.email, u.created_at as user_created_at, a.api_key, a.created_at as apikey_created_at
              FROM users u LEFT JOIN apikeys a ON a.id = u.id WHERE u.id = ?`, [userId], (e, row) => {
        if (e) return res.status(500).json({ error: 'DB fetch after save failed', details: e.message });
        logCyber(`Saved user ${row.id} + apikey ${row.api_key}`, 'pink');
        res.json({ success: true, user: row });
      });
    });
  });
});

// Validate API key and mark the owner as seen/online (updates last_seen)
app.get('/api/validate', (req, res) => {
  const { key } = req.query;
  logCyber(`/api/validate key=${key}`, 'blue');

  if (!key) return res.status(400).json({ valid: false, reason: 'missing_key' });
  const re = /^UWUNTU-API-[A-F0-9]{16}$/;
  if (!re.test(key)) return res.status(400).json({ valid: false, reason: 'invalid_format' });

  // Look up apikey row
  db.get(`SELECT * FROM apikeys WHERE api_key = ?`, [key], (err, row) => {
    if (err) {
      console.error('DB error on validate:', err.message);
      return res.status(500).json({ valid: false, reason: 'db_error' });
    }
    if (!row) {
      return res.status(404).json({ valid: false, reason: 'not_found', message: 'API key tidak ditemukan.' });
    }

    // Mark the corresponding user as online and update last_seen
    db.run(
      `UPDATE users SET is_online = 1, last_seen = datetime('now') WHERE id = ?`,
      [row.id],
      function (updErr) {
        if (updErr) console.error('Failed to update last_seen on validate:', updErr.message);
        // respond with key info (validation success)
        res.json({
          valid: true,
          key: row.api_key,
          status: row.status || 'active',
          createdAt: row.created_at,
          message: 'API key valid dan last_seen diupdate.'
        });
      }
    );
  });
});


// Heartbeat: set online + update last_seen
app.post('/api/user/:id/online', (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE users SET is_online = 1, last_seen = datetime('now') WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Set offline
app.post('/api/user/:id/offline', (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE users SET is_online = 0, last_seen = NULL WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- Admin routes ---
async function hashPasswordMiddleware(req, res, next) {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password required' });
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);
    req.body.password_hash = hash;
    delete req.body.password;
    next();
  } catch (err) { next(err); }
}

app.post('/admin/register', hashPasswordMiddleware, (req, res) => {
  const { email, password_hash } = req.body;
  if (!email || !password_hash) return res.status(400).json({ error: 'email & password required' });
  db.run(`INSERT INTO admins (email, password_hash) VALUES (?,?)`, [email, password_hash], function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Admin email exists' });
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, adminId: this.lastID });
  });
});

app.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });
  db.get(`SELECT id, email, password_hash FROM admins WHERE email = ?`, [email], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.adminId = row.id; req.session.adminEmail = row.email;
    res.json({ success: true });
  });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}



// Admin: list users + apikeys + computed online (last_seen within 35s)
// Admin: list users + apikeys + computed online (based on last_seen within 30 days)
app.get('/admin/api/users', requireAdmin, (req, res) => {
  // 30 days in seconds
  const ONLINE_WINDOW_SECONDS = 30 * 24 * 3600;

  const sql = `
    SELECT u.id, u.firstname, u.lastname, u.email, u.last_seen,
           CASE WHEN u.last_seen IS NOT NULL
                AND (strftime('%s','now') - strftime('%s', u.last_seen)) <= ${ONLINE_WINDOW_SECONDS}
                THEN 1 ELSE 0 END AS online_now,
           u.created_at AS user_created_at,
           a.api_key, a.created_at AS apikey_created_at
    FROM users u
    LEFT JOIN apikeys a ON a.id = u.id
    ORDER BY u.id ASC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ users: rows });
  });
});


// Admin: revoke key
app.post('/admin/api/user/:id/revoke', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM apikeys WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Admin export
app.get('/admin/api/export', requireAdmin, (req, res) => {
  const sql = `SELECT u.id, u.firstname, u.lastname, u.email, u.created_at as user_created_at, a.api_key, a.created_at as apikey_created_at, u.last_seen FROM users u LEFT JOIN apikeys a ON a.id = u.id ORDER BY u.id ASC`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users_apikeys.csv"');
    res.write('id,firstname,lastname,email,user_created_at,api_key,apikey_created_at,last_seen\n');
    rows.forEach(r => {
      const esc = v => (v === null || v === undefined) ? '' : `"${String(v).replace(/"/g, '""')}"`;
      res.write(`${r.id},${esc(r.firstname)},${esc(r.lastname)},${esc(r.email)},${esc(r.user_created_at)},${esc(r.api_key)},${esc(r.apikey_created_at)},${esc(r.last_seen)}\n`);
    });
    res.end();
  });
});


app.post('/admin/api/user/:id/delete', requireAdmin, (req, res) => {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'invalid id' });

      db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');
        db.run('BEGIN TRANSACTION');
        db.run('DELETE FROM apikeys WHERE id = ?', [id], function (err) {
          if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: 'delete_keys_failed', details: err.message }); }
          db.run('DELETE FROM users WHERE id = ?', [id], function (err2) {
            if (err2) { db.run('ROLLBACK'); return res.status(500).json({ error: 'delete_user_failed', details: err2.message }); }
            db.run('COMMIT');
            res.json({ success: true });
          });
        });
      });
    });

// serve index by static middleware; also keep root fallback
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.clear();
  console.log(chalk.hex('#00fff0')('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.hex('#ff007c')('║     UwUntu Cyberpunk API Console v4.0 ⚙️      ║'));
  console.log(chalk.hex('#00fff0')('╚═══════════════════════════════════════════════╝'));
  console.log(chalk.hex('#00ff88')(`🚀  Server aktif di: http://localhost:${PORT}`));
});