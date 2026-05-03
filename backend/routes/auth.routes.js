import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Identifiants requis' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1', [username]
    );
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({
      token,
      user: {
        id: user.id, username: user.username,
        role: user.role, displayName: user.display_name,
      },
    });
  } catch (e) { next(e); }
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.get('/users', authRequired, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, display_name, role, avatar, created_at FROM users ORDER BY username'
    );
    res.json({ users: rows });
  } catch (e) { next(e); }
});

// Map léger displayName -> avatar, accessible à tout user authentifié
// (pour afficher les avatars dans la liste des commandes).
router.get('/avatars', authRequired, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT display_name, avatar FROM users');
    const map = {};
    for (const r of rows) map[r.display_name] = r.avatar || null;
    res.json({ avatars: map });
  } catch (e) { next(e); }
});

function validateAvatar(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('Avatar invalide');
  if (!value.startsWith('data:image/')) throw new Error('Avatar invalide');
  // Base64 pesé : ~1.37 octets par caractère ; on cap à ~200KB de base64 (= ~150KB image)
  if (value.length > 200_000) throw new Error('Avatar trop volumineux');
  return value;
}

router.post('/users', authRequired, adminOnly, async (req, res, next) => {
  try {
    const { username, password, displayName, role, avatar } = req.body || {};
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Champs manquants' });
    }
    let avatarValue;
    try { avatarValue = validateAvatar(avatar); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows.length) return res.status(409).json({ error: 'Utilisateur déjà existant' });

    const hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, display_name, role, avatar) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [username, hash, displayName, role === 'admin' ? 'admin' : 'user', avatarValue]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (e) { next(e); }
});

router.patch('/users/:id', authRequired, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const { username, displayName, role, password, avatar } = req.body || {};
    const updates = [];
    const params = [];
    let i = 1;

    if (avatar !== undefined) {
      // null ou '' = suppression de l'avatar
      let avatarValue;
      try { avatarValue = validateAvatar(avatar); }
      catch (e) { return res.status(400).json({ error: e.message }); }
      updates.push(`avatar = $${i++}`);
      params.push(avatarValue);
    }

    if (username && username !== user.username) {
      const dup = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2', [username, id]
      );
      if (dup.rows.length) return res.status(409).json({ error: 'Login déjà utilisé' });
      updates.push(`username = $${i++}`);
      params.push(username);
    }
    if (displayName) {
      updates.push(`display_name = $${i++}`);
      params.push(displayName);
    }
    if (role && (role === 'admin' || role === 'user')) {
      if (id === req.user.id && role !== 'admin') {
        return res.status(400).json({ error: 'Vous ne pouvez pas retirer votre propre rôle admin' });
      }
      updates.push(`role = $${i++}`);
      params.push(role);
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
      updates.push(`password_hash = $${i++}`);
      params.push(bcrypt.hashSync(password, 10));
    }

    if (!updates.length) return res.json({ user });

    params.push(id);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, params
    );
    const updated = await pool.query(
      'SELECT id, username, display_name, role, avatar, created_at FROM users WHERE id = $1', [id]
    );
    res.json({ user: updated.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/users/:id', authRequired, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/change-password', authRequired, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
    }
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
