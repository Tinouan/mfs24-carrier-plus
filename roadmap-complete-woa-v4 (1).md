# Roadmap complète — World of Aircraft EFB v4.1

**Date** : 6 février 2026
**Mise à jour** : Ajout social, virements, marché avions, tags ownership, kits conversion

---

## Structure cible des onglets (v4.1)

```
SIDEBAR (8 onglets)
│
├── 👤 PROFILE
│   ├── Aperçu ................. ✅ OK (niveau, XP, stats, nationalité)
│   ├── Certifications ......... 📋 Licences obtenues + progression
│   ├── Inventaire ............. ✅ OK (+ tag perso/company)
│   ├── Historique ............. 🔶 Transactions + vols (unifié)
│   ├── Messagerie ............. 📋 Messages joueurs + système
│   └── Social ................. 📋 Liste amis, recherche joueur
│
├── 🗺️ MAP
│   └── (vue unique) ........... ✅ OK
│
├── ✈️ MISSIONS
│   ├── Aperçu/Tracking ........ ✅ OK
│   └── Création ............... ✅ OK (+ passagers + tag cargo perso/company)
│
├── 📜 CONTRATS
│   ├── Tableau de bord ........ 📋 Contrats disponibles
│   ├── Mes contrats ........... 📋 Contrats créés par moi
│   └── En cours ............... 📋 Contrats acceptés
│
├── 🏢 COMPANY
│   ├── Overview ............... ✅ OK (+ virements joueur↔company)
│   ├── Membres ................ ✅ OK (+ gestion des droits/rôles)
│   ├── Inventaire ............. ✅ OK (+ tag company visible)
│   ├── Historique ............. 📋 Achats, ventes, virements company
│   └── Messagerie ............. 📋 Messages internes company
│
├── 🛒 MARKET
│   ├── Achats items ........... ✅ OK
│   ├── Mes ventes ............. 📋 Poster des sell orders
│   └── Avions ................. 📋 Achat/vente d'avions
│
├── 🔧 HANGAR
│   └── (vue unique) ........... ✅ OK (+ conversion kits cargo↔pax)
│
└── ⚙️ SETTINGS (en bas)
    └── (vue unique) ........... ✅ OK
```

---

## Détail des ajouts par onglet

---

### PROFILE — 3 nouveaux sous-onglets

#### Certifications

Fiche de progression pilote complète.

```
┌─ Ma licence actuelle ─────────────────────────┐
│  PPL — Private Pilot License                   │
│  Obtenue le 15/02/2026                         │
│                                                │
│  Prochaine : IR (Instrument Rating)            │
│  ████████████░░░░░░░░  62%                     │
│  Heures : 18h / 25h requises                   │
│  Missions : 12 / 15 requises                   │
│  Vols de nuit : 3 / 5 requis                   │
└────────────────────────────────────────────────┘

┌─ Qualifications de type ──────────────────────┐
│  ✅ C172    ✅ PA28    ✅ DA40                  │
│  🔒 C208 (CPL requis)                         │
│  🔒 PC12 (CPL + type rating requis)           │
│  🔒 B738 (ATPL + type rating + copilote)      │
└────────────────────────────────────────────────┘
```

#### Historique (unifié vols + finances)

| Filtre | Contenu |
|--------|---------|
| Tout | Timeline complète |
| Vols | Missions, free flights, contrats exécutés |
| Transactions | Achats, ventes, virements envoyés/reçus, repairs, refuel |
| Contrats | Contrats créés et exécutés |

Chaque entrée : date, type, montant ($) ou XP, icône, description.

#### Messagerie

| Type | Exemple |
|------|---------|
| Système | "Contrat #42 accepté par PilotJohn" |
| Joueur | Message direct d'un ami |
| Company | "Le CEO a changé vos droits" |
| Contrat | "Livraison en attente à LFPG — 1h30 restant" |

Messages asynchrones (pas de chat temps réel, trop complexe pour Coherent GT).

#### Social

```
┌─ Mes amis (3) ─────────────────────────────────┐
│  🟢 PilotJohn      Lvl 12   @ EGLL             │
│  🔴 AviatorMike    Lvl 8    Hors ligne          │
│  🟢 SkyQueen       Lvl 15   @ EDDF             │
│                                                 │
│  [Rechercher un joueur...]                      │
│  Actions : Message / Envoyer $ / Contrat / Profil│
└─────────────────────────────────────────────────┘
```

**Mode Solo** : Social et Messagerie grisés → "Disponible en mode Online".

---

### COMPANY — Ajouts

#### Gestion des droits (enrichi dans Membres)

| Rôle | Missions | Achats market | Ventes | Virements | Inviter | Modifier droits |
|------|----------|---------------|--------|-----------|---------|-----------------|
| **CEO** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Officier** | ✅ | ✅ | ✅ | ✅ (limite) | ✅ | ❌ |
| **Pilote** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Recrue** | Vol only | ❌ | ❌ | ❌ | ❌ | ❌ |

CEO peut changer le rôle de chaque membre via dropdown.

#### Company > Overview — Virements joueur↔company

```
┌─ Finances ─────────────────────────────────────┐
│  Solde company : 125,000 $                     │
│  Mon solde perso : 43,000 $                    │
│                                                │
│  [Transférer vers company ___$]  [Confirmer]   │
│  [Retirer de la company  ___$]   [Confirmer]   │
└────────────────────────────────────────────────┘
```

Règles :
- Joueur → Company : Recrue et + (investir)
- Company → Joueur : CEO et Officier uniquement (retirer)
- Joueur → Joueur : via Social > "Envoyer $" (Online only)

#### Company > Historique

Log de toutes les opérations company : achats, ventes, virements, contrats, production usine. Filtrable par type et date. Identifie quel membre a fait chaque action.

#### Company > Messagerie

Channel interne simple. Messages postés par les membres + notifications auto (nouveau membre, mission terminée, fonds insuffisants). Le CEO peut épingler un message.

---

### MARKET > Avions

Marché d'achat/vente d'avions dans Market (pas Hangar). Le Market est le lieu d'échange, le Hangar est le lieu de gestion.

```
┌─ Avions en vente ──────────────────────────────┐
│  [Filtre: Type ▼] [Prix min___] [Prix max___]  │
│                                                 │
│  Boeing 737-800         5,200,000 $             │
│  ATPL requis · Copilote requis                  │
│  189 pax · 20,000 kg · 3115 nm                 │
│  Vendeur: IA Dealer @ LFPG                      │
│  [Acheter perso] [Acheter company]              │
│                                                 │
│  Cessna 208 [état: 82%]    180,000 $            │
│  Vendeur: @AviatorMike @ KJFK                   │
│  [Acheter perso] [Acheter company]              │
│                                                 │
│  [Vendre un de mes avions]                      │
└─────────────────────────────────────────────────┘
```

- Achat → l'avion apparaît dans le Hangar, stationné à l'aéroport du vendeur
- Vente → bouton dans Hangar ou dans Market > Avions, l'avion reste volable tant que pas vendu
- Solo : catalogue IA fixe (prix constructeur), pas de vente possible
- Achat possible même sans la licence → investissement, mais vol bloqué

---

### HANGAR — Kits de conversion cargo↔passager

Chaque avion a un champ `configuration: "cargo" | "passenger" | "combi"` :

| Config | Sièges | Cargo | Usage |
|--------|--------|-------|-------|
| **Cargo** | 0 (pilote+copilote) | 100% capacité | Fret pur |
| **Passenger** | 100% sièges | ~20% (bagages) | Passagers |
| **Combi** | ~50% sièges | ~50% cargo | Config par défaut |

#### Kits (items T3-T4, craftables en usine)

| Kit | Timer | Avions concernés |
|-----|-------|-----------------|
| Small | 10 min | Monomoteurs (C172, PA28, SR22) |
| Medium | 30 min | Turboprops (C208, PC12, King Air) |
| Large | 1h | Jets (B737, A320, CRJ) |

Le kit est un item acheté au marché ou produit en usine. Il est consommé à l'application. Pendant le timer l'avion est immobilisé (badge "EN CONVERSION", missions bloquées).

```
┌─ Configuration avion ──────────────────────────┐
│  Cessna 208 — Config: COMBI (5 pax / 500 kg)  │
│                                                 │
│  [Convertir CARGO]    Kit Medium ✅ en stock    │
│    → 0 pax, 1000 kg · Timer 30 min             │
│                                                 │
│  [Convertir PASSAGER] Kit Medium ❌ pas en stock│
│    → 9 pax, 200 kg  · Timer 30 min             │
│                                                 │
│  ⚠ Avion immobilisé pendant la conversion      │
└────────────────────────────────────────────────┘
```

---

### Tags ownership perso/company

Chaque item en inventaire a un champ `owner_type: "player" | "company"` avec indicateur visuel :

```
🔵 Bleu (#3b82f6)  = personnel
🟠 Orange (#f59e0b) = company
```

| Écran | Impact |
|-------|--------|
| Profile > Inventaire | Pastille + filtre Perso/Company/Tout |
| Company > Inventaire | Items company uniquement |
| Missions > Création > Cargo | Toggle "Charger depuis [Perso] [Company]" |
| Market > Achats | Bouton "Acheter perso" / "Acheter company" |
| Hangar > Cargo | Pastille sur chaque item dans l'avion |

---

## Roadmap d'implémentation

### Phase 0 — Nettoyage (2-3h)
```
□ Supprimer Company > Flotte (sub-tab + state + refs)
□ Supprimer tab INVENTORY orpheline
□ Build clean
```

### Phase 1 — Tags ownership + passagers (8-10h)
```
□ Ajouter owner_type au modèle Item en DB
□ Ajouter passenger_seats au modèle Aircraft en DB
□ Créer items "personnel" (Worker/Ingénieur/Pilote/Copilote, 80 kg chacun)
□ UI pastilles bleu/orange dans inventaire, cargo, market
□ UI "Acheter perso / Acheter company" dans Market
□ UI toggle "Charger depuis perso/company" dans Missions > Création
□ UI section passagers dans Missions > Création étape 2
□ Afficher passenger_seats dans Hangar
```

### Phase 2 — Free Flight XP + Historique unifié (5-6h)
```
□ Implémenter spec Free Flight XP v2.7
□ Profile > Historique : timeline unifiée (vols + transactions)
□ Modèle TransactionLog en DB
□ Sauvegarde auto en fin de mission et free flight
```

### Phase 3 — Market étendu (6-8h)
```
□ Market > Mes Ventes (poster, annuler, status)
□ Market > Avions (catalogue IA + occasion joueurs)
□ Specs avions réalistes en DB (50+ avions MSFS)
□ Vente d'avion depuis Hangar
□ IA acheteur en Solo
```

### Phase 4 — Company étendue (8-10h)
```
□ Rôles (CEO/Officier/Pilote/Recrue) + guards
□ Virements joueur↔company dans Overview
□ Company > Historique (log toutes opérations)
□ Company > Messagerie (channel interne)
```

### Phase 5 — Certifications pilote (8-10h)
```
□ Modèle licences + type ratings en DB
□ Progression auto (heures + missions → licence)
□ Profile > Certifications (UI progression)
□ Guards création mission (licence + copilote)
□ Missions de formation pour type ratings
```

### Phase 6 — Contrats (12-15h)
```
□ Modèle contrats en DB
□ Onglet CONTRATS + 3 sous-onglets
□ Flow : créer → accepter → charger → livrer
□ IA contrats en Solo
□ Expiration + Trust Score (Online)
□ Virements auto à la livraison
```

### Phase 7 — Social + Messagerie (6-8h)
```
□ Profile > Social (amis, statut, recherche)
□ Profile > Messagerie (conversations + notifications)
□ Virement joueur → joueur via Social
□ Proposer contrat à un ami
□ Solo : Social + Messagerie désactivés
```

### Phase 8 — Usines T0→T5 (20-25h)
```
□ Items T0-T5 (~50-80 items, prix réalistes)
□ Recettes (~30-50 recettes)
□ Spawn T0 par géographie
□ Construction usine (Map popup)
□ Production auto + timer
□ Workers + nourriture
□ Kits conversion dans recettes T3-T4
□ Équilibrage économique
```

### Phase 9 — Kits conversion cargo↔pax (4-6h)
```
□ Champ configuration sur Aircraft ("cargo"|"passenger"|"combi")
□ Items Small/Medium/Large Conversion Kit
□ UI Hangar : boutons conversion + timer
□ Avion immobilisé pendant conversion
□ Guards : pas de mission si en conversion
```

### Phase 10 — Bâtiments (futur, 12-16h)
```
□ Nouveau tab BÂTIMENTS
□ Atelier réparation (requis pour repair)
□ Hôpital (soigne workers)
□ École pilotage (source pilotes/copilotes)
□ Hangar privé (stockage, réduction frais)
```

---

## Timeline

```
Sem 1  : Phase 0 (nettoyage) + Phase 1 (ownership + passagers)
Sem 2  : Phase 2 (Free Flight XP + Historique)
Sem 3  : Phase 3 (Market étendu + avions)
Sem 4  : Phase 4 (Company étendue)
Sem 5  : Phase 5 (Certifications)
Sem 6-7: Phase 6 (Contrats)
Sem 8  : Phase 7 (Social + Messagerie)
Sem 9-11: Phase 8 (Usines T0-T5)
Sem 12 : Phase 9 (Kits conversion)
Sem 13+: Phase 10 (Bâtiments) + Mode Online SEED
```

---

## Boucle de jeu complète

```
                    ┌─── TRANSPORTER ───┐
                    │                    │
           Cargo (items T0-T5)   Passagers (workers/ingé/copilotes)
             🔵perso 🟠company        │
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
                    ┌─────────┴─────────┐
                    ▼                    ▼
              HANGAR              CERTIFICATIONS
           avions + kits        PPL → ATPL
           conversion            type ratings
           repair + fuel         copilote requis
                    │                    │
                    └───── REVOLER ──────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                    ▼
              COMPANY              SOCIAL
           rôles, virements     amis, messages,
           historique            virements joueur
```
