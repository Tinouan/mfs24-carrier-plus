# MFS World of Aircraft (MSFS 2024) — Architecture v3.0

> **Version**: 3.0 (Deux Carrières Distinctes : Solo / Online)
> **Repo**: https://github.com/Tinouan/mfs24-carrier-plus
> **Stack**: EFB TypeScript/React + Persistance Native MSFS + SEED (Cloudflare Workers + R2)

---

## Vue d'ensemble

MFS World of Aircraft est un mod de gestion de compagnie cargo pour **Microsoft Flight Simulator 2024**. L'architecture v3.0 propose **deux carrières complètement séparées** : Solo et Online.

### Changement majeur v3.0

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│   CARRIÈRE SOLO                    CARRIÈRE ONLINE          │
│   ─────────────                    ───────────────          │
│   • Stockage: GetStoredData        • Stockage: SEED         │
│   • Économie: IA locale            • Économie: joueurs      │
│   • Anti-triche: DÉSACTIVÉ         • Anti-triche: STRICT    │
│   • Connexion: NON requise         • Connexion: OBLIGATOIRE │
│   • Progression: indépendante      • Progression: indépendante│
│                                                              │
│   PAS DE SYNC ENTRE LES DEUX !                              │
│   PAS DE TRANSFERT DE DONNÉES !                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Comparaison des modes

| Aspect | Solo | Online |
|--------|------|--------|
| **Stockage** | GetStoredData local | SEED Cloudflare |
| **Économie** | IA (PNJ) | Joueurs réels |
| **Marché** | Prix fixes, stock illimité | Offre/demande réelle |
| **Anti-triche** | Désactivé | Strict (SEED calcule tout) |
| **Classements** | Non | Oui |
| **Connexion** | Non requise | Obligatoire |
| **Xbox** | Garanti | Probable |

### Principes clés

| Aspect | Implémentation |
|--------|----------------|
| **Sélection mode** | Écran de choix au démarrage |
| **Persistance Solo** | GetStoredData/SetStoredData (MSFS API) |
| **Persistance Online** | SEED (Cloudflare Workers + R2) |
| **UI** | EFB intégré MSFS 2024 |
| **Multijoueur** | Mode Online uniquement via SEED |
| **Anti-triche** | Mode Online uniquement |

---

## Architecture technique

### Vue globale (Deux Carrières)

```
[Lancement EFB]
       │
       ▼
[Écran de sélection]
       │
  ┌────┴────┐
  │         │
  ▼         ▼
SOLO      ONLINE
  │         │
  ▼         ▼
┌─────┐   ┌─────┐
│Local│   │SEED │
│Save │   │     │
└─────┘   └─────┘
  │         │
  └────┬────┘
       ▼
[ServiceAdapter]
(route selon mode)
       │
       ▼
  [Même UI]
```

### Diagramme détaillé

```
                            CLOUD (Cloudflare)
┌────────────────────────────────────────────────────────────────────┐
│                           SEED SERVER v2.0                          │
│                  https://woa-seed.seedworldofaircraft.workers.dev  │
│                         (MODE ONLINE UNIQUEMENT)                    │
│                                                                     │
│   ┌─────────────┐    ┌──────────────┐    ┌─────────────┐          │
│   │  Workers    │◄──►│   R2 Bucket  │    │  Anti-Cheat │          │
│   │  (REST API) │    │  (Storage)   │    │  (Trust)    │          │
│   └─────────────┘    └──────────────┘    └─────────────┘          │
└────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ HTTPS (si mode Online)
                                 │
┌────────────────────────────────┴───────────────────────────────────┐
│                         EFB CARRIER+ v3.0                           │
│                                                                     │
│   ┌─────────────┐    ┌──────────────┐    ┌─────────────┐          │
│   │GameModeState│◄──►│ModeSelection │◄──►│ AuthState   │          │
│   │ (solo|online)│    │   Screen     │    │ (si online) │          │
│   └─────────────┘    └──────────────┘    └─────────────┘          │
│         │                                                           │
│         ▼                                                           │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                     ServiceAdapter                           │  │
│   │  Route selon GameModeState.currentMode                       │  │
│   │  • Solo → SoloSaveService                                    │  │
│   │  • Online → SyncService (SEED)                               │  │
│   └─────────────────────────────────────────────────────────────┘  │
│         │                   │                                       │
│    ┌────┴────┐         ┌────┴────┐                                 │
│    ▼         ▼         ▼         ▼                                 │
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐                           │
│ │ Solo  │ │Local  │ │Sync   │ │ SEED  │                           │
│ │ Save  │ │Market │ │Service│ │ API   │                           │
│ │Service│ │ (IA)  │ │       │ │       │                           │
│ └───────┘ └───────┘ └───────┘ └───────┘                           │
│    │                    │                                           │
│    ▼                    ▼                                           │
│ ┌───────────────┐  ┌───────────────┐                               │
│ │GetStoredData  │  │    SEED R2    │                               │
│ │(MSFS Native)  │  │  (Cloudflare) │                               │
│ └───────────────┘  └───────────────┘                               │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                          UI                                  │  │
│   │   Map | Hangar | Market | Company | Profile | Settings       │  │
│   │              (Identique pour les deux modes)                 │  │
│   └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### Couches de persistance

```
┌─────────────────────────────────────────────────────────────┐
│              PERSISTANCE PAR MODE                            │
│                                                              │
│   MODE SOLO                        MODE ONLINE              │
│   ═════════                        ════════════              │
│                                                              │
│   GetStoredData (MSFS)             SEED (Cloudflare R2)     │
│   • Profil joueur                  • Profil joueur validé   │
│   • Flotte d'avions                • Flotte d'avions        │
│   • Missions complétées            • Missions (anti-triche) │
│   • Argent/XP (non vérifié)        • Argent/XP (calculé)    │
│   • Économie IA locale             • Économie joueurs       │
│                                    • Marché partagé         │
│                                    • Trust Score            │
│                                                              │
│   Cache session: localStorage      Cache session: localStorage│
│   (Effacé quand MSFS ferme)        (Effacé quand MSFS ferme) │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Flow de démarrage (v3.0)

```
[MSFS démarre]
       │
       ▼
[EFB s'ouvre] → InitService.initialize()
       │
       ▼
[1. Charger GameModeState]
       │
       ├── Mode déjà choisi ? → Aller directement au mode
       └── Premier lancement ou reset → Écran de sélection
       │
       ▼
[2. ÉCRAN DE SÉLECTION]
       │
       ├── Bouton "SOLO"
       │      │
       │      ▼
       │   [Mode SOLO]
       │      ├── GameModeState.setMode("solo")
       │      ├── SoloSaveService.load()
       │      ├── LocalMarketService.init() (économie IA)
       │      └── Pas de connexion réseau
       │
       └── Bouton "ONLINE"
              │
              ▼
           [Connexion SEED requise]
              │
              ├─── Succès ─────┐
              │                ▼
              │         [Mode ONLINE]
              │                ├── GameModeState.setMode("online")
              │                ├── AuthState.setConnected()
              │                ├── SyncService.loadPlayer()
              │                └── SyncService.startPolling()
              │
              └─── Échec ──────┐
                               ▼
                        [Retour écran sélection]
                        [Message: "Connexion requise"]
       │
       ▼
[3. Démarrer Auto-Save]
       │
       ├── Solo: setInterval(SoloSaveService.save, 60000)
       └── Online: Pas d'auto-save local (SEED = source de vérité)
       │
       ▼
[Prêt !] ◄── Jeu jouable dans le mode choisi
```

---

## GameModeState (NOUVEAU)

### Structure

```typescript
// state/GameModeState.ts

type GameMode = "solo" | "online" | null;

interface GameModeStateType {
  currentMode: Subject<GameMode>;
  hasChosenMode: Subject<boolean>;

  setMode(mode: GameMode): void;
  getMode(): GameMode;
  resetMode(): void;  // Retour à l'écran de sélection
}
```

### Implémentation

```typescript
class GameModeStateClass {
  currentMode = new Subject<GameMode>(null);
  hasChosenMode = new Subject<boolean>(false);

  private STORAGE_KEY = "WorldOfAircraft_GameMode";

  init(): void {
    // Charger le mode sauvegardé
    const saved = GetStoredData(this.STORAGE_KEY);
    if (saved === "solo" || saved === "online") {
      this.currentMode.set(saved);
      this.hasChosenMode.set(true);
    }
  }

  setMode(mode: GameMode): void {
    this.currentMode.set(mode);
    this.hasChosenMode.set(mode !== null);

    if (mode) {
      SetStoredData(this.STORAGE_KEY, mode);
    }
  }

  getMode(): GameMode {
    return this.currentMode.get();
  }

  resetMode(): void {
    this.currentMode.set(null);
    this.hasChosenMode.set(false);
    SetStoredData(this.STORAGE_KEY, "");
  }

  isSolo(): boolean {
    return this.currentMode.get() === "solo";
  }

  isOnline(): boolean {
    return this.currentMode.get() === "online";
  }
}

export const GameModeState = new GameModeStateClass();
```

---

## SoloSaveService (NOUVEAU)

### Structure

```typescript
// services/SoloSaveService.ts

interface SoloSaveData {
  version: number;
  timestamp: number;

  player: Player;
  aircraft: Aircraft[];
  company: Company | null;
  completed_missions: CompletedMission[];

  checksum: string;
}
```

### Implémentation

```typescript
class SoloSaveServiceClass {
  private STORAGE_KEY = "WorldOfAircraft_SoloSave";
  private VERSION = 1;

  async save(): Promise<boolean> {
    if (!GameModeState.isSolo()) {
      console.warn("[SoloSaveService] Not in solo mode, skipping save");
      return false;
    }

    try {
      const saveData: SoloSaveData = {
        version: this.VERSION,
        timestamp: Date.now(),
        player: await this.collectPlayerData(),
        aircraft: await this.collectAircraftData(),
        company: CompanyState.company.get(),
        completed_missions: MissionState.completedMissions.get(),
        checksum: ""
      };

      saveData.checksum = this.calculateChecksum(saveData);

      const json = JSON.stringify(saveData);
      SetStoredData(this.STORAGE_KEY, json);

      console.log("[SoloSaveService] Saved successfully");
      return true;
    } catch (e) {
      console.error("[SoloSaveService] Save failed:", e);
      return false;
    }
  }

  async load(): Promise<SoloSaveData | null> {
    try {
      const json = GetStoredData(this.STORAGE_KEY);

      if (!json || json === "") {
        console.log("[SoloSaveService] No save data, creating new game");
        return this.createNewGame();
      }

      const saveData: SoloSaveData = JSON.parse(json);

      // Vérifier checksum
      const expectedChecksum = saveData.checksum;
      saveData.checksum = "";
      const actualChecksum = this.calculateChecksum(saveData);

      if (expectedChecksum !== actualChecksum) {
        console.warn("[SoloSaveService] Checksum mismatch - data may be corrupted");
        // En mode solo, on accepte quand même (pas d'anti-triche)
      }

      return saveData;
    } catch (e) {
      console.error("[SoloSaveService] Load failed:", e);
      return this.createNewGame();
    }
  }

  async restore(saveData: SoloSaveData): Promise<void> {
    // Restaurer dans les States
    if (saveData.player) {
      AuthState.player.set(saveData.player);
    }
    if (saveData.aircraft) {
      InventoryState.aircraft.set(saveData.aircraft);
    }
    if (saveData.company) {
      CompanyState.company.set(saveData.company);
    }
  }

  private createNewGame(): SoloSaveData {
    return {
      version: this.VERSION,
      timestamp: Date.now(),
      player: this.createDefaultPlayer(),
      aircraft: [],
      company: null,
      completed_missions: [],
      checksum: ""
    };
  }

  private createDefaultPlayer(): Player {
    return {
      id: this.generateUUID(),
      name: "Pilote Solo",
      money: 50000,  // Argent de départ généreux en solo
      xp: 0,
      level: 1,
      created_at: Date.now()
    };
  }

  private calculateChecksum(data: SoloSaveData): string {
    const str = JSON.stringify({
      timestamp: data.timestamp,
      player_money: data.player?.money,
      player_xp: data.player?.xp,
      aircraft_count: data.aircraft?.length,
    });

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private generateUUID(): string {
    return 'solo-' + Math.random().toString(36).substring(2, 15);
  }
}

export const SoloSaveService = new SoloSaveServiceClass();
```

---

## ServiceAdapter (mis à jour v3.0)

Le ServiceAdapter route les appels selon le mode actif.

```typescript
// services/ServiceAdapter.ts

class ServiceAdapterClass {

  // === MISSIONS ===

  async createMission(params: CreateMissionParams): Promise<Mission> {
    if (GameModeState.isSolo()) {
      // Mode Solo: calcul local, pas de validation anti-triche
      return LocalMissionService.create(params);
    } else {
      // Mode Online: SEED calcule et valide tout
      return SyncService.createMission(params);
    }
  }

  async completeMission(missionId: string, stats: FlightStats): Promise<MissionResult> {
    if (GameModeState.isSolo()) {
      // Mode Solo: calcul local généreux
      return LocalMissionService.complete(missionId, stats);
    } else {
      // Mode Online: SEED valide et calcule les récompenses
      return SyncService.completeMission(missionId, stats);
    }
  }

  // === CARBURANT ===

  async refuel(aircraftId: string, gallons: number): Promise<RefuelResult> {
    if (GameModeState.isSolo()) {
      // Mode Solo: déduction locale, pas de validation
      return LocalFleetService.refuel(aircraftId, gallons);
    } else {
      // Mode Online: SEED calcule le coût et vérifie les fonds
      return SyncService.refuel(aircraftId, gallons);
    }
  }

  // === MARCHÉ ===

  async getMarketOrders(airportIcao: string): Promise<MarketOrder[]> {
    if (GameModeState.isSolo()) {
      // Mode Solo: ordres IA générés localement
      return LocalMarketService.getOrders(airportIcao);
    } else {
      // Mode Online: vrais ordres joueurs depuis SEED
      return SyncService.getMarketOrders(airportIcao);
    }
  }

  async buyMarketOrder(orderId: string, quantity: number): Promise<BuyResult> {
    if (GameModeState.isSolo()) {
      // Mode Solo: achat IA local
      return LocalMarketService.buy(orderId, quantity);
    } else {
      // Mode Online: SEED vérifie fonds et transfère
      return SyncService.buyMarketOrder(orderId, quantity);
    }
  }

  // === SAUVEGARDE ===

  async save(): Promise<void> {
    if (GameModeState.isSolo()) {
      await SoloSaveService.save();
    }
    // Mode Online: pas de sauvegarde locale, SEED = source de vérité
  }
}

export const ServiceAdapter = new ServiceAdapterClass();
```

---

## SEED Server v2.0 (MODE ONLINE UNIQUEMENT)

### Infrastructure

| Composant | Technologie |
|-----------|-------------|
| **Compute** | Cloudflare Workers (edge computing) |
| **Storage** | Cloudflare R2 (S3-compatible) |
| **URL** | `https://woa-seed.seedworldofaircraft.workers.dev` |
| **Latence** | < 50ms (edge mondial) |
| **Version** | 2.0.0-anticheat |

### Endpoints API

**Status**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ping` | Health check + player count |

**Players (données personnelles)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/players` | Créer un joueur |
| GET | `/players/:id` | Récupérer un joueur |
| PUT | `/players/:id` | Mettre à jour (PROTÉGÉ: bloque money/xp) |
| GET | `/players/:id/aircraft` | Liste des avions du joueur |
| POST | `/players/:id/aircraft` | Ajouter un avion |
| GET | `/players/:id/company` | Company du joueur |
| GET | `/players/:id/trust` | Trust Score |

**Aircraft**
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/aircraft/:id` | Mettre à jour un avion |
| POST | `/aircraft/:id/refuel` | Ravitaillement (SEED calcule coût) |

**Missions (ANTI-CHEAT)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/missions` | Créer mission (SEED calcule base XP/reward) |
| POST | `/missions/:id/complete` | Compléter (SEED calcule final XP/reward) |
| GET | `/missions/active/:aircraftId` | Mission active pour un avion |

**Companies**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/companies` | Créer une company |
| PUT | `/companies/:id` | Mettre à jour une company |

**World (données partagées)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/world` | Monde complet (market, inventaires, prix) |
| GET | `/world/inventories/:icao` | Inventaire d'un aéroport |
| PUT | `/world/inventories/:icao` | Mettre à jour inventaire |

**Market**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/market/orders` | Liste ordres (filtres: airport, item, seller) |
| POST | `/market/orders` | Poster un ordre de vente |
| POST | `/market/orders/:id/buy` | Acheter un ordre (SEED vérifie fonds) |
| DELETE | `/market/orders/:id` | Annuler un ordre |

---

## Structure des fichiers (v3.0)

```
tablette ingame/PackageSources/WorldOfAircraft/src/
├── WorldOfAircraft.tsx              # Point d'entrée principal
│
├── types/
│   └── index.ts                 # Interfaces TypeScript
│
├── constants/
│   └── index.ts                 # URLs, intervalles, prix
│
├── state/                       # Modules State réactifs
│   ├── index.ts
│   ├── AuthState.ts             # Connexion SEED (mode online)
│   ├── GameModeState.ts         # ** NOUVEAU ** Solo | Online
│   ├── NavigationState.ts       # Tabs actifs
│   ├── SettingsState.ts         # Langue, unités
│   ├── SimVarState.ts           # Position, fuel, vitesse
│   ├── MapState.ts              # Layers, sélection
│   ├── MissionState.ts          # Mission active
│   ├── CompanyState.ts          # Company du joueur
│   ├── InventoryState.ts        # Inventaire joueur
│   └── MarketState.ts           # Ordres marché
│
├── managers/
│   ├── TrackingManager.ts       # Tracking missions
│   ├── MapManager.ts            # OpenLayers
│   ├── DatabaseManager.ts       # localStorage persistence
│   └── FreeFlightManager.ts     # Tracking vol libre
│
├── services/
│   ├── SoloSaveService.ts       # ** NOUVEAU ** Sauvegarde mode Solo
│   ├── SyncService.ts           # Connexion SEED (mode Online)
│   ├── ServiceAdapter.ts        # Facade unifiée (route selon mode)
│   ├── InitService.ts           # Init avec sélection mode
│   ├── LocalFleetService.ts     # Gestion flotte locale
│   ├── LocalMissionService.ts   # Missions mode Solo
│   ├── LocalMarketService.ts    # Marché IA (mode Solo)
│   └── AIEconomyService.ts      # Ordres IA (mode Solo)
│
├── components/
│   ├── ModeSelectionScreen.tsx  # ** NOUVEAU ** Écran choix Solo/Online
│   ├── ConnectionScreen.tsx     # Écran connexion SEED (mode Online)
│   ├── ConnectionStatusIndicator.tsx  # Indicateur status
│   └── ...                      # Autres composants UI
│
├── views/                       # Vues par onglet
│
├── data/
│   ├── seed.json                # Items, recipes initiaux
│   └── airports-main.json       # Cache aéroports
│
├── locales/                     # i18n (fr, en, de, es, ru)
│
└── lib/
    └── sql.js                   # SQLite pour browser (legacy)
```

### Fichiers supprimés (v3.0)

Ces fichiers ne sont plus nécessaires avec l'architecture deux carrières :

| Fichier | Raison |
|---------|--------|
| ~~NetworkState.ts~~ | Remplacé par GameModeState |
| ~~SyncManager.ts~~ | Plus de sync entre modes |
| ~~OfflineMissionService.ts~~ | Plus de queue offline |
| ~~NativePersistence.ts~~ | Remplacé par SoloSaveService |

---

## Mode Solo - Règles

### Autorisé en Solo (TOUT)

| Action | Comportement |
|--------|--------------|
| Missions | Calcul local, récompenses généreuses |
| Refuel | Gratuit ou prix fixe bas |
| Marché | Ordres IA, stock illimité |
| Vol libre | Tracking local |
| Achat avion | Prix catalogue, toujours disponible |
| **Triche** | **Le joueur peut modifier sa save s'il le souhaite** |

### Économie IA (Solo)

```typescript
// LocalMarketService.ts - Mode Solo uniquement

class LocalMarketServiceClass {
  // Génère des ordres IA pour simuler un marché
  generateAIOrders(airportIcao: string): MarketOrder[] {
    const items = this.getItemsForAirport(airportIcao);

    return items.map(item => ({
      id: `ai-${item.code}-${airportIcao}`,
      seller_id: "AI_TRADER",
      seller_name: "Marchand local",
      item_code: item.code,
      quantity: 999,  // Stock illimité
      price_per_unit: item.base_price,  // Prix fixe
      airport_icao: airportIcao,
      is_ai: true
    }));
  }
}
```

---

## Mode Online - Règles

### OBLIGATOIRE en Online

| Aspect | Règle |
|--------|-------|
| Connexion | SEED obligatoire, pas de fallback offline |
| Anti-triche | Strict, SEED calcule tout |
| Validation | Toutes les transactions vérifiées |
| Trust Score | Actif, pénalités si anomalies |

### BLOQUÉ si déconnecté

Si la connexion au SEED est perdue en mode Online :
- Afficher message "Connexion perdue"
- Bloquer toutes les actions (missions, marché, refuel)
- Proposer de passer en mode Solo (nouvelle carrière)

---

## Développement local

### Serveur mock (dev)

```bash
# Installer Bun
irm bun.sh/install.ps1 | iex

# Lancer le serveur mock
bun run seed-mock/server.ts
# → http://localhost:8787

# Dans SyncService
SyncService.useDevMode();
```

### Déploiement production

```bash
cd seed-server
npx wrangler deploy
# → https://woa-seed.seedworldofaircraft.workers.dev
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
| **Persistance Solo** | **GetStoredData/SetStoredData** |
| **Persistance Online** | **SEED (Cloudflare R2)** |
| Storage session | localStorage (Coherent GT) |
| i18n | 5 langues (fr, en, de, es, ru) |

### SEED Server (Backend - Mode Online uniquement)

| Composant | Technologie |
|-----------|-------------|
| Runtime | Cloudflare Workers |
| Storage | Cloudflare R2 |
| API | REST JSON |
| Auth | API Key + Player ID |
| Anti-cheat | Trust Score + validation |

---

## Documentation associée

| Fichier | Description |
|---------|-------------|
| [anticheat-seed.md](anticheat-seed.md) | Système anti-triche (MODE ONLINE uniquement) |
| [efb-tablet.md](efb-tablet.md) | UI et composants EFB |
| [items-recipes.md](items-recipes.md) | Liste items et recettes |
| [inventory.md](inventory.md) | Gestion inventaires |
| [market.md](market.md) | Système de marché |

---

## Roadmap

### V3.0 — Deux Carrières (Actuel)

- [x] Architecture SEED Central (mode Online)
- [x] SyncService (connexion SEED)
- [x] ServiceAdapter (routing selon mode)
- [x] Connection Screen (mode Online)
- [x] SEED Server (Cloudflare Workers + R2)
- [x] Anti-cheat complet (mode Online)
- [x] **GameModeState** (choix Solo/Online)
- [x] **ModeSelectionScreen** (écran de sélection)
- [x] **SoloSaveService** (persistance mode Solo)
- [x] **LocalMarketService** (économie IA mode Solo)
- [ ] Tests complets des deux modes
- [ ] UI indicateur de mode actif

### V3.1 — Améliorations

- [ ] Tracking vol libre vers SEED (mode Online)
- [ ] Affichage Trust Score dans ProfileView (mode Online)
- [ ] Cron Cloudflare récupération quotidienne trust
- [ ] Statistiques séparées par mode

### V3.2+ — Futures évolutions

- [ ] Licences pilote (PPL, IFR, CPL, ATPL)
- [ ] Examens de licence
- [ ] Contrats NPC (mode Solo)
- [ ] Classements mondiaux (mode Online)
- [ ] Factories sur SEED (mode Online)

---

## Résumé v2.1 → v3.0

| Composant | Avant (v2.1) | Après (v3.0) |
|-----------|--------------|--------------|
| Modes | Hybride (online/offline) | Deux carrières séparées |
| Sync | Queue + SyncManager | Aucune sync entre modes |
| Offline | OfflineMissionService | SoloSaveService (carrière Solo) |
| Anti-triche | Partout (complexe) | Online only (simple) |
| NetworkState | Connecting/Online/Offline/Syncing | Supprimé → GameModeState |
| Conflits | Résolution complexe | Aucun (pas de sync) |
| Xbox | Incertain (fetch bloqué?) | Solo garanti, Online probable |

---

## License

Voir [LEGAL.md](../LEGAL.md)
