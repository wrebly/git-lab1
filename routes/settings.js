const express = require('express');
const { getDb } = require('../database');
const { authenticate, ownerOnly, logActivity } = require('../middleware/auth');

const router = express.Router();

// GET all settings
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json({ settings });
});

// UPDATE settings (owner only)
router.put('/', authenticate, ownerOnly, (req, res) => {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  const updateAll = db.transaction((entries) => {
    for (const [key, value] of entries) {
      upsert.run(key, String(value));
    }
  });

  updateAll(Object.entries(req.body));
  logActivity(req.user.id, 'settings_updated', 'settings', null, JSON.stringify(Object.keys(req.body)), req.ip);
  res.json({ message: 'Settings updated' });
});

// TOGGLE restaurant open/closed
router.patch('/toggle-open', authenticate, (req, res) => {
  const db = getDb();
  const current = db.prepare("SELECT value FROM settings WHERE key = 'is_open'").get();
  const newVal = current?.value === '1' ? '0' : '1';

  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('is_open', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(newVal);

  logActivity(req.user.id, newVal === '1' ? 'restaurant_opened' : 'restaurant_closed', 'settings', null, null, req.ip);
  res.json({
    is_open: newVal === '1',
    message: newVal === '1' ? 'Restaurant is now OPEN' : 'Restaurant is now CLOSED'
  });
});

// ACTIVITY LOG
router.get('/activity-log', authenticate, (req, res) => {
  const db = getDb();
  const { page = 1, limit = 100 } = req.query;

  const total = db.prepare('SELECT COUNT(*) as total FROM activity_log').get().total;
  const logs = db.prepare(`
    SELECT al.*, u.name as user_name
    FROM activity_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).all(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  res.json({
    logs,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
  });
});

module.exports = router;
