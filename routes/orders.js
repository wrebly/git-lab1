const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');

// Отримання списку замовлень (тільки для авторизованих)
router.get('/', authenticate, async (req, res) => {
    try {
        const db = getDb();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const totalRow = db.prepare('SELECT COUNT(*) as count FROM orders').get();
        const total = totalRow ? totalRow.count : 0;
        
        const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

        const formattedOrders = orders.map(order => {
            let items = [];
            try {
                items = JSON.parse(order.items_json || '[]');
            } catch (e) {
                items = [];
            }
            return { ...order, items };
        });

        res.json({
            orders: formattedOrders,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Створення замовлення (публічне)
router.post('/', async (req, res) => {
    const { customer_name, phone, items, total } = req.body;

    if (!customer_name || !phone || !items || !total) {
        return res.status(400).json({ error: 'Required fields missing' });
    }

    try {
        const db = getDb();
        const result = db.prepare(`
            INSERT INTO orders (customer_name, phone, items_json, total, status)
            VALUES (?, ?, ?, ?, 'received')
        `).run(customer_name, phone, JSON.stringify(items), total);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Order created' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create order' });
    }
});

module.exports = router;