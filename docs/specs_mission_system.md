# SPECS - Système de Missions v0.8

> Document pour Claude Code (VS Code)
> Projet: MFS Carrier+

---

## CONTEXTE

Le joueur crée sa mission depuis l'EFB en cliquant sur un aéroport de destination sur la carte. L'onglet MISSION s'ouvre avec la destination pré-remplie. Il configure son cargo depuis l'inventaire disponible à l'aéroport actuel, valide, et le vol commence avec tracking jusqu'à l'atterrissage.

---

## 1. MODÈLE BDD - Mission

### Table `missions`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| company_id | UUID | FK → companies |
| pilot_user_id | UUID | FK → users |
| aircraft_id | UUID | FK → company_aircraft |
| origin_icao | VARCHAR(4) | Aéroport départ |
| destination_icao | VARCHAR(4) | Aéroport arrivée |
| distance_nm | FLOAT | Distance calculée |
| status | ENUM | `pending`, `in_progress`, `completed`, `failed`, `cancelled` |
| cargo_snapshot | JSONB | Items transportés (copie au départ) |
| pax_count | INT | Nombre passagers (items type pax) |
| cargo_weight_kg | FLOAT | Poids cargo total |
| started_at | TIMESTAMP | Heure décollage |
| completed_at | TIMESTAMP | Heure atterrissage |
| score_landing | INT | /40 pts |
| score_gforce | INT | /20 pts |
| score_destination | INT | /20 pts (bon aéroport) |
| score_time | INT | /10 pts |
| score_fuel | INT | /10 pts |
| score_total | INT | /100 pts |
| grade | VARCHAR(1) | S, A, B, C, D, E, F |
| xp_earned | INT | XP gagné |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Table `mission_cargo` (optionnel si JSONB insuffisant)

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| mission_id | UUID | FK → missions |
| inventory_item_id | UUID | FK → inventory_items |
| quantity | INT | Quantité transportée |

---

## 2. ENDPOINTS API

### POST `/api/missions/`
Créer une mission (status: pending)

**Body:**
```json
{
  "destination_icao": "LFPG",
  "aircraft_id": "uuid",
  "cargo_items": [
    {"inventory_item_id": "uuid", "quantity": 10}
  ]
}
```

**Validations:**
- User authentifié + membre d'une company
- aircraft_id appartient à la company
- Position GPS avion ≈ aéroport origine (tolérance 5nm)
- Items existent dans inventaire à cet aéroport
- Poids total ≤ payload max avion
- Pax count ≤ sièges avion

**Response:** Mission créée avec origin_icao déduit de la position

---

### POST `/api/missions/{id}/start`
Démarrer la mission (pending → in_progress)

**Validations:**
- Mission appartient au user
- Status = pending
- Position GPS toujours à l'origine

**Actions:**
- Lock les items cargo (retrait de l'inventaire)
- Set started_at = now()
- Status → in_progress

---

### POST `/api/missions/{id}/complete`
Terminer la mission avec succès

**Body:**
```json
{
  "landing_fpm": -180,
  "max_gforce": 1.8,
  "final_icao": "LFPG",
  "flight_time_minutes": 95,
  "fuel_used_percent": 45
}
```

**Validations:**
- Status = in_progress
- final_icao = destination_icao (sinon score_destination = 0)

**Actions:**
- Calculer scores (voir section 4)
- Transférer cargo vers inventaire destination
- **Mettre à jour `company_aircraft.current_icao` → destination**
- Créditer XP au pilot_user
- Status → completed

---

### POST `/api/missions/{id}/fail`
Mission échouée (crash, abandon)

**Body:**
```json
{
  "reason": "crash" | "timeout" | "cancelled"
}
```

**Actions:**
- Retourner cargo à l'aéroport d'origine
- Status → failed
- XP = 0

---

### GET `/api/missions/active`
Mission en cours du user (une seule à la fois ?)

---

### GET `/api/missions/history`
Historique missions du user/company

---

## 3. LOGIQUE EFB

### Flow UI

```
[Carte] Clic aéroport → destination sélectionnée
         ↓
[Onglet MISSION s'ouvre]
         ↓
┌─────────────────────────────────────┐
│ MISSION                             │
├─────────────────────────────────────┤
│ Origine: LFBO (position actuelle)   │
│ Destination: LFPG ✓                 │
│ Distance: 312 nm                    │
├─────────────────────────────────────┤
│ AVION                               │
│ [▼ Sélectionner un avion ────────]  │
│   • F-ABCD - Cessna 185 Skywagon    │
│   • F-WXYZ - Cessna 208 Caravan     │
├─────────────────────────────────────┤
│ (après sélection avion)             │
│ Avion: F-ABCD Cessna 185 Skywagon   │
│ Capacité: 2 pax | 450 kg cargo      │
│ Payload dispo: 380 kg               │
├─────────────────────────────────────┤
│ CHARGEMENT                          │
│ [+] Ajouter cargo                   │
│ • Steel Plates x5 (125 kg)          │
│ • Worker_CN x1 (80 kg)              │
│ Total: 205 kg / 380 kg ████░░░░     │
├─────────────────────────────────────┤
│ [VALIDER MISSION]                   │
└─────────────────────────────────────┘

Si aucun avion disponible:
┌─────────────────────────────────────┐
│ ⚠️ Aucun avion de votre fleet       │
│ n'est positionné à LFBO.            │
│                                     │
│ Enregistrez un avion ou déplacez    │
│ un avion existant vers cet aéroport │
└─────────────────────────────────────┘
```

### SimVars à récupérer

```javascript
// Identification avion
TITLE                    // Nom complet avion
ATC_MODEL                // Code ICAO type

// Position
GPS_POSITION_LAT
GPS_POSITION_LON

// Capacités
NUMBER_OF_SEATS          // Nb sièges total (pilote inclus)
EMPTY_WEIGHT             // Poids à vide (lbs)
MAX_GROSS_WEIGHT         // MTOW (lbs)
TOTAL_WEIGHT             // Poids actuel (lbs)
FUEL_TOTAL_QUANTITY_WEIGHT  // Poids fuel actuel (lbs)

// Calcul payload dispo:
// payload_max = MAX_GROSS_WEIGHT - EMPTY_WEIGHT
// payload_dispo = MAX_GROSS_WEIGHT - TOTAL_WEIGHT

// Pendant vol (tracking)
VERTICAL_SPEED           // FPM pour landing
G_FORCE                  // G actuel
GROUND_VELOCITY          // Vitesse sol
SIM_ON_GROUND            // Boolean atterri
```

### Validations côté EFB

Avant d'envoyer à l'API :
1. **Avion validé** - aircraft_id trouvé dans fleet company
2. **Position OK** - GPS proche d'un aéroport connu
3. **Cargo dans les limites** - poids ≤ payload dispo, pax ≤ sièges-1

### Tracking en vol

- Poll SimVars toutes les 2-5 secondes
- Stocker max G-force rencontré
- Détecter atterrissage: `SIM_ON_GROUND` passe à true + `VERTICAL_SPEED` 
- Capturer FPM au touchdown
- Vérifier ICAO aéroport d'arrivée

---

## 4. CALCUL SCORING

### Landing (40 pts)
```
FPM        | Points
-----------+--------
0 à -100   | 40 (butter)
-100 à -200| 35
-200 à -300| 25
-300 à -500| 15
-500 à -700| 5
< -700     | 0 (crash léger)
```

### G-Force (20 pts)
```
Max G   | Points
--------+--------
< 1.5   | 20 (smooth)
1.5-2.0 | 15
2.0-2.5 | 10
2.5-3.0 | 5
> 3.0   | 0
```

### Destination (20 pts)
```
Arrivée au bon ICAO = 20 pts
Mauvais aéroport    = 0 pts
```

### Time (10 pts)
```
Basé sur distance/vitesse croisière estimée
± 10% du temps prévu = 10 pts
± 25% = 7 pts
± 50% = 4 pts
> 50% écart = 0 pts
```

### Fuel (10 pts)
```
Fuel restant ≥ 20% = 10 pts
10-20% = 7 pts
5-10% = 4 pts
< 5% = 0 pts
```

### Grade
```
Score  | Grade
-------+-------
95-100 | S
85-94  | A
70-84  | B
55-69  | C
40-54  | D
25-39  | E
0-24   | F
```

### XP Formula
```
base_xp = distance_nm × 2
multiplier = grade_multiplier (S=2.0, A=1.5, B=1.2, C=1.0, D=0.7, E=0.5, F=0.2)
cargo_bonus = (cargo_weight_kg / 100) × 5

total_xp = (base_xp × multiplier) + cargo_bonus
```

---

## 5. FICHIERS À MODIFIER/CRÉER

### Backend (game-api/)
- `app/models/mission.py` - Nouveau modèle
- `app/models/company_aircraft.py` - Ajouter champ `current_icao` si absent
- `app/schemas/mission.py` - Schemas Pydantic
- `app/routers/missions.py` - Endpoints missions
- `app/routers/fleet.py` - Ajouter endpoint `GET /fleet/available?icao=`
- `app/core/scheduler.py` - Ajouter job timeout missions
- `app/main.py` - Inclure router missions

### SQL
- `sql/v0_8_missions_schema.sql` - Table missions + migration company_aircraft

### EFB (msfs-efb/ ou équivalent)
- Modifier panel principal - Ajouter onglet MISSION
- Menu déroulant sélection avion
- Logique tracking vol
- Appels API missions

### Docs
- `docs/missions.md` - Documentation système

---

## 6. RÈGLES CONFIRMÉES

1. **Une mission à la fois par pilote** → OUI (bloquer création si mission active)
2. **Timeout auto si mission > 24h** → OUI (status → failed, cargo retourne origine)
3. **Avion hors fleet** → BLOQUÉ, le joueur DOIT sélectionner un avion enregistré dans sa fleet

### Sélection avion obligatoire

L'EFB affiche un **menu déroulant** avec uniquement les avions de la company qui sont :
- Enregistrés dans `company_aircraft`
- Positionnés à l'aéroport actuel (champ `current_icao` dans company_aircraft)

Si aucun avion fleet n'est sur place → message "Aucun avion disponible ici" → mission impossible.

### Nouveau endpoint nécessaire

**GET `/api/fleet/available?icao=LFBO`**
Retourne les avions de la company positionnés à cet ICAO.

```json
[
  {
    "id": "uuid",
    "registration": "F-ABCD",
    "aircraft_type": "Cessna 185",
    "current_icao": "LFBO",
    "max_pax": 2,
    "max_cargo_kg": 450
  }
]
```

## 7. APSCHEDULER JOB - Timeout Missions

### Job `check_mission_timeouts`
**Fréquence:** Toutes les 15 minutes

```python
# Pseudo-code
async def check_mission_timeouts():
    # Missions in_progress depuis > 24h
    expired = await db.execute(
        select(Mission)
        .where(Mission.status == "in_progress")
        .where(Mission.started_at < now() - timedelta(hours=24))
    )
    
    for mission in expired:
        # Retourner cargo à l'origine
        await return_cargo_to_origin(mission)
        
        # L'avion reste à l'origine (pas bougé)
        
        mission.status = "failed"
        mission.completed_at = now()
        # Pas de XP
```

---

1. Modèle + Migration SQL
2. Endpoints API basiques (create, start, complete, fail)
3. EFB: Onglet MISSION + sélection cargo
4. EFB: Tracking vol + détection atterrissage
5. Scoring + XP
6. Tests + polish
