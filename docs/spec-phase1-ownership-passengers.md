# Spec Phase 1 — Tags ownership perso/company + passagers

**Date** : 6 février 2026  
**Pour** : Claude Code (VS Code)  
**Prérequis** : Phase 0 terminée (tabs v4.1 restructurés)  
**Estimation** : 8-10h  

---

## Objectif

Ajouter 2 fondations manquantes :
1. **Ownership** : chaque item en inventaire appartient au joueur OU à sa company (tag visuel)
2. **Passagers** : les avions ont des sièges, et des "personnel" (Worker, Ingénieur, Pilote, Copilote) peuvent être transportés comme du cargo spécial

---

## PARTIE A — Tags ownership (owner_type)

### A1. Modèle DB : ajouter `owner_type` aux items d'inventaire

Dans `DatabaseManager.ts`, le schema des items d'inventaire doit inclure :

```typescript
// Table: inventory_items (ou équivalent)
owner_type: "player" | "company"  // DEFAULT "player"
```

**Migration** : tous les items existants → `owner_type = "player"`.

Les items dans `company_inventory` ont `owner_type = "company"`.

### A2. Couleurs ownership

```
Bleu  (#3b82f6) = personnel (player)
Orange (#f59e0b) = company
```

Pastille ronde de 8px avant le nom de l'item, dans toutes les listes d'inventaire.

### A3. UI — Profile > Inventaire

Ajouter un filtre ownership au-dessus des filtres existants (ICAO, item, tier) :

```
[Tout] [Perso] [Company]     ← 3 boutons toggle, style identique aux filtres tier
```

Chaque item dans la liste affiche la pastille bleu/orange AVANT la pastille de tier.

**Render HTML** dans `renderGroupedInventory()` :
```html
<!-- Avant (tier seulement) -->
<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>

<!-- Après (ownership + tier) -->
<span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;margin-right:4px;"></span>
<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>
```

### A4. UI — Company > Inventaire

Pas de filtre ownership ici (tout est company par définition). Mais la pastille orange est affichée pour cohérence visuelle.

### A5. UI — Market > Achats

Le popup d'achat actuel a un bouton "Acheter". Le remplacer par 2 boutons :

```
[Acheter perso]     → owner_type = "player", débite wallet joueur
[Acheter company]   → owner_type = "company", débite wallet company
```

Le bouton "Acheter company" est :
- **Grisé** si le joueur n'a pas de company
- **Grisé** si le wallet company est insuffisant
- **Visible** uniquement si le joueur a une company

Style des boutons :
```
Acheter perso   : background #3b82f6, text white
Acheter company : background #f59e0b, text #1a1a24 (noir)
```

### A6. UI — Missions > Création > Étape 2 (cargo)

Ajouter un toggle source au-dessus de la liste d'items disponibles à l'aéroport :

```
Charger depuis : [Perso] [Company]
```

- **Perso** (défaut) : affiche uniquement les items `owner_type = "player"` à cet aéroport
- **Company** : affiche uniquement les items `owner_type = "company"` à cet aéroport

Les items chargés dans l'avion conservent leur `owner_type`.

### A7. Backend — Logique d'achat

Dans `LocalMarketService.ts` (ou `PopupManager.ts` > `confirmMarketBuy`) :

```typescript
// Paramètre supplémentaire : wallet source
async buyItem(locationId: string, itemId: string, qty: number, wallet: "player" | "company"): Promise<void> {
  if (wallet === "company") {
    // Débiter wallet company
    // Ajouter item avec owner_type = "company"
  } else {
    // Débiter wallet player (comportement actuel)
    // Ajouter item avec owner_type = "player"
  }
}
```

---

## PARTIE B — Passagers (passenger_seats + items personnel)

### B1. Modèle DB : ajouter `passenger_seats` aux avions

Dans le schema aircraft de `DatabaseManager.ts` :

```typescript
// Table: aircraft
passenger_seats: number  // DEFAULT basé sur le type d'avion
```

**Valeurs par défaut par type d'avion** (à ajouter dans `InitService.ts` ou seed data) :

| ICAO Type | passenger_seats | cargo_capacity_kg | Notes |
|-----------|----------------|-------------------|-------|
| C172 | 3 | 150 | Pilote + 3 pax |
| PA28 | 3 | 100 | |
| SR22 | 3 | 120 | |
| DA40 | 3 | 100 | |
| C208 | 9 | 1000 | Caravan |
| PC12 | 9 | 1200 | |
| BE20 | 8 | 800 | King Air |
| B738 | 189 | 20000 | Boeing 737-800 |
| A320 | 180 | 16000 | |
| CRJ9 | 90 | 8000 | |

Si un avion n'est pas dans cette table, utiliser `passenger_seats = 4` par défaut.

### B2. Items "personnel" — Catégorie spéciale

Créer 4 items de catégorie `"personnel"` dans le catalogue d'items :

| Item code | Nom | Tier | Poids | Catégorie | Achetable au marché |
|-----------|-----|------|-------|-----------|-------------------|
| `worker` | Worker | T0 | 80 kg | personnel | NON (spawn IA aux aéroports large/medium) |
| `engineer` | Engineer | T1 | 80 kg | personnel | NON (spawn IA aux aéroports large) |
| `pilot` | Pilot | T2 | 80 kg | personnel | NON (futur: écoles) |
| `copilot` | Copilot | T2 | 80 kg | personnel | NON (futur: écoles) |

**Spawn IA** : L'`AIEconomyService` doit périodiquement créer des Workers et Engineers aux aéroports éligibles, disponibles pour chargement comme du cargo.

### B3. UI — Missions > Création > Étape 2 : section passagers

Sous la section cargo existante, ajouter une section "Passagers" :

```
┌─ Passagers ──────────────────────────────┐
│  Sièges disponibles : 3 / 3              │
│                                           │
│  À l'aéroport (LFPG) :                  │
│  Worker     x12   [+ Embarquer]          │
│  Engineer   x3    [+ Embarquer]          │
│                                           │
│  Dans l'avion :                          │
│  (vide)                                   │
│                                           │
│  Poids passagers : 0 kg / 240 kg max     │
└───────────────────────────────────────────┘
```

**Règles** :
- Nombre de passagers embarqués <= `passenger_seats`
- Poids passagers = nombre × 80 kg
- Le poids total (cargo items + passagers) ne doit pas dépasser `cargo_capacity_kg`
- Les passagers embarqués apparaissent dans la liste cargo de l'avion avec une icône distincte (pas d'emoji, utiliser un cercle plein #a855f7 violet)

### B4. UI — Hangar > Détails avion

Ajouter `passenger_seats` dans la fiche de l'avion, dans la section existante qui affiche cargo_capacity_kg :

```
Cargo : 1000 kg
Seats : 9 pax          ← AJOUTER
Fuel  : 280 / 280 gal
```

### B5. Cargo loading — Étendre pour les passagers

Le système cargo actuel (load/unload via popup slider) fonctionne déjà. Pour les passagers :
- Utiliser le MÊME système de cargo loading (`loadCargoItem` / `unloadCargoItem`)
- Les passagers sont traités comme des items normaux dans le cargo (item_code = "worker", etc.)
- Le slider popup existant fonctionne pour les passagers
- Ajouter une validation : `total_passengers_in_aircraft <= passenger_seats`

### B6. Inventaire — Affichage personnel

Les items de catégorie "personnel" dans l'inventaire Profile/Company affichent une pastille violette (#a855f7) au lieu de la pastille tier normale.

---

## Résumé des fichiers à modifier

| Fichier | Changement |
|---------|------------|
| `types/index.ts` | Ajouter `owner_type` aux types inventaire, `passenger_seats` au type Aircraft |
| `DatabaseManager.ts` | Migration schema : `owner_type` sur inventory, `passenger_seats` sur aircraft |
| `InitService.ts` | Seed data : `passenger_seats` par type d'avion, items personnel |
| `AIEconomyService.ts` | Spawn Workers/Engineers aux aéroports éligibles |
| `LocalMarketService.ts` | Paramètre `wallet` dans buyItem, `owner_type` sur items créés |
| `PopupManager.ts` | Popup achat : 2 boutons (perso/company) |
| `WorldOfAircraft.tsx` | `renderGroupedInventory()` : pastilles ownership, filtre ownership, section passagers étape 2 |
| `ProfileView.tsx` | Filtre ownership [Tout/Perso/Company] |
| `MarketView.tsx` | Boutons "Acheter perso" / "Acheter company" dans popup |
| `MissionsView.tsx` | Toggle source cargo + section passagers |
| `HangarView.tsx` | Afficher passenger_seats dans détails |
| `helpers/` | Render helpers : pastilles ownership dans toutes les listes HTML |
| `en.json` / `fr.json` | Traductions : ownership, passagers, items personnel |

---

## Ordre d'implémentation recommandé

```
1. DB schema + migration (owner_type + passenger_seats)     → 1h
2. Types TypeScript (owner_type, passenger_seats, personnel) → 30min
3. Seed data (passenger_seats par avion, items personnel)    → 1h
4. AI spawn Workers/Engineers                                → 1h
5. Pastilles ownership dans renderGroupedInventory           → 1h
6. Filtre ownership dans ProfileView                         → 30min
7. Market : 2 boutons achat (perso/company)                  → 1h30
8. Missions : toggle source + section passagers              → 2h
9. Hangar : afficher passenger_seats                         → 30min
10. i18n                                                     → 30min
11. Build clean + test                                       → 30min
```

Total estimé : ~10h
