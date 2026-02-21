# Roadmap complète — AeroCorp Online EFB v4.4

**Date** : 13 février 2026
**Mise à jour** : Phase 9 terminée — usines, items T0/T1, icônes SVG, map intégrée

---

## Phases terminées

### Phase 0 — Nettoyage ✅
```
✅ Supprimer Company > Flotte (sub-tab + state + refs)
✅ Supprimer tab INVENTORY orpheline
✅ Build clean
```

### Phase 1 — Tags ownership + passagers ✅
```
✅ Ajouter owner_type au modèle Item en DB
✅ Ajouter passenger_seats au modèle Aircraft en DB
✅ UI pastilles bleu/orange dans inventaire, cargo, market
✅ UI "Acheter perso / Acheter company" dans Market
✅ Afficher passenger_seats dans Hangar
```

### Phase 2 — Free Flight XP + Historique ✅
```
✅ Free Flight XP v2.7
✅ TransactionLog en DB
✅ Sauvegarde auto en fin de mission et free flight
✅ Historique séparé : vols (Profile), transactions (Market), contrats (Missions)
```

### Phase 3 — Market étendu ✅
```
✅ Market réorganisé : [Inventaire | Achats | Ventes en cours | Avions | Historique]
✅ Inventaire déplacé de sidebar vers Market (premier sous-onglet)
✅ Bouton "Vendre" sur chaque item de l'inventaire
✅ Sell orders (poster, annuler, status)
✅ Catalogue avions (51 avions, achat perso/company)
✅ Vente avion : choix rapide (60%) ou marché (sell order)
✅ IA acheteur en Solo (15 min)
✅ Badge "En vente" dans Hangar
```

### Phase 4 — Company étendue ✅
```
✅ Rôles (CEO/Officier/Pilote/Recrue) + matrice permissions
✅ Guards sur tous les boutons (achats company, ventes, virements)
✅ Virements joueur ↔ company dans Overview
✅ Company > Historique (transactions company filtrées)
✅ Company > Messagerie (overlay "Online requis" en Solo, infrastructure prête)
✅ Messages système auto-générés (achats, virements, etc.)
```

### Phase 5 — Contrats (Solo + Online) ✅
```
✅ Modèle ContractOffer + ActiveContract en DB
✅ Onglet CONTRATS dans sidebar (3 sous-onglets)
✅ "Disponibles" : contrats IA générés automatiquement (~10 dispo)
✅ "En cours" : contrats acceptés, bouton Livrer (vérifie GPS)
✅ "Mes contrats" : overlay Online en Solo
✅ Distances variées : très court (20-50nm) à long (400-800nm)
✅ Cargo contrat spawné à l'aéroport + badge violet "CONTRAT"
✅ Anti-triche cargo contrat (verrouillé, non vendable)
✅ Passagers dans section Passagers (pas dans Cargo)
```

### Refactoring complet ✅ (fait en une passe, avant Phase 6)
```
✅ ContractController (~400 lignes) extrait
✅ CompanyController (~600 lignes) extrait
✅ MapController (~500 lignes) extrait
✅ MarketController (~800 lignes) extrait
✅ HangarController (~800 lignes) extrait
✅ MissionController (~700 lignes) extrait
✅ AeroCorpOnline.tsx : 7900 → 2378 lignes (orchestrateur pur)
✅ msfs-globals.d.ts créé (déclarations SimVar, Coherent, etc.)
✅ 122 erreurs TypeScript → 0 erreurs
✅ Build OK (2.6MB bundle)
✅ Locales de/es/ru complétées (alignées sur fr.json)
```

### Phase 6 — Social (Online only) ✅
```
✅ SocialController (~325 lignes) extrait
✅ SocialState.ts + LocalSocialService.ts créés
✅ SocialRenderHelpers.ts créé
✅ Profile > Social (liste d'amis, recherche, ajout/suppression)
✅ Solo : overlay "Disponible en mode Online"
```

### Phase 7 — Transferts pilote & avion ✅
```
✅ TransferState.ts + LocalTransferService.ts créés
✅ TransferRouter dans ServiceRouter.ts
✅ Map : bouton "Se déplacer ici" (transfert pilote, coût/NM)
✅ Map : bouton "Transférer un avion" (sélection avion + popup)
✅ Hangar : bouton transfert avion avec saisie ICAO destination
✅ Estimation coût en temps réel (haversine)
✅ Confirmation popup avec détails (distance, coût, solde)
```

### Anti-cheat mission ✅
```
✅ Fix SimVar GPS CLOSEST AIRPORT ID (nettoyage caractères parasites \r")
✅ Fallback coordonnées quand SimVar échoue (WorldRouter.getClosestAirport)
✅ Suppression check ATC ID (garder 3 checks : position joueur DB, SimVar, avion DB)
✅ Cacher étapes 2/3 et bouton "Créer" quand step1 invalide
✅ Renommage label "position (jeu)" → "position (AeroCorp Online)" (5 locales)
```

### Hangar — Notes avion ✅
```
✅ Champ description éditable (max 50 chars) sur chaque avion
✅ Texte gris italique "Ajouter une note..." cliquable
✅ Input inline avec setupInputEventBlocker (Enter/blur = save)
✅ Sauvegardé en DB (aircraft.description)
✅ Clé traduction addNote dans 5 locales
```

### Phase 8 — Debug audit ✅
```
✅ Dead code removal
✅ Repair wallet fix
✅ Transaction history cleanup
```

### Phase 9 — Usines & économie complète ✅
```
✅ Items T0 (37 matières premières) + T1 (39 items transformés), prix réalistes
✅ Recettes T1 (39 recettes : alimentation, métaux, matériaux, carburants, chimie)
✅ 89 icônes SVG inline (37 T0 + 39 T1 + 13 personnel) via svgTextPlugin
✅ ItemService + RecipeService + WorkerService + LocalFactoryService
✅ FactoryController (~1086 lignes) : liste, détail, craft slots dynamiques, rename
✅ Usines T1-T10 : tiers équilibrés (food_capacity, max_workers, max_engineers, max_ingredients)
✅ Construction usine depuis la Map (sélection aéroport + slots disponibles)
✅ Production auto + timer (FactoryScheduler : batch completion + hourly tick)
✅ Workers : achetables, assignables, XP tiers (Novice→Maitre), blessures, nourriture
✅ Ingénieurs : bonus production vitesse (diminishing returns)
✅ Nourriture : stock consommé par les workers, bonus tier, efficacité réduite sans food
✅ Craft slots dynamiques (2-5) selon tier usine
✅ Icône produit sur les cartes usine (couleur=producing, grisé=idle, ?=jamais produit)
✅ Rename usine inline (click→input, Enter/blur=save, Escape=cancel)
✅ Map : usines visibles avec icône produit (SVG imbriqué dans marqueur OpenLayers)
✅ DatabaseManager : Factory, WorkerInstance, ProductionBatch tables
✅ FactoryState (Subject pattern) + ServiceAdapter routing
✅ Build OK (2.9MB bundle)
```

### Phase Stabilisation Position + FreeFlight (20 février 2026) ✅
```
✅ PositionService : 5 bypass corrigés, source de vérité unique
✅ FreeFlightController extrait du TSX (~127 lignes retirées)
✅ FlightTracker : XP, career stats, FPM touchdown, fallback GPS
✅ Missions : maxGForce, distance, money reward solo
✅ Historique vols : free flights affichés + clic → recap
✅ UI : position:fixed → absolute, messages erreur améliorés
```

### Fixes transversaux ✅
```
✅ Persistence unifiée (DatabaseManager → AeroCorpOnlineData)
✅ Fix solde initial 100,000 CR
✅ Fix refresh EFB → pilote conservé
✅ Fix systèmes avion stables (read-only)
✅ Fix popup refuel (vrai overlay centré)
✅ Fix badge "En vente" après annulation
✅ Fix arrondi montants (formatMoney partout)
✅ Fix déchargement passagers
✅ Fix détection aéroport SimVar
✅ Fix fetchCurrentUser → PlayerRouter.getPlayer()
✅ Fix cargo popup unload (quantité synchronisée slider/display)
```

---

## Structure actuelle des onglets

```
SIDEBAR (9 onglets)
│
├── PROFILE
│   ├── Infos ........................ ✅
│   └── Historique des vols .......... ✅
│
├── MAP
│   └── (vue unique + filtres Fac/Heli) ✅
│
├── MISSIONS
│   ├── Aperçu/Tracking .............. ✅
│   ├── Création ..................... ✅
│   └── Historique contrats .......... ✅
│
├── CONTRATS ......................... ✅
│   ├── Disponibles .................. ✅
│   ├── Mes contrats ................. ✅ (Online only)
│   └── En cours ..................... ✅
│
├── COMPANY
│   ├── Overview (+ virements) ....... ✅
│   ├── Membres (+ rôles) ........... ✅
│   ├── Inventaire ................... ✅
│   ├── Usines ...................... ✅ (Phase 9)
│   ├── Historique ................... ✅
│   └── Messagerie .................. ✅ (Online only)
│
├── MARKET
│   ├── Inventaire ................... ✅
│   ├── Achats ...................... ✅
│   ├── Ventes en cours .............. ✅
│   ├── Avions ...................... ✅
│   └── Historique ................... ✅
│
├── HANGAR
│   └── (vue unique) ................. ✅
│
└── SETTINGS (en bas)
    └── (vue unique) ................. ✅
```

---

## Architecture après Phase 9

```
AeroCorpOnline.tsx (~2500 lignes)
  = Orchestrateur : init, render, routing, event wiring
  = Instancie 8 controllers

controllers/ (~7400 lignes total)
  ├── MissionController.ts    (2291 lignes)
  ├── MarketController.ts     (1130 lignes)
  ├── FactoryController.ts    (1086 lignes) ← Phase 9
  ├── MapController.ts        (1087 lignes)
  ├── HangarController.ts      (751 lignes)
  ├── CompanyController.ts     (471 lignes)
  ├── SocialController.ts      (325 lignes)
  └── ContractController.ts    (259 lignes)

services/ (~2800 lignes ajoutées Phase 9)
  ├── LocalFactoryService.ts   (565 lignes)
  ├── WorkerService.ts         (250 lignes)
  ├── ItemService.ts           (120 lignes)
  ├── RecipeService.ts         (100 lignes)
  └── ... (existants)

managers/
  ├── FactoryScheduler.ts      (200 lignes) ← Phase 9
  └── ... (existants)

constants/
  └── factory.ts               (165 lignes) ← Phase 9

data/
  ├── items.json               (137 items : 37 T0 + 39 T1 + personnel)
  ├── recipes.json             (39 recettes T1)
  ├── itemIconMap.ts           (79 mappings icon_path → SVG string)
  └── ... (existants)

Assets/icons/                  ← Phase 9
  ├── items/t0/                (37 SVG, 64x64)
  ├── items/t1/                (39 SVG, 64x64)
  └── personnel/               (10 SVG, 64x64)

state/
  └── FactoryState.ts          ← Phase 9

views/          ← Rendu JSX par onglet
helpers/        ← Fonctions de rendu DOM (renderItemIcon)
types/          ← Types + msfs-globals.d.ts
```

---

## Phases à venir

---

### Phase 10 — Kits conversion cargo↔pax (Solo + Online) — 4-6h
```
□ Champ configuration sur Aircraft ("cargo" | "passenger" | "combi")
□ Items Small/Medium/Large Conversion Kit (craftables en usine T3-T4)
□ UI Hangar : section "Configuration" + boutons conversion
□ Timer immobilisation (10 min / 30 min / 1h)
□ Badge "EN CONVERSION" dans Hangar
□ Guards : pas de mission si en conversion
□ Ajouté dans HangarController
```

---

### Phase 11 — Vols IA pour pilotes (Solo) — 8-10h
```
□ Pilotes IA générés (noms, nationalités, niveaux)
□ Volent entre aéroports, achètent/vendent, prennent des contrats
□ Icônes avion IA visibles sur la carte
□ Impact économique (offre/demande dynamique)
□ Solo uniquement (Online = vrais joueurs)
□ Nouveau controller : src/controllers/AIFlightController.ts
```

---

### Phase 12 — Certifications pilote (Solo + Online) — 8-10h
```
□ Modèle licences : PPL → IR → CPL → ATPL
□ Type ratings par avion
□ Profile > Certifications (progression, badges)
□ Guards création mission (licence + copilote)
□ Nouveau controller : src/controllers/CertificationController.ts
```

---

### Phase 13 — Bâtiments (futur) — 12-16h
```
□ Nouveau tab BÂTIMENTS dans sidebar
□ Atelier réparation (requis pour repair)
□ Hôpital (soigne workers blessés)
□ École pilotage (source pilotes/copilotes)
□ Hangar privé (stockage, réduction frais)
□ Nouveau controller : src/controllers/BuildingController.ts
```

---

## Timeline révisée

```
Fait :
  ✅ Phase 0-9 terminées
  ✅ Refactoring complet (8 controllers, ~7400 lignes extraites)
  ✅ 89 icônes SVG inline, 137 items, 39 recettes
  ✅ Build OK (2.9MB bundle)

Prochaines :
Sem 8    : Phase 10 — Kits conversion
Sem 9    : Phase 11 — Vols IA pilotes
Sem 10   : Phase 12 — Certifications pilote
Sem 11+  : Phase 13 — Bâtiments
```

---

## Évolution AeroCorpOnline.tsx

```
Phase 5  (avant)  : 7900 lignes  ████████████████████ 100%
Refactoring       : 2378 lignes  ██████░░░░░░░░░░░░░░  30%
Phase 7           : 2485 lignes  ██████░░░░░░░░░░░░░░  31%
Phase 9 (actuel)  : 2500 lignes  ██████░░░░░░░░░░░░░░  32%  ← Orchestrateur pur ✅
Controllers       : 7400 lignes  ██████████████████░░  (8 controllers)
```
