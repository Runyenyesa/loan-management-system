const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
let OAuth2Client = null;
try { OAuth2Client = require('google-auth-library').OAuth2Client; } catch { OAuth2Client = null; }
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'db.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dbPath)) {
  console.error('Database file not found. Run: npm run init-db');
  process.exit(1);
}

function normalizeEmail(email = '') { return String(email).trim().toLowerCase(); }

function sanitizeUser(user) {
  return { id: user.id, username: user.username, email: user.email || '', provider: user.provider || 'local' };
}

function loadDb() {
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  db.meta = db.meta || { nextIds: {} };
  db.meta.nextIds = db.meta.nextIds || {};
  db.password_resets = db.password_resets || [];
  db.users = db.users || [];
  db.users.forEach((u) => {
    if (!u.email && u.username && String(u.username).includes('@')) u.email = normalizeEmail(u.username);
    if (!u.email) u.email = '';
    if (!u.provider) u.provider = 'local';
  });
  return db;
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function nextId(db, key) {
  const id = db.meta.nextIds[key] || 1;
  db.meta.nextIds[key] = id + 1;
  return id;
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function computeLoanStatus(loan) {
  const today = new Date().toISOString().slice(0, 10);
  if (loan.balance <= 0) return 'paid';
  if (loan.due_date < today) return 'overdue';
  return 'active';
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

function issueToken(user) {
  return jwt.sign({ userId: user.id, username: user.username, email: user.email || '' }, JWT_SECRET, { expiresIn: '12h' });
}

app.post('/api/auth/register', (req, res) => {
  const { full_name = '', email, password } = req.body;
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const db = loadDb();
  const exists = db.users.some((u) => normalizeEmail(u.email || u.username) === cleanEmail);
  if (exists) return res.status(409).json({ error: 'An account with this email already exists' });
  const user = {
    id: nextId(db, 'users'),
    username: full_name.trim() || cleanEmail.split('@')[0],
    email: cleanEmail,
    provider: 'local',
    password_hash: bcrypt.hashSync(password, 10),
    created_at: new Date().toISOString()
  };
  db.users.push(user);
  saveDb(db);
  const token = issueToken(user);
  res.status(201).json({ token, username: user.username, user: sanitizeUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { username, email, password } = req.body;
  const loginId = normalizeEmail(email || username);
  if (!loginId || !password) return res.status(400).json({ error: 'Email and password are required' });
  const db = loadDb();
  const user = db.users.find((u) => normalizeEmail(u.email || u.username) === loginId || normalizeEmail(u.username) === loginId);
  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid login details' });
  }
  const token = issueToken(user);
  res.json({ token, username: user.username, user: sanitizeUser(user) });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const cleanEmail = normalizeEmail(req.body.email);
  if (!cleanEmail) return res.status(400).json({ error: 'Email is required' });
  const db = loadDb();
  const user = db.users.find((u) => normalizeEmail(u.email || u.username) === cleanEmail);
  if (!user) return res.status(404).json({ error: 'No account found with that email' });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  db.password_resets = db.password_resets.filter((r) => r.email !== cleanEmail);
  db.password_resets.push({ email: cleanEmail, code_hash: bcrypt.hashSync(code, 10), expires_at: Date.now() + 15 * 60 * 1000 });
  saveDb(db);
  res.json({ message: 'Reset code generated. In production this would be sent by email.', resetCode: code });
});

app.post('/api/auth/reset-password', (req, res) => {
  const cleanEmail = normalizeEmail(req.body.email);
  const { code, new_password } = req.body;
  if (!cleanEmail || !code || !new_password) return res.status(400).json({ error: 'Email, code and new password are required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const db = loadDb();
  const reset = db.password_resets.find((r) => r.email === cleanEmail);
  if (!reset || reset.expires_at < Date.now() || !bcrypt.compareSync(code, reset.code_hash)) {
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  }
  const user = db.users.find((u) => normalizeEmail(u.email || u.username) === cleanEmail);
  if (!user) return res.status(404).json({ error: 'Account not found' });
  user.password_hash = bcrypt.hashSync(new_password, 10);
  db.password_resets = db.password_resets.filter((r) => r.email !== cleanEmail);
  saveDb(db);
  res.json({ success: true, message: 'Password reset successfully' });
});

app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(501).json({ error: 'Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID on your hosting settings.' });
  if (!OAuth2Client) return res.status(500).json({ error: 'Google OAuth package is missing. Run npm install.' });
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential is required' });
  try {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const cleanEmail = normalizeEmail(payload.email);
    const db = loadDb();
    let user = db.users.find((u) => normalizeEmail(u.email || u.username) === cleanEmail);
    if (!user) {
      user = {
        id: nextId(db, 'users'),
        username: payload.name || cleanEmail.split('@')[0],
        email: cleanEmail,
        provider: 'google',
        google_sub: payload.sub,
        created_at: new Date().toISOString()
      };
      db.users.push(user);
      saveDb(db);
    }
    const token = issueToken(user);
    res.json({ token, username: user.username, user: sanitizeUser(user) });
  } catch (error) {
    res.status(401).json({ error: 'Google sign-in failed' });
  }
});

app.get('/api/dashboard/summary', authRequired, (req, res) => {
  const db = loadDb();
  db.loans.forEach((l) => { l.status = computeLoanStatus(l); });
  saveDb(db);

  const totalClients = db.clients.length;
  const activeLoans = db.loans.filter(l => l.status === 'active').length;
  const overdueLoans = db.loans.filter(l => l.status === 'overdue').length;
  const paidLoans = db.loans.filter(l => l.status === 'paid').length;
  const totalOutstanding = db.loans.filter(l => l.status !== 'paid').reduce((sum, l) => sum + l.balance, 0);
  const today = new Date().toISOString().slice(0, 10);
  const repaymentsToday = db.repayments.filter(r => r.payment_date === today).reduce((sum, r) => sum + r.amount_paid, 0);

  res.json({ totalClients, activeLoans, overdueLoans, paidLoans, totalOutstanding, repaymentsToday });
});

app.get('/api/clients', authRequired, (req, res) => {
  const db = loadDb();
  res.json([...db.clients].sort((a, b) => b.id - a.id));
});

app.post('/api/clients', authRequired, (req, res) => {
  const { full_name, phone, address = '' } = req.body;
  if (!full_name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
  const db = loadDb();
  const client = {
    id: nextId(db, 'clients'),
    full_name: full_name.trim(),
    phone: phone.trim(),
    address: address.trim(),
    created_at: new Date().toISOString()
  };
  db.clients.push(client);
  saveDb(db);
  res.status(201).json(client);
});

app.put('/api/clients/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const { full_name, phone, address = '' } = req.body;
  const db = loadDb();
  const client = db.clients.find(c => c.id === id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  client.full_name = full_name.trim();
  client.phone = phone.trim();
  client.address = address.trim();
  saveDb(db);
  res.json({ success: true });
});

app.get('/api/loans', authRequired, (req, res) => {
  const db = loadDb();
  const enriched = db.loans.map(loan => {
    loan.status = computeLoanStatus(loan);
    const client = db.clients.find(c => c.id === loan.client_id) || {};
    return { ...loan, full_name: client.full_name || 'Unknown', phone: client.phone || '' };
  }).sort((a, b) => b.id - a.id);
  saveDb(db);
  res.json(enriched);
});

app.post('/api/loans', authRequired, (req, res) => {
  const { client_id, principal, interest_rate, repayment_plan, date_issued, due_date, notes = '' } = req.body;
  const principalNum = safeNumber(principal);
  const rateNum = safeNumber(interest_rate);
  if (!client_id || principalNum <= 0 || rateNum < 0 || !repayment_plan || !date_issued || !due_date) {
    return res.status(400).json({ error: 'Missing or invalid loan fields' });
  }
  const db = loadDb();
  const interestAmount = (principalNum * rateNum) / 100;
  const totalAmount = principalNum + interestAmount;
  const loan = {
    id: nextId(db, 'loans'),
    client_id: Number(client_id),
    principal: principalNum,
    interest_rate: rateNum,
    interest_amount: interestAmount,
    total_amount: totalAmount,
    balance: totalAmount,
    repayment_plan,
    date_issued,
    due_date,
    notes: notes.trim(),
    status: 'active',
    created_at: new Date().toISOString()
  };
  loan.status = computeLoanStatus(loan);
  db.loans.push(loan);
  saveDb(db);
  res.status(201).json(loan);
});

app.get('/api/repayments', authRequired, (req, res) => {
  const db = loadDb();
  const enriched = db.repayments.map(r => {
    const loan = db.loans.find(l => l.id === r.loan_id) || {};
    const client = db.clients.find(c => c.id === loan.client_id) || {};
    return { ...r, client_id: loan.client_id, full_name: client.full_name || 'Unknown' };
  }).sort((a, b) => b.id - a.id);
  res.json(enriched);
});

app.post('/api/repayments', authRequired, (req, res) => {
  const { loan_id, amount_paid, payment_method, payment_date, notes = '' } = req.body;
  const amountNum = safeNumber(amount_paid);
  if (!loan_id || amountNum <= 0 || !payment_method || !payment_date) {
    return res.status(400).json({ error: 'Missing or invalid repayment fields' });
  }
  const db = loadDb();
  const loan = db.loans.find(l => l.id === Number(loan_id));
  if (!loan) return res.status(404).json({ error: 'Loan not found' });

  const repayment = {
    id: nextId(db, 'repayments'),
    loan_id: Number(loan_id),
    amount_paid: amountNum,
    payment_method: payment_method.trim(),
    payment_date,
    notes: notes.trim(),
    created_at: new Date().toISOString()
  };
  db.repayments.push(repayment);
  loan.balance = Math.max(0, loan.balance - amountNum);
  loan.status = computeLoanStatus(loan);
  saveDb(db);
  res.status(201).json({ success: true, newBalance: loan.balance });
});

app.get('/api/collateral', authRequired, (req, res) => {
  const db = loadDb();
  const enriched = db.collateral.map(item => {
    const client = db.clients.find(c => c.id === item.client_id) || {};
    return { ...item, full_name: client.full_name || 'Unknown' };
  }).sort((a, b) => b.id - a.id);
  res.json(enriched);
});

app.post('/api/collateral', authRequired, (req, res) => {
  const { client_id, item_name, estimated_value, condition_notes = '', received_date, status = 'held' } = req.body;
  const valueNum = safeNumber(estimated_value);
  if (!client_id || !item_name || valueNum <= 0 || !received_date) {
    return res.status(400).json({ error: 'Missing or invalid collateral fields' });
  }
  const db = loadDb();
  const item = {
    id: nextId(db, 'collateral'),
    client_id: Number(client_id),
    item_name: item_name.trim(),
    estimated_value: valueNum,
    condition_notes: condition_notes.trim(),
    received_date,
    status: status.trim(),
    created_at: new Date().toISOString()
  };
  db.collateral.push(item);
  saveDb(db);
  res.status(201).json(item);
});

app.put('/api/collateral/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const { status, condition_notes = '' } = req.body;
  const db = loadDb();
  const item = db.collateral.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Collateral not found' });
  item.status = status.trim();
  item.condition_notes = condition_notes.trim();
  saveDb(db);
  res.json({ success: true });
});

app.get('/api/company', authRequired, (req, res) => {
  const db = loadDb();
  res.json(db.company[0] || null);
});

app.put('/api/company', authRequired, (req, res) => {
  const { business_name, phone = '', email = '', location = '', description = '', repayment_terms = '', payment_instructions = '' } = req.body;
  if (!business_name) return res.status(400).json({ error: 'Business name is required' });
  const db = loadDb();
  if (!db.company.length) {
    db.company.push({
      id: nextId(db, 'company'),
      business_name: business_name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      location: location.trim(),
      description: description.trim(),
      repayment_terms: repayment_terms.trim(),
      payment_instructions: payment_instructions.trim(),
      updated_at: new Date().toISOString()
    });
  } else {
    Object.assign(db.company[0], {
      business_name: business_name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      location: location.trim(),
      description: description.trim(),
      repayment_terms: repayment_terms.trim(),
      payment_instructions: payment_instructions.trim(),
      updated_at: new Date().toISOString()
    });
  }
  saveDb(db);
  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Loan management app running on http://localhost:${PORT}`);
  console.log('If this is your first run, execute: npm run init-db');
});
