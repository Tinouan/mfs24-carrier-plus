# Factory System - Documentation Technique

> **Version**: V0.8.1 (Workers V2 + Ingredients Simplification)

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
| `transaction_type` | VARCHAR(20) | `input`, `output`, `waste`, `transfer_in`, `transfer_out` |
| `quantity` | INT | Quantité (négatif = consommation) |
| `batch_id` | UUID | FK → production_batches (optionnel) |
| `notes` | TEXT | Notes |

> **Note V0.8.1**: `input` avec quantité négative = consommation d'ingrédients, `output` = production terminée

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

### 1. Démarrage d'un batch (V0.8.1)

```http
POST /api/factories/{factory_id}/production
{
    "recipe_id": "uuid",
    "quantity": 10
}
```

| Paramètre | Type | Description |
|-----------|------|-------------|
| `recipe_id` | UUID | Recette à produire |
| `quantity` | INT | Nombre de batches (1-1000) |

**Validations:**
1. L'usine appartient à la company du joueur
2. L'usine est en status "idle"
3. Au moins 1 worker assigné (status="working")
4. Ingrédients disponibles dans `company_inventory` @ même aéroport
5. Tier recette <= Tier usine

> **V0.8.1**: Food = 0 ne bloque PAS la production, seulement réduit l'efficacité (30%)

### 2. Calcul temps de production

```
temps_total = temps_par_batch × nombre_de_batches
```

**Exemple:**
- Recette Salted Meat: 3h par batch
- Quantity: 10 batches
- Temps total = 3 × 10 = 30 heures

**Modificateurs (V2):**
- Bonus tier workers: +5% par tier au-dessus de T1 (max +25%)

### 3. Consommation des ingrédients (V0.8.1)

Les ingrédients sont déduits directement de `company_inventory` au même aéroport:

```
quantité_consommée = ingrédient.quantity × nombre_batches
```

**Exemple:**
- Recette: 2× Raw Meat + 1× Raw Salt par batch
- Quantity: 10 batches
- Consommé: 20× Raw Meat + 10× Raw Salt

### 4. Completion automatique

Le scheduler (`batch_completion` job) vérifie toutes les minutes:
- Si `NOW() >= estimated_completion`
- Si oui: status → completed

**Destination des items produits (V0.8.1):**
- Items ajoutés directement à `company_inventory` @ `factory.airport_ident`
- Quantité = `recipe.result_quantity × nombre_batches`

**Transaction log:**
- Type `input` (négatif): consommation ingrédients au démarrage
- Type `output` (positif): production terminée à la completion

### 5. Bonus Tier Workers (V2)

> **V0.8.1**: Plus de système "engineer" séparé. Le bonus est basé sur le tier moyen des workers.

```
tier_bonus = 1.0 + ((avg_tier - 1) × 0.05)
result_qty = base_qty × min(tier_bonus, 1.25)
```

**Exemple:**
- 4 workers tier 3 → avg = 3
- Bonus = 1.0 + (2 × 0.05) = 1.10 (+10%)
- Max bonus: +25%

### 6. Gain XP Workers (V2)

À chaque batch complété:
```
xp_gain = recipe.tier × 10
```

Tous les workers assignés à la factory gagnent cet XP.

---

## Système Food

### Consommation

- 1 unité de food / worker / heure
- Calculé et déduit toutes les heures par le scheduler

### Effets sans nourriture (V0.8.1)

> **Important**: Food = 0 ne bloque PAS la production !

1. **Efficacité réduite à 30%**: Production plus lente
2. **Risque blessure x2**: Chance de blessure doublée
3. **Salaire toujours payé**: Les workers sont quand même payés
4. **Production possible**: Le bouton START reste actif

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

### Production (V0.8.1)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/factories/{id}/production` | Lancer production (recipe_id + quantity) |
| GET | `/api/factories/{id}/production` | Liste batches |
| DELETE | `/api/factories/{id}/production` | Annuler production en cours |

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

### Créer une usine et lancer une production (V0.8.1)

```bash
# 1. Vérifier les slots disponibles
GET /api/world/airports/LFPG/slots

# 2. Créer l'usine
POST /api/factories
{
    "airport_ident": "LFPG",
    "name": "Boulangerie Paris"
}

# 3. Acheter des workers (items dans inventory)
# → Workers sont des items comme les autres

# 4. Assigner les workers à l'usine (V2)
POST /api/workers/v2/{worker_id}/assign
{"factory_id": "..."}

# 5. Avoir les ingrédients en inventory
# → Les ingrédients doivent être dans company_inventory @ LFPG

# 6. (Optionnel) Déposer de la nourriture
POST /api/factories/{id}/food
{"quantity": 50}

# 7. Lancer la production (V0.8.1)
POST /api/factories/{id}/production
{
    "recipe_id": "...",
    "quantity": 10
}
# → Consomme ingrédients × 10 batches
# → Crée batch avec estimated_completion

# 8. Vérifier le status
GET /api/factories/{id}/production

# 9. Voir les produits finis (après completion)
GET /api/inventory/overview
# → Items produits dans container "Production" @ LFPG
```

### Flux Production V0.8.1

```
[Ingrédients]                         [Produits]
company_inventory  ───────►  Factory  ───────►  company_inventory
     @ LFPG           │        T1+          │       @ LFPG
                      │                     │
                 start_production()    complete_batch()
                 (consume × qty)       (output × qty)
```

**Points clés V0.8.1:**
- Ingrédients consommés depuis `company_inventory` (pas factory_storage)
- Multi-batch: `quantity` × ingrédients consommés
- Produits arrivent dans `company_inventory` après completion
- Visible dans `/inventory/overview` comme container "Production"
- Food = 0 réduit efficacité mais ne bloque pas
