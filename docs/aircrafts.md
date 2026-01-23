# MFS Carrier+ - Systeme Fleet (Avions)

**Version**: 0.7.1
**Date**: 2026-01-23
**Statut**: Implemente

---

## Vue d'ensemble

Le systeme Fleet permet aux joueurs de gerer une flotte d'avions cargo pour transporter des marchandises entre aeroports. Il comprend:

- **Catalogue d'avions** - Types d'avions predefinies avec specs et prix
- **Gestion de flotte** - Achat, modification, suppression d'avions
- **Integration cargo** - Chaque avion a un emplacement d'inventaire pour le cargo
- **Statistiques** - Vue d'ensemble de la flotte

---

## Base de donnees

### Table `game.aircraft_catalog`

Catalogue des types d'avions disponibles a l'achat.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | VARCHAR(100) | Nom complet (ex: "Cessna 208 Caravan") |
| `icao_type` | VARCHAR(10) | Code ICAO (ex: "C208") |
| `manufacturer` | VARCHAR(50) | Constructeur |
| `category` | VARCHAR(30) | Categorie (turboprop, jet_small, jet_medium, jet_large, helicopter) |
| `cargo_capacity_kg` | INT | Capacite cargo en kg |
| `cargo_capacity_m3` | FLOAT | Capacite cargo en m3 (optionnel) |
| `max_range_nm` | INT | Autonomie en NM |
| `cruise_speed_kts` | INT | Vitesse de croisiere en noeuds |
| `base_price` | NUMERIC(14,2) | Prix d'achat |
| `operating_cost_per_hour` | NUMERIC(10,2) | Cout operationnel horaire |
| `min_runway_length_m` | INT | Longueur piste minimale |
| `required_license` | VARCHAR(20) | Licence requise (PPL, CPL, ATPL) |
| `msfs_aircraft_id` | VARCHAR(100) | ID MSFS (pour integration) |
| `is_active` | BOOLEAN | Actif dans le catalogue |

### Table `game.company_aircraft`

Avions possedes par les companies ou joueurs.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `company_id` | UUID | Company proprietaire (nullable si player-owned) |
| `user_id` | UUID | Joueur proprietaire (nullable si company-owned) |
| `owner_type` | VARCHAR(20) | Type: "company" ou "player" |
| `registration` | VARCHAR(10) | Immatriculation unique (F-XXXX, N12345) |
| `name` | VARCHAR(100) | Surnom de l'avion |
| `aircraft_type` | VARCHAR | Type d'avion |
| `icao_type` | VARCHAR(10) | Code ICAO |
| `cargo_capacity_kg` | INT | Capacite cargo |
| `current_airport_ident` | VARCHAR(8) | Position actuelle (ICAO) |
| `status` | VARCHAR(20) | Statut: stored, parked, in_flight, maintenance |
| `condition` | FLOAT | Etat (0.0 - 1.0) |
| `hours` | FLOAT | Heures de vol totales |
| `purchase_price` | NUMERIC(14,2) | Prix d'achat |
| `is_active` | BOOLEAN | Actif (soft delete) |
| `created_at` | TIMESTAMPTZ | Date creation |
| `updated_at` | TIMESTAMPTZ | Date modification |

---

## Catalogue d'avions (Seed)

### Turboprops (Starter)

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Cessna 208 Caravan | C208 | 1,360 kg | $250,000 | 900 NM |
| Pilatus PC-12 | PC12 | 1,200 kg | $450,000 | 1,800 NM |
| Beechcraft King Air 350 | BE35 | 1,800 kg | $700,000 | 1,500 NM |
| DHC-6 Twin Otter | DHC6 | 1,800 kg | $350,000 | 800 NM |
| ATR 72-600F | AT76 | 8,500 kg | $2,500,000 | 900 NM |
| Cessna 408 SkyCourier | C408 | 2,700 kg | $600,000 | 900 NM |

### Jets Petits

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Embraer Phenom 300 | E55P | 800 kg | $1,200,000 | 2,000 NM |
| Cessna Citation CJ4 | C25C | 700 kg | $1,100,000 | 2,000 NM |

### Jets Moyens (Cargo)

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Boeing 737-800BCF | B738 | 23,000 kg | $15,000,000 | 2,500 NM |
| Airbus A320P2F | A320 | 21,000 kg | $14,000,000 | 2,500 NM |

### Gros Porteurs

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Boeing 747-8F | B748 | 137,000 kg | $80,000,000 | 4,500 NM |
| Boeing 777F | B77F | 102,000 kg | $65,000,000 | 5,000 NM |

### Helicopteres

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Airbus H125 | EC30 | 600 kg | $350,000 | 350 NM |
| Sikorsky S-76 | S76 | 1,200 kg | $800,000 | 400 NM |

---

## API Endpoints

### Catalogue (Public)

| Methode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/api/fleet/catalog` | Non | Liste le catalogue d'avions |
| GET | `/api/fleet/catalog?category=turboprop` | Non | Filtrer par categorie |
| GET | `/api/fleet/catalog?max_price=500000` | Non | Filtrer par prix max |
| GET | `/api/fleet/catalog/{id}` | Non | Details d'un type d'avion |

### Flotte (Authentifie)

| Methode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/api/fleet` | Oui | Liste mes avions |
| GET | `/api/fleet/stats` | Oui | Statistiques de la flotte |
| GET | `/api/fleet/{id}` | Oui | Details d'un avion |
| GET | `/api/fleet/{id}/details` | Oui | Details avec cargo |
| POST | `/api/fleet` | Oui | Acheter/ajouter un avion |
| PATCH | `/api/fleet/{id}` | Oui | Modifier un avion |
| DELETE | `/api/fleet/{id}` | Oui | Retirer un avion (soft delete) |

### Cargo (V0.7)

| Methode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/api/fleet/{id}/cargo` | Oui | Voir le cargo d'un avion |
| POST | `/api/fleet/{id}/load` | Oui | Charger du cargo |
| POST | `/api/fleet/{id}/unload` | Oui | Decharger du cargo |
| PATCH | `/api/fleet/{id}/location` | Oui | Mettre a jour la position |

---

## Schemas Pydantic

### AircraftCatalogOut
```python
class AircraftCatalogOut(BaseModel):
    id: UUID
    name: str
    icao_type: str
    manufacturer: str
    category: str
    cargo_capacity_kg: int
    cargo_capacity_m3: Optional[float]
    max_range_nm: Optional[int]
    cruise_speed_kts: Optional[int]
    base_price: Decimal
    operating_cost_per_hour: Optional[Decimal]
    min_runway_length_m: Optional[int]
    required_license: Optional[str]
```

### AircraftCreateIn
```python
class AircraftCreateIn(BaseModel):
    catalog_id: Optional[UUID]  # Achat depuis catalogue
    registration: str           # Immatriculation (obligatoire)
    name: Optional[str]         # Surnom
    aircraft_type: Optional[str]  # Requis si pas de catalog_id
    icao_type: Optional[str]
    cargo_capacity_kg: Optional[int]
    current_airport: Optional[str]  # ICAO
```

### AircraftOut
```python
class AircraftOut(BaseModel):
    id: UUID
    company_id: Optional[UUID]
    user_id: Optional[UUID]
    owner_type: str
    registration: Optional[str]
    name: Optional[str]
    aircraft_type: str
    icao_type: Optional[str]
    status: str
    condition: float
    hours: float
    cargo_capacity_kg: int
    current_airport_ident: Optional[str]
    purchase_price: Optional[Decimal]
    is_active: bool
    created_at: datetime
```

### FleetStatsOut
```python
class FleetStatsOut(BaseModel):
    total_aircraft: int
    available_count: int
    in_flight_count: int
    maintenance_count: int
    total_cargo_capacity_kg: int
    categories: dict[str, int]  # {"turboprop": 3, "jet_medium": 1}
```

---

## Logique metier

### Achat d'avion (depuis catalogue)

1. Verifier que l'utilisateur a une company
2. Verifier les permissions (`is_founder` ou `can_manage_aircraft`)
3. Verifier l'unicite de l'immatriculation
4. Verifier le solde de la company >= prix
5. Deduire le prix du solde
6. Creer l'avion avec les specs du catalogue
7. Creer l'emplacement d'inventaire pour le cargo

### Ajout manuel (gratuit)

Pour les tests ou l'import d'avions existants:
- Pas de deduction de solde
- `aircraft_type` obligatoire
- Capacite cargo par defaut: 500 kg

### Suppression d'avion

1. Verifier les permissions
2. Verifier que le cargo est vide
3. Soft delete (`is_active = false`)

### Systeme de cargo

Chaque avion a un `InventoryLocation` associe:
- `kind = "aircraft"`
- `aircraft_id` = ID de l'avion
- Position = `current_airport_ident` de l'avion

Contraintes:
- Chargement/dechargement uniquement au meme aeroport
- Validation du poids (ne peut pas depasser `cargo_capacity_kg`)
- Audit trail des operations

---

## Frontend

### Modal Ajouter Avion

Deux onglets:
1. **Catalogue** - Selectionner un avion, entrer immatriculation, acheter
2. **Manuel** - Creer un avion personnalise (gratuit)

### Modal Details Avion

Affiche:
- Immatriculation et type
- Statut (parked, in_flight, etc.)
- Position actuelle
- Capacite et utilisation cargo
- Heures de vol et usure
- Prix d'achat
- Bouton de suppression

### Liste Flotte (Company Tab)

Cartes cliquables avec:
- Icone selon categorie
- Immatriculation
- Type d'avion
- Position
- Capacite
- Statut

---

## Permissions

| Permission | Description |
|------------|-------------|
| `is_founder` | Tous les droits |
| `can_manage_aircraft` | Acheter/vendre des avions |
| `can_use_aircraft` | Charger/decharger cargo, mettre a jour position |

---

## Migration SQL

Fichier: `sql/v0_7_aircraft_catalog.sql`

```sql
-- Creer la table aircraft_catalog
CREATE TABLE IF NOT EXISTS game.aircraft_catalog (...);

-- Ajouter les colonnes manquantes a company_aircraft
ALTER TABLE game.company_aircraft ADD COLUMN registration VARCHAR(10) UNIQUE;
ALTER TABLE game.company_aircraft ADD COLUMN name VARCHAR(100);
ALTER TABLE game.company_aircraft ADD COLUMN icao_type VARCHAR(10);
ALTER TABLE game.company_aircraft ADD COLUMN purchase_price NUMERIC(14,2);
ALTER TABLE game.company_aircraft ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE game.company_aircraft ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Seed 14 types d'avions
INSERT INTO game.aircraft_catalog (...) VALUES (...);
```

---

## Fichiers modifies

### Backend
- `game-api/app/models/company_aircraft.py` - AircraftCatalog + champs supplementaires
- `game-api/app/schemas/fleet.py` - Nouveaux schemas
- `game-api/app/routers/fleet.py` - Endpoints catalogue et gestion

### Frontend
- `webmap/app.html` - Modals ajouter/details avion
- `webmap/app.js` - Fonctions fleet
- `webmap/styles.css` - Styles modals et cartes

### SQL
- `sql/v0_7_aircraft_catalog.sql` - Migration et seed
