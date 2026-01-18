# Mfs Carrier+ (MSFS 2024)

Backend modulaire pour **Microsoft Flight Simulator 2024** : Auth, Company, Inventory, Fleet, Market, Usines, Missions.
Stack Docker avec **FastAPI + PostgreSQL + Directus + Nginx**.

> Repo : https://github.com/Tinouan/mfs24-carrier-plus

---

## Objectif

Mfs Carrier+ fournit un socle “game backend” utilisable par :
- une **tablette in-game** (UI intégrée MSFS)
- un **admin panel web**
- des services gameplay (marché, usines, missions, logs)

Le backend est **source de vérité** : inventaires, flotte, économie, règles, audit.

---

## Architecture

### Services
- **PostgreSQL** : base unique
  - schéma `public` : données “world / Directus” (ex: airports)
  - schéma `game` : gameplay (users, companies, inventory, fleet…)

- **FastAPI** (`game-api/`)
  - Auth JWT
  - endpoints gameplay
  - tables SQLAlchemy (MVP) créées au startup (migration Alembic plus tard)

- **Directus**
  - gestion world data / admin content

- **Nginx**
  - reverse proxy `/api/` → FastAPI
  - static `/map/`

---

## URLs

- API docs : `http://<host>:8080/api/docs`
- API health : `http://<host>:8080/api/health`
- Directus : `http://<host>:8055`
- Web map : `http://<host>:8080/map/`

---

## Démarrage rapide

### Prérequis
- Docker + Docker Compose
- un fichier `.env` local (non versionné)

### Run
```bash
cp .env.example .env
docker compose up -d
