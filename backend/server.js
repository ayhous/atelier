import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { migrate, ensureDefaultAdmin } from './migrate.js';
import authRoutes from './routes/auth.routes.js';
import ordersRoutes from './routes/orders.routes.js';

if (!process.env.JWT_SECRET) {
  console.error('[fatal] JWT_SECRET manquant. Copiez .env.example en .env');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('[fatal] DATABASE_URL manquant.');
  process.exit(1);
}

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);

const app = express();
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl, server-to-server
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqué pour ${origin}`));
  },
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  if (err.message?.startsWith('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: 'Erreur serveur' });
});

const port = Number(process.env.PORT) || 4000;

(async () => {
  try {
    await migrate();
    await ensureDefaultAdmin();
    app.listen(port, () => {
      console.log(`[ok] API sur http://localhost:${port}`);
      console.log(`[ok] CORS autorisés: ${allowedOrigins.join(', ')}`);
    });
  } catch (err) {
    console.error('[fatal] Échec du démarrage:', err.message);
    process.exit(1);
  }
})();
