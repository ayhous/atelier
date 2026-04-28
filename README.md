# Traçabilité Zone 53

Application interne warehouse : enregistrer chaque commande passant par la Zone 53,
imprimer une étiquette Zebra, et garder une trace inviolable (qui, quoi, quand).

## Stack

- **Backend** : Node.js + Express + SQLite (via `better-sqlite3`) + JWT
- **Frontend** : React (Vite) + xlsx pour l'export
- **DB** : 1 fichier `backend/data/warehouse.db` — sauvegarde = copier ce fichier

## Démarrage

### Prérequis
- Node.js 18+ ([nodejs.org](https://nodejs.org))

### 1. Backend

```bash
cd backend
copy .env.example .env       # Windows
# cp .env.example .env       # Linux/Mac
npm install
npm run dev
```

Le serveur démarre sur `http://localhost:4000`.
Au premier lancement, un admin par défaut est créé :
- **utilisateur** : `admin`
- **mot de passe** : `admin123`

> ⚠️ Changez ce mot de passe immédiatement (variable `DEFAULT_ADMIN_PASSWORD` dans `.env`,
> ou via l'API `/api/auth/change-password` plus tard).
> Modifiez aussi `JWT_SECRET` avec une chaîne longue et aléatoire.

### 2. Frontend

Dans un autre terminal :

```bash
cd frontend
npm install
npm run dev
```

Ouvrir `http://localhost:5173`. Les appels `/api/*` sont automatiquement
proxifiés vers le backend.

## Mise en production sur le PC du warehouse

Option simple (machine unique) :

1. `cd frontend && npm run build` → produit `frontend/dist/`
2. Servir `dist/` depuis le backend, ou avec `npx serve dist`
3. Mettre le backend en service Windows avec `pm2` ou `nssm`
4. Sauvegarde quotidienne : copie de `backend/data/warehouse.db` vers un partage réseau

Option multi-postes : tous les PC du warehouse ouvrent la même URL pointant
vers le serveur du backend.

## Comptes utilisateurs

- L'admin peut créer des utilisateurs via le bouton **Utilisateurs** en haut.
- Deux rôles : `admin` (gère les comptes) et `user` (saisie + consultation).
- Toute saisie est tracée avec le nom de l'utilisateur connecté et la date/heure serveur.

## Étiquettes Zebra

Deux modes (au choix dans la colonne *Actions* du tableau) :

- **Imprimer** : ouvre une fenêtre HTML format 100×60 mm avec impression
  immédiate (Ctrl+P automatique). La Zebra doit être installée comme imprimante Windows.
- **ZPL** : génère le code natif Zebra à coller dans *Zebra Setup Utilities*
  (premier déploiement) ou à envoyer plus tard via le SDK BrowserPrint.

## Schéma de la base

- `users` : id, username, password_hash, display_name, role
- `orders` : id, order_number, at_number, client, carton_type, carton_count,
  status, note, created_by, created_at, updated_at, updated_by
- `order_history` : journal des modifications par champ

## Évolutions possibles

- Scanner code-barres USB (douchette) : déjà compatible — la douchette tape le
  numéro dans le champ "N° commande" comme un clavier
- Photo du carton (caméra USB) en cas de litige
- Tableau de bord : stats par AT, par jour, par utilisateur
- Confirmation atelier via lien/QR
- Zebra BrowserPrint pour impression directe sans Ctrl+P
- Synchronisation Active Directory pour le login

## Sécurité — checklist avant prod

- [ ] Changer `JWT_SECRET` dans `backend/.env` (chaîne aléatoire de 64+ caractères)
- [ ] Changer le mot de passe admin par défaut
- [ ] Sauvegarder régulièrement `backend/data/warehouse.db`
- [ ] Mettre le backend derrière HTTPS si exposé hors LAN
