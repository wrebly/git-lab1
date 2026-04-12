const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { authenticate, ownerOnly, logActivity } = require('../middleware/auth');

const router = express.Router();

// LOGIN
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: 'Account is disabled. Contact the owner.' });
  }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  logActivity(user.id, 'login', 'user', user.id, null, req.ip);

  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

// LOGOUT
router.post('/logout', authenticate, (req, res) => {
  logActivity(req.user.id, 'logout', 'user', req.user.id, null, req.ip);
  res.clearCookie('admin_token');
  res.json({ message: 'Logged out' });
});

// GET CURRENT USER
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// CHANGE PASSWORD
router.put('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both passwords required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password = ?, updated_at = datetime("now") WHERE id = ?').run(hash, req.user.id);
  logActivity(req.user.id, 'password_changed', 'user', req.user.id, null, req.ip);
  res.json({ message: 'Password updated successfully' });
});

// GET ALL STAFF
router.get('/staff', authenticate, ownerOnly, (req, res) => {
  const db = getDb();
  const staff = db.prepare(`
    SELECT id, name, email, role, is_active, last_login, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json({ staff });
});

// CREATE STAFF
router.post('/staff', authenticate, ownerOnly, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password required' });
  }

  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`)
    .run(name.trim(), email.toLowerCase().trim(), hash, role || 'staff');

  logActivity(req.user.id, 'staff_created', 'user', result.lastInsertRowid, name, req.ip);
  res.status(201).json({ message: 'Staff member created', id: result.lastInsertRowid });
});

// UPDATE STAFF
router.put('/staff/:id', authenticate, ownerOnly, (req, res) => {
  const { name, email, role, is_active } = req.body;
  const db = getDb();
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (parseInt(req.params.id) === req.user.id && is_active === 0) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      role = COALESCE(?, role),
      is_active = COALESCE(?, is_active),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name || null, email || null, role || null, is_active ?? null, req.params.id);

  logActivity(req.user.id, 'staff_updated', 'user', req.params.id, null, req.ip);
  res.json({ message: 'Staff member updated' });
});

// DELETE STAFF
router.delete('/staff/:id', authenticate, ownerOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, 'staff_deleted', 'user', req.params.id, null, req.ip);
  res.json({ message: 'Staff member deleted' });
});

module.exports = router;
