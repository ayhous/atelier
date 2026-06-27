import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

function todoOwnerParams(req) {
  return [req.user.id, req.user.displayName || req.user.username];
}

const TODO_OWNER_WHERE = `(user_id = $1 OR (user_id IS NULL AND created_by = $2))`;

// Liste : pas faits d'abord (par échéance), puis faits (récents en premier)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM todos
      WHERE ${TODO_OWNER_WHERE}
      ORDER BY
        done ASC,
        (CASE WHEN done = FALSE AND due_date IS NULL THEN 1 ELSE 0 END) ASC,
        due_date ASC NULLS LAST,
        created_at DESC
      LIMIT 500
    `, todoOwnerParams(req));
    res.json({ todos: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, dueDate, requestedBy, details } = req.body || {};
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) return res.status(400).json({ error: 'Titre obligatoire' });

    const createdBy = req.user.displayName || req.user.username;
    const { rows } = await pool.query(
      `INSERT INTO todos (user_id, title, details, due_date, requested_by, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, cleanTitle, details || null, dueDate || null, requestedBy || null, createdBy],
    );
    res.status(201).json({ todo: rows[0] });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existingResult = await pool.query(
      `SELECT * FROM todos WHERE id = $3 AND ${TODO_OWNER_WHERE}`,
      [...todoOwnerParams(req), id],
    );
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Tâche introuvable' });

    const fields = ['title', 'details', 'dueDate', 'requestedBy', 'done'];
    const map = {
      title: 'title',
      details: 'details',
      dueDate: 'due_date',
      requestedBy: 'requested_by',
      done: 'done',
    };

    const updates = [];
    const params = [];
    let i = 1;
    let toggledDone = false;
    let newDoneValue = existing.done;

    for (const key of fields) {
      if (req.body[key] !== undefined) {
        const col = map[key];
        let val = req.body[key];
        if (key === 'title') {
          val = (val || '').trim();
          if (!val) return res.status(400).json({ error: 'Titre obligatoire' });
        }
        if (key === 'done') {
          val = Boolean(val);
          if (val !== existing.done) {
            toggledDone = true;
            newDoneValue = val;
          }
        }
        updates.push(`${col} = $${i++}`);
        params.push(val);
      }
    }

    if (toggledDone) {
      updates.push(`completed_at = $${i++}`);
      params.push(newDoneValue ? new Date() : null);
    }

    if (!updates.length) return res.json({ todo: existing });

    params.push(id, ...todoOwnerParams(req));
    const { rows } = await pool.query(
      `UPDATE todos SET ${updates.join(', ')}
       WHERE id = $${i++} AND (user_id = $${i++} OR (user_id IS NULL AND created_by = $${i}))
       RETURNING *`,
      params,
    );
    res.json({ todo: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query(
      `DELETE FROM todos WHERE id = $3 AND ${TODO_OWNER_WHERE}`,
      [...todoOwnerParams(req), id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Tâche introuvable' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
