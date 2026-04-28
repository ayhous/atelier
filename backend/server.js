import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ensureDefaultAdmin } from './db.js';
import authRoutes from './routes/auth.routes.js';
import ordersRoutes from './routes/orders.routes.js';

if (!process.env.JWT_SECRET) {
  console.error('[fatal] JWT_SECRET manquant. Copiez .env.example en .env');
  process.exit(1);
}

ensureDefaultAdmin();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`[ok] API sur http://localhost:${port}`);
});
