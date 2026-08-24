const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const port = Number(process.env.PORT) || 3000;
const initialAdminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';
const sessionTokens = new Set();
const database = new DatabaseSync(path.join(__dirname, 'daansetu.db'));

database.exec('PRAGMA journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    description TEXT NOT NULL,
    city TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    photo TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
database.exec(`CREATE TABLE IF NOT EXISTS admin_credentials (id INTEGER PRIMARY KEY CHECK(id = 1), password_hash TEXT NOT NULL, password_salt TEXT NOT NULL)`);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { hash: crypto.scryptSync(password, salt, 64).toString('hex'), salt };
}

function passwordMatches(password, storedHash, salt) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

if (!database.prepare('SELECT id FROM admin_credentials WHERE id = 1').get()) {
  const credentials = hashPassword(initialAdminPassword);
  database.prepare('INSERT INTO admin_credentials (id, password_hash, password_salt) VALUES (1, ?, ?)').run(credentials.hash, credentials.salt);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json({ limit: '8mb' }));
app.use(express.static(__dirname));

function requireAdmin(request, response, next) {
  if (!request.cookies.daansetu_admin || !sessionTokens.has(request.cookies.daansetu_admin)) return response.status(401).json({ error: 'Unauthorized' });
  next();
}

function donationRow(row) {
  return { id: row.id, itemName: row.item_name, description: row.description, city: row.city, whatsapp: row.whatsapp, photo: row.photo || '', status: row.status, createdAt: row.created_at };
}

app.get('/api/donations', (request, response) => {
  const rows = database.prepare("SELECT * FROM donations WHERE status = 'approved' ORDER BY created_at DESC").all();
  response.json({ donations: rows.map(donationRow) });
});

app.post('/api/donations', (request, response) => {
  const { itemName, description, city, whatsapp, photo = '' } = request.body || {};
  if (!itemName || !description || !city || !whatsapp) return response.status(400).json({ error: 'Please fill all required fields.' });
  const id = crypto.randomUUID();
  database.prepare('INSERT INTO donations (id, item_name, description, city, whatsapp, photo) VALUES (?, ?, ?, ?, ?, ?)').run(id, itemName.trim(), description.trim(), city.trim(), whatsapp.trim(), photo);
  response.status(201).json({ donation: donationRow(database.prepare('SELECT * FROM donations WHERE id = ?').get(id)) });
});

app.post('/api/admin/login', (request, response) => {
  const credentials = database.prepare('SELECT password_hash, password_salt FROM admin_credentials WHERE id = 1').get();
  if (!request.body || !credentials || !passwordMatches(request.body.password, credentials.password_hash, credentials.password_salt)) return response.status(401).json({ error: 'Incorrect password.' });
  const token = crypto.randomBytes(32).toString('hex');
  sessionTokens.add(token);
  response.cookie('daansetu_admin', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });
  response.json({ authenticated: true });
});

app.get('/api/admin/session', requireAdmin, (request, response) => response.json({ authenticated: true }));
app.post('/api/admin/change-password', requireAdmin, (request, response) => {
  const { currentPassword, newPassword } = request.body || {};
  const credentials = database.prepare('SELECT password_hash, password_salt FROM admin_credentials WHERE id = 1').get();
  if (!currentPassword || !newPassword || newPassword.length < 8) return response.status(400).json({ error: 'New password must be at least 8 characters.' });
  if (!passwordMatches(currentPassword, credentials.password_hash, credentials.password_salt)) return response.status(401).json({ error: 'Current password is incorrect.' });
  const updated = hashPassword(newPassword);
  database.prepare('UPDATE admin_credentials SET password_hash = ?, password_salt = ? WHERE id = 1').run(updated.hash, updated.salt);
  response.json({ success: true });
});
app.post('/api/admin/logout', (request, response) => { sessionTokens.delete(request.cookies.daansetu_admin); response.clearCookie('daansetu_admin'); response.json({ authenticated: false }); });
app.get('/api/admin/donations', requireAdmin, (request, response) => {
  const rows = database.prepare('SELECT * FROM donations ORDER BY created_at DESC').all();
  response.json({ donations: rows });
});

app.post('/api/admin/donations/:id/:action', requireAdmin, (request, response) => {
  const actions = { approve: 'approved', reject: 'rejected' };
  if (request.params.action === 'delete') {
    database.prepare('DELETE FROM donations WHERE id = ?').run(request.params.id);
    return response.json({ success: true });
  }
  if (!actions[request.params.action]) return response.status(400).json({ error: 'Invalid action.' });
  database.prepare('UPDATE donations SET status = ? WHERE id = ?').run(actions[request.params.action], request.params.id);
  response.json({ success: true });
});

app.listen(port, () => console.log(`DaanSetu running at http://localhost:${port}`));
