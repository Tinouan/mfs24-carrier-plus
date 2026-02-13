# Roadmap complète — World of Aircraft EFB v4.4

**Date** : 10 février 2026
**Mise à jour** : Phases 6-7 terminées, anti-cheat renforcé, notes avion dans Hangar, 0 erreurs TS

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
✅ WorldOfAircraft.tsx : 7900 → 2378 lignes (orchestrateur pur)
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
✅ Renommage label "position (jeu)" → "position (World of Aircraft)" (5 locales)
```

### Hangar — Notes avion ✅
```
✅ Champ description éditable (max 50 chars) sur chaque avion
✅ Texte gris italique "Ajouter une note..." cliquable
✅ Input inline avec setupInputEventBlocker (Enter/blur = save)
✅ Sauvegardé en DB (aircraft.description)
✅ Clé traduction addNote dans 5 locales
```

### Fixes transversaux ✅
```
✅ Persistence unifiée (DatabaseManager → WorldOfAircraftData)
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
│   └── (vue unique) ................. ✅
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

## Architecture après refactoring

```
WorldOfAircraft.tsx (~2485 lignes)
  = Orchestrateur : init, render, routing, event wiring
  = Instancie 7 controllers

controllers/ (~6280 lignes total)
  ├── MissionController.ts    (2291 lignes)
  ├── MarketController.ts     (1130 lignes)
  ├── MapController.ts        (1047 lignes)
  ├── HangarController.ts      (751 lignes)
  ├── CompanyController.ts     (471 lignes)
  ├── SocialController.ts      (325 lignes)
  └── ContractController.ts    (259 lignes)

views/          ← Rendu JSX par onglet
helpers/        ← Fonctions de rendu DOM
managers/       ← Tracking, persistence, popups
services/       ← LocalServices, Routers, ServiceAdapter
state/          ← States réactifs (Subject)
types/          ← Types + msfs-globals.d.ts
```

---

## Phases à venir

---

### Phase 8 — Debug & Validation Solo + Online — 6-8h
```
□ Aligner SEED server sur Phases 1-7
□ Audit ServiceAdapter : chaque Router a Solo + Online
□ Endpoints SEED manquants (sell-orders, aircraft, contracts, friends, messages)
□ Tests complets Solo (flow complet)
□ Tests complets Online (même flow via SEED)
□ Fix bugs trouvés
□ Isolation données Solo/Online vérifiée
```

---

### Phase 9 — Usines & économie complète (Solo + Online) — 20-25h
```
□ Items T0-T5 (~50-80 items, prix réalistes)
□ Recettes (~30-50 recettes)
□ Spawn T0 par géographie
□ Construction usine depuis la Map
□ Production auto + timer + file d'attente
□ Workers : items achetables grands aéroports, stats pays, nourriture
□ Ingénieurs : efficacité + recettes haut tier
□ Nourriture : items T1 consommés par les workers
□ Équilibrage économique
□ Nouveau controller : src/controllers/FactoryController.ts
□ Endpoints SEED pour Online
```

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
Semaine actuelle :
  ✅ Phase 0-7 terminées
  ✅ Refactoring complet (7 controllers, ~6280 lignes extraites)
  ✅ Anti-cheat renforcé + notes avion Hangar
  ✅ 0 erreurs TS, build OK

Prochaines :
Sem 7    : Phase 8  — Debug Online
Sem 8-10 : Phase 9  — Usines
Sem 11   : Phase 10 — Kits conversion
Sem 12   : Phase 11 — Vols IA pilotes
Sem 13   : Phase 12 — Certifications pilote
Sem 14+  : Phase 13 — Bâtiments
```

---

## Évolution WorldOfAircraft.tsx

```
Phase 5  (avant)  : 7900 lignes  ████████████████████ 100%
Refactoring       : 2378 lignes  ██████░░░░░░░░░░░░░░  30%
Phase 7 (actuel)  : 2485 lignes  ██████░░░░░░░░░░░░░░  31%  ← Orchestrateur pur ✅
Controllers       : 6280 lignes  ████████████████░░░░  (7 controllers)
```
