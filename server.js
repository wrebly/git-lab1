require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const { initialize } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Initialize Database ───
initialize();

// ─── added some rows───

// ─── Static Files ───
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ─── API Routes ───
app.use('/api/auth', require('./routes/auth'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/settings', require('./routes/settings'));

// ─── Catch-all for admin SPA ───
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ─── Health check ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ─── Error handler ───
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║      🔥  TANDOOR KITCHEN SERVER  🔥          ║
  ║                                               ║
  ║   Website:  http://localhost:${PORT}             ║
  ║   Admin:    http://localhost:${PORT}/admin        ║
  ║   API:      http://localhost:${PORT}/api          ║
  ║                                               ║
  ║   Default Login:                              ║
  ║   Email:    ....@gmail.com           ║
  ║   Password: ....
  ║
  ╚═══════════════════════════════════════════════╝
  `);
});
