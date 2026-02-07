# Roadmap complète — World of Aircraft EFB v4.2

**Date** : 7 février 2026
**Mise à jour** : Réorganisation phases, stratégie online intégrée, nouvelles features (vols IA, transferts map)

---

## Phases terminées ✅

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

### Fixes transversaux ✅
```
✅ Persistence unifiée (DatabaseManager → WorldOfAircraftData)
✅ Fix solde 100,000 CR (double player dans localStorage)
✅ Fix refresh EFB (NativePersistence lisait mauvaise clé)
✅ Fix systèmes avion stables (getAircraftSystems read-only)
✅ Fix avion neuf 100% (systèmes initialisés à l'achat)
✅ Fix popup refuel (vrai overlay centré)
✅ Fix badge "En vente" après annulation
✅ Fix arrondi montants (formatMoney partout)
✅ Refresh hangar auto à l'ouverture
```

---

## Structure actuelle des onglets

```
SIDEBAR (8 onglets)
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
├── CONTRATS ......................... 📋 Phase 5
│   ├── Disponibles
│   ├── Mes contrats
│   └── En cours
│
├── COMPANY
│   ├── Overview (+ virements) ....... ✅
│   ├── Membres (+ rôles) ........... ✅
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

## Phases à venir

---

### Phase 5 — Contrats (Solo + Online) — 12-15h

Onglet CONTRATS avec 3 sous-onglets. Système de commandes entre joueurs (Online) et IA (Solo).

```
□ Modèle contrats en DB (ContractOffer, ContractAccepted)
□ Onglet CONTRATS dans sidebar (icône document)
□ Sous-onglet "Disponibles" : contrats IA + joueurs à proximité
    - Filtres : distance, récompense, type (cargo/passagers)
    - Chaque contrat : départ → arrivée, cargo, deadline, récompense
    - Bouton [Accepter]
□ Sous-onglet "Mes contrats" : contrats créés par le joueur (Online)
    - Solo : overlay "Disponible en mode Online"
    - Online : créer un contrat → autre joueur peut accepter
□ Sous-onglet "En cours" : contrats acceptés en attente de livraison
    - Timer deadline
    - Bouton [Annuler] (pénalité Trust Score en Online)
□ IA contrats en Solo :
    - Génération auto basée sur la position du joueur
    - Difficulté progressive (distance + cargo + deadline)
    - Récompenses réalistes selon distance × poids
□ Flow complet : accepter → charger cargo → voler → atterrir → valider
□ Expiration : contrat non livré à temps = échec + pénalité
□ Virements auto : récompense créditée à la complétion
□ Historique : apparaît dans Missions > Historique contrats
```

### Phase 6 — Social + Messagerie (Online only) — 6-8h

Features sociales pour le mode Online. Overlay "Online requis" en Solo.

```
□ Profile > Social (nouveau sous-onglet)
    - Liste d'amis (nom, niveau, position, statut en ligne)
    - Recherche joueur par nom
    - Ajouter/supprimer ami
    - Actions : Message / Envoyer CR / Proposer contrat / Voir profil
    - Solo : overlay "Disponible en mode Online"
□ Profile > Messagerie (nouveau sous-onglet)
    - Conversations joueur ↔ joueur
    - Notifications système (contrat accepté, livraison, etc.)
    - Solo : overlay "Disponible en mode Online"
□ Virement joueur → joueur via Social > "Envoyer CR"
    - SEED valide les fonds (Online only)
□ Proposer contrat à un ami
    - Raccourci depuis Social > ami > "Proposer contrat"
□ Modèles DB : Friend, DirectMessage, Notification
□ Endpoints SEED : /friends, /messages, /notifications
```

### Phase 7 — Transfert pilote & avion sur la Map (Solo + Online) — 6-8h

Logique de déplacement physique des pilotes et avions entre aéroports.

```
□ Transfert avion (ferry flight)
    - Depuis Hangar : bouton "Transférer" sur un avion
    - Sélection aéroport destination sur la Map
    - Timer basé sur distance / vitesse croisière de l'avion
    - L'avion est indisponible pendant le transfert (badge "EN TRANSFERT")
    - Coût carburant estimé déduit automatiquement
    - Animation sur la Map : icône avion se déplace progressivement
□ Transfert pilote (vol commercial fictif)
    - Le joueur peut "se déplacer" vers un aéroport distant
    - Coût : billet d'avion proportionnel à la distance
    - Timer : ~1 min par 100 nm (accéléré)
    - Nécessaire pour récupérer un avion acheté dans un autre aéroport
□ Visualisation Map :
    - Avions en transfert visibles sur la carte (icône animée)
    - Avions parkés visibles à leur aéroport
    - Position du joueur (marqueur pilote)
□ Règles :
    - Pas de mission possible pendant un transfert
    - Transfert annulable (avion revient à l'origine, pas de remboursement fuel)
    - Solo + Online : même logique
```

### Phase 8 — Debug & Validation Solo + Online — 4-6h

Aligner le SEED server sur les Phases 1-7 et tester les deux modes.

```
□ Audit ServiceAdapter : chaque Router a Solo + Online
□ Endpoints SEED manquants :
    - POST /market/sell-orders (poster sell order)
    - GET  /market/sell-orders/mine (mes ventes)
    - DEL  /market/sell-orders/:id (annuler)
    - GET  /aircraft/catalog (catalogue)
    - POST /aircraft/purchase (acheter avion)
    - POST /aircraft/sell-order (poster avion en vente)
    - POST /company/:id/transfer-in (virement)
    - POST /company/:id/transfer-out (retrait)
    - PUT  /company/:id/members/:uid (changer rôle)
    - POST /free-flight/end (fin free flight XP)
    - Endpoints contrats (/contracts/*)
    - Endpoints social (/friends/*, /messages/*)
□ Tests complets Solo :
    - Créer pilote → acheter avion → mission → vendre → contrat → repeat
    - Vérifier persistence (restart EFB)
    - Vérifier IA acheteur (15 min)
    - Vérifier tous les historiques
□ Tests complets Online :
    - Même flow mais via SEED
    - Vérifier anti-triche (SEED calcule tout)
    - Vérifier Social + Messagerie
    - Tester multi-joueur (2 instances)
□ Fix des bugs trouvés
```

### Phase 9 — Usines & économie complète (Solo + Online) — 20-25h

Système de production avec items T0→T5, workers, recettes, nourriture.

```
□ Items T0-T5 (~50-80 items, prix réalistes)
    - T0 : Matières premières (bois, fer, blé, pétrole...) — spawn géographique
    - T1 : Matériaux basiques (planches, lingots, farine...)
    - T2 : Composants (circuits, moteurs, tissus...)
    - T3 : Produits intermédiaires (kits conversion, pièces avion...)
    - T4 : Produits finis (électronique, équipement...)
    - T5 : Luxe / haute valeur (bijoux, tech de pointe...)
□ Recettes (~30-50 recettes)
    - Chaque recette : inputs (items + quantités) → output (item + quantité)
    - Timer de production basé sur le tier
    - Qualité influencée par skill workers
□ Spawn T0 par géographie :
    - Pétrole : Moyen-Orient, Golfe du Mexique, Mer du Nord
    - Bois : Scandinavie, Canada, Brésil
    - Minerais : Australie, Afrique du Sud, Russie
    - Blé : USA Midwest, Ukraine, France
    - Poisson : côtes, Norvège, Japon
□ Construction usine :
    - Depuis la Map : clic sur aéroport → "Construire une usine"
    - Coût basé sur le tier (T1 cheap → T10 très cher)
    - Usine liée à un aéroport
□ Production auto :
    - Sélectionner recette → lancer production → timer
    - Workers produisent automatiquement
    - File d'attente de production
□ Workers :
    - Items achetables uniquement aux grands aéroports
    - Stats par nationalité (efficacité, coût)
    - Besoin de nourriture (efficacité tombe à 30% sans)
    - Ingénieurs augmentent l'efficacité / débloquent recettes haut tier
□ Nourriture :
    - Items T1 (pain, conserves) consommés par les workers
    - Transport nécessaire vers l'usine
□ Équilibrage économique :
    - Prix de vente IA basé sur coût de production + marge
    - Offre/demande dynamique en Online
□ Endpoints SEED pour Online :
    - /factories, /production, /workers
```

### Phase 10 — Kits conversion cargo↔pax (Solo + Online) — 4-6h

```
□ Champ configuration sur Aircraft ("cargo" | "passenger" | "combi")
□ Items Small/Medium/Large Conversion Kit (craftables en usine T3-T4)
□ UI Hangar : section "Configuration" avec boutons conversion
    - Affiche config actuelle (sièges / cargo)
    - Bouton [Convertir CARGO] / [Convertir PASSAGER]
    - Vérification kit en stock
    - Timer immobilisation (10 min / 30 min / 1h selon taille)
□ Badge "EN CONVERSION" dans Hangar pendant le timer
□ Guards : pas de mission si en conversion
□ Le kit est consommé à l'application
□ Même logique Solo + Online
```

### Phase 11 — Vols IA pour pilotes (Solo) — 8-10h

Des pilotes IA volent dans le monde, transportent du cargo, interagissent avec l'économie.

```
□ Pilotes IA :
    - Générés automatiquement (noms, nationalités, niveaux variés)
    - Possèdent des avions et du cargo
    - Volent entre aéroports (routes générées aléatoirement)
    - Achètent/vendent sur le marché
    - Prennent des contrats
□ Visualisation Map :
    - Icônes avion IA visibles sur la carte (couleur différente du joueur)
    - Info au clic : nom pilote, destination, cargo
□ Impact économique :
    - Les pilotes IA consomment et produisent des items
    - Créent de l'offre et de la demande sur le marché
    - Rendent le monde vivant même en Solo
□ Paramètres :
    - Nombre de pilotes IA ajustable (Settings)
    - Difficulté influence leur efficacité
□ Solo uniquement pour le moment
    - Online : les vrais joueurs remplacent les pilotes IA
    - Possibilité future d'ajouter des IA en Online pour remplir le monde
```

### Phase 12 — Certifications pilote (Solo + Online) — 8-10h

```
□ Modèle licences en DB : PPL → IR → CPL → ATPL
    - Chaque licence : heures requises, missions requises, conditions spéciales
    - PPL : 0h (de base)
    - IR : 25h + 15 missions + 5 vols de nuit
    - CPL : 100h + 50 missions + IR requis
    - ATPL : 500h + 200 missions + CPL requis
□ Type ratings :
    - Chaque type avion nécessite un type rating
    - Petits avions (C172, PA28) : inclus avec PPL
    - Turboprops (C208, PC12) : CPL + training flight requis
    - Jets (B737, A320) : ATPL + type rating + copilote
□ Profile > Certifications (nouveau sous-onglet)
    - Licence actuelle + barre de progression vers la suivante
    - Liste des type ratings obtenus
    - Type ratings verrouillés avec conditions affichées
□ Progression auto :
    - Les heures de vol et missions sont comptées automatiquement
    - Notification quand une nouvelle licence est disponible
    - Pas de "paiement" pour la licence (juste l'expérience)
□ Guards création mission :
    - Vérification licence avant de pouvoir voler un avion
    - Copilote requis pour certains avions (item "Copilote" dans l'inventaire)
□ Missions de formation (type ratings) :
    - Missions spéciales pour obtenir un type rating
    - Parcours défini, conditions météo, manœuvres
□ Même progression Solo + Online
    - Online : SEED valide les heures (anti-triche)
    - Solo : local, pas de validation
```

### Phase 13 — Bâtiments (futur) — 12-16h

```
□ Nouveau tab BÂTIMENTS dans sidebar
□ Atelier réparation (requis pour repair avion)
□ Hôpital (soigne workers blessés)
□ École pilotage (source pilotes/copilotes items)
□ Hangar privé (stockage, réduction frais parking)
□ Construction depuis la Map (comme les usines)
□ Coût + timer de construction
□ Bâtiments liés à un aéroport
```

---

## Timeline révisée

```
Semaine actuelle :
  ✅ Phase 0-4 terminées
  ✅ Fixes persistence, systèmes, UI

Sem 5    : Phase 5  — Contrats (Solo + Online)
Sem 6    : Phase 6  — Social + Messagerie (Online only)
Sem 7    : Phase 7  — Transfert pilote & avion (Map)
Sem 8    : Phase 8  — Debug & Validation Solo + Online
Sem 9-11 : Phase 9  — Usines & économie complète
Sem 12   : Phase 10 — Kits conversion
Sem 13   : Phase 11 — Vols IA pilotes (Solo)
Sem 14   : Phase 12 — Certifications pilote
Sem 15+  : Phase 13 — Bâtiments
```

---

## Boucle de jeu complète (cible finale)

```
                    ┌─── TRANSPORTER ───┐
                    │                    │
           Cargo (items T0-T5)   Passagers (workers/ingé/copilotes)
             perso / company          │
                    │                    │
                    ▼                    ▼
              ┌─ USINES ──────── Workers produisent ─┐
              │  T0→T1→T2→T3→T4→T5                   │
              │  + Kits conversion (T3-T4)            │
              └───────── Items produits ──────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                    ▼
               MARCHÉ              CONTRATS
           (items + avions)    (fret + passagers)
           achat perso/company  créer / accepter
                    │                    │
                    └────── ARGENT ──────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         HANGAR          CERTIFICATIONS    TRANSFERTS
      avions + kits     PPL → ATPL       ferry flights
      conversion         type ratings     déplacement pilote
      repair + fuel     copilote requis   récup avion distant
              │               │               │
              └───────── REVOLER ─────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         COMPANY           SOCIAL          VOLS IA
      rôles, virements   amis, messages   pilotes IA
      historique          virements        économie vivante
                          contrats amis    offre/demande
```

---

## Architecture Solo / Online

```
┌─────────────────────────────────────────────────────────┐
│                    EFB (Client)                          │
│                                                         │
│  UI identique ──→ Routers ──→ ServiceAdapter            │
│                                    │                    │
│                          ┌─────────┴─────────┐          │
│                          │                   │          │
│                     Solo Mode           Online Mode     │
│                          │                   │          │
│                   LocalServices        SyncService      │
│                   + AIEconomy          → SEED API       │
│                   + DatabaseManager    → Cloudflare R2  │
│                   + SetStoredData      → Anti-triche    │
│                          │                   │          │
│                   Bac à sable         Monde partagé     │
│                   (pas de triche)     (SEED = vérité)   │
└─────────────────────────────────────────────────────────┘

Features par mode :
  Solo + Online : Missions, Market, Hangar, Company, Contrats,
                  Usines, Kits, Certifications, Transferts
  Online only   : Social, Messagerie joueur, Vols multi-joueur
  Solo only     : Pilotes IA, IA acheteur/vendeur
```
