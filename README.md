# Logistique Zone 53

Application interne warehouse : enregistre chaque commande passant par la Zone 53 ou Proforma,
imprime une étiquette format colis (style DPD/FedEx), et garde une trace inviolable.

## Stack

- **Backend** : Node + Express + PostgreSQL (`pg`) + JWT
- **Frontend** : React (Vite)
- **Hébergement** : GitHub Pages (frontend) + Render (backend) + Supabase (DB) — tous gratuits

---

## Démarrage local

### Prérequis

- Node.js 18+
- Une DB Postgres accessible (Supabase free, Postgres local, ou Docker)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Éditer .env : remplir DATABASE_URL et JWT_SECRET
npm install
npm run migrate    # crée les tables et l'admin par défaut
npm run dev
```

Le serveur tourne sur `http://localhost:4000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Ouvrir `http://localhost:5173`. Login par défaut : `admin` / `admin123`.

---

## Déploiement (Plan B : GitHub Pages + Render + Supabase)

Voir [docs/DEPLOY.md](docs/DEPLOY.md) pour le guide pas à pas.

### Récapitulatif rapide

1. **Supabase** → créer un projet, récupérer la connection string Postgres
2. **Render** → créer un Web Service connecté au repo GitHub :
   - Root Directory : `backend`
   - Build : `npm install && npm run migrate`
   - Start : `npm start`
   - Env vars : `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `DEFAULT_ADMIN_*`
3. **GitHub Pages** → Settings → Pages → source = GitHub Actions
4. **GitHub repo Variables** → ajouter `VITE_API_URL` = URL Render

À chaque `git push main`, le frontend se redéploie automatiquement sur GitHub Pages.

---

## Sécurité avant prod

- [ ] `JWT_SECRET` aléatoire de 64+ caractères
- [ ] `DEFAULT_ADMIN_PASSWORD` changé
- [ ] `CORS_ORIGINS` restreint à votre domaine GitHub Pages
- [ ] DB Supabase : sauvegarde régulière (snapshot Supabase auto, ou export manuel)

## Schéma DB

- `users` : id, username, password_hash, display_name, role, created_at
- `orders` : id, order_type, order_number, client, carton_type, note, created_by, created_at, updated_at, updated_by
- `order_history` : journal des modifications par champ
