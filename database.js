const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tandoor_kitchen.db');
let db;

function initialize() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin' CHECK(role IN ('owner','admin','staff')),
      avatar TEXT,
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tab_key TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL,
      price_label TEXT,
      description TEXT,
      image TEXT,
      is_veg INTEGER DEFAULT 0,
      is_available INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      spice_level INTEGER DEFAULT 1 CHECK(spice_level BETWEEN 0 AND 5),
      display_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      booking_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      guests TEXT NOT NULL,
      dining_pref TEXT,
      special_requests TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','seated','completed','cancelled','no_show')),
      payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','paid','refunded')),
      payment_amount REAL DEFAULT 30,
      staff_notes TEXT,
      confirmed_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (confirmed_by) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      order_type TEXT DEFAULT 'dine_in' CHECK(order_type IN ('dine_in','delivery','takeaway')),
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tax REAL DEFAULT 0,
      delivery_fee REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT DEFAULT 'received' CHECK(status IN ('received','preparing','ready','out_for_delivery','delivered','completed','cancelled')),
      payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash','upi','card','online')),
      payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','paid','refunded')),
      staff_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      receipt_image TEXT,
      added_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (added_by) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Seed default admin
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(
    process.env.ADMIN_DEFAULT_EMAIL || '....@gmail.com'
  );
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(process.env.ADMIN_DEFAULT_PASSWORD || '....', 12);
    db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'owner')`)
      .run('Restaurant Owner', process.env.ADMIN_DEFAULT_EMAIL || '....@gmail.com', hash);
    console.log('✅ Default owner account created');
  }

  // Seed default settings
  const defaultSettings = {
    restaurant_name: 'Tandoor Kitchen',
    tagline: 'Veg & Non-Veg · South Indian · Chinese · Tandoori · Shawarma',
    phone: '+91 72598 53156',
    email: 'info@tandoorkitchen.com',
    address: 'Mangalore - Dharmasthala Hwy, Near M.S. Pai Petrol Pump, Opp. Sahyadri College of Engineering, Adyar, Mangalore, Karnataka 575007',
    opening_time: '12:30',
    closing_time: '23:00',
    is_open: '1',
    reservation_fee: '30',
    delivery_available: '1',
    delivery_fee: '0',
    tax_percentage: '5',
    currency_symbol: '₹',
    google_rating: '4.1',
    total_reviews: '1200'
  };
  const upsertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [key, value] of Object.entries(defaultSettings)) {
    upsertSetting.run(key, value);
  }

  // Seed menu categories
  const catCount = db.prepare('SELECT COUNT(*) as count FROM menu_categories').get();
  if (catCount.count === 0) {
    const categories = [
      { name: 'Veg Soups', tab_key: 'soups', order: 1 },
      { name: 'Chicken Soups', tab_key: 'soups', order: 2 },
      { name: 'Mutton Soups', tab_key: 'soups', order: 3 },
      { name: 'Chinese Veg Starters', tab_key: 'starters', order: 4 },
      { name: 'Tandoori Veg Starters', tab_key: 'starters', order: 5 },
      { name: 'Tandoori Non-Veg Starters', tab_key: 'starters', order: 6 },
      { name: 'Chinese Non-Veg — Chicken', tab_key: 'starters', order: 7 },
      { name: 'Chinese Non-Veg — Mutton', tab_key: 'starters', order: 8 },
      { name: 'Egg Starters', tab_key: 'starters', order: 9 },
      { name: 'Vegetarian Main Course', tab_key: 'mainveg', order: 10 },
      { name: 'Paneer', tab_key: 'mainveg', order: 11 },
      { name: 'Mushroom', tab_key: 'mainveg', order: 12 },
      { name: 'Baby Corn', tab_key: 'mainveg', order: 13 },
      { name: 'Gobi', tab_key: 'mainveg', order: 14 },
      { name: 'Chicken', tab_key: 'mainnonveg', order: 15 },
      { name: 'Mutton', tab_key: 'mainnonveg', order: 16 },
      { name: 'Tandoori Breads', tab_key: 'tandoori', order: 17 },
      { name: 'Shawarma', tab_key: 'tandoori', order: 18 },
      { name: 'Rolls', tab_key: 'tandoori', order: 19 },
      { name: 'Veg Fried Rice & Noodles', tab_key: 'ricebreads', order: 20 },
      { name: 'Non-Veg Fried Rice & Noodles', tab_key: 'ricebreads', order: 21 },
      { name: 'Indian Rice', tab_key: 'ricebreads', order: 22 },
      { name: 'Indian Rice — Non Veg', tab_key: 'ricebreads', order: 23 },
      { name: 'South Indian', tab_key: 'ricebreads', order: 24 },
      { name: 'Juices', tab_key: 'drinks', order: 25 },
      { name: 'Milk Shakes', tab_key: 'drinks', order: 26 },
      { name: 'Ice Creams', tab_key: 'drinks', order: 27 },
      { name: 'Raitha', tab_key: 'drinks', order: 28 }
    ];
    const insertCat = db.prepare(`INSERT INTO menu_categories (name, tab_key, display_order) VALUES (?, ?, ?)`);
    const insertMany = db.transaction((cats) => {
      for (const c of cats) insertCat.run(c.name, c.tab_key, c.order);
    });
    insertMany(categories);
    console.log('✅ Menu categories seeded');
  }

  console.log('✅ Database initialized at', DB_PATH);
  return db;
}

function getDb() {
  if (!db) initialize();
  return db;
}

module.exports = { initialize, getDb };
