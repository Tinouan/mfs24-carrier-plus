# MFS World of Aircraft - Systeme Anti-Triche

**Version**: 2.0 (Architecture P2P)
**Date**: 2026-02-03
**Statut**: Implemente
**Document pour**: Claude Code (VS Code)

---

## Vue d'ensemble

Le systeme anti-triche de MFS World of Aircraft protege l'integrite des donnees de jeu en utilisant **SQLite local comme source de verite**. En mode multi, le HOST valide toutes les actions.

### Principe fondamental

**Mode Solo:**
```
SQLite local = Source de verite
     |
     v
Simulateur MSFS = Affichage uniquement
```

**Mode Multi (P2P):**
```
CLIENT → Intention → HOST → Validation → SQLite → Sync
                           ↓
                        Resultat
```

Le simulateur recoit les donnees de SQLite, pas l'inverse.

---

## 1. Protection du Carburant

### 1.1 Menace

Les joueurs peuvent utiliser le panneau carburant natif de MSFS pour:
- Ajouter du carburant gratuitement
- Contourner le systeme de cout de carburant
- Avoir un avantage economique injuste

### 1.2 Solution implementee

**Flux securise:**

```
[Connexion joueur]
       |
       v
[Lire carburant BDD] --> [Appliquer au simulateur]
       |
       v
[Simulateur affiche le carburant BDD]
```

**Points de synchronisation (DB --> Sim):**

| Moment | Action | Fonction |
|--------|--------|----------|
| Connexion/Login | Restaure carburant + condition | `autoSyncCurrentAircraft()` |
| Resume app (retour menu) | Restaure carburant + condition | `autoSyncCurrentAircraft()` |
| Changement onglet Hangar | Restaure carburant + condition | `autoSyncCurrentAircraft()` |
| Changement onglet Missions | Restaure carburant + condition | `autoSyncCurrentAircraft()` |
| Chargement mission | Applique le carburant DB | `loadCurrentAircraftForMission()` |
| Selection Hangar | Applique si avion actif | `fetchAircraftDetails()` |
| Bouton SYNC | Enforce le carburant DB | `syncFuelFromSimulator()` |

**Seul moyen legitime d'ajouter du carburant:**

| Action | Resultat |
|--------|----------|
| Popup REMPLIR | Ecrit dans sim + sauvegarde en BDD |
| Fin de mission | Sauvegarde le carburant restant en BDD |

### 1.3 Detection de triche

```typescript
// Si carburant simulateur > carburant BDD = tentative de triche
if (simFuelCurrent > dbFuelGallons + 1) {
  console.warn(`[WorldOfAircraft] ANTI-CHEAT: Sim fuel (${simFuelCurrent}) > DB fuel (${dbFuelGallons}). Resetting.`);
}
```

Le systeme:
1. Detecte la discrepance
2. Log l'evenement (pour monitoring futur)
3. Remet le carburant au niveau BDD

### 1.4 Ecriture dans le simulateur

```typescript
private setSimulatorFuel(targetGallons: number, capacityGallons: number): void {
  const targetLevel = Math.min(1.0, Math.max(0.0, targetGallons / capacityGallons));

  // Ecrire dans TOUS les reservoirs
  const fuelTanks = [
    "FUEL TANK CENTER LEVEL",
    "FUEL TANK LEFT MAIN LEVEL",
    "FUEL TANK RIGHT MAIN LEVEL",
    "FUEL TANK LEFT AUX LEVEL",
    "FUEL TANK RIGHT AUX LEVEL",
    "FUEL TANK LEFT TIP LEVEL",
    "FUEL TANK RIGHT TIP LEVEL",
    "FUEL TANK EXTERNAL1 LEVEL",
    "FUEL TANK EXTERNAL2 LEVEL",
    "FUEL TANK CENTER2 LEVEL",
    "FUEL TANK CENTER3 LEVEL",
  ];

  for (const tank of fuelTanks) {
    SimVar.SetSimVarValue(tank, "percent over 100", targetLevel);
  }
}
```

Note: `FUEL TOTAL QUANTITY` est en lecture seule, il faut ecrire dans chaque reservoir individuellement.

---

## 2. Protection des Systemes Avion

### 2.1 Donnees protegees

| Donnee | Protection |
|--------|------------|
| Condition generale | BDD uniquement, pas de SimVar |
| Heures de vol | BDD uniquement |
| Etat moteur | BDD uniquement |
| Etat train d'atterrissage | BDD uniquement |
| Etat helice | BDD uniquement |
| Etat electrique | BDD uniquement |
| Etat pitot | BDD uniquement |
| Etat avionique | BDD uniquement |

### 2.2 Pourquoi c'est securise

Ces donnees n'ont **pas d'equivalent SimVar** dans MSFS. Elles sont:
- Stockees uniquement en SQLite local
- Calculees localement par les services (usure, reparations)
- Affichees dans l'EFB mais non modifiables directement
- En mode multi: validees par le HOST

### 2.3 Calcul d'usure (local/HOST)

L'usure est calculee localement lors de la completion de mission:

```typescript
// WearService.calculateWear()
function calculateWear(flightStats: FlightStats): WearResult {
  const wear: WearResult = {};

  // Usure basee sur le temps de vol
  const flightHours = (flightStats.flight_time_minutes || 0) / 60;
  const baseWear = flightHours * WEAR_PER_HOUR;

  // Penalites
  if (flightStats.hard_landing) {
    wear.landing_gear = baseWear * 2;
  }
  if ((flightStats.overspeed_events || 0) > 0) {
    wear.engine = baseWear * 1.5;
  }
  if ((flightStats.max_g_force || 1) > 3.5) {
    wear.avionics = baseWear * 1.5;
  }

  return wear;
}
```

---

## 3. Protection du Cargo

### 3.1 Systeme d'inventaire

Le cargo est gere via le systeme d'inventaire local (mode solo) ou HOST (mode multi):

| Element | Protection |
|---------|------------|
| Items en inventaire | SQLite uniquement |
| Poids du cargo | Calcule par InventoryService |
| Capacite cargo | Definie dans aircraft_catalog |
| Transferts | Valides localement / par HOST |

### 3.2 Validation des transferts

```typescript
// InventoryService.loadCargo() valide:
// 1. L'item existe dans l'inventaire source
// 2. L'avion appartient au joueur/company
// 3. La capacite n'est pas depassee
// 4. L'avion est au bon aeroport (meme ICAO)
```

---

## 4. V1.6 - Tracking de Vol en Arriere-Plan (Anti-Cheat)

### 4.1 Menace

Les joueurs peuvent contourner le systeme en:
- Volant sans demarrer de mission (eviter l'usure)
- Deplacant l'avion "gratuitement" entre aeroports
- Evitant les penalites d'atterrissage dur

### 4.2 Solution implementee

L'EFB suit **tous les vols**, meme sans mission active:

```
[Tracking en arriere-plan - toutes les 30s]
       |
       v
[Detection decollage] --> [Timer + Stats]
       |
       v
[Detection atterrissage] --> [Envoi usure au serveur]
```

**Donnees capturees en arriere-plan:**

| Donnee | Usage |
|--------|-------|
| Temps de vol (minutes) | Usure horaire |
| G-force max | Penalite structure |
| Overspeed detecte | Penalite moteur/helice |
| Vitesse verticale atterrissage | Penalite train |
| Aeroport d'atterrissage | Mise a jour position |

### 4.3 Service local

```typescript
// FleetService.applyBackgroundWear()
await FleetService.applyBackgroundWear(aircraftId, {
  flight_minutes: 45,
  landing_fpm: 180,
  max_gforce: 1.5,
  had_overspeed: false,
  landing_icao: "LFPG"
});
```

Resultat: Applique l'usure + met a jour la position de l'avion dans SQLite.

### 4.4 Detection de vol

```typescript
// Conditions de decollage (debut tracking)
const isFlying = !onGround && airspeed > 50 && engineRunning;

// Conditions d'atterrissage (fin tracking)
const hasLanded = onGround && wasFlying && groundSpeed < 5;
```

### 4.5 Difference Mission vs Background

| Aspect | Vol en Mission | Vol sans Mission |
|--------|----------------|------------------|
| Intervalle tracking | 2 secondes | 30 secondes |
| Donnees capturees | Completes (position, replay) | Minimales (stats) |
| Usure appliquee | A la completion | A l'atterrissage |
| XP/Rewards | Oui | Non |
| Position avion | Mise a jour | Mise a jour |

---

## 5. Protection des Missions

### 5.1 V1.6 - Validation a la creation

**Verifications locales / HOST:**
```typescript
// MissionService.createMission() valide:
// - Avion existe et appartient au joueur
// - Avion a l'aeroport de depart (SQLite)
// - Systemes critiques > 10% (peut decoller)
// - Carburant suffisant (optionnel)
```

**V1.6 - Verification position client (EFB):**

L'EFB verifie que le joueur est physiquement a l'aeroport de l'avion:

```typescript
// Verification anti-cheat position
const dbAirport = aircraft.current_airport_ident;    // Position SQLite
const simVarAirport = this.closestAirport.get();     // SimVar GPS

// Si SimVar fonctionne et montre un aeroport different = bloquer
if (dbAirport && simVarAirport !== "----" && simVarAirport !== dbAirport) {
  // "L'avion est a {db}, vous etes a {detected}"
  return; // Bloquer creation mission
}
```

**Cas geres:**
| Situation | Action |
|-----------|--------|
| SimVar = DB airport | OK, autoriser |
| SimVar = "----" (pas de detection) | OK, benefice du doute |
| SimVar = autre aeroport | BLOQUER |

### 5.2 Validation a la completion

```typescript
// MissionService.completeMission() valide:
// Donnees du client:
// - Position finale (latitude, longitude, aeroport ICAO)
// - Statistiques de vol (temps, G-force, etc.)
// - Carburant final

// Verifications:
// - Mission existe et est active
// - Appartient au joueur
// - Position finale coherente avec destination
```

**V1.6 - Detection completion par progression:**

Si le SimVar `GPS CLOSEST AIRPORT ID` ne fonctionne pas ("----"), l'EFB utilise un fallback base sur la progression:

```typescript
// Methode 1: SimVar airport detection
if (currentAirport !== "----") {
  atDestination = currentAirport === mission.destination_icao;
}

// Methode 2: Fallback progression (>= 90%)
if (!atDestination && progressPct >= 90 && parkingBrake && onGround) {
  atDestination = true;  // Completion autorisee
}
```

### 5.3 V1.6 - Gestion Position sur Annulation/Echec

**Annulation manuelle (bouton):**

L'EFB appelle MissionService avec la position actuelle:

```typescript
// MissionService.cancelMission() recoit:
{
  reason: "cancelled",
  final_latitude: currentLat,
  final_longitude: currentLon,
  final_icao: currentAirport  // V1.6
}
```

Le service met a jour `current_airport_ident` de l'avion dans SQLite.

**Timeout automatique (scheduler local):**

Missions sans mise a jour depuis 2 heures:

```typescript
// LocalScheduler toutes les 15 minutes
if (mission.last_update_at < (now - 2h)) {
  // Trouver aeroport le plus proche de la derniere position
  const closest = WorldService.findClosestAirport(
    mission.last_position_lat,
    mission.last_position_lon
  );
  aircraft.current_airport_ident = closest || mission.origin_icao;
  mission.status = "failed";
  mission.failure_reason = "timeout";
  await DatabaseManager.saveMission(mission);
  await DatabaseManager.saveAircraft(aircraft);
}
```

**Tableau des comportements:**

| Scenario | Position avion |
|----------|----------------|
| Mission completee | Destination |
| Mission annulee (bouton) | Aeroport actuel |
| Joueur quitte le jeu | Apres 2h: derniere position connue |
| Vol long (8h+) en cours | Pas de timeout si tracking actif |

### 5.4 Limitation connue

Les statistiques de vol (G-force, vitesse, atterrissage) sont lues depuis les SimVars pendant le vol. Un cheater sophistique pourrait potentiellement les manipuler. Une protection complete necessiterait:

- Telemetrie en temps reel vers le HOST (mode multi)
- Validation de coherence des donnees
- Detection d'anomalies statistiques (voir section 12)

En mode solo, le joueur peut tricher (son probleme). En mode multi, le HOST valide les donnees.

---

## 6. Protection Economique

### 6.1 Transactions validees (local/HOST)

| Transaction | Validation |
|-------------|------------|
| Achat avion | Solde >= prix, deduction atomique |
| Reparation | Cout calcule par FleetService, deduction atomique |
| Achat carburant | Prix indexe aeroport (AIEconomyService) |
| Vente items | Prix defini par MarketService |

### 6.2 Principe

Le client envoie une **intention** (ex: "reparer moteur"), le service local ou HOST:
1. Calcule le cout
2. Verifie le solde
3. Effectue la transaction atomique dans SQLite
4. Retourne le resultat

Le client ne peut pas specifier le montant a deduire.

---

## 7. Logs et Monitoring

### 7.1 Logs anti-triche actuels

```
[WorldOfAircraft] ANTI-CHEAT: Sim fuel (XX.X) > DB fuel (YY.Y). Resetting.
[WorldOfAircraft] ANTI-CHEAT Hangar: Sim fuel (XX.X) > DB fuel (YY.Y). Resetting.
```

### 7.2 Ameliorations futures

Pour un systeme de monitoring complet (mode multi):

```typescript
// Envoyer les evenements au HOST/SEED
async function reportCheatAttempt(type: string, details: object): Promise<void> {
  await NetworkManager.sendToHost({
    action: "anticheat_report",
    type,
    details,
    timestamp: Date.now(),
    player_id: currentPlayer.id,
  });
}
```

Table SQLite potentielle:
```sql
CREATE TABLE anticheat_logs (
  id TEXT PRIMARY KEY,
  player_id TEXT,
  event_type TEXT NOT NULL,
  details TEXT,  -- JSON stringified
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 8. Resume des protections

### 8.1 Protege actuellement

| Element | Methode | Statut |
|---------|---------|--------|
| Carburant | SQLite source de verite | OK |
| Condition avion | SQLite uniquement | OK |
| Systemes avion | SQLite uniquement | OK |
| Heures de vol | SQLite uniquement | OK |
| Inventaire/Cargo | SQLite uniquement | OK |
| Transactions | Validation locale/HOST | OK |
| Positions avions | SQLite + validation | OK |
| Vol sans mission | V1.6 Background tracking | OK |
| Position sur annulation | V1.6 final_icao | OK |
| Timeout missions | V1.6 Scheduler local 2h | OK |

### 8.2 Vulnerabilites connues (acceptees)

| Element | Risque | Mitigation |
|---------|--------|------------|
| Stats de vol | Manipulation SimVars | Validation de coherence (futur) |
| Position temps reel | Teleportation | Validation distance (futur) |
| Temps de vol | Acceleration | Validation timestamps (futur) |

### 8.3 Hors scope

- Protection contre modification du code client (obfuscation)
- Protection contre injection memoire
- Verification integrite des fichiers

Ces protections necessiteraient un client lourd signe, ce qui n'est pas compatible avec l'architecture EFB web.

---

## 9. Implementation technique

### 9.1 Fichiers cles

| Fichier | Role |
|---------|------|
| `WorldOfAircraft.tsx` | setSimulatorFuel(), anti-cheat, background tracking |
| `services/FleetService.ts` | applyBackgroundWear(), fuel management |
| `services/MissionService.ts` | cancelMission(), completeMission() |
| `services/WearService.ts` | calculateWear() |
| `managers/DatabaseManager.ts` | SQLite operations |
| `managers/LocalScheduler.ts` | Timeout 2h, periodic checks |

### 9.2 Fonctions cles EFB

```typescript
// Ecriture carburant dans simulateur
private setSimulatorFuel(targetGallons: number, capacityGallons: number): void

// Sync a la connexion/resume (SQLite -> Sim + UI refresh)
private async autoSyncCurrentAircraft(): Promise<void>

// Chargement mission avec verification position (V1.6)
private async loadCurrentAircraftForMission(): Promise<void>

// V1.6: Tracking vol sans mission
private trackBackgroundFlight(): void

// V1.6: Envoi usure vol sans mission
private async sendBackgroundWear(): Promise<void>

// V1.6: Annulation mission avec position
private async cancelMission(): Promise<void>
```

### 9.3 Fonctions cles Services

```typescript
// V1.6: Annulation/echec mission avec position
MissionService.failMission(missionId, reason, finalIcao?): Promise<void>

// V1.6: Trouver aeroport le plus proche
WorldService.findClosestAirport(lat, lon): string | null

// V1.6: Timeout missions abandonees
LocalScheduler.checkMissionTimeouts(): void  // Toutes les 15min
```

---

## 10. Tests anti-triche

### 10.1 Scenario: Triche carburant via MFS

1. Joueur se connecte avec avion a 20% fuel
2. Utilise panneau MFS pour mettre 100% fuel
3. Ouvre l'app World of Aircraft ou charge une mission
4. **Resultat attendu**: Fuel remis a 20%

### 10.2 Scenario: Bouton SYNC apres triche

1. Joueur a 30% fuel en BDD
2. Utilise panneau MFS pour mettre 100%
3. Clique sur SYNC dans le Hangar
4. **Resultat attendu**: Fuel remis a 30% (pas sauvegarde a 100%)

### 10.3 Scenario: Refuel legitime

1. Joueur a 20% fuel
2. Ouvre popup REMPLIR, selectionne 80%
3. Confirme
4. **Resultat attendu**: Fuel mis a 80% dans sim ET BDD

### 10.4 V1.6 Scenario: Vol sans mission

1. Joueur decolle sans demarrer de mission
2. Vole 30 minutes, atterrit durement (500 fpm)
3. **Resultat attendu**:
   - Usure appliquee (temps + atterrissage dur)
   - Position avion mise a jour

### 10.5 V1.6 Scenario: Mission annulee

1. Joueur demarre une mission LFPG -> LFPO
2. Vole jusqu'a LFPO, atterrit
3. Annule la mission au lieu de la completer
4. **Resultat attendu**: Avion repositionne a LFPO (pas LFPG)

### 10.6 V1.6 Scenario: Joueur quitte le jeu

1. Joueur demarre une mission LFPG -> LFPO
2. Vole jusqu'a mi-chemin, quitte le jeu sans annuler
3. Attendre 2h15 (timeout + check interval)
4. **Resultat attendu**:
   - Mission marquee "failed" (timeout)
   - Avion repositionne a l'aeroport le plus proche de la derniere position

### 10.7 V1.6 Scenario: Creation mission depuis mauvais aeroport

1. Avion en BDD a LFPG
2. Joueur teleporte son avion a LFPO dans MSFS
3. Essaie de creer une mission depuis LFPO
4. **Resultat attendu**: Erreur "L'avion est a LFPG, vous etes a LFPO"

---

## 11. Evolution future

### 11.1 Phase 2 - Cout du carburant

- Prix indexe par aeroport
- Deduction du solde lors du refuel
- Historique des achats

### 11.2 Phase 3 - Telemetrie avancee

- Envoi periodique des stats de vol
- Detection d'anomalies (teleportation, acceleration)
- Systeme de reputation/confiance

### 11.3 Phase 4 - Reporting

- Dashboard admin des tentatives de triche
- Alertes automatiques
- Systeme de sanctions (warnings, bans)

### 11.4 Ameliorations V1.6 implementees

- [x] Tracking de vol en arriere-plan
- [x] Usure appliquee meme sans mission
- [x] Position avion mise a jour sur annulation
- [x] Timeout missions reduit a 2h (au lieu de 24h)
- [x] Position basee sur derniere position connue au timeout
- [x] Verification position a la creation de mission

---

## 12. Anti-Triche P2P (Monde Persistant)

> **Contexte** : Migration vers architecture P2P sans serveur central.
> Le HOST (joueur PC) devient l'autorité, le SEED (NAS) est le backup.

### 12.1 Principe fondamental P2P

```
┌─────────────────────────────────────────────────────────────────┐
│                     RÈGLE D'OR                                   │
│                                                                  │
│   CLIENT envoie des INTENTIONS                                   │
│   HOST/SEED valide et exécute                                    │
│   CLIENT reçoit le RÉSULTAT                                      │
│                                                                  │
│   Le client ne dit JAMAIS "j'ai maintenant 1M$"                 │
│   Le client dit "je veux acheter X" → HOST décide               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 Hiérarchie de confiance

| Niveau | Entité | Rôle | Confiance |
|--------|--------|------|-----------|
| 1 | SEED (NAS) | Autorité finale, toujours en ligne | 100% |
| 2 | HOST (PC joueur) | Autorité du shard, élu | 90% |
| 3 | CLIENT | Envoie intentions uniquement | 0% |

**En cas de conflit** : SEED > HOST > CLIENT

### 12.3 Validations par type d'action

#### 12.3.1 Transactions économiques

```typescript
// CLIENT envoie
{ action: "market_buy", order_id: "xxx", quantity: 10 }

// HOST/SEED valide
function validateMarketBuy(request, player): ValidationResult {
  const order = db.getMarketOrder(request.order_id);

  // 1. L'ordre existe-t-il ?
  if (!order || !order.is_active)
    return { valid: false, reason: "ORDER_NOT_FOUND" };

  // 2. Quantité disponible ?
  if (order.quantity < request.quantity)
    return { valid: false, reason: "INSUFFICIENT_QUANTITY" };

  // 3. Joueur a assez d'argent ?
  const totalCost = order.price_per_unit * request.quantity;
  if (player.money < totalCost)
    return { valid: false, reason: "INSUFFICIENT_FUNDS" };

  // 4. Joueur est à l'aéroport de l'ordre ?
  if (player.current_airport !== order.icao)
    return { valid: false, reason: "WRONG_AIRPORT" };

  // 5. Capacité cargo suffisante ?
  const itemWeight = items.getWeight(order.item_code) * request.quantity;
  if (player.aircraft.cargo_current + itemWeight > player.aircraft.cargo_capacity)
    return { valid: false, reason: "CARGO_FULL" };

  return { valid: true };
}
```

#### 12.3.2 Missions

```typescript
// CLIENT envoie intention de compléter
{
  action: "mission_complete",
  mission_id: "xxx",
  final_position: { lat: 48.8566, lon: 2.3522 },
  flight_stats: { flight_time: 45, landings: 1, max_g: 1.8 }
}

// HOST/SEED valide
function validateMissionComplete(request, mission, aircraft): ValidationResult {
  // 1. Mission existe et appartient au joueur ?
  if (!mission || mission.player_id !== request.player_id)
    return { valid: false, reason: "INVALID_MISSION" };

  // 2. Mission est active ?
  if (mission.status !== "in_progress")
    return { valid: false, reason: "MISSION_NOT_ACTIVE" };

  // 3. Position proche de la destination ? (tolérance 5nm)
  const distToDestination = calculateDistance(
    request.final_position,
    getAirportCoords(mission.destination_icao)
  );
  if (distToDestination > 5)
    return { valid: false, reason: "NOT_AT_DESTINATION" };

  // 4. Temps de vol cohérent ? (±20% de l'estimation)
  const expectedTime = mission.estimated_flight_time;
  const actualTime = request.flight_stats.flight_time;
  if (actualTime < expectedTime * 0.3) // Trop rapide = suspect
    return { valid: false, reason: "FLIGHT_TOO_FAST", flag: "SUSPICIOUS" };

  // 5. Carburant cohérent ? (consommation réaliste)
  const fuelUsed = aircraft.fuel_at_start - request.fuel_remaining;
  const minFuelExpected = mission.distance_nm * aircraft.fuel_burn_rate * 0.5;
  if (fuelUsed < minFuelExpected)
    return { valid: false, reason: "FUEL_ANOMALY", flag: "SUSPICIOUS" };

  return { valid: true };
}
```

#### 12.3.3 Free Flight (Vol libre)

```typescript
// CLIENT envoie stats périodiquement (toutes les 5 min)
{
  action: "free_flight_update",
  session_id: "xxx",
  position: { lat: 48.8566, lon: 2.3522 },
  flight_time_delta: 5,  // minutes depuis dernier update
  distance_delta: 12,    // nm depuis dernier update
  landings_delta: 0
}

// HOST/SEED valide
function validateFreeFlightUpdate(request, session): ValidationResult {
  // 1. Temps écoulé réel vs déclaré (±30 sec de tolérance)
  const realTimeDelta = (Date.now() - session.last_update) / 60000;
  if (Math.abs(realTimeDelta - request.flight_time_delta) > 0.5)
    return { valid: false, reason: "TIME_MANIPULATION" };

  // 2. Distance parcourue réaliste ? (max 300 kts = 5nm/min)
  const maxPossibleDistance = request.flight_time_delta * 5;
  if (request.distance_delta > maxPossibleDistance * 1.2)
    return { valid: false, reason: "DISTANCE_ANOMALY", flag: "SUSPICIOUS" };

  // 3. Position cohérente avec distance déclarée ?
  const actualDistance = calculateDistance(session.last_position, request.position);
  if (Math.abs(actualDistance - request.distance_delta) > 5)
    return { valid: false, reason: "POSITION_MISMATCH", flag: "SUSPICIOUS" };

  return { valid: true };
}
```

### 12.4 Calculs côté HOST uniquement

Le HOST calcule **tous** les résultats, jamais le client :

| Donnée | Calculé par | Jamais par |
|--------|-------------|------------|
| XP gagné | HOST | Client |
| Argent gagné/dépensé | HOST | Client |
| Usure appliquée | HOST | Client |
| Score mission | HOST | Client |
| Prix des items | HOST (+ fluctuation IA) | Client |

```typescript
// HOST calcule le score mission
function calculateMissionScore(mission, flightStats): MissionScore {
  let score = 1000; // Base

  // Pénalités calculées côté HOST
  if (flightStats.hard_landing) score -= 200;
  if (flightStats.overspeed_count > 0) score -= flightStats.overspeed_count * 50;
  if (flightStats.max_g > 2.5) score -= 100;

  // Bonus calculés côté HOST
  if (flightStats.landing_fpm < 100) score += 150;
  if (flightStats.fuel_efficiency > 0.9) score += 100;

  // XP calculé côté HOST
  const xp = Math.floor(score * mission.distance_nm / 100);

  return { score, xp, grade: getGrade(score) };
}
```

### 12.5 Détection d'anomalies

#### 12.5.1 Flags de suspicion

```typescript
interface PlayerTrustScore {
  player_id: string;
  trust_score: number;      // 0-100, démarre à 100
  suspicious_events: number;
  last_flag_date: Date;
}

// Événements qui réduisent le trust score
const TRUST_PENALTIES = {
  "FLIGHT_TOO_FAST": -10,
  "FUEL_ANOMALY": -15,
  "DISTANCE_ANOMALY": -20,
  "TIME_MANIPULATION": -30,
  "POSITION_MISMATCH": -25,
  "REPEATED_FAILURES": -5,
};

// Actions basées sur trust score
function checkTrustActions(player: PlayerTrustScore): void {
  if (player.trust_score < 50) {
    // Validation renforcée
    enableStrictValidation(player.player_id);
  }
  if (player.trust_score < 20) {
    // Signalement pour review
    flagForAdminReview(player.player_id);
  }
  if (player.trust_score < 0) {
    // Exclusion du monde partagé
    banFromMultiplayer(player.player_id);
  }
}
```

#### 12.5.2 Patterns suspects

| Pattern | Détection | Action |
|---------|-----------|--------|
| Argent croissant sans activité | Balance check toutes les heures | Flag + review |
| XP trop rapide | XP/heure > seuil | Validation renforcée |
| Téléportation | Distance/temps impossible | Rejeter + flag |
| Ordres market suspects | Prix anormaux, volumes excessifs | Validation manuelle |
| Missions ultra-rapides | Temps < 30% estimé | Rejeter + flag |

### 12.6 Synchronisation et consensus

#### 12.6.1 Données synchronisées vs locales

| Donnée | Sync multi-shard | Stockage |
|--------|------------------|----------|
| Market orders | OUI | HOST + SEED |
| Inventaires joueurs | OUI | HOST + SEED |
| Positions avions | OUI | HOST + SEED |
| Argent/XP joueurs | OUI | HOST + SEED |
| Mission en cours | NON (local) | Client seul |
| Position temps réel | NON (local) | Client seul |
| Stats de vol live | NON (local) | Client seul |

#### 12.6.2 Résolution de conflits

```typescript
// Règle: Last-Write-Wins avec timestamp HOST
interface SyncRecord {
  data: any;
  timestamp: number;      // Timestamp HOST (pas client!)
  host_id: string;        // Quel HOST a validé
  signature?: string;     // Optionnel: signature cryptographique
}

function resolveConflict(local: SyncRecord, remote: SyncRecord): SyncRecord {
  // SEED a toujours priorité
  if (remote.host_id === "SEED") return remote;
  if (local.host_id === "SEED") return local;

  // Sinon, le plus récent gagne
  return remote.timestamp > local.timestamp ? remote : local;
}
```

### 12.7 Mode Solo vs Multi

| Aspect | Mode Solo | Mode Multi |
|--------|-----------|------------|
| Validation | Locale (laxiste) | HOST/SEED (stricte) |
| Triche possible | Oui (son problème) | Non (protégé) |
| Progression | Non synchronisée | Synchronisée |
| Économie | IA locale | Partagée |
| Trust score | Non utilisé | Actif |

**Transition Solo → Multi** :
- Premier login multi : création profil avec valeurs de base
- Pas d'import des données solo (évite triche)
- Choix explicite: "Rejoindre le monde" = reset progression

### 12.8 Sanctions

| Niveau | Trust Score | Conséquence |
|--------|-------------|-------------|
| 0 - Warning | 50-70 | Message d'avertissement |
| 1 - Surveillance | 30-50 | Validation renforcée, logs détaillés |
| 2 - Restriction | 10-30 | Pas de vente market, missions limitées |
| 3 - Exclusion | < 10 | Banni du multi, solo uniquement |

```typescript
// Récupération du trust score (1 point/jour si pas de flag)
function dailyTrustRecovery(player: PlayerTrustScore): void {
  const daysSinceLastFlag = daysBetween(player.last_flag_date, new Date());
  if (daysSinceLastFlag > 0) {
    player.trust_score = Math.min(100, player.trust_score + daysSinceLastFlag);
  }
}
```

### 12.9 Implémentation côté HOST

```typescript
// PeerHost.ts - Middleware de validation
class PeerHost {
  private trustScores: Map<string, PlayerTrustScore> = new Map();

  async handleRequest(playerId: string, request: PlayerRequest): Promise<Response> {
    const player = this.getPlayer(playerId);
    const trustScore = this.getTrustScore(playerId);

    // 1. Valider la requête
    const validation = this.validateRequest(request, player, trustScore);

    if (!validation.valid) {
      // 2. Appliquer pénalité si flag
      if (validation.flag) {
        this.applyTrustPenalty(playerId, validation.flag);
      }
      return { success: false, error: validation.reason };
    }

    // 3. Exécuter l'action
    const result = await this.executeAction(request, player);

    // 4. Broadcast aux autres clients
    this.broadcastUpdate(result);

    // 5. Sync vers SEED
    await this.syncToSeed(result);

    return { success: true, data: result };
  }
}
```

### 12.10 Checklist implémentation anti-triche P2P

- [ ] Validation market côté HOST
- [ ] Validation missions côté HOST
- [ ] Validation free flight côté HOST
- [ ] Calcul XP/score côté HOST
- [ ] Système trust score
- [ ] Détection patterns suspects
- [ ] Sync conflits avec SEED
- [ ] Sanctions automatiques
- [ ] Recovery trust score
- [ ] Logs anti-triche vers SEED
