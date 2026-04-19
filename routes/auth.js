const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { authenticate, ownerOnly, logActivity } = require('../middleware/auth');

const router = express.Router();

// LOGIN - Вхід користувача
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  // --- ВІДНОВЛЕНА ЛОГІКА (БЕЗ БАГІВ) ---
  // Перевіряємо, чи існує користувач та чи збігається хеш пароля
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'Account is disabled. Contact the owner.' });
  }

  // Оновлюємо дату останнього входу в базі
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  // Генеримо JWT токен для сесії
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  // Фіксуємо вхід в журналі активності
  logActivity(user.id, 'login', 'user', user.id, null, req.ip);

  // Відправляємо токен у куках для автоматичної авторизації в браузері
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

// Решта стандартних маршрутів
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.get('/staff', authenticate, ownerOnly, (req, res) => {
  const db = getDb();
  const staff = db.prepare('SELECT id, name, email, role, is_active FROM users').all();
  res.json({ staff });
});

module.exports = router;