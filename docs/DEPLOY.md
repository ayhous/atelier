# Guide de déploiement (Plan B)

**Architecture** : GitHub Pages (frontend) + Render (backend) + Supabase (DB Postgres)
**Coût** : 0 € (free tiers permanents)

---

## Étape 1 — Supabase (la base de données)

1. Créez un compte sur [supabase.com](https://supabase.com) avec votre GitHub
2. **New Project** :
   - Name : `atelier-zone53`
   - Database password : générez un mot de passe **fort** et notez-le
   - Region : **West EU (Ireland)** ou **Central EU (Frankfurt)**
3. Attendez ~2 min que le projet soit prêt
4. **Settings → Database → Connection string → URI** : copiez la chaîne et remplacez `[YOUR-PASSWORD]` par votre mot de passe
5. Notez aussi : Settings → Database → Connection pooling → mode **Transaction** (URL différente, on l'utilise pour Render)

Vous devriez avoir une URL ressemblant à :

```
postgresql://postgres.xxxxx:VOTRE_PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

---

## Étape 2 — Render (le backend)

1. Créez un compte sur [render.com](https://render.com) avec votre GitHub
2. **New + → Web Service**
3. Connectez votre repo GitHub `ayhous/atelier`
4. Configuration :
   - **Name** : `atelier-api`
   - **Region** : Frankfurt
   - **Branch** : `main`
   - **Root Directory** : `backend`
   - **Runtime** : Node
   - **Build Command** : `npm install && npm run migrate`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**

5. **Environment Variables** (cliquer "Add Environment Variable") :

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | la connection string Supabase de l'étape 1 |
   | `JWT_SECRET` | une chaîne aléatoire longue (voir tip ci-dessous) |
   | `CORS_ORIGINS` | `https://ayhous.github.io` |
   | `DEFAULT_ADMIN_USER` | `admin` |
   | `DEFAULT_ADMIN_PASSWORD` | un vrai mot de passe |
   | `DEFAULT_ADMIN_NAME` | `Administrateur` |

   **Tip JWT_SECRET** : générez avec :
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

6. **Create Web Service**
7. Le déploiement prend ~3-5 min. À la fin, vous aurez une URL type `https://atelier-api-xxxx.onrender.com`
8. Testez : ouvrir `https://atelier-api-xxxx.onrender.com/api/health` → doit afficher `{"ok":true}`

---

## Étape 3 — GitHub Pages (le frontend)

### 3a. Activer GitHub Pages

1. Dans votre repo GitHub `ayhous/atelier` → **Settings → Pages**
2. **Source** : **GitHub Actions**

### 3b. Ajouter la variable VITE_API_URL

1. Dans le repo → **Settings → Secrets and variables → Actions**
2. Onglet **Variables** (pas Secrets) → **New repository variable**
3. **Name** : `VITE_API_URL`
4. **Value** : l'URL Render obtenue à l'étape 2 (ex: `https://atelier-api-xxxx.onrender.com`)
5. **Add variable**

### 3c. Déclencher le déploiement

Soit :

- Faites un push sur `main` (n'importe quel changement dans `frontend/`)
- Ou allez dans **Actions** → **Deploy frontend → GitHub Pages** → **Run workflow**

Après ~1-2 min, votre app est en ligne sur :

```
https://ayhous.github.io/atelier/
```

---

## Étape 4 — Mettre à jour CORS

Si l'URL GitHub Pages diffère de ce qui est dans `CORS_ORIGINS`, mettez à jour la variable sur Render et redéployez (Manual Deploy → Deploy latest commit).

---

## Vérifications finales

1. Ouvrir `https://ayhous.github.io/atelier/`
2. ⚠️ Première requête : Render dort, **attendre 30-50 secondes** pour le réveil
3. Login : `admin` / votre mot de passe défini dans `DEFAULT_ADMIN_PASSWORD`
4. Créer une commande de test → doit s'enregistrer dans Supabase
5. Vérifier dans Supabase : Table Editor → `orders` → vous voyez la ligne

---

## Anti-cold-start (optionnel)

Si les 30s d'attente du matin sont gênantes, ajoutez un ping :

### Option : UptimeRobot (gratuit)

1. Créer un compte sur [uptimerobot.com](https://uptimerobot.com)
2. Add New Monitor → HTTP(s)
3. URL : `https://atelier-api-xxxx.onrender.com/api/health`
4. Monitoring Interval : 5 minutes
5. Save

⚠️ Render compte les heures "actives". Avec un ping continu 24/7 vous risquez de dépasser 750h/mois (= service suspendu). Pour rester safe, n'activez le ping que sur les heures de bureau via la fonctionnalité **"Maintenance Windows"** d'UptimeRobot.

---

## Mise à jour de l'application

À chaque `git push` sur `main` :

- **Frontend** : GitHub Actions redéploie automatiquement (visible dans l'onglet Actions)
- **Backend** : Render redéploie automatiquement (visible dans le dashboard Render)

---

## Sauvegardes

Supabase fait des **snapshots quotidiens automatiques** sur le free tier (rétention 7 jours).
Pour un export manuel :

- Supabase Dashboard → SQL Editor → exporter en SQL ou CSV
- Ou via le bouton **Exporter Excel** de l'app (admin uniquement)

---

## Dépannage

**"CORS bloqué"** : vérifier que `CORS_ORIGINS` sur Render contient exactement votre URL GitHub Pages (sans slash final, avec `https://`).

**"Database connection failed"** : vérifier que `DATABASE_URL` est correct et que Supabase n'a pas mis le projet en pause (gratuit = pause après 7 jours d'inactivité, à réactiver dans le dashboard).

**Render déploie mais l'app ne répond pas** : aller dans Render → Logs pour voir l'erreur. Souvent une env var manquante.

**Frontend affiche page blanche** : ouvrir la console du navigateur (F12). Si erreur 404 sur les assets, c'est que `base` dans `vite.config.js` ne correspond pas au nom du repo.
