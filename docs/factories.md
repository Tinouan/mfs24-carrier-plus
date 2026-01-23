# Factory System - Documentation Technique

## Vue d'ensemble

Le système de factories permet aux joueurs de transformer des matières premières (T0) en produits finis (T1-T5) via des usines industrielles.

---

## Tables SQL

### `game.factories`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `company_id` | UUID | FK → companies |
| `airport_ident` | VARCHAR(4) | Code ICAO aéroport |
| `name` | VARCHAR(100) | Nom de l'usine |
| `tier` | INT (0-5) | Niveau usine (T0=NPC, T1-T5=joueurs) |
| `factory_type` | VARCHAR(50) | Auto-détecté (food_processing, metal_smelting...) |
| `status` | VARCHAR(20) | idle, producing, maintenance, offline |
| `current_recipe_id` | UUID | Recette en cours |
| `is_active` | BOOLEAN | Usine active |
| `max_workers` | INT | Capacité workers (T1=10, T5=50) |
| `max_engineers` | INT | Capacité engineers (T1=2, T5=10) |
| `food_stock` | INT | Stock nourriture actuel |
| `food_capacity` | INT | Capacité max nourriture |
| `food_consumption_per_hour` | DECIMAL | Consommation horaire |

### `game.factory_storage` (Legacy - T0 uniquement)

> **V0.7 Simplifié:** Les factories T1+ n'utilisent plus `factory_storage`. La production va directement dans `company_inventory`.

Inventaire interne de l'usine (utilisé uniquement par T0/NPC).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `factory_id` | UUID | FK → factories |
| `item_id` | UUID | FK → items |
| `quantity` | INT | Quantité en stock |
| `max_capacity` | INT | Capacité max (défaut: 1000) |

### `game.production_batches`

Lots de production en cours/terminés.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `factory_id` | UUID | FK → factories |
| `recipe_id` | UUID | FK → recipes |
| `status` | VARCHAR(20) | pending, in_progress, completed, failed, cancelled |
| `started_at` | TIMESTAMPTZ | Début production |
| `estimated_completion` | TIMESTAMPTZ | Fin estimée |
| `completed_at` | TIMESTAMPTZ | Fin réelle |
| `result_quantity` | INT | Quantité produite |
| `workers_assigned` | INT | Nombre de workers |
| `engineer_bonus_applied` | BOOLEAN | Bonus engineer appliqué |

### `game.factory_transactions`

Historique des mouvements.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `factory_id` | UUID | FK → factories |
| `item_id` | UUID | FK → items |
| `transaction_type` | VARCHAR(20) | input, output, produced, waste |
| `quantity` | INT | Quantité |
| `batch_id` | UUID | FK → production_batches (optionnel) |
| `notes` | TEXT | Notes |

---

## Types d'usines

### T0 - Usines NPC (Matières Premières)

Les usines T0 sont gérées automatiquement par le système et produisent des matières premières:

| Keyword dans nom | Item produit |
|------------------|--------------|
| céréal, agricole | Raw Wheat |
| élevage, boucherie | Raw Meat |
| laiterie, laitière | Raw Milk |
| verger, fruits | Raw Fruits |
| maraîcher, légumes | Raw Vegetables |
| pêcherie, criée | Raw Fish |
| raffinerie | Crude Oil |
| gisement | Natural Gas |
| carrière | Raw Stone |
| mine | Iron Ore |
| minier | Coal |
| bois, forêt | Raw Wood |
| eaux, source | Raw Water |
| sel | Raw Salt |
| sucre | Raw Sugar |

**Paramètres T0:**
- Stock max: 1000 items
- Production: 50 items / 5 minutes
- Items mis en vente automatiquement au marché NPC

### T1-T5 - Usines Joueurs

| Tier | Workers Max | Engineers Max | Recettes Disponibles |
|------|-------------|---------------|---------------------|
| T1 | 10 | 2 | T1 uniquement |
| T2 | 15 | 3 | T1, T2 |
| T3 | 25 | 5 | T1, T2, T3 |
| T4 | 35 | 7 | T1-T4 |
| T5 | 50 | 10 | Toutes |

---

## Mécanique de Production

### 1. Démarrage d'un batch

```http
POST /api/factories/{factory_id}/production/start
{
    "recipe_id": "uuid",
    "workers_assigned": 5
}
```

**Validations:**
1. L'usine appartient à la company du joueur
2. L'usine est en status "idle"
3. Assez de workers disponibles (status="working")
4. Ingrédients disponibles en storage
5. Tier recette <= Tier workers moyens

### 2. Calcul temps de production

```
temps_production = base_time * (200 / sum(worker.speed))
```

**Exemple:**
- Recette: 4h de base
- 5 workers avec speed [55, 60, 50, 45, 58] → total = 268
- Temps = 4 * (200 / 268) = 2.98h

**Modificateurs:**
- Sans nourriture: -50% vitesse (temps x2)
- Avec engineers: pas d'effet sur le temps, mais +bonus output

### 3. Consommation des ingrédients

Les ingrédients sont déduits du `factory_storage` au démarrage du batch.

### 4. Completion automatique

Le scheduler (`batch_completion` job) vérifie toutes les minutes:
- Si `NOW() >= estimated_completion`
- Si oui: status → completed

**Destination des items produits (V0.7 Simplifié):**
- **T1-T5**: Items ajoutés directement à `company_inventory` @ `factory.airport_ident`
- **T0 (NPC)**: Items ajoutés à `inventory_items` via legacy system

### 5. Bonus Engineer

Chaque engineer assigné donne +10% output (max +50%):
- 1 engineer: +10%
- 2 engineers: +20%
- 5 engineers: +50% (cap)

### 6. Gain XP Workers

À chaque batch complété:
```
xp_gain = recipe.tier * 10
```

Les workers gagnent de l'XP, les engineers gagnent le double.

---

## Système Food

### Consommation

- 1 unité de food / worker / heure
- Calculé et déduit toutes les heures par le scheduler

### Effets sans nourriture

1. **Vitesse réduite**: -50% production speed
2. **Risque blessure x2**: Chance de blessure doublée
3. **Salaire toujours payé**: Les workers sont quand même payés

### Endpoints Food

```http
# Déposer de la nourriture
POST /api/factories/{id}/food
{
    "quantity": 100
}

# Status food
GET /api/factories/{id}/food/status
→ {
    "food_stock": 50,
    "food_capacity": 100,
    "food_consumption_per_hour": 5.0,
    "hours_until_empty": 10.0
}
```

---

## Slots Aéroport

Chaque aéroport a un nombre limité de slots pour les usines:

| Type Aéroport | Max Slots |
|---------------|-----------|
| large_airport | 10 |
| medium_airport | 5 |
| small_airport | 2 |
| seaplane_base | 1 |
| heliport | 1 |
| closed | 0 |

**Vérification:**
```http
GET /api/world/airports/{ident}/slots
→ {
    "airport_ident": "LFPG",
    "max_factories_slots": 10,
    "occupied_slots": 3,
    "available_slots": 7
}
```

---

## API Endpoints

### CRUD Factories

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/factories` | Créer une factory |
| GET | `/api/factories` | Liste mes factories |
| GET | `/api/factories/{id}` | Détails factory |
| PATCH | `/api/factories/{id}` | Modifier factory |
| DELETE | `/api/factories/{id}` | Supprimer factory |

### Storage

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/factories/{id}/storage` | Inventaire factory |
| POST | `/api/factories/{id}/storage/deposit` | Déposer items |
| POST | `/api/factories/{id}/storage/withdraw` | Retirer items |

### Production

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/factories/{id}/production/start` | Lancer batch |
| GET | `/api/factories/{id}/batches` | Liste batches |
| GET | `/api/batches/{id}` | Détails batch |
| POST | `/api/batches/{id}/cancel` | Annuler batch |

### Workers

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/factories/{id}/workers` | Workers de la factory |

Voir [workers.md](workers.md) pour la gestion complète des workers.

---

## Scheduler Jobs

| Job | Intervalle | Description |
|-----|------------|-------------|
| `batch_completion` | 1 min | Complète les batches terminés |
| `t0_auto_production` | 5 min | Production NPC T0 |
| `food_and_injuries` | 1 heure | Consommation food + blessures |

---

## Exemples de Flux

### Créer une usine et lancer une production (V0.7 Simplifié)

```bash
# 1. Vérifier les slots disponibles
GET /api/world/airports/LFPG/slots

# 2. Créer l'usine
POST /api/factories
{
    "airport_ident": "LFPG",
    "name": "Boulangerie Paris"
}

# 3. Embaucher des workers (voir workers.md)
POST /api/workers/hire/{company_id}
{"worker_id": "..."}

# 4. Assigner les workers à l'usine
POST /api/workers/{worker_id}/assign
{"factory_id": "..."}

# 5. Déposer des ingrédients
POST /api/factories/{id}/storage/deposit
{"item_id": "...", "quantity": 100}

# 6. Déposer de la nourriture
POST /api/factories/{id}/food
{"quantity": 50}

# 7. Lancer la production
POST /api/factories/{id}/production/start
{"recipe_id": "...", "workers_assigned": 5}

# 8. Vérifier le status
GET /api/factories/{id}/batches

# 9. [V0.7] Voir les produits finis dans company_inventory
GET /inventory/company?airport=LFPG
# → Items produits apparaissent directement ici après completion
```

### Flux Production V0.7 Simplifié

```
[Ingrédients]                    [Produits]
company_inventory    →  Factory  →  company_inventory
     @ LFPG             T1+            @ LFPG
                          ↓
                   complete_batch()
```

**Points clés:**
- Plus besoin de `factory_storage` intermédiaire
- Les produits arrivent directement dans `company_inventory`
- La localisation = aéroport de la factory
