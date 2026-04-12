const express = require('express');
const { getDb } = require('../database');
const { authenticate, logActivity } = require('../middleware/auth');
const router = express.Router();

router.get('/public', (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM menu_categories WHERE is_active=1 ORDER BY display_order').all();
  const items = db.prepare(`SELECT mi.*,mc.name as category_name,mc.tab_key FROM menu_items mi JOIN menu_categories mc ON mi.category_id=mc.id WHERE mi.is_available=1 AND mc.is_active=1 ORDER BY mc.display_order,mi.display_order`).all();
  const menu = {};
  for (const cat of categories) { if (!menu[cat.tab_key]) menu[cat.tab_key]=[]; menu[cat.tab_key].push({...cat,items:items.filter(i=>i.category_id===cat.id)}); }
  res.json({ categories, items, menu });
});

router.get('/categories', authenticate, (req, res) => {
  const db = getDb();
  const categories = db.prepare(`SELECT mc.*,COUNT(mi.id) as item_count FROM menu_categories mc LEFT JOIN menu_items mi ON mc.id=mi.category_id GROUP BY mc.id ORDER BY mc.display_order`).all();
  res.json({ categories });
});

router.post('/categories', authenticate, (req, res) => {
  const { name, tab_key, display_order } = req.body;
  if (!name || !tab_key) return res.status(400).json({ error: 'Name and tab key required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO menu_categories (name,tab_key,display_order) VALUES (?,?,?)').run(name,tab_key,display_order||0);
  logActivity(req.user.id,'category_created','menu_category',result.lastInsertRowid,name,req.ip);
  res.status(201).json({ message: 'Category created', id: result.lastInsertRowid });
});

router.put('/categories/:id', authenticate, (req, res) => {
  const { name, tab_key, display_order, is_active } = req.body;
  const db = getDb();
  db.prepare(`UPDATE menu_categories SET name=COALESCE(?,name),tab_key=COALESCE(?,tab_key),display_order=COALESCE(?,display_order),is_active=COALESCE(?,is_active) WHERE id=?`).run(name||null,tab_key||null,display_order??null,is_active??null,req.params.id);
  res.json({ message: 'Category updated' });
});

router.delete('/categories/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM menu_categories WHERE id=?').run(req.params.id);
  res.json({ message: 'Category deleted' });
});

router.get('/items', authenticate, (req, res) => {
  const db = getDb();
  const { category_id, search, available } = req.query;
  let query = `SELECT mi.*,mc.name as category_name,mc.tab_key FROM menu_items mi JOIN menu_categories mc ON mi.category_id=mc.id WHERE 1=1`;
  const params = [];
  if (category_id) { query+=' AND mi.category_id=?'; params.push(category_id); }
  if (search) { query+=' AND mi.name LIKE ?'; params.push('%'+search+'%'); }
  if (available!==undefined) { query+=' AND mi.is_available=?'; params.push(parseInt(available)); }
  query+=' ORDER BY mc.display_order,mi.display_order';
  const items = db.prepare(query).all(...params);
  res.json({ items, total: items.length });
});

router.post('/items', authenticate, (req, res) => {
  const { category_id, name, price, price_label, description, is_veg, is_featured, spice_level, display_order } = req.body;
  if (!category_id || !name) return res.status(400).json({ error: 'Category and name required' });
  const db = getDb();
  const result = db.prepare(`INSERT INTO menu_items (category_id,name,price,price_label,description,is_veg,is_featured,spice_level,display_order) VALUES (?,?,?,?,?,?,?,?,?)`).run(category_id,name,price||null,price_label||null,description||null,is_veg||0,is_featured||0,spice_level||1,display_order||0);
  logActivity(req.user.id,'item_created','menu_item',result.lastInsertRowid,name,req.ip);
  res.status(201).json({ message: 'Menu item created', id: result.lastInsertRowid });
});

router.put('/items/:id', authenticate, (req, res) => {
  const { category_id, name, price, price_label, description, is_veg, is_available, is_featured, spice_level, display_order } = req.body;
  const db = getDb();
  db.prepare(`UPDATE menu_items SET category_id=COALESCE(?,category_id),name=COALESCE(?,name),price=COALESCE(?,price),price_label=COALESCE(?,price_label),description=COALESCE(?,description),is_veg=COALESCE(?,is_veg),is_available=COALESCE(?,is_available),is_featured=COALESCE(?,is_featured),spice_level=COALESCE(?,spice_level),display_order=COALESCE(?,display_order),updated_at=datetime('now') WHERE id=?`).run(category_id||null,name||null,price??null,price_label||null,description||null,is_veg??null,is_available??null,is_featured??null,spice_level??null,display_order??null,req.params.id);
  res.json({ message: 'Menu item updated' });
});

router.patch('/items/:id/toggle', authenticate, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT is_available FROM menu_items WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const newStatus = item.is_available ? 0 : 1;
  db.prepare('UPDATE menu_items SET is_available=?,updated_at=datetime("now") WHERE id=?').run(newStatus,req.params.id);
  res.json({ message: newStatus?'Item available':'Item unavailable', is_available: newStatus });
});

router.delete('/items/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM menu_items WHERE id=?').run(req.params.id);
  logActivity(req.user.id,'item_deleted','menu_item',req.params.id,null,req.ip);
  res.json({ message: 'Menu item deleted' });
});

module.exports = router;
