const express = require('express');
const { getDb } = require('../database');
const { authenticate, logActivity } = require('../middleware/auth');
const router = express.Router();

router.post('/', authenticate, (req, res) => {
  const { customer_name, phone, address, order_type, items, subtotal, tax, delivery_fee, discount, total, payment_method } = req.body;
  if (!customer_name || !phone || !items || !total) return res.status(400).json({ error: 'Required fields missing' });
  const db = getDb();
  const orderNumber = 'ORD-' + Date.now().toString().slice(-8);
  const result = db.prepare(`INSERT INTO orders (order_number,customer_name,phone,address,order_type,items_json,subtotal,tax,delivery_fee,discount,total,payment_method) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(orderNumber,customer_name,phone,address||null,order_type||'dine_in',JSON.stringify(items),subtotal||total,tax||0,delivery_fee||0,discount||0,total,payment_method||'cash');
  logActivity(req.user.id,'order_created','order',result.lastInsertRowid,orderNumber,req.ip);
  res.status(201).json({ message: 'Order created', order_number: orderNumber, id: result.lastInsertRowid });
});

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { status, type, date, page=1, limit=50, search } = req.query;
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status && status!=='all') { query+=' AND status=?'; params.push(status); }
  if (type && type!=='all') { query+=' AND order_type=?'; params.push(type); }
  if (date) { query+=' AND DATE(created_at)=?'; params.push(date); }
  if (search) { query+=' AND (customer_name LIKE ? OR phone LIKE ? OR order_number LIKE ?)'; params.push('%'+search+'%','%'+search+'%','%'+search+'%'); }
  const total_count = db.prepare(query.replace('SELECT *','SELECT COUNT(*) as total')).get(...params).total;
  query+=' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit),(parseInt(page)-1)*parseInt(limit));
  const orders = db.prepare(query).all(...params);
  orders.forEach(o => { try { o.items=JSON.parse(o.items_json); } catch(e){ o.items=[]; } });
  res.json({ orders, pagination: { page:parseInt(page), limit:parseInt(limit), total:total_count, pages:Math.ceil(total_count/parseInt(limit)) } });
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  try { order.items=JSON.parse(order.items_json); } catch(e){ order.items=[]; }
  res.json({ order });
});

router.put('/:id', authenticate, (req, res) => {
  const { status, payment_status, payment_method, staff_notes } = req.body;
  const db = getDb();
  db.prepare(`UPDATE orders SET status=COALESCE(?,status),payment_status=COALESCE(?,payment_status),payment_method=COALESCE(?,payment_method),staff_notes=COALESCE(?,staff_notes),updated_at=datetime('now') WHERE id=?`).run(status||null,payment_status||null,payment_method||null,staff_notes||null,req.params.id);
  logActivity(req.user.id,'order_updated','order',req.params.id,'Status: '+status,req.ip);
  res.json({ message: 'Order updated' });
});

router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  logActivity(req.user.id,'order_deleted','order',req.params.id,null,req.ip);
  res.json({ message: 'Order deleted' });
});

module.exports = router;
