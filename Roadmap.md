## V0.1 — Core (DONE)

- [x] Docker stack : Postgres + Directus + Nginx + FastAPI
- [x] Auth JWT (`/api/auth/*`, `/api/me`)
- [x] Company + members
- [x] Inventory (vault + warehouses)
- [x] Fleet (company_aircraft)
- [x] API docs via `/api/docs`

---

## V0.2 — Player Profile

### Objectif
Créer un profil joueur persistant (préférences + progression minimale).

### DB
- [ ] Table `game.player_profiles`
  - id (uuid, pk)
  - user_id (uuid, unique, fk users)
  - display_name
  - home_airport_ident (optionnel)
  - created_at / updated_at

### API
- [ ] `GET /api/profile/me`
- [ ] `PATCH /api/profile/me`
- [ ] Validation Pydantic (tailles, formats)
- [ ] Audit logs (create/update)

### DoD
- [ ] Tests API (happy path + erreurs)
- [ ] Documentation endpoints (OpenAPI ok)
- [ ] Aucun breaking change sur V0.1

---

## V0.3 — Company Profile

### Objectif
Donner une identité et des paramètres à la company.

- [ ] Champs company : name, description, logo_url, tax_rate (optionnel)
- [ ] Endpoint update profil company (RBAC owner/admin)
- [ ] Audit logs

---

## V0.4 — Market / HV

### Objectif
Mettre en place un hôtel des ventes central.

- [ ] Tables : market_orders, market_trades, wallet_transactions
- [ ] Money model : wallet + taxes + fees
- [ ] Pagination + filtres
- [ ] Anti-abus : price bands, cooldowns, rate limiting
- [ ] Admin actions : freeze/cancel (limité)

---

## V0.5 — Usines

### Objectif
Production d’items avec timers.

- [ ] Table `factories`
- [ ] Table `factory_production`
- [ ] Tick production (cron/worker)
- [ ] Buff nourriture (qualité + variété, cap)

---

## V0.6 — Missions / Logistics

### Objectif
Créer un gameplay “transport / supply chain”.

- [ ] Mission generator
- [ ] Claim/validation vol (takeoff+landing)
- [ ] Inventory in-transit lock
- [ ] Rewards / XP / money

---

## V0.7 — Admin Panel MVP

### Objectif
Outils de modération + monitoring.

- [ ] RBAC admin/mod
- [ ] Audit log viewer
- [ ] Market moderation
- [ ] Review flight_claims
- [ ] Config (taxes, cooldowns, thresholds)
