# AeroCorp Online - Système Anti-Triche

**Version**: 3.2 (MODE ONLINE UNIQUEMENT)
**Date**: 2026-02-04
**Statut**: ✅ IMPLÉMENTÉ
**Document pour**: Claude Code (VS Code)

---

## ⚠️ IMPORTANT : Mode Online uniquement

**Le système anti-triche ne s'applique QU'AU MODE ONLINE.**

Le mode Solo n'a AUCUNE protection anti-triche. Voir section "Mode Solo vs Online" ci-dessous.

---

## Mode Solo vs Online

### Mode Solo (AUCUNE protection)

Le mode Solo est un bac à sable personnel :
- Pas de connexion au SEED
- Données stockées localement (GetStoredData)
- Le joueur peut "tricher" s'il le souhaite
- Aucun impact sur les autres joueurs
- Pas de classements

```
┌─────────────────────────────────────┐
│           MODE SOLO                  │
│                                      │
│   • Anti-triche: DÉSACTIVÉ          │
│   • Stockage: Local (GetStoredData) │
│   • Économie: IA locale             │
│   • Validation: AUCUNE              │
│   • Triche: AUTORISÉE (bac à sable) │
│                                      │
└─────────────────────────────────────┘
```

### Mode Online (Protection STRICTE)

Le mode Online est le monde partagé :
- Connexion SEED obligatoire
- SEED = source de vérité absolue
- Toutes les protections actives
- Anti-triche strict
- Classements et compétition

```
┌─────────────────────────────────────┐
│          MODE ONLINE                 │
│                                      │
│   • Anti-triche: STRICT             │
│   • Stockage: SEED (Cloudflare R2)  │
│   • Économie: Joueurs réels         │
│   • Validation: TOTALE              │
│   • Triche: IMPOSSIBLE              │
│                                      │
└─────────────────────────────────────┘
```

### Pourquoi cette séparation ?

| Raison | Explication |
|--------|-------------|
| **Simplicité** | Pas de sync, pas de conflits |
| **Équité** | Tous les joueurs online partent égaux |
| **Xbox** | Solo fonctionne même si fetch() bloqué |
| **Liberté** | Le joueur choisit son expérience |

---

## Vue d'ensemble (Mode Online)

Le système anti-triche de AeroCorp Online protège l'intégrité des données de jeu en utilisant le **SEED Central comme source de vérité unique**. Tous les joueurs **en mode Online** sont connectés au même monde partagé.

### Principe fondamental

```
┌─────────────────────────────────────────────────────────────┐
│                 ARCHITECTURE SEED CENTRAL                    │
│                                                              │
│   CLIENT (EFB)              SEED (Cloudflare Workers)       │
│   ┌──────────────┐          ┌──────────────────────┐        │
│   │ Envoie FAITS │ ───────► │ VALIDE + CALCULE     │        │
│   │ (stats vol)  │          │ (récompenses, usure) │        │
│   └──────────────┘          └──────────────────────┘        │
│          │                           │                       │
│          │                           ▼                       │
│          │                  ┌──────────────────────┐        │
│          │                  │    R2 Storage        │        │
│          │                  │ (source de vérité)   │        │
│          │                  └──────────────────────┘        │
│          │                           │                       │
│          ▼                           ▼                       │
│   ┌──────────────┐          ┌──────────────────────┐        │
│   │ Reçoit       │ ◄─────── │ Renvoie résultat     │        │
│   │ RÉSULTATS    │          │ validé               │        │
│   └──────────────┘          └──────────────────────┘        │
│                                                              │
│   Le CLIENT n'envoie JAMAIS de valeurs calculées            │
│   Le SEED CALCULE tout (XP, argent, usure, score)           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Règle d'or

| Le CLIENT envoie | Le SEED calcule |
|------------------|-----------------|
| Stats de vol (temps, distance) | XP gagné |
| Position finale | Argent gagné/dépensé |
| Carburant restant | Usure appliquée |
| Events (overspeed, hard landing) | Score mission |
| Intention d'achat | Validation + déduction |

---

## Fichiers Implémentés (Mode Online)

| Fichier | Description |
|---------|-------------|
| `seed-server/src/index.ts` | Serveur SEED complet (Cloudflare Workers) |
| `services/SyncService.ts` | Client API SEED (mode Online) |
| `services/ServiceAdapter.ts` | Facade unifiée (route selon GameModeState) |
| `services/InitService.ts` | Initialisation avec sélection de mode |
| `state/GameModeState.ts` | État du mode (solo \| online) |

### Fichiers supprimés (v3.0)

Ces fichiers ne sont plus utilisés avec l'architecture "deux carrières" :

| Fichier | Raison |
|---------|--------|
| ~~NetworkState.ts~~ | Remplacé par GameModeState |
| ~~SyncManager.ts~~ | Plus de sync entre modes |
| ~~OfflineMissionService.ts~~ | Plus de queue offline |

---

## Sécurité de base (IMPLÉMENTÉ ✅)

### Authentification API

```typescript
// Chaque requête EFB → SEED contient :
Headers: {
  "X-API-Key": "aerocorp-seed-secret",  // Clé partagée
  "X-Player-ID": "uuid-du-joueur"          // ID unique
}
```

### Validation côté SEED

```typescript
function validateRequest(request: Request): ValidationResult {
  const apiKey = request.headers.get("X-API-Key");
  const playerId = request.headers.get("X-Player-ID");
  
  // 1. API Key valide ?
  if (!apiKey || apiKey !== API_KEY) {
    return { valid: false, error: "INVALID_API_KEY" };
  }
  
  // 2. Player ID présent ?
  if (!playerId) {
    return { valid: false, error: "MISSING_PLAYER_ID" };
  }
  
  return { valid: true, playerId };
}
```

---

## 1. Protection du Carburant

### 1.1 Menace

Les joueurs peuvent utiliser le panneau carburant natif de MSFS pour:
- Ajouter du carburant gratuitement
- Contourner le système de coût de carburant

### 1.2 Solution implémentée (côté EFB)

**Flux sécurisé:**

```
[Connexion au SEED]
       │
       ▼
[Charger aircraft depuis SEED] ──► [Appliquer fuel au simulateur]
       │
       ▼
[Simulateur affiche le carburant SEED]
```

**Points de synchronisation (SEED → Sim):**

| Moment | Action | Fonction |
|--------|--------|----------|
| Connexion/Login | Restaure carburant | `SyncService.getPlayerAircraft()` |
| Changement onglet Hangar | Restaure carburant | `autoSyncCurrentAircraft()` |
| Chargement mission | Applique fuel SEED | `loadCurrentAircraftForMission()` |
| Bouton SYNC | Enforce fuel SEED | `syncFuelFromSimulator()` |

### 1.3 Détection de triche (côté EFB)

```typescript
// Si carburant simulateur > carburant SEED = tentative de triche
async function checkFuelAnomaly(aircraftId: string): Promise<void> {
  const simFuel = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons");
  const seedAircraft = await SyncService.getAircraft(aircraftId);
  
  if (simFuel > seedAircraft.fuel_gallons + 1) {
    console.warn(`[ANTI-CHEAT] Fuel anomaly detected. Resetting.`);
    setSimulatorFuel(seedAircraft.fuel_gallons);
    
    // Optionnel: signaler au SEED
    await SyncService.reportAnomaly({
      type: "FUEL_CHEAT_ATTEMPT",
      expected: seedAircraft.fuel_gallons,
      actual: simFuel
    });
  }
}
```

### 1.4 Achat de carburant (validé par SEED)

```typescript
// POST /aircraft/:id/refuel
async function handleRefuel(request: Request): Promise<Response> {
  const { aircraft_id, gallons_to_add, price_per_gallon } = await request.json();
  const playerId = request.headers.get("X-Player-ID");
  
  // 1. Charger données
  const player = await getPlayer(playerId);
  const aircraft = await getAircraft(aircraft_id);
  
  // 2. L'avion appartient au joueur ?
  if (aircraft.owner_id !== playerId && aircraft.company_id !== player.company_id) {
    return error(403, "NOT_YOUR_AIRCRAFT");
  }
  
  // 3. Calculer le coût (SEED calcule, pas le client !)
  const FUEL_PRICE = 5.50; // Prix fixé par le SEED
  const totalCost = gallons_to_add * FUEL_PRICE;
  
  // 4. Fonds suffisants ?
  if (player.money < totalCost) {
    return error(400, "INSUFFICIENT_FUNDS");
  }
  
  // 5. Capacité non dépassée ?
  const catalog = await getAircraftCatalog(aircraft.type_code);
  const newFuel = aircraft.fuel_gallons + gallons_to_add;
  if (newFuel > catalog.fuel_capacity_gallons) {
    return error(400, "EXCEEDS_CAPACITY");
  }
  
  // 6. SEED effectue la transaction
  player.money -= totalCost;
  aircraft.fuel_gallons = newFuel;
  
  await savePlayer(player);
  await saveAircraft(aircraft);
  
  return json({ 
    success: true, 
    new_balance: player.money,
    new_fuel: aircraft.fuel_gallons
  });
}
```

---

## 2. Protection des Systèmes Avion

### 2.1 Données protégées (stockées SEED uniquement)

| Donnée | Stockage | Modifiable par |
|--------|----------|----------------|
| Condition générale | SEED | SEED uniquement |
| Heures de vol | SEED | SEED uniquement |
| État moteur | SEED | SEED uniquement |
| État train d'atterrissage | SEED | SEED uniquement |
| État hélice | SEED | SEED uniquement |
| État électrique | SEED | SEED uniquement |
| Position (ICAO) | SEED | SEED uniquement |
| Carburant | SEED | SEED uniquement |

### 2.2 Calcul d'usure (côté SEED)

```typescript
// POST /aircraft/:id/apply-wear
// Appelé par le client après un vol, SEED valide et calcule

interface FlightStats {
  flight_time_minutes: number;
  distance_nm: number;
  landing_fpm: number;
  max_g_force: number;
  overspeed_count: number;
  departure_icao: string;
  arrival_icao: string;
}

async function applyWear(aircraftId: string, stats: FlightStats): Promise<WearResult> {
  const aircraft = await getAircraft(aircraftId);
  
  // 1. VALIDER les stats (anti-triche)
  const validation = validateFlightStats(stats, aircraft);
  if (!validation.valid) {
    await flagSuspiciousActivity(aircraft.owner_id, validation.reason);
    return { success: false, error: validation.reason };
  }
  
  // 2. SEED CALCULE l'usure (pas le client !)
  const flightHours = stats.flight_time_minutes / 60;
  const WEAR_PER_HOUR = 0.5; // 0.5% par heure
  const baseWear = flightHours * WEAR_PER_HOUR;
  
  // Pénalités
  let engineWear = baseWear;
  let gearWear = baseWear;
  let propWear = baseWear;
  
  if (stats.landing_fpm > 500) {
    gearWear *= 2; // Hard landing
  }
  if (stats.overspeed_count > 0) {
    engineWear *= 1.5;
    propWear *= 1.5;
  }
  if (stats.max_g_force > 3.5) {
    engineWear *= 1.5;
  }
  
  // 3. Appliquer l'usure
  aircraft.systems.engine_condition -= engineWear;
  aircraft.systems.landing_gear_condition -= gearWear;
  aircraft.systems.propeller_condition -= propWear;
  
  // 4. Mettre à jour position et heures
  aircraft.location_icao = stats.arrival_icao;
  aircraft.flight_hours += flightHours;
  
  await saveAircraft(aircraft);
  
  return { 
    success: true,
    wear_applied: { engine: engineWear, gear: gearWear, prop: propWear },
    new_location: aircraft.location_icao
  };
}
```

### 2.3 Validation des stats de vol

```typescript
function validateFlightStats(stats: FlightStats, aircraft: Aircraft): ValidationResult {
  const errors: string[] = [];
  
  // 1. Temps de vol réaliste ? (max 24h)
  if (stats.flight_time_minutes > 1440) {
    errors.push("FLIGHT_TOO_LONG");
  }
  
  // 2. Distance cohérente avec le temps ? (max 300 kts)
  const maxDistance = (stats.flight_time_minutes / 60) * 300;
  if (stats.distance_nm > maxDistance * 1.2) {
    errors.push("IMPOSSIBLE_SPEED");
  }
  
  // 3. Départ correspond à la dernière position connue ?
  if (aircraft.location_icao !== stats.departure_icao) {
    errors.push("TELEPORTATION_DETECTED");
  }
  
  // 4. G-force réaliste ? (max 10g)
  if (stats.max_g_force > 10) {
    errors.push("IMPOSSIBLE_G_FORCE");
  }
  
  if (errors.length > 0) {
    return { valid: false, reason: errors.join(", ") };
  }
  
  return { valid: true };
}
```

---

## 3. Protection du Marché

### 3.1 Poster un ordre (validé par SEED)

```typescript
// POST /market/orders
async function postMarketOrder(request: Request): Promise<Response> {
  const { item_code, quantity, price_per_unit, airport_icao } = await request.json();
  const playerId = request.headers.get("X-Player-ID");
  
  // 1. Le joueur a les items en inventaire ?
  const inventory = await getPlayerInventory(playerId, airport_icao);
  const item = inventory.find(i => i.item_code === item_code);
  
  if (!item || item.quantity < quantity) {
    return error(400, "INSUFFICIENT_ITEMS");
  }
  
  // 2. Prix raisonnable ? (anti-manipulation)
  const basePrice = await getItemBasePrice(item_code);
  if (price_per_unit < basePrice * 0.1 || price_per_unit > basePrice * 10) {
    return error(400, "PRICE_OUT_OF_RANGE");
  }
  
  // 3. Retirer les items de l'inventaire
  item.quantity -= quantity;
  await saveInventory(playerId, airport_icao, inventory);
  
  // 4. Créer l'ordre
  const order = {
    id: generateUUID(),
    seller_id: playerId,
    item_code,
    quantity,
    price_per_unit,
    airport_icao,
    created_at: Date.now()
  };
  
  await saveMarketOrder(order);
  
  return json({ success: true, order_id: order.id });
}
```

### 3.2 Acheter un ordre (validé par SEED)

```typescript
// POST /market/orders/:id/buy
async function buyMarketOrder(request: Request, orderId: string): Promise<Response> {
  const { quantity } = await request.json();
  const buyerId = request.headers.get("X-Player-ID");
  
  // 1. Charger l'ordre
  const order = await getMarketOrder(orderId);
  if (!order) return error(404, "ORDER_NOT_FOUND");
  
  // 2. Pas d'auto-achat
  if (order.seller_id === buyerId) {
    return error(400, "CANNOT_BUY_OWN_ORDER");
  }
  
  // 3. Stock suffisant ?
  if (order.quantity < quantity) {
    return error(400, "INSUFFICIENT_STOCK");
  }
  
  // 4. SEED calcule le coût total
  const totalCost = order.price_per_unit * quantity;
  
  // 5. Acheteur a les fonds ?
  const buyer = await getPlayer(buyerId);
  if (buyer.money < totalCost) {
    return error(400, "INSUFFICIENT_FUNDS");
  }
  
  // 6. SEED effectue la transaction
  buyer.money -= totalCost;
  
  const seller = await getPlayer(order.seller_id);
  seller.money += totalCost;
  
  order.quantity -= quantity;
  
  // 7. Ajouter items à l'inventaire acheteur
  await addToInventory(buyerId, order.airport_icao, order.item_code, quantity);
  
  // 8. Sauvegarder
  await savePlayer(buyer);
  await savePlayer(seller);
  if (order.quantity > 0) {
    await saveMarketOrder(order);
  } else {
    await deleteMarketOrder(orderId);
  }
  
  return json({ 
    success: true,
    new_balance: buyer.money,
    items_received: quantity
  });
}
```

---

## 4. Protection des Missions

### 4.1 Créer une mission

```typescript
// POST /missions
async function createMission(request: Request): Promise<Response> {
  const { aircraft_id, destination_icao, cargo } = await request.json();
  const playerId = request.headers.get("X-Player-ID");
  
  // 1. L'avion appartient au joueur ?
  const aircraft = await getAircraft(aircraft_id);
  if (aircraft.owner_id !== playerId) {
    return error(403, "NOT_YOUR_AIRCRAFT");
  }
  
  // 2. L'avion n'est pas déjà en mission ?
  const existingMission = await getActiveMission(aircraft_id);
  if (existingMission) {
    return error(400, "AIRCRAFT_ALREADY_IN_MISSION");
  }
  
  // 3. Systèmes OK ? (pas de système en panne)
  if (aircraft.systems.engine_condition < 10 || 
      aircraft.systems.landing_gear_failed ||
      aircraft.systems.electrical_failed) {
    return error(400, "AIRCRAFT_NOT_AIRWORTHY");
  }
  
  // 4. SEED calcule la distance et temps estimé
  const departure = await getAirport(aircraft.location_icao);
  const destination = await getAirport(destination_icao);
  const distance = calculateDistance(departure, destination);
  const estimatedTime = distance / 120; // 120 kts moyenne
  
  // 5. SEED calcule les récompenses de base
  const baseXP = Math.floor(distance * 2);
  const baseReward = Math.floor(distance * 10);
  
  // 6. Créer la mission
  const mission = {
    id: generateUUID(),
    player_id: playerId,
    aircraft_id,
    departure_icao: aircraft.location_icao,
    destination_icao,
    distance_nm: distance,
    estimated_time_hours: estimatedTime,
    base_xp: baseXP,
    base_reward: baseReward,
    cargo,
    fuel_at_start: aircraft.fuel_gallons,
    status: "in_progress",
    created_at: Date.now()
  };
  
  await saveMission(mission);
  
  return json({ success: true, mission });
}
```

### 4.2 Compléter une mission (CRITIQUE - Anti-triche)

```typescript
// POST /missions/:id/complete
async function completeMission(request: Request, missionId: string): Promise<Response> {
  const playerId = request.headers.get("X-Player-ID");
  const flightStats: FlightStats = await request.json();
  
  // 1. Charger la mission
  const mission = await getMission(missionId);
  if (!mission) return error(404, "MISSION_NOT_FOUND");
  
  // 2. Mission appartient au joueur ?
  if (mission.player_id !== playerId) {
    return error(403, "NOT_YOUR_MISSION");
  }
  
  // 3. Mission en cours ?
  if (mission.status !== "in_progress") {
    return error(400, "MISSION_NOT_ACTIVE");
  }
  
  // 4. VALIDER les stats de vol
  const validation = validateMissionCompletion(mission, flightStats);
  if (!validation.valid) {
    // Flaguer le joueur
    await flagSuspiciousActivity(playerId, validation.reason);
    return error(400, validation.reason);
  }
  
  // 5. SEED CALCULE le score (pas le client !)
  const score = calculateMissionScore(mission, flightStats);
  
  // 6. SEED CALCULE les récompenses finales
  const xpEarned = Math.floor(mission.base_xp * score.multiplier);
  const moneyEarned = Math.floor(mission.base_reward * score.multiplier);
  
  // 7. Appliquer l'usure à l'avion
  const aircraft = await getAircraft(mission.aircraft_id);
  await applyWear(aircraft.id, flightStats);
  
  // 8. Mettre à jour carburant
  aircraft.fuel_gallons = flightStats.fuel_remaining;
  aircraft.location_icao = mission.destination_icao;
  await saveAircraft(aircraft);
  
  // 9. Créditer le joueur
  const player = await getPlayer(playerId);
  player.xp += xpEarned;
  player.money += moneyEarned;
  
  // 10. Mettre à jour stats pilote
  player.career_stats.total_flights += 1;
  player.career_stats.total_distance_nm += flightStats.distance_nm;
  player.career_stats.total_flight_hours += flightStats.flight_time_minutes / 60;
  
  await savePlayer(player);
  
  // 11. Marquer mission comme complétée
  mission.status = "completed";
  mission.completed_at = Date.now();
  mission.final_score = score;
  mission.xp_earned = xpEarned;
  mission.money_earned = moneyEarned;
  await saveMission(mission);
  
  return json({
    success: true,
    score: score,
    xp_earned: xpEarned,
    money_earned: moneyEarned,
    new_balance: player.money,
    new_xp: player.xp
  });
}

function validateMissionCompletion(mission: Mission, stats: FlightStats): ValidationResult {
  const errors: string[] = [];
  const flags: string[] = [];
  
  // 1. Position finale proche de la destination ? (tolérance 10nm)
  // Note: On fait confiance au client pour la position, mais on vérifie la cohérence
  
  // 2. Temps de vol réaliste ? (min 30% du temps estimé)
  const minTime = mission.estimated_time_hours * 60 * 0.3;
  if (stats.flight_time_minutes < minTime) {
    errors.push("FLIGHT_TOO_FAST");
    flags.push("SPEED_HACK_SUSPECTED");
  }
  
  // 3. Carburant consommé cohérent ?
  const fuelUsed = mission.fuel_at_start - stats.fuel_remaining;
  const minFuelExpected = mission.distance_nm * 0.05; // ~5 gal/100nm minimum
  if (fuelUsed < minFuelExpected && stats.flight_time_minutes > 10) {
    errors.push("FUEL_ANOMALY");
    flags.push("FUEL_CHEAT_SUSPECTED");
  }
  
  // 4. Distance parcourue cohérente ?
  const maxSpeed = 300; // kts
  const maxPossibleDistance = (stats.flight_time_minutes / 60) * maxSpeed;
  if (stats.distance_nm > maxPossibleDistance * 1.2) {
    errors.push("IMPOSSIBLE_DISTANCE");
    flags.push("TELEPORT_SUSPECTED");
  }
  
  if (errors.length > 0) {
    return { valid: false, reason: errors.join(", "), flags };
  }
  
  return { valid: true };
}

function calculateMissionScore(mission: Mission, stats: FlightStats): MissionScore {
  let score = 1000; // Base
  let multiplier = 1.0;
  
  // Pénalités (calculées par SEED, pas client !)
  if (stats.landing_fpm > 500) {
    score -= 200;
    multiplier -= 0.1;
  }
  if (stats.overspeed_count > 0) {
    score -= stats.overspeed_count * 50;
    multiplier -= 0.05 * stats.overspeed_count;
  }
  if (stats.max_g_force > 2.5) {
    score -= 100;
    multiplier -= 0.05;
  }
  
  // Bonus (calculés par SEED, pas client !)
  if (stats.landing_fpm < 100) {
    score += 150;
    multiplier += 0.1;
  }
  if (stats.landing_fpm < 50) {
    score += 100; // Butter landing bonus
    multiplier += 0.05;
  }
  
  // Grade
  let grade = "F";
  if (score >= 1200) grade = "S";
  else if (score >= 1000) grade = "A";
  else if (score >= 800) grade = "B";
  else if (score >= 600) grade = "C";
  else if (score >= 400) grade = "D";
  
  return { score, multiplier: Math.max(0.5, multiplier), grade };
}
```

---

## 5. Système Trust Score

### 5.1 Structure

```typescript
interface PlayerTrustScore {
  player_id: string;
  trust_score: number;      // 0-100, démarre à 100
  suspicious_events: string[];
  last_flag_date: number;
  restrictions: string[];
}
```

### 5.2 Pénalités

```typescript
const TRUST_PENALTIES: Record<string, number> = {
  // Sévères
  "TELEPORT_SUSPECTED": -30,
  "SPEED_HACK_SUSPECTED": -25,
  "MONEY_MANIPULATION": -40,
  
  // Moyennes
  "FUEL_CHEAT_SUSPECTED": -15,
  "IMPOSSIBLE_DISTANCE": -20,
  "IMPOSSIBLE_G_FORCE": -10,
  
  // Légères
  "FLIGHT_TOO_FAST": -10,
  "FUEL_ANOMALY": -10,
  "PRICE_MANIPULATION": -15,
};

async function flagSuspiciousActivity(playerId: string, reason: string): Promise<void> {
  const trust = await getPlayerTrust(playerId);
  
  const penalty = TRUST_PENALTIES[reason] || -5;
  trust.trust_score = Math.max(0, trust.trust_score + penalty);
  trust.suspicious_events.push(`${Date.now()}: ${reason}`);
  trust.last_flag_date = Date.now();
  
  // Appliquer restrictions basées sur le score
  trust.restrictions = [];
  
  if (trust.trust_score < 50) {
    trust.restrictions.push("STRICT_VALIDATION");
  }
  if (trust.trust_score < 30) {
    trust.restrictions.push("NO_MARKET_SELLING");
    trust.restrictions.push("REDUCED_REWARDS"); // -50% XP/argent
  }
  if (trust.trust_score < 10) {
    trust.restrictions.push("MISSIONS_DISABLED");
  }
  
  await savePlayerTrust(trust);
  
  console.log(`[ANTI-CHEAT] Player ${playerId} flagged: ${reason}. New score: ${trust.trust_score}`);
}
```

### 5.3 Récupération

```typescript
// Appelé quotidiennement par un cron job Cloudflare
async function dailyTrustRecovery(): Promise<void> {
  const allPlayers = await getAllPlayerTrusts();
  
  for (const trust of allPlayers) {
    const daysSinceLastFlag = (Date.now() - trust.last_flag_date) / (1000 * 60 * 60 * 24);
    
    if (daysSinceLastFlag >= 1 && trust.trust_score < 100) {
      // Récupère 2 points par jour sans incident
      trust.trust_score = Math.min(100, trust.trust_score + 2);
      await savePlayerTrust(trust);
    }
  }
}
```

### 5.4 Sanctions

| Trust Score | Niveau | Conséquences |
|-------------|--------|--------------|
| 70-100 | Normal | Aucune restriction |
| 50-70 | Warning | Message d'avertissement affiché |
| 30-50 | Surveillance | Validation renforcée, logs détaillés |
| 10-30 | Restriction | Pas de vente market, -50% récompenses |
| 0-10 | Exclu | Missions désactivées, lecture seule |

---

## 6. Tracking Vol en Arrière-Plan

### 6.1 Objectif

Même sans mission active, le SEED doit être informé des vols pour:
- Mettre à jour la position de l'avion
- Appliquer l'usure
- Détecter les anomalies (téléportation)

### 6.2 Implémentation côté EFB

```typescript
// FreeFlightTracker.ts
class FreeFlightTracker {
  private isTracking = false;
  private lastUpdate = Date.now();
  private sessionStats = {
    flight_time_minutes: 0,
    distance_nm: 0,
    max_g_force: 1,
    overspeed_count: 0,
    departure_icao: "",
    current_icao: ""
  };
  
  // Appelé toutes les 30 secondes
  async tick(): Promise<void> {
    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "bool");
    const airspeed = SimVar.GetSimVarValue("AIRSPEED INDICATED", "knots");
    
    if (!onGround && airspeed > 50) {
      // En vol
      if (!this.isTracking) {
        this.startTracking();
      }
      this.updateStats();
    } else if (this.isTracking && onGround) {
      // Vient d'atterrir
      await this.endTracking();
    }
  }
  
  private startTracking(): void {
    this.isTracking = true;
    this.lastUpdate = Date.now();
    this.sessionStats = {
      flight_time_minutes: 0,
      distance_nm: 0,
      max_g_force: 1,
      overspeed_count: 0,
      departure_icao: this.getCurrentNearestAirport(),
      current_icao: ""
    };
  }
  
  private async endTracking(): Promise<void> {
    this.isTracking = false;
    this.sessionStats.current_icao = this.getCurrentNearestAirport();
    
    // Envoyer au SEED pour validation et mise à jour
    await SyncService.reportFreeFlightEnd({
      aircraft_id: this.currentAircraftId,
      stats: this.sessionStats
    });
  }
}
```

### 6.3 Validation côté SEED

```typescript
// POST /aircraft/:id/free-flight-end
async function handleFreeFlightEnd(request: Request, aircraftId: string): Promise<Response> {
  const { stats } = await request.json();
  const playerId = request.headers.get("X-Player-ID");
  
  const aircraft = await getAircraft(aircraftId);
  
  // Valider (même logique que les missions, mais plus permissive)
  const validation = validateFlightStats(stats, aircraft);
  if (!validation.valid) {
    await flagSuspiciousActivity(playerId, validation.reason);
    // On applique quand même l'usure minimale
  }
  
  // Appliquer usure (même calcul que missions)
  await applyWear(aircraftId, stats);
  
  return json({ success: true });
}
```

---

## 7. Checklist Implémentation

### Côté SEED (Cloudflare Workers) — `seed-server/src/index.ts`

- [x] Middleware validation API Key + Player ID (ligne 173-183)
- [x] Validation achat carburant (calcul prix côté SEED) (ligne 596-647)
- [x] Validation achat avion (vérification fonds + déduction) (ligne 1025-1043)
- [x] Validation transaction marché (transfert atomique) (ligne 909-975)
- [x] Validation création mission (ligne 659-716)
- [x] Validation complétion mission (calcul score/XP/argent) (ligne 718-819)
- [x] Validation stats de vol (anti-téléportation, anti-speed) (ligne 312-366)
- [x] Calcul et application usure (ligne 774-789)
- [x] Système Trust Score (pénalités) (ligne 188-227)
- [ ] Endpoint free-flight-end ❌ **NON IMPLÉMENTÉ**
- [x] Logs anti-triche (console.log sur toutes les actions)
- [ ] Cron récupération trust quotidienne ❌ **NON IMPLÉMENTÉ**

### Côté EFB (Client)

- [x] Headers X-API-Key + X-Player-ID sur toutes les requêtes (`SyncService.ts:185-191`)
- [ ] Détection fuel anomaly + reset ⚠️ **PARTIEL**
- [ ] FreeFlightTracker (background tracking) ❌ **NON IMPLÉMENTÉ**
- [ ] Affichage Trust Score dans profil ❌ **NON IMPLÉMENTÉ**
- [ ] Affichage restrictions si applicable ❌ **NON IMPLÉMENTÉ**
- [x] Ne jamais envoyer de valeurs calculées (XP, argent, score) ✅

---

## 8. Résumé des Principes (MODE ONLINE)

```
┌─────────────────────────────────────────────────────────────┐
│            RÈGLES D'OR ANTI-TRICHE (ONLINE ONLY)            │
│                                                              │
│  ⚠️  Ces règles NE S'APPLIQUENT PAS au mode Solo !         │
│                                                              │
│  1. Le CLIENT envoie des FAITS, jamais des CALCULS          │
│     ✅ "J'ai volé 45 min, atterri à 150 fpm"                │
│     ❌ "J'ai gagné 5000 XP"                                  │
│                                                              │
│  2. Le SEED CALCULE tout                                     │
│     • XP gagné                                               │
│     • Argent gagné/dépensé                                   │
│     • Usure appliquée                                        │
│     • Score mission                                          │
│     • Prix du carburant                                      │
│                                                              │
│  3. Le SEED VALIDE avant d'exécuter                         │
│     • Fonds suffisants ?                                     │
│     • Stock disponible ?                                     │
│     • Stats de vol réalistes ?                               │
│     • Pas de téléportation ?                                 │
│                                                              │
│  4. Anomalie = Flag + Pénalité Trust Score                  │
│     • Pas de ban immédiat                                    │
│     • Restrictions progressives                              │
│     • Récupération possible                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Récapitulatif par Mode

| Aspect | Mode Solo | Mode Online |
|--------|-----------|-------------|
| Anti-triche | ❌ Désactivé | ✅ Strict |
| Validation SEED | ❌ Non | ✅ Oui |
| Trust Score | ❌ Non | ✅ Oui |
| XP/Argent calculé par | Client (local) | SEED (serveur) |
| Triche possible | ✅ Oui (bac à sable) | ❌ Non |
| Impact autres joueurs | ❌ Aucun | ✅ Monde partagé |
