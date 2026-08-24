const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { MongoClient } = require('mongodb');

const app = express();
const port = Number(process.env.PORT) || 3000;
const initialAdminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';
const mongoUri = process.env.MONGODB_URI;
const mongoClient = mongoUri ? new MongoClient(mongoUri) : null;
let database;
let donations;
let sessions;
let credentials;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { hash: crypto.scryptSync(password, salt, 64).toString('hex'), salt };
}

function passwordMatches(password, storedHash, salt) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json({ limit: '8mb' }));
app.use(express.static(__dirname));

async function requireAdmin(request, response, next) {
  const token = request.cookies.daansetu_admin;
  const session = token && await sessions.findOne({ token, expiresAt: { $gt: new Date() } });
  if (!session) return response.status(401).json({ error: 'Unauthorized' });
  next();
}

function donationRow(row) {
  return { id: row.id, itemName: row.itemName, description: row.description, city: row.city, whatsapp: row.whatsapp, photo: row.photo || '', status: row.status, createdAt: row.createdAt };
}

app.get('/api/donations', async (request, response) => {
  const rows = await donations.find({ status: 'approved' }).sort({ createdAt: -1 }).toArray();
  response.json({ donations: rows.map(donationRow) });
});

app.post('/api/donations', async (request, response) => {
  const { itemName, description, city, whatsapp, photo = '' } = request.body || {};
  if (!itemName || !description || !city || !whatsapp) return response.status(400).json({ error: 'Please fill all required fields.' });
  const donation = { id: crypto.randomUUID(), itemName: itemName.trim(), description: description.trim(), city: city.trim(), whatsapp: whatsapp.trim(), photo, status: 'pending', createdAt: new Date() };
  await donations.insertOne(donation);
  response.status(201).json({ donation: donationRow(donation) });
});

app.post('/api/admin/login', async (request, response) => {
  const adminCredentials = await credentials.findOne({ type: 'admin' });
  if (!request.body || !adminCredentials || !passwordMatches(request.body.password, adminCredentials.passwordHash, adminCredentials.passwordSalt)) return response.status(401).json({ error: 'Incorrect password.' });
  const token = crypto.randomBytes(32).toString('hex');
  await sessions.insertOne({ token, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) });
  response.cookie('daansetu_admin', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });
  response.json({ authenticated: true });
});

app.get('/api/admin/session', requireAdmin, (request, response) => response.json({ authenticated: true }));
app.post('/api/admin/change-password', requireAdmin, async (request, response) => {
  const { currentPassword, newPassword } = request.body || {};
  const adminCredentials = await credentials.findOne({ type: 'admin' });
  if (!currentPassword || !newPassword || newPassword.length < 8) return response.status(400).json({ error: 'New password must be at least 8 characters.' });
  if (!passwordMatches(currentPassword, adminCredentials.passwordHash, adminCredentials.passwordSalt)) return response.status(401).json({ error: 'Current password is incorrect.' });
  const updated = hashPassword(newPassword);
  await credentials.updateOne({ type: 'admin' }, { $set: { passwordHash: updated.hash, passwordSalt: updated.salt } });
  response.json({ success: true });
});
app.post('/api/admin/logout', async (request, response) => { await sessions.deleteOne({ token: request.cookies.daansetu_admin }); response.clearCookie('daansetu_admin'); response.json({ authenticated: false }); });
app.get('/api/admin/donations', requireAdmin, async (request, response) => {
  const rows = await donations.find().sort({ createdAt: -1 }).toArray();
  response.json({ donations: rows.map(donationRow) });
});

app.post('/api/admin/donations/:id/:action', requireAdmin, async (request, response) => {
  const actions = { approve: 'approved', reject: 'rejected' };
  if (request.params.action === 'delete') {
    await donations.deleteOne({ id: request.params.id });
    return response.json({ success: true });
  }
  if (!actions[request.params.action]) return response.status(400).json({ error: 'Invalid action.' });
  await donations.updateOne({ id: request.params.id }, { $set: { status: actions[request.params.action] } });
  response.json({ success: true });
});

async function start() {
  if (!mongoClient) throw new Error('MONGODB_URI is required. Add it to your environment variables.');
  await mongoClient.connect();
  database = mongoClient.db(process.env.MONGODB_DATABASE || 'daansetu');
  donations = database.collection('donations');
  sessions = database.collection('sessions');
  credentials = database.collection('admin_credentials');
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  if (!await credentials.findOne({ type: 'admin' })) {
    const adminPassword = hashPassword(initialAdminPassword);
    await credentials.insertOne({ type: 'admin', passwordHash: adminPassword.hash, passwordSalt: adminPassword.salt });
  }
  return app;
}

if (require.main === module) {
  start().then(() => app.listen(port, () => console.log(`DaanSetu running at http://localhost:${port}`)))
    .catch((error) => { console.error('Could not start DaanSetu:', error.message); process.exit(1); });
}

let ready;
module.exports = async (request, response) => {
  ready ||= start();
  await ready;
  return app(request, response);
};
