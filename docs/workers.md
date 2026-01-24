# Workers System V2 - Documentation Technique

## Vue d'ensemble

Le systeme Workers V2 transforme les workers en **items individuels** avec stats uniques:
- Chaque worker est une instance unique avec ses propres stats
- Workers sont des items achetables (Worker-FR, Worker-CN, etc.)
- Stats generees aleatoirement selon la nationalite (±20%)
- Integration avec l'inventaire company
- Visible dans la vue Inventaire globale

---

## Tables SQL

### `game.worker_instances` (V2 - ACTIF)

Table principale pour les workers item-based.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Cle primaire |
| `owner_company_id` | UUID | FK -> companies (proprietaire) |
| `owner_player_id` | UUID | FK -> users (proprietaire alternatif) |
| `item_id` | UUID | FK -> items (Worker-XX item) |
| `airport_ident` | VARCHAR(8) | Aeroport de localisation |
| `country_code` | CHAR(2) | Code pays (FR, DE, US...) |
| `speed` | INT (1-100) | Vitesse de travail |
| `resistance` | INT (1-100) | Resistance aux blessures |
| `xp` | INT | Points d'experience |
| `tier` | INT (1-5) | Niveau (auto-calcule via XP) |
| `hourly_salary` | DECIMAL(10,2) | Salaire horaire |
| `status` | VARCHAR(20) | available, working, injured, dead |
| `factory_id` | UUID | FK -> factories (si assigne) |
| `for_sale` | BOOLEAN | En vente sur HV |
| `sale_price` | DECIMAL(12,2) | Prix de vente HV |
| `injured_at` | TIMESTAMPTZ | Date de blessure |
| `created_at` | TIMESTAMPTZ | Date creation |
| `updated_at` | TIMESTAMPTZ | Date MAJ |

**Contraintes:**
- `speed BETWEEN 1 AND 100`
- `resistance BETWEEN 1 AND 100`
- `xp >= 0`
- `tier BETWEEN 1 AND 5`
- `hourly_salary > 0`
- `status IN ('available', 'working', 'injured', 'dead')`

### `game.items` - Worker Items (42 types)

Chaque pays a un item Worker-XX correspondant.

| Item Name | Categorie | Tier | Description |
|-----------|-----------|------|-------------|
| Worker-FR | Worker | 0 | Worker francais |
| Worker-DE | Worker | 0 | Worker allemand |
| Worker-US | Worker | 0 | Worker americain |
| Worker-CN | Worker | 0 | Worker chinois |
| ... | ... | ... | 42 pays au total |

### `game.country_worker_stats`

Stats de base par nationalite pour la generation.

| Colonne | Type | Description |
|---------|------|-------------|
| `country_code` | CHAR(2) | PK - Code pays ISO |
| `country_name` | VARCHAR(100) | Nom du pays |
| `base_speed` | INT | Vitesse de base (30-70) |
| `base_resistance` | INT | Resistance de base (30-70) |
| `base_hourly_salary` | DECIMAL(10,2) | Salaire horaire de base |

**Exemples de stats par pays:**

| Pays | Speed | Resistance | Salaire/h |
|------|-------|------------|-----------|
| France (FR) | 55 | 50 | 15$ |
| Germany (DE) | 60 | 50 | 16$ |
| USA (US) | 55 | 52 | 18$ |
| Japan (JP) | 65 | 45 | 22$ |
| China (CN) | 52 | 55 | 6$ |
| India (IN) | 50 | 48 | 4$ |

---

## Cycle de Vie d'un Worker V2

```
[Achat/Creation]
     |
     | game.create_worker_instance()
     v
[Inventaire Company] (status: available, factory_id: NULL)
     |
     | POST /workers/v2/{id}/assign
     v
[Assigne Factory] (status: working, factory_id: set)
     |
     +--- Production -> +XP, risque blessure
     |
     | POST /workers/v2/{id}/unassign
     v
[Retour Inventaire] (status: available, factory_id: NULL)
     |
     +--- Visible dans vue Inventaire
     +--- Peut etre vendu sur HV (future)
```

---

## Generation des Workers

### Fonction SQL `create_worker_instance()`

```sql
SELECT game.create_worker_instance(
    'FR',           -- country_code
    'LFPG',         -- airport_ident
    company_id,     -- owner_company_id
    NULL,           -- owner_player_id (ou company)
    FALSE,          -- for_sale
    NULL            -- sale_price
);
```

### Formule de generation

```python
# Stats de base du pays
base_speed = country_stats.base_speed
base_resistance = country_stats.base_resistance
base_salary = country_stats.base_hourly_salary

# Variation ±20%
speed = base_speed * random(0.8, 1.2)
resistance = base_resistance * random(0.8, 1.2)
salary = base_salary * random(0.9, 1.1)

# Contraintes: 1-100 pour stats
speed = CLAMP(speed, 1, 100)
resistance = CLAMP(resistance, 1, 100)
```

### Exemple - Worker Francais

Stats France: speed=55, resistance=50, salary=15$

Worker genere:
- Speed: 44-66 (55 ± 20%)
- Resistance: 40-60 (50 ± 20%)
- Salaire: 13.50$-16.50$ (15$ ± 10%)

---

## API Endpoints V2

### Liste Workers (Inventaire)

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/workers/v2/all` | Tous les workers de la company |
| GET | `/workers/v2/inventory?airport=LFPG` | Workers disponibles a un aeroport |

**Reponse /v2/all:**
```json
[
    {
        "id": "uuid",
        "item_name": "Worker-FR",
        "country_code": "FR",
        "speed": 58,
        "resistance": 47,
        "tier": 1,
        "hourly_salary": 14.85,
        "status": "available",
        "airport_ident": "LFPG",
        "factory_id": null
    },
    {
        "id": "uuid2",
        "item_name": "Worker-DE",
        "country_code": "DE",
        "speed": 62,
        "resistance": 51,
        "tier": 1,
        "hourly_salary": 15.20,
        "status": "working",
        "airport_ident": "LFPG",
        "factory_id": "factory-uuid"
    }
]
```

### Details Worker

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/workers/v2/{id}` | Details complets d'un worker |

### Assignation Factory

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/workers/v2/{id}/assign` | Assigner a une factory |
| POST | `/workers/v2/{id}/unassign` | Retirer de la factory |

**Body assign:**
```json
{"factory_id": "uuid-de-la-factory"}
```

**Validations assign:**
- Worker doit appartenir a la company
- Worker doit etre `status: available`
- Worker doit etre au meme aeroport que la factory
- Factory ne doit pas etre pleine (`max_workers`)

### Workers d'une Factory

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/workers/v2/factory/{factory_id}` | Workers assignes |

**Reponse:**
```json
{
    "factory_id": "uuid",
    "factory_name": "Ma Factory",
    "max_workers": 10,
    "current_workers": 3,
    "workers": [
        {
            "id": "uuid",
            "item_name": "Worker-FR",
            "country_code": "FR",
            "speed": 58,
            "resistance": 47,
            "tier": 1,
            "hourly_salary": 14.85,
            "status": "working",
            "airport_ident": "LFPG",
            "factory_id": "factory-uuid"
        }
    ]
}
```

---

## Integration Frontend

### Vue Inventaire

Les workers V2 apparaissent dans la vue Inventaire globale avec:
- Drapeau du pays (emoji)
- Status icon: ✅ available, 🔧 working, 🤕 injured
- Stats affichees: ⚡speed 🛡️resistance
- Filtres: "Workers" et "En Travail"

### Factory Management Modal

Le modal de gestion factory affiche:
- Workers actuellement assignes
- Bouton pour ouvrir le modal d'assignation
- Liste des workers disponibles a l'aeroport

---

## Differences V1 (Legacy) vs V2

| Aspect | V1 (game.workers) | V2 (worker_instances) |
|--------|-------------------|------------------------|
| Modele | Pool + embauche | Item individuel |
| Identite | first_name, last_name | item_name (Worker-XX) |
| Stockage | company_id | owner_company_id + airport |
| Achat | Embauche depuis pool | Achat item ou creation |
| Inventaire | Separe | Integre vue globale |
| HV (Marche) | Non | Oui (for_sale) |

---

## Exemples de Flux V2

### Creer des workers de test

```sql
-- Creer 5 workers FR a LFPG pour une company
DO $$
DECLARE
    v_company_id UUID := 'votre-company-id';
BEGIN
    FOR i IN 1..5 LOOP
        PERFORM game.create_worker_instance(
            'FR', 'LFPG', v_company_id, NULL, FALSE, NULL
        );
    END LOOP;
END $$;
```

### Assigner un worker a une factory

```bash
# 1. Lister mes workers disponibles a LFPG
GET /workers/v2/inventory?airport=LFPG

# 2. Assigner a ma factory
POST /workers/v2/{worker-id}/assign
{"factory_id": "my-factory-id"}

# 3. Verifier les workers de la factory
GET /workers/v2/factory/my-factory-id
```

### Retirer un worker de la factory

```bash
# Le worker retourne a l'inventaire (status: available)
POST /workers/v2/{worker-id}/unassign

# Visible dans l'inventaire global
GET /workers/v2/all
```

---

## Tables Legacy (V0.6)

> **Note:** Ces tables sont conservees pour compatibilite mais ne sont plus utilisees activement.

### `game.workers` (LEGACY)

Ancienne table unifiee workers/engineers avec pool system.

### `game.airport_worker_pools` (LEGACY)

Anciens pools de recrutement par aeroport.

---

## Scheduler Jobs (Future)

| Job | Intervalle | Description |
|-----|------------|-------------|
| `salary_payments` | 1 heure | Paie les salaires workers V2 |
| `injury_processing` | 1 heure | Traite blessures (mort apres 10j) |
| `xp_progression` | Production | +XP selon travail effectue |
