# Mfs Carrier+

Un mod / backend pour Microsoft Flight Simulator 2024 visant à gérer des entreprises, des flottes, de l’inventaire et des opérations logistiques via une API FastAPI, un CMS Directus, et une interface tablette in-game.

---

## 🧠 Vision

Mfs Carrier+ est un backend modulaire destiné à fournir des services d’entreprise dans un environnement MSFS :
- Authentification JWT
- Gestion de profils utilisateur & sociétés
- Inventaire & localisation d’items
- Gestion de flotte d’aéronefs
- Extensible (usines, marchés, missions, admin panel)

L’objectif est de proposer une **stack complète, évolutive et open-source**, prête pour intégration dans une tablette IG ou application cliente.

---

## 🧱 Architecture

Le projet se compose de plusieurs couches :


- **Directus** : gestion du contenu global (liste d’aéroports, assets, etc.)
- **FastAPI** : backend de logique de jeu (auth, companies, inventory, fleet…)
- **PostgreSQL** : base de données partagée avec 2 schémas (`public`, `game`)
- **Nginx** : reverse proxy pour exposer l’API
- **Clients** : interfaces consommatrices (MSFS mod, tablette, web)

---

## 📦 Roadmap / Versions

### 📌 V0.1 — Core (Terminé)
- Auth JWT
- Company CRUD
- Inventory CRUD
- Fleet CRUD
- Endpoints de base
- Docker Compose + Directus + FastAPI

### 📌 V0.2 — Player Profile
- Endpoint `GET /profile/me`
- Gestion des préférences & crédits

### 📌 V0.3 — Company Profile
- Ajout de métadonnées pour les compagnies
- Logo, description, politique

### 📌 V0.4 — HV/Market
- Places de marché pour acheter/vendre items/avions
- Modèle pricing & taxes

### 📌 V0.5 — Usines
- Création d’entités “usine”
- Production d’items en temps réel

### 📌 V0.6 — Missions / Logistics
- Système de missions
- Transfert d’inventaire entre joueurs/compagnies

### 📌 V0.7 — Admin Panel MVP
- Interface administration
- Monitoring, logs, audits

---

## 🚀 Démarrage rapide (dev)

### ⛴️ Prérequis
- Docker & Docker Compose
- Accès au repository
- variables d’environnement (cf `.env.example`)

### 🧩 Installer
Copier les secrets :
```bash
cp .env.example .env

