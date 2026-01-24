# Company System - Documentation Technique

## Vue d'ensemble

Le système Company gère les compagnies de transport aérien des joueurs avec:
- Création et gestion de company
- Système de membres avec rôles (owner, admin, member)
- Profil company personnalisable
- Wallet/Balance pour l'économie
- Vault global pour le stockage

---

## Tables SQL

### `game.companies`

Table principale des compagnies.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `world_id` | INT | ID du monde (défaut: 1) |
| `name` | VARCHAR(80) | Nom de la company |
| `slug` | VARCHAR(50) | Slug URL unique (auto-généré) |
| `owner_user_id` | UUID | FK → users (propriétaire) |
| `home_airport_ident` | VARCHAR(8) | Code ICAO aéroport de base |
| `display_name` | VARCHAR(48) | Nom d'affichage public |
| `description` | VARCHAR(400) | Description de la company |
| `logo_url` | VARCHAR(300) | URL du logo |
| `is_public` | BOOLEAN | Profil public (défaut: false) |
| `settings` | JSONB | Paramètres personnalisés |
| `balance` | DECIMAL(14,2) | Solde en crédits (défaut: 0) |
| `created_at` | TIMESTAMPTZ | Date de création |
| `updated_at` | TIMESTAMPTZ | Dernière modification |

### `game.company_members`

Table de liaison users ↔ companies.

| Colonne | Type | Description |
|---------|------|-------------|
| `company_id` | UUID | PK, FK → companies |
| `user_id` | UUID | PK, FK → users |
| `role` | VARCHAR | owner, admin, member |
| `joined_at` | TIMESTAMPTZ | Date d'adhésion |

**Contraintes:**
- Clé primaire composite (company_id, user_id)
- Un user ne peut être que dans UNE company (MVP)
- Rôles: `owner`, `admin`, `member`

---

## Système de Rôles

| Rôle | Permissions |
|------|-------------|
| `owner` | Tout (créateur de la company) |
| `admin` | Modifier profil, ajouter membres, gérer factories |
| `member` | Lecture seule, utiliser factories |

**Hiérarchie des droits:**
- Owner peut tout faire
- Admin peut modifier company profile et ajouter des membres
- Member peut voir les infos et travailler dans les factories

---

## Cycle de Vie d'une Company

```
[User s'inscrit]
       │
       │ POST /auth/register
       ▼
[User connecté] (sans company)
       │
       │ POST /company
       ▼
[Company créée]
       ├── Owner assigné automatiquement
       ├── Vault créé automatiquement
       └── Balance = 0
       │
       │ POST /company/members/add
       ▼
[Membres ajoutés]
       │
       │ PATCH /company-profile/me
       ▼
[Profil personnalisé]
```

---

## API Endpoints

### Company Core

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/company` | Créer une company |
| GET | `/company/me` | Ma company |
| GET | `/company/{id}` | Company par ID (V0.8 - pour wallet display) |
| GET | `/company/members` | Liste des membres |
| POST | `/company/members/add` | Ajouter un membre |

### Permissions (V0.7)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/company/permissions` | Liste permissions membres |
| GET | `/company/permissions/{user_id}` | Permissions d'un membre |
| PATCH | `/company/permissions/{user_id}` | Modifier permissions |

### Company Profile

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/company-profile/me` | Profil complet |
| PATCH | `/company-profile/me` | Modifier profil |

---

## Company par ID (V0.8)

### Endpoint: `GET /company/{id}`

Récupère les informations d'une company par son ID. Utilisé pour afficher le wallet company dans les vues Market/Inventory.

**Prérequis:** Être membre de la company

**Réponse:**
```json
{
    "id": "uuid",
    "name": "Air France Cargo",
    "home_airport_ident": "LFPG",
    "balance": 25000.00,
    "created_at": "2026-01-22T..."
}
```

**Note:** Le champ `balance` est inclus pour permettre l'affichage du wallet company dans le frontend.

---

## Création de Company

### Endpoint: `POST /company`

**Body:**
```json
{
    "name": "Air France Cargo",
    "home_airport_ident": "LFPG"
}
```

**Validations:**
1. User n'est pas déjà dans une company
2. `home_airport_ident` existe dans `public.airports`
3. Nom entre 3 et 80 caractères

**Actions automatiques:**
1. Génère un slug unique (ex: `air-france-cargo`)
2. Crée la company
3. Ajoute le user comme `owner`
4. Crée un `vault` (stockage global company)

**Réponse:**
```json
{
    "id": "uuid",
    "name": "Air France Cargo",
    "home_airport_ident": "LFPG",
    "created_at": "2026-01-22T..."
}
```

---

## Gestion des Membres

### Ajouter un membre: `POST /company/members/add`

**Prérequis:** Être `owner` ou `admin`

**Body:**
```json
{
    "email": "pilote@example.com",
    "role": "member"
}
```

**Validations:**
1. User appelant est owner ou admin
2. Target user existe (par email)
3. Target user n'est pas déjà dans cette company
4. Target user n'est pas dans une autre company

**Réponse:**
```json
{
    "company_id": "uuid",
    "user_id": "uuid",
    "role": "member",
    "username": "pilote123",
    "email": "pilote@example.com"
}
```

### Lister les membres: `GET /company/members`

**Réponse:**
```json
[
    {
        "company_id": "uuid",
        "user_id": "uuid",
        "role": "owner",
        "username": "boss",
        "email": "boss@example.com"
    },
    {
        "company_id": "uuid",
        "user_id": "uuid",
        "role": "member",
        "username": "pilote123",
        "email": "pilote@example.com"
    }
]
```

---

## Permissions System (V0.7)

### Table: `game.company_permissions`

| Permission | Description |
|------------|-------------|
| `can_withdraw_warehouse` | Retirer du warehouse company |
| `can_deposit_warehouse` | Déposer au warehouse company |
| `can_withdraw_factory` | Retirer du factory storage |
| `can_deposit_factory` | Déposer au factory storage |
| `can_manage_aircraft` | Gérer les avions (acheter, vendre) |
| `can_use_aircraft` | Utiliser les avions (load/unload cargo) |
| `can_sell_market` | Mettre en vente sur le marché |
| `can_buy_market` | Acheter sur le marché |
| `can_manage_workers` | Gérer les workers |
| `can_manage_members` | Gérer les permissions membres |
| `can_manage_factories` | Gérer les usines |
| `is_founder` | Tous les droits (non modifiable) |

### Permissions par défaut selon le rôle

| Rôle | Permissions |
|------|-------------|
| **Founder/Owner** | Toutes (is_founder=true) |
| **Admin** | withdraw_*, manage_aircraft, sell_market, manage_workers, manage_factories |
| **Member** | deposit_*, use_aircraft, buy_market |

### Modifier les permissions: `PATCH /company/permissions/{user_id}`

**Prérequis:** Être founder ou avoir `can_manage_members`

**Body (champs optionnels):**
```json
{
    "can_buy_market": true,
    "can_sell_market": false,
    "can_manage_aircraft": true
}
```

**Note:** Les permissions du founder ne peuvent être modifiées que par lui-même.

---

## Company Profile

### Endpoint: `PATCH /company-profile/me`

**Prérequis:** Être `owner` ou `admin`

**Body (tous les champs optionnels):**
```json
{
    "display_name": "Air France Cargo Express",
    "description": "Transport de fret premium en Europe",
    "logo_url": "https://example.com/logo.png",
    "is_public": true,
    "settings": {
        "theme": "dark",
        "notifications": true
    }
}
```

**Validations:**
- `display_name`: 3-48 caractères, alphanumériques + espaces/tirets
- `description`: max 400 caractères
- `logo_url`: doit commencer par http:// ou https://
- `settings`: doit être un objet JSON

---

## Système de Balance

La company a un wallet (`balance`) utilisé pour:
- Payer les salaires des workers (automatique, horaire)
- Pénalités (mort d'un worker: -10,000)
- Achats sur le marché (futur)
- Construction de factories (futur)

**Balance actuelle:** Lecture seule via le profil company.

**Déductions automatiques:**
- Scheduler `salary_payments` (toutes les heures)
- Scheduler `injury_processing` (pénalité mort)

---

## Inventory Locations

Chaque company a plusieurs types de stockage:

| Kind | Description |
|------|-------------|
| `vault` | Stockage global (créé automatiquement) |
| `warehouse` | Stockage par aéroport (créé à la demande) |

Les warehouses sont créés automatiquement lors du premier `withdraw` depuis une factory.

---

## Relations avec les autres systèmes

### Factories
- Une company peut avoir plusieurs factories
- `company_id` dans `game.factories`

### Workers
- Les workers sont embauchés par la company
- `company_id` dans `game.workers`
- Assignés ensuite à une factory

### Inventory
- `company_id` dans `game.inventory_locations`
- Vault global + warehouses par aéroport

---

## Exemples de Flux

### Créer une company et embaucher

```bash
# 1. Créer la company
POST /company
{"name": "My Cargo Co", "home_airport_ident": "LFPG"}

# 2. Voir ma company
GET /company/me

# 3. Modifier le profil
PATCH /company-profile/me
{"display_name": "My Cargo Express", "is_public": true}

# 4. Ajouter un pilote
POST /company/members/add
{"email": "pilote@test.com", "role": "member"}

# 5. Voir les membres
GET /company/members
```

---

## Limitations actuelles (MVP)

- Un user ne peut être que dans **une seule company**
- Pas de système d'invitation (ajout direct par email)
- Pas de suppression de company
- Pas de retrait de membres
- Pas de transfert de propriété

---

## Évolutions futures

- [ ] Invitations avec acceptation
- [ ] Retrait/kick de membres
- [ ] Transfert de propriété (owner → autre)
- [ ] Suppression de company
- [ ] Multi-company pour admin
- [ ] Système de rangs personnalisés
- [ ] Historique des transactions (balance)
