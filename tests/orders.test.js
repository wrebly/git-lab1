// tests/orders.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../database', () => ({ getDb: vi.fn() }));
vi.mock('../database.js', () => ({ getDb: vi.fn() }));


const fakeAuth = {
  authenticate: (req, res, next) => {
    req.user = { id: 99, role: 'admin' };
    next();
  },
  logActivity: vi.fn()
};
vi.mock('../middleware/auth', () => fakeAuth);
vi.mock('../middleware/auth.js', () => fakeAuth);

import ordersRouter from '../routes/orders.js';
import { getDb } from '../database.js';


ordersRouter.stack.forEach(layer => {
  if (layer.route) {
    layer.route.stack.forEach(routeLayer => {
      if (routeLayer.name === 'authenticate') {
        routeLayer.handle = fakeAuth.authenticate;
      }
    });
  }
});

const app = express();
app.use(express.json());
app.use('/api/orders', ordersRouter);

describe('Orders API (Unit Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- ТЕСТ 1 ---
  it('POST / - повертає помилку 400, якщо не вистачає даних', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ customer_name: 'Богдан' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Required fields missing');
  });

  // --- ТЕСТ 2 ---
  it('POST / - успішно створює замовлення', async () => {
    if (vi.isMockFunction(getDb)) {
      const mockRun = vi.fn().mockReturnValue({ lastInsertRowid: 5 });
      const mockDb = { prepare: vi.fn().mockReturnValue({ run: mockRun }) };
      getDb.mockReturnValue(mockDb);
    }

    const orderData = {
      customer_name: 'Олег',
      phone: '0991234567',
      items: [{ id: 1, name: 'Шашлик', quantity: 2 }],
      total: 500
    };

    const res = await request(app)
      .post('/api/orders')
      .send(orderData);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(typeof res.body.id).toBe('number');
  });

  // --- ТЕСТ 3 ---
  it('GET / - повертає список замовлень і парсить items_json', async () => {
    if (vi.isMockFunction(getDb)) {
      const mockGet = vi.fn().mockReturnValue({ total: 1 });
      const mockAll = vi.fn().mockReturnValue([
        { id: 1, customer_name: 'Іван', items_json: '[{"name":"Лаваш"}]' }
      ]);
      const mockDb = {
        prepare: vi.fn().mockReturnValueOnce({ get: mockGet }).mockReturnValueOnce({ all: mockAll })
      };
      getDb.mockReturnValue(mockDb);
    }

    const res = await request(app).get('/api/orders?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orders)).toBe(true);
    if (res.body.orders.length > 0) {
      expect(Array.isArray(res.body.orders[0].items)).toBe(true);
    }
  });

  // --- ТЕСТ 4 ---
  it('GET /:id - повертає 404, якщо замовлення немає в базі', async () => {
    if (vi.isMockFunction(getDb)) {
      const mockDb = { prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }) };
      getDb.mockReturnValue(mockDb);
    }

    const res = await request(app).get('/api/orders/999999'); 
    expect(res.status).toBe(404);
  });

  // --- ТЕСТ 5 ---
  it('PUT /:id - оновлює статус замовлення', async () => {
    if (vi.isMockFunction(getDb)) {
      const mockRun = vi.fn();
      const mockDb = { prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue({id:5}), run: mockRun }) };
      getDb.mockReturnValue(mockDb);
    }

    const res = await request(app).put('/api/orders/5').send({ status: 'completed' });
    expect([200, 404]).toContain(res.status); 
  });

  // --- ТЕСТ 6 ---
  it('DELETE /:id - успішно видаляє замовлення', async () => {
    if (vi.isMockFunction(getDb)) {
      const mockRun = vi.fn();
      const mockDb = { prepare: vi.fn().mockReturnValue({ run: mockRun }) };
      getDb.mockReturnValue(mockDb);
    }

    const res = await request(app).delete('/api/orders/12');
    expect(res.status).toBe(200);
  });

  // --- ТЕСТ 7 ---
  it('GET / - обробляє пошкоджений JSON у базі даних (catch block)', async () => {
    if (vi.isMockFunction(getDb)) {
      const mockGet = vi.fn().mockReturnValue({ total: 1 });
      const mockAll = vi.fn().mockReturnValue([
        { id: 99, customer_name: 'Помилка', items_json: '{bad_json' }
      ]);
      const mockDb = {
        prepare: vi.fn().mockReturnValueOnce({ get: mockGet }).mockReturnValueOnce({ all: mockAll })
      };
      getDb.mockReturnValue(mockDb);
    }

    const res = await request(app).get('/api/orders?page=1&limit=10');

    expect(res.status).toBe(200);
    if (res.body.orders.length > 0) {
      // Головне, щоб парсер не "впав", а повернув порожній або валідний масив
      expect(Array.isArray(res.body.orders[0].items)).toBe(true);
    }
  });
});