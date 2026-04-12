const express = require('express');
const { getDb } = require('../database');
const { authenticate, logActivity } = require('../middleware/auth');
const router = express.Router();

router.post('/public', (req, res) => {
  const { customer_name, phone, email, booking_date, time_slot, guests, dining_pref, special_requests } = req.body;
  if (!customer_name || !phone || !booking_date || !time_slot || !guests)
    return res.status(400).json({ error: 'Please fill in all required fields' });
  const db = getDb();
  const refCode = 'TK-' + Date.now().toString().slice(-6);
  const result = db.prepare(`INSERT INTO bookings (ref_code,customer_name,phone,email,booking_date,time_slot,guests,dining_pref,special_requests) VALUES (?,?,?,?,?,?,?,?,?)`).run(refCode,customer_name.trim(),phone.trim(),email||null,booking_date,time_slot,guests,dining_pref||null,special_requests||null);
  res.status(201).json({ message: 'Booking received! We will call you within 30 minutes.', ref_code: refCode, booking_id: result.lastInsertRowid });
});

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { status, date, page=1, limit=50, search } = req.query;
  let query = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];
  if (status && status !== 'all') { query += ' AND status = ?'; params.push(status); }
  if (date) { query += ' AND booking_date = ?'; params.push(date); }
  if (search) { query += ' AND (customer_name LIKE ? OR phone LIKE ? OR ref_code LIKE ?)'; params.push('%'+search+'%','%'+search+'%','%'+search+'%'); }
  const total = db.prepare(query.replace('SELECT *','SELECT COUNT(*) as total')).get(...params).total;
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit),(parseInt(page)-1)*parseInt(limit));
  const bookings = db.prepare(query).all(...params);
  res.json({ bookings, pagination: { page:parseInt(page), limit:parseInt(limit), total, pages:Math.ceil(total/parseInt(limit)) } });
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json({ booking });
});

router.put('/:id', authenticate, (req, res) => {
  const { status, payment_status, staff_notes } = req.body;
  const db = getDb();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  db.prepare(`UPDATE bookings SET status=COALESCE(?,status), payment_status=COALESCE(?,payment_status), staff_notes=COALESCE(?,staff_notes), confirmed_by=?, updated_at=datetime('now') WHERE id=?`).run(status||null,payment_status||null,staff_notes!==undefined?staff_notes:null,req.user.id,req.params.id);
  logActivity(req.user.id,'booking_updated','booking',req.params.id,'Status: '+(status||booking.status),req.ip);
  res.json({ message: 'Booking updated' });
});

router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  logActivity(req.user.id,'booking_deleted','booking',req.params.id,null,req.ip);
  res.json({ message: 'Booking deleted' });
});

router.get('/summary/today', authenticate, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const stats = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) as confirmed, SUM(CASE WHEN status='seated' THEN 1 ELSE 0 END) as seated, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled, SUM(CASE WHEN payment_status='paid' THEN payment_amount ELSE 0 END) as revenue FROM bookings WHERE booking_date=?`).get(today);
  res.json({ date: today, ...stats });
});

module.exports = router;
