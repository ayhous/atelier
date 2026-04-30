import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const VALID_TYPES = ['Zone 53', 'Proforma'];

router.get('/', async (req, res, next) => {
  try {
    const { search, date, type } = req.query;
    const filters = [];
    const params = [];
    let i = 1;

    if (search) {
      filters.push(`(
        order_number ILIKE $${i} OR client ILIKE $${i} OR created_by ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }
    if (type) {
      filters.push(`order_type = $${i++}`);
      params.push(type);
    }
    if (date) {
      filters.push(`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') = $${i++}`);
      params.push(date);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 5000`,
      params,
    );
    res.json({ orders: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { type, orderNumber, client, cartonType, cartonCount, note } = req.body || {};

    if (!orderNumber || !client) {
      return res.status(400).json({ error: 'N° commande et client obligatoires' });
    }
    const orderType = VALID_TYPES.includes(type) ? type : 'Zone 53';
    const count = Math.max(1, Math.min(99, Number(cartonCount) || 1));

    const id = crypto.randomUUID();
    const createdBy = req.user.displayName || req.user.username;

    const { rows } = await pool.query(
      `INSERT INTO orders
        (id, order_type, order_number, client, carton_type, carton_count, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, orderType, orderNumber, client, cartonType || null, count, note || null, createdBy],
    );
    res.status(201).json({ order: rows[0] });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existingResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Commande introuvable' });

    const allowed = ['note', 'cartonType', 'cartonCount', 'client', 'orderNumber', 'type'];
    const map = {
      note: 'note',
      cartonType: 'carton_type',
      cartonCount: 'carton_count',
      client: 'client',
      orderNumber: 'order_number',
      type: 'order_type',
    };

    const updates = [];
    const params = [];
    const historyRows = [];
    const changedBy = req.user.displayName || req.user.username;
    let i = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const col = map[key];
        const newVal = req.body[key];
        if (key === 'type' && !VALID_TYPES.includes(newVal)) continue;
        if (String(existing[col] ?? '') !== String(newVal ?? '')) {
          historyRows.push({ field: col, oldValue: existing[col], newValue: newVal });
        }
        updates.push(`${col} = $${i++}`);
        params.push(newVal);
      }
    }

    if (!updates.length) return res.json({ order: existing });

    updates.push(`updated_at = NOW()`, `updated_by = $${i++}`);
    params.push(changedBy);

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE orders SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      params,
    );

    for (const h of historyRows) {
      await pool.query(
        `INSERT INTO order_history (order_id, field, old_value, new_value, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, h.field, String(h.oldValue ?? ''), String(h.newValue ?? ''), changedBy],
      );
    }

    res.json({ order: rows[0] });
  } catch (e) { next(e); }
});

router.get('/:id/history', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM order_history WHERE order_id = $1 ORDER BY changed_at DESC',
      [req.params.id],
    );
    res.json({ history: rows });
  } catch (e) { next(e); }
});

export default router;
