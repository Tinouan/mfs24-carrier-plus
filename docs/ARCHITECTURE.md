# MFS Carrier+ (MSFS 2024) — Architecture P2P

> **Version**: 0.9+ (P2P)  
> **Repo**: https://github.com/Tinouan/mfs24-carrier-plus  
> **Stack**: EFB TypeScript/React + SQLite local + P2P Sync

---

## Vue d'ensemble

MFS Carrier+ est un mod de gestion de compagnie cargo pour **Microsoft Flight Simulator 2024**. L'architecture P2P permet de jouer en solo ou en multijoueur **sans serveur centralisé**.

### Principes clés

| Aspect | Implémentation |
|--------|----------------|
| **Stockage** | SQLite local (sql.js) |
| **UI** | EFB intégré MSFS 2024 |
| **Multijoueur** | P2P via shards (sync HTTP) |
| **Données monde** | Un seul monde partagé entre tous les joueurs |
| **Offline** | 100% jouable sans connexion |

---

## Architecture technique

### Vue globale

```
┌─────────────────────────────────────────────────────────────────┐
│                         EFB CARRIER+                             │
│                                                                  │
│   ┌─────────────┐    ┌──────────────┐    ┌─────────────┐       │
│   │   States    │◄──►│ Persistence  │◄──►│  SQLite     │       │
│   │ (Subject<T>)│    │   Manager    │    │  (sql.js)   │       │
│   └─────────────┘    └──────────────┘    └─────────────┘       │
│         │                   │                                    │
│         │                   ▼                                    │
│         │            ┌──────────────┐                           │
│         │            │   Network    │◄────► Autres joueurs      │
│         │            │   Manager    │       (P2P Sync)          │
│         │            └──────────────┘                           │
│         │                                                        │
│         ▼                                                        │
│   ┌─────────────┐                                               │
│   │     UI      │ ◄── OpenLayers Map, Hangar, Market, etc.     │
│   └─────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Flux de données

```
1. DÉMARRAGE
   SQLite → PersistenceManager → States → UI

2. ACTION UTILISATEUR  
   UI → Service → State.set() → PersistenceManager → SQLite
                              → NetworkManager → Sync vers peers

3. RÉCEPTION SYNC RÉSEAU
   Peer → NetworkManager → States → UI
                        → SQLite (backup)
```

---

## Structure des fichiers

```
tablette ingame/PackageSources/CarrierPlus/src/
├── CarrierPlus.tsx              # Point d'entrée principal
│
├── types/
│   └── index.ts                 # Interfaces TypeScript
│
├── constants/
│   └── index.ts                 # URLs, intervalles, prix
│
├── state/                       # 17 modules State réactifs
│   ├── index.ts
│   ├── AuthState.ts             # Mode P2P, first launch
│   ├── NavigationState.ts       # Tabs actifs
│   ├── SettingsState.ts         # Langue, unités
│   ├── SimVarState.ts           # Position, fuel, vitesse
│   ├── MapState.ts              # Layers, sélection
│   ├── MissionState.ts          # Mission active
│   ├── MissionCreationState.ts  # Création mission
│   ├── TrackingState.ts         # Progression vol
│   ├── CheckpointState.ts       # Waypoints
│   ├── CargoState.ts            # Transfert cargo
│   ├── HangarState.ts           # Flotte, réparations
│   ├── CompanyState.ts          # Company data
│   ├── MarketState.ts           # Ordres marché
│   ├── PopupState.ts            # Modals
│   ├── InventoryState.ts        # Items
│   └── FreeFlightState.ts       # Vol libre
│
├── managers/
│   ├── TrackingManager.ts       # Tracking missions
│   ├── MapManager.ts            # OpenLayers
│   ├── MissionCreationManager.ts
│   ├── FreeFlightManager.ts
│   ├── DatabaseManager.ts       # SQLite (sql.js)
│   ├── PersistenceManager.ts    # States ↔ SQLite
│   └── NetworkManager.ts        # P2P state machine
│
├── services/
│   ├── DataLayer.ts             # Abstraction local/réseau
│   ├── FleetService.ts          # Gestion flotte
│   ├── MissionService.ts        # Missions
│   ├── WorldService.ts          # Aéroports, items
│   ├── MarketService.ts         # Marché
│   ├── InitService.ts           # Premier lancement
│   ├── AIEconomyService.ts      # Économie solo (ordres IA)
│   ├── PeerClient.ts            # Client P2P
│   ├── PeerHost.ts              # Serveur P2P (PC only)
│   └── DiscoveryService.ts      # Trouver le monde
│
├── components/                  # Composants UI
├── helpers/                     # Fonctions utilitaires
├── views/                       # Vues par onglet
│
├── data/
│   ├── seed.json                # Items, recipes initiaux
│   └── airports.json            # Cache aéroports (5000+)
│
├── locales/                     # i18n (fr, en, de, es, ru)
│
└── lib/
    └── sql.js                   # SQLite pour browser
```

---

## Base de données SQLite

### Schéma (15 tables)

**Core (5 tables)**
| Table | Description |
|-------|-------------|
| `player` | Profil joueur (id, name, money, xp, home_airport) |
| `company` | Company du joueur (si achetée) |
| `aircraft` | Flotte (personal + company) |
| `inventory_locations` | Emplacements stockage |
| `inventory_items` | Items par emplacement |

**World Data (3 tables)**
| Table | Description |
|-------|-------------|
| `items` | 94 items (T0-T2) |
| `recipes` | 60 recettes |
| `airports` | Cache aéroports MSFS |

**Factories (3 tables)**
| Table | Description |
|-------|-------------|
| `factories` | Usines de production |
| `factory_storage` | Stockage local usine |
| `production_batches` | Lots en cours |

**Workers (2 tables)**
| Table | Description |
|-------|-------------|
| `workers` | Workers + Engineers |
| `country_stats` | Stats par pays (42 pays) |

**Market & Missions (2 tables)**
| Table | Description |
|-------|-------------|
| `market_orders` | Ordres achat/vente |
| `missions` | Historique missions |

---

## Modes de jeu

### Mode Solo (offline)

```
┌─────────────────────────────────────────┐
│              JOUEUR SOLO                 │
│                                          │
│   SQLite local ◄──► EFB                 │
│        │                                 │
│        ▼                                 │
│   AIEconomyService                       │
│   (génère ordres marché IA)             │
└─────────────────────────────────────────┘
```

- Toutes les données en local
- Économie simulée par IA
- Aucune connexion requise

### Mode Multijoueur (P2P)

```
┌─────────────────────────────────────────────────────────────────┐
│                     1 SEUL MONDE CARRIER+                        │
│                                                                  │
│   SHARD EU         SHARD US         SHARD ASIA        SEED      │
│   (max 100)        (max 100)        (max 100)      (NAS 24/7)   │
│       │                │                │              │         │
│       └────────────────┴────────────────┴──────────────┘         │
│                              │                                   │
│                    SYNC TEMPS RÉEL (2-5 sec)                     │
│                                                                  │
│   Données SYNC: market, inventaires, usines, classements        │
│   Données LOCAL: position avion, mission en cours               │
└─────────────────────────────────────────────────────────────────┘
```

**Données synchronisées** (monde partagé) :
- Ordres marché
- Inventaires par aéroport
- Usines et production
- Classements joueurs

**Données locales** (par joueur) :
- Position avion temps réel
- Mission en cours
- Préférences UI

---

## First Launch Flow

```
[MSFS démarre]
       │
       ▼
[EFB s'ouvre] → InitService.initialize()
       │
       ├── Player existe dans SQLite?
       │         │
       │    Non  │  Oui
       │         │
       │         ▼
       │   [Load existing data]
       │
       ▼
[First Launch Popup]
       │
       │ Saisie: Nom, Nationalité, Aéroport de base
       │
       ▼
[completeFirstLaunch()]
       │
       ├── Créer Player (100,000 CR)
       ├── Créer Aircraft personnel (C172)
       ├── Initialiser seed data (items, recipes)
       └── Générer market orders IA
       │
       ▼
[Jeu prêt]
```

---

## Company System

### Sans Company (début de jeu)

Le joueur démarre avec :
- 100,000 CR
- 1 avion personnel (C172)
- Accès au marché (achat/vente)
- Missions disponibles

### Achat Company (50,000 CR)

```
[Tab Company] → "Créer une compagnie"
       │
       │ Saisie: Nom de la company
       │ Coût: 50,000 CR
       │
       ▼
[InitService.purchaseCompany()]
       │
       ├── Vérifier fonds (≥50,000)
       ├── Déduire 50,000 du wallet
       └── Créer Company
       │
       ▼
[Company active - Accès à:]
  - Usines (factories)
  - Workers
  - Flotte company
  - Warehouses company
```

### Ownership Model

| Type | Description |
|------|-------------|
| **Personal** | Avion/warehouse du joueur |
| **Company** | Avion/warehouse/factory de la company |

---

## Gameplay Core Loop

### Mécanique principale

1. **Recruter** des workers dans les pools d'aéroports
2. **Produire** des items dans des usines
3. **Transporter** ces items en avion entre aéroports
4. **Vendre** sur le marché pour générer des profits

### Système d'inventaires

**4 types de containers** (localisés par aéroport) :

| Container | Description |
|-----------|-------------|
| `player_warehouse` | Entrepôt personnel |
| `company_warehouse` | Entrepôt company |
| `factory_storage` | Stockage local usine |
| `aircraft` | Cargo avion (limite poids) |

**Anti-cheat** : Transport inter-aéroport = vol obligatoire
- ❌ Transfert direct LFPG → EGLL bloqué
- ✅ Charger avion → Voler → Décharger

---

## Items & Recipes

### Items (94 total)

| Tier | Quantité | Type |
|------|----------|------|
| T0 | 34 | Matières premières (auto-produites) |
| T1 | 30 | Produits transformés |
| T2 | 30 | Produits avancés |

**Tags** : `food`, `construction`, `electronics`, `medical`, `fuel`

### Recipes (60 total)

| Tier | Quantité | Ingrédients |
|------|----------|-------------|
| T1 | 30 | 2-3 items T0 |
| T2 | 30 | 2-4 items T0/T1 |

---

## Factory System

### Slots par type d'aéroport

| Type | Slots |
|------|-------|
| large_airport | 12 |
| medium_airport | 6 |
| small_airport | 3 |
| seaplane_base | 1 |
| heliport | 1 |
| closed | 0 |

### Tiers d'usines

| Tier | Ingrédients | Workers max | Engineers max |
|------|-------------|-------------|---------------|
| T1 | 2 | 10 | 0 |
| T2 | 2 | 20 | 1 |
| T3 | 3 | 30 | 1 |
| T4 | 3 | 40 | 2 |
| T5 | 4 | 50 | 2 |
| T6 | 4 | 60 | 3 |
| T7 | 5 | 70 | 3 |
| T8 | 5 | 80 | 4 |
| T9 | 5 | 90 | 4 |
| T10 | 5 | 100 | 5 |

### Production

```
Temps = base_time × (200 / sum(worker.speed))
```

- Sans food : -50% vitesse
- Bonus engineer : +10% output par engineer (max 50%)

---

## Workers System

### Recrutement

- Workers disponibles dans les pools d'aéroports
- Stats basées sur nationalité (42 pays)
- Variation ±20% (speed, resistance), ±10% (salaire)

### Capacités pools

| Type aéroport | Workers | Engineers |
|---------------|---------|-----------|
| large_airport | 200 | 20 |
| medium_airport | 100 | 10 |
| small_airport | 50 | 5 |

### Progression XP

| Tier | XP requis | Bonus |
|------|-----------|-------|
| Novice | 0 | - |
| Apprenti | 1,000 | +5% speed |
| Compagnon | 5,000 | +10% speed |
| Expert | 15,000 | +15% speed |
| Maître | 50,000 | +20% speed |

### Système de blessures

- Risque base : 0.5%/heure
- Sans food : risque x2
- Blessure >10 jours → mort
- Pénalité mort : -10,000 CR

### Consommation

- 1 food/worker/heure
- Sans food : 30% efficacité + risque blessures x2

---

## Mission System

### Création mission

1. Sélectionner avion (au sol, systèmes OK)
2. Configurer cargo
3. Entrer destination ICAO
4. Valider et décoller

### Tracking

- Progression basée sur distance parcourue
- Détection waypoints via GPS MSFS
- Scoring : landing, fuel, time, events

### Scoring

| Catégorie | Critères |
|-----------|----------|
| Landing | Vertical speed, centerline |
| Fuel | Consommation vs estimée |
| Time | Durée vs estimée |
| Events | Incidents en vol |
| Bonus | Night, no-autopilot, etc. |

---

## P2P Network

### États NetworkManager

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  SOLO   │────►│ JOINING │────►│ CLIENT  │
└─────────┘     └─────────┘     └─────────┘
     │               │               │
     │               ▼               │
     │         ┌─────────┐          │
     └────────►│  HOST   │◄─────────┘
               └─────────┘
```

| État | Description |
|------|-------------|
| `solo` | Mode offline, données locales uniquement |
| `joining` | Connexion à un shard en cours |
| `client` | Connecté, reçoit les sync |
| `host` | Héberge un shard (PC uniquement) |

### peers.json

```json
{
  "version": 1,
  "shards": [
    {
      "id": "seed",
      "name": "SEED (Backup)",
      "host": "ton-nas.synology.me",
      "port": 7777,
      "region": "EU",
      "permanent": true
    },
    {
      "id": "eu-1",
      "name": "Europe 1",
      "host": "dynamic",
      "port": 7777,
      "region": "EU",
      "permanent": false
    }
  ]
}
```

---

## Stack technique

### EFB (Frontend)

| Composant | Technologie |
|-----------|-------------|
| Framework | TypeScript + FSComponent (MSFS SDK) |
| Build | esbuild + SASS |
| State | MSFS Subject<T> (réactif) |
| Map | OpenLayers 10 |
| Storage | SQLite (sql.js) |
| i18n | 5 langues (fr, en, de, es, ru) |

### Contraintes Coherent GT

- Pas de CSS classes dynamiques → styles inline
- Pas de `onClick` → `Button` avec `callback`
- Pas de `.map()` JSX → `ref` + `innerHTML`
- Debug : `localhost:19999` + `Ctrl+Shift+R`

---

## Documentation associée

| Fichier | Description |
|---------|-------------|
| [efb-tablet.md](efb-tablet.md) | UI et composants EFB |
| [items-recipes.md](items-recipes.md) | Liste items et recettes |
| [factories.md](factories.md) | Système d'usines |
| [workers.md](workers.md) | Système de workers |
| [inventory.md](inventory.md) | Gestion inventaires |
| [market.md](market.md) | Système de marché |
| [missions.md](missions.md) | Système de missions |

---

## Roadmap

### V0.9 — Mode P2P (En cours)

- [x] Architecture P2P définie
- [ ] DatabaseManager (SQLite)
- [ ] PersistenceManager
- [ ] DataLayer
- [ ] Mode solo complet
- [ ] NetworkManager
- [ ] Sync multi-shards

### V1.0 — Release

- [ ] Polish UI
- [ ] Tests complets
- [ ] Documentation utilisateur

### V1.1+ — Futures évolutions

- [ ] Licences pilote (PPL, IFR, CPL, ATPL)
- [ ] Examens de licence
- [ ] Contrats NPC
- [ ] Classements mondiaux

---

## License

Voir [LEGAL.md](../LEGAL.md)
