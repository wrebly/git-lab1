const express = require('express');
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// DASHBOARD OVERVIEW
router.get('/dashboard', authenticate, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  const todayBookings = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status IN ('completed','seated') THEN 1 ELSE 0 END) as fulfilled
    FROM bookings WHERE booking_date = ?
  `).get(today);

  const todayOrders = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(total) as revenue,
      SUM(CASE WHEN status = 'completed' OR status = 'delivered' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END) as paid_revenue
    FROM orders WHERE DATE(created_at) = ?
  `).get(today);

  const monthOrders = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(total) as revenue,
      SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END) as paid_revenue
    FROM orders WHERE DATE(created_at) >= ?
  `).get(monthStart);

  const monthBookings = db.prepare(
    'SELECT COUNT(*) as total FROM bookings WHERE booking_date >= ?'
  ).get(monthStart);

  const weeklyTrend = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total) as revenue
    FROM orders WHERE DATE(created_at) >= ?
    GROUP BY DATE(created_at) ORDER BY date
  `).all(weekAgo);

  const popularItems = db.prepare(
    'SELECT items_json FROM orders WHERE DATE(created_at) >= ? AND status != \'cancelled\''
  ).all(monthStart);

  const itemCounts = {};
  for (const row of popularItems) {
    try {
      const items = JSON.parse(row.items_json);
      for (const item of items) {
        const name = item.name || item.item_name;
        if (name) itemCounts[name] = (itemCounts[name] || 0) + (item.quantity || 1);
      }
    } catch (e) { /* skip */ }
  }

  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const monthExpenses = db.prepare(`
    SELECT SUM(amount) as total, category, COUNT(*) as count
    FROM expenses WHERE date >= ?
    GROUP BY category ORDER BY total DESC
  `).all(monthStart);

  const totalExpenses = monthExpenses.reduce((sum, e) => sum + (e.total || 0), 0);

  const recentActivity = db.prepare(`
    SELECT al.*, u.name as user_name FROM activity_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC LIMIT 20
  `).all();

  const menuStats = db.prepare(`
    SELECT COUNT(*) as total_items,
      SUM(CASE WHEN is_available = 1 THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN is_available = 0 THEN 1 ELSE 0 END) as unavailable
    FROM menu_items
  `).get();

  res.json({
    today: {
      bookings: todayBookings,
      orders: {
        total: todayOrders.total || 0,
        revenue: todayOrders.revenue || 0,
        completed: todayOrders.completed || 0,
        paid_revenue: todayOrders.paid_revenue || 0
      }
    },
    month: {
      orders: {
        total: monthOrders.total || 0,
        revenue: monthOrders.revenue || 0,
        paid_revenue: monthOrders.paid_revenue || 0
      },
      bookings: { total: monthBookings.total || 0 },
      expenses: { total: totalExpenses, breakdown: monthExpenses },
      profit: (monthOrders.paid_revenue || 0) - totalExpenses
    },
    weekly_trend: weeklyTrend,
    top_items: topItems,
    menu: menuStats,
    recent_activity: recentActivity
  });
});

// REVENUE REPORT
router.get('/revenue', authenticate, (req, res) => {
  const db = getDb();
  const { from, to, group_by = 'day' } = req.query;
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = to || new Date().toISOString().split('T')[0];

  let dateFormat;
  switch (group_by) {
    case 'month': dateFormat = "strftime('%Y-%m', created_at)"; break;
    case 'week':  dateFormat = "strftime('%Y-W%W', created_at)"; break;
    default:      dateFormat = "DATE(created_at)";
  }

  const revenue = db.prepare(`
    SELECT ${dateFormat} as period,
      COUNT(*) as total_orders,
      SUM(total) as total_revenue,
      SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END) as paid_revenue,
      SUM(CASE WHEN order_type = 'dine_in' THEN 1 ELSE 0 END) as dine_in,
      SUM(CASE WHEN order_type = 'delivery' THEN 1 ELSE 0 END) as delivery,
      SUM(CASE WHEN order_type = 'takeaway' THEN 1 ELSE 0 END) as takeaway
    FROM orders
    WHERE DATE(created_at) BETWEEN ? AND ? AND status != 'cancelled'
    GROUP BY period ORDER BY period
  `).all(fromDate, toDate);

  const expenses = db.prepare(
    'SELECT SUM(amount) as total FROM expenses WHERE date BETWEEN ? AND ?'
  ).get(fromDate, toDate);

  res.json({ period: { from: fromDate, to: toDate }, revenue, total_expenses: expenses.total || 0 });
});

// GET EXPENSES
router.get('/expenses', authenticate, (req, res) => {
  const db = getDb();
  const { from, to, category, page = 1, limit = 50 } = req.query;

  let query = 'SELECT e.*, u.name as added_by_name FROM expenses e LEFT JOIN users u ON e.added_by = u.id WHERE 1=1';
  const params = [];

  if (from) { query += ' AND e.date >= ?'; params.push(from); }
  if (to)   { query += ' AND e.date <= ?'; params.push(to); }
  if (category) { query += ' AND e.category = ?'; params.push(category); }

  const countQuery = query.replace('SELECT e.*, u.name as added_by_name', 'SELECT COUNT(*) as total');
  const total = db.prepare(countQuery).get(...params).total;

  query += ' ORDER BY e.date DESC, e.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const expenses = db.prepare(query).all(...params);
  res.json({
    expenses,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
  });
});

// ADD EXPENSE
router.post('/expenses', authenticate, (req, res) => {
  const { date, category, description, amount, payment_method } = req.body;
  if (!date || !category || !amount) {
    return res.status(400).json({ error: 'Date, category and amount required' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO expenses (date, category, description, amount, payment_method, added_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(date, category, description || null, amount, payment_method || 'cash', req.user.id);

  res.status(201).json({ message: 'Expense recorded', id: result.lastInsertRowid });
});

// DELETE EXPENSE
router.delete('/expenses/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ message: 'Expense deleted' });
});

module.exports = router;
