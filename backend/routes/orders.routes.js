import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const { search, date } = req.query;
  const filters = [];
  const params = {};

  if (search) {
    filters.push(`(
      order_number LIKE @q OR client LIKE @q OR created_by LIKE @q
    )`);
    params.q = `%${search}%`;
  }
  if (date) { filters.push("substr(created_at, 1, 10) = @date"); params.date = date; }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.prepare(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 5000`
  ).all(params);

  res.json({ orders: rows });
});

router.post('/', (req, res) => {
  const { orderNumber, client, cartonType, note } = req.body || {};

  if (!orderNumber || !client) {
    return res.status(400).json({ error: 'N° commande et client obligatoires' });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO orders
    (id, order_number, client, carton_type, note, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, orderNumber, client,
    cartonType || null, note || null,
    req.user.displayName || req.user.username,
    now,
  );

  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.status(201).json({ order: row });
});

router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Commande introuvable' });

  const allowed = ['note', 'cartonType', 'client', 'orderNumber'];
  const map = {
    note: 'note',
    cartonType: 'carton_type',
    client: 'client',
    orderNumber: 'order_number',
  };

  const updates = [];
  const params = { id };
  const historyRows = [];
  const changedBy = req.user.displayName || req.user.username;

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const col = map[key];
      const newVal = req.body[key];
      if (String(existing[col] ?? '') !== String(newVal ?? '')) {
        historyRows.push({
          field: col, oldValue: existing[col], newValue: newVal,
        });
      }
      updates.push(`${col} = @${key}`);
      params[key] = newVal;
    }
  }

  if (!updates.length) return res.json({ order: existing });

  const now = new Date().toISOString();
  updates.push('updated_at = @updatedAt', 'updated_by = @updatedBy');
  params.updatedAt = now;
  params.updatedBy = changedBy;

  db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = @id`).run(params);

  const histStmt = db.prepare(`
    INSERT INTO order_history (order_id, field, old_value, new_value, changed_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const h of historyRows) {
    histStmt.run(id, h.field, String(h.oldValue ?? ''), String(h.newValue ?? ''), changedBy);
  }

  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.json({ order: row });
});

router.get('/:id/history', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM order_history WHERE order_id = ? ORDER BY changed_at DESC'
  ).all(req.params.id);
  res.json({ history: rows });
});

export default router;
