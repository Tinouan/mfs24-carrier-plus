# Workers System V0.6 - Documentation Technique

## Vue d'ensemble

Le système Workers V0.6 unifie les workers et engineers dans un seul modèle avec:
- Nationalité et stats basées sur le pays
- Pool de recrutement par aéroport
- Système de blessures et de mort
- Consommation de nourriture
- Salaires horaires

---

## Tables SQL

### `game.workers`

Table principale unifiée pour workers et engineers.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `first_name` | VARCHAR(50) | Prénom |
| `last_name` | VARCHAR(50) | Nom |
| `country_code` | CHAR(2) | Code pays (FR, DE, US...) |
| `worker_type` | VARCHAR(20) | 'worker' ou 'engineer' |
| `speed` | INT (1-100) | Vitesse de travail |
| `resistance` | INT (1-100) | Résistance aux blessures |
| `tier` | INT (1-5) | Niveau (auto-calculé via XP) |
| `xp` | INT | Points d'expérience |
| `hourly_salary` | DECIMAL(10,2) | Salaire horaire |
| `status` | VARCHAR(20) | available, working, injured, dead |
| `injured_at` | TIMESTAMPTZ | Date de blessure |
| `location_type` | VARCHAR(20) | 'airport' ou 'factory' |
| `airport_ident` | VARCHAR(10) | Aéroport de rattachement |
| `factory_id` | UUID | FK → factories (si assigné) |
| `company_id` | UUID | FK → companies (si employé) |

**Contraintes:**
- `tier BETWEEN 1 AND 5`
- `speed BETWEEN 1 AND 100`
- `resistance BETWEEN 1 AND 100`
- `xp >= 0`
- `status IN ('available', 'working', 'injured', 'dead')`
- `location_type IN ('airport', 'factory')`
- `worker_type IN ('worker', 'engineer')`

### `game.country_worker_stats`

Stats de base par nationalité.

| Colonne | Type | Description |
|---------|------|-------------|
| `country_code` | CHAR(2) | PK - Code pays ISO |
| `country_name` | VARCHAR(100) | Nom du pays |
| `base_speed` | INT | Vitesse de base (30-70) |
| `base_resistance` | INT | Résistance de base (30-70) |
| `base_hourly_salary` | DECIMAL(10,2) | Salaire horaire de base |

**42 pays configurés** incluant:

| Pays | Speed | Resistance | Salaire/h |
|------|-------|------------|-----------|
| France (FR) | 55 | 50 | 15€ |
| Germany (DE) | 60 | 50 | 16€ |
| USA (US) | 55 | 52 | 18€ |
| Japan (JP) | 65 | 45 | 22€ |
| China (CN) | 52 | 55 | 6€ |
| India (IN) | 50 | 48 | 4€ |

### `game.worker_xp_thresholds`

Seuils XP pour progression de tier.

| Tier | XP Requis | Nom | Couleur |
|------|-----------|-----|---------|
| 1 | 0 | Novice | gray |
| 2 | 1000 | Apprenti | green |
| 3 | 3000 | Confirmé | blue |
| 4 | 7000 | Expert | purple |
| 5 | 15000 | Maître | gold |

### `game.airport_worker_pools`

Pools de recrutement par aéroport.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `airport_ident` | VARCHAR(10) | Code ICAO |
| `airport_type` | VARCHAR(20) | Type d'aéroport |
| `max_workers` | INT | Capacité max workers |
| `max_engineers` | INT | Capacité max engineers |
| `current_workers` | INT | Workers disponibles |
| `current_engineers` | INT | Engineers disponibles |
| `last_reset_at` | TIMESTAMPTZ | Dernier reset |
| `next_reset_at` | TIMESTAMPTZ | Prochain reset |

**Capacités par type d'aéroport:**

| Type | Workers Max | Engineers Max |
|------|-------------|---------------|
| large_airport | 200 | 20 |
| medium_airport | 100 | 10 |

---

## Cycle de Vie d'un Worker

```
[Pool Aéroport]
     │
     │ POST /workers/hire/{company_id}
     ▼
[Employé Company] (status: available)
     │
     │ POST /workers/{id}/assign
     ▼
[Assigné Factory] (status: working)
     │
     ├─── Production → +XP, risque blessure
     │
     │ POST /workers/{id}/unassign
     ▼
[Retour Company] (status: available)
     │
     │ DELETE /workers/{id}
     ▼
[Retour Pool] ou supprimé si dead
```

---

## Génération des Workers

### Formule de génération

Quand un pool est rafraîchi, les workers sont générés avec:

```python
# Stats de base du pays de l'aéroport
base_speed = country_stats.base_speed
base_resistance = country_stats.base_resistance
base_salary = country_stats.base_hourly_salary

# Variation ±20% pour workers
speed = base_speed * random(0.8, 1.2)
resistance = base_resistance * random(0.8, 1.2)
salary = base_salary * random(0.9, 1.1)

# Engineers: stats légèrement meilleures, salaire x2
speed = base_speed * random(0.9, 1.3)
resistance = base_resistance * random(0.9, 1.3)
salary = base_salary * 2.0 * random(0.9, 1.1)
```

### Exemple - LFPG (Paris CDG)

L'aéroport LFPG est en France (iso_country=FR).
Stats France: speed=55, resistance=50, salary=15€

Workers générés:
- Speed: 44-66 (55 ± 20%)
- Resistance: 40-60 (50 ± 20%)
- Salaire: 13.50€-16.50€ (15€ ± 10%)

Engineers générés:
- Speed: 49-72 (55 ± 30% vers le haut)
- Resistance: 45-65 (50 ± 30% vers le haut)
- Salaire: 27€-33€ (15€ × 2 ± 10%)

---

## Système de Blessures

### Risque de blessure

```python
base_injury_chance = 0.005  # 0.5% par heure

# Sans nourriture: risque x2
if not has_food:
    base_injury_chance *= 2

# Resistance réduit le risque
injury_chance = base_injury_chance * (100 - worker.resistance) / 100

# Exemple: worker avec resistance=60, sans food
# 0.01 * (100 - 60) / 100 = 0.004 = 0.4% par heure
```

### Récupération et mort

| Durée blessure | État |
|----------------|------|
| 0-10 jours | Blessé (peut récupérer) |
| >10 jours | Mort |

**Conséquences de la mort:**
- Worker supprimé de la company/factory
- **Pénalité**: -10,000 crédits pour la company

### Guérison

Les workers blessés peuvent guérir naturellement (implémentation future) ou via des soins médicaux.

---

## Système de Salaires

### Paiement horaire

Toutes les heures, le scheduler paie les salaires:

```python
for company in companies_with_workers:
    total_salary = sum(worker.hourly_salary for worker in company.workers)
    company.balance -= total_salary
```

**Important:** Les salaires sont payés même si:
- Les workers n'ont pas de nourriture
- Les workers sont en status "available" (non assignés)
- Seuls les workers "working" ou "available" sont payés
- Les workers "injured" ou "dead" ne sont pas payés

---

## API Endpoints

### Pools de Recrutement

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/workers/pools` | Liste tous les pools |
| GET | `/workers/pool/{airport_ident}` | Détails pool avec workers dispo |

**Paramètres /pools:**
- `airport_type`: Filtrer par type (large_airport, medium_airport)
- `has_workers`: Seulement les pools avec workers disponibles
- `limit`: Nombre max de résultats (1-1000)

**Réponse /pool/{airport}:**
```json
{
    "airport_ident": "LFPG",
    "airport_name": "Paris CDG",
    "max_workers": 200,
    "max_engineers": 20,
    "available_workers": [
        {
            "id": "uuid",
            "first_name": "Jean",
            "last_name": "Martin",
            "country_code": "FR",
            "worker_type": "worker",
            "tier": 1,
            "speed": 58,
            "resistance": 47,
            "hourly_salary": 14.85
        }
    ],
    "available_engineers": [...]
}
```

### Embauche

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/workers/hire/{company_id}` | Embaucher 1 worker |
| POST | `/workers/hire-bulk/{company_id}` | Embaucher plusieurs (max 10) |

**Body hire:**
```json
{"worker_id": "uuid-du-worker"}
```

**Body hire-bulk:**
```json
{"worker_ids": ["uuid1", "uuid2", "uuid3"]}
```

### Assignation aux Factories

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/workers/{id}/assign` | Assigner à une factory |
| POST | `/workers/{id}/unassign` | Retirer de la factory |

**Body assign:**
```json
{"factory_id": "uuid-de-la-factory"}
```

### Licenciement

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| DELETE | `/workers/{id}` | Licencier (retour au pool) |

### Consultation

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/workers/{id}` | Détails d'un worker |
| GET | `/workers/company/{id}` | Workers d'une company |
| GET | `/workers/factory/{id}` | Workers d'une factory |
| GET | `/workers/countries` | Stats par pays |
| GET | `/workers/country/{code}` | Stats d'un pays |

### Admin (DEV)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/workers/admin/generate-pool/{airport}` | Générer workers pour un pool |

---

## Scheduler Jobs

| Job | Intervalle | Description |
|-----|------------|-------------|
| `food_and_injuries` | 1 heure | Consomme food, check blessures |
| `salary_payments` | 1 heure | Paie les salaires |
| `injury_processing` | 1 heure | Traite workers blessés (mort après 10j) |
| `pool_reset` | 6 heures | Régénère les pools d'aéroports |
| `dead_workers_cleanup` | 24 heures | Supprime workers morts >30j |

---

## Différences Worker vs Engineer

| Aspect | Worker | Engineer |
|--------|--------|----------|
| Role | Production directe | Bonus production |
| Capacité factory | max_workers | max_engineers |
| Ratio | ~10:1 | ~1:10 |
| Salaire | 1x base | 2x base |
| XP gain | Normal | Double |
| Bonus | Via speed | +10% output par engineer |

---

## Exemples de Flux

### Recruter et assigner des workers

```bash
# 1. Voir les workers disponibles à Paris CDG
GET /workers/pool/LFPG

# 2. Embaucher un worker
POST /workers/hire/my-company-id
{"worker_id": "worker-uuid"}

# 3. Voir mes workers
GET /workers/company/my-company-id

# 4. Assigner à ma factory
POST /workers/{worker-id}/assign
{"factory_id": "my-factory-id"}

# 5. Vérifier les workers de la factory
GET /workers/factory/my-factory-id
```

### Gérer la nourriture

```bash
# 1. Vérifier le status food de la factory
GET /factories/{id}/food/status

# 2. Déposer de la nourriture
POST /factories/{id}/food
{"quantity": 100}

# Note: 1 worker consomme 1 food/heure
# 10 workers = 240 food/jour
```

### Licencier un worker

```bash
# Le worker retourne au pool de son aéroport d'origine
DELETE /workers/{worker-id}
```
