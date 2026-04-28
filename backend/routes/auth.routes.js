import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiants requis' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
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
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.get('/users', authRequired, adminOnly, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, display_name, role, created_at FROM users ORDER BY username'
  ).all();
  res.json({ users });
});

router.post('/users', authRequired, adminOnly, (req, res) => {
  const { username, password, displayName, role } = req.body || {};
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Champs manquants' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Utilisateur déjà existant' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(username, hash, displayName, role === 'admin' ? 'admin' : 'user');
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/users/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const { username, displayName, role, password } = req.body || {};
  const updates = [];
  const params = { id };

  if (username && username !== user.username) {
    const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
    if (exists) return res.status(409).json({ error: 'Login déjà utilisé' });
    updates.push('username = @username');
    params.username = username;
  }
  if (displayName) {
    updates.push('display_name = @displayName');
    params.displayName = displayName;
  }
  if (role && (role === 'admin' || role === 'user')) {
    if (id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Vous ne pouvez pas retirer votre propre rôle admin' });
    }
    updates.push('role = @role');
    params.role = role;
  }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
    updates.push('password_hash = @hash');
    params.hash = bcrypt.hashSync(password, 10);
  }

  if (!updates.length) return res.json({ user });

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = @id`).run(params);
  const updated = db.prepare(
    'SELECT id, username, display_name, role, created_at FROM users WHERE id = ?'
  ).get(id);
  res.json({ user: updated });
});

router.delete('/users/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (!result.changes) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ ok: true });
});

router.post('/change-password', authRequired, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

export default router;
