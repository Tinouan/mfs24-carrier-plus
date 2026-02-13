# Factory System — Documentation Technique

> **Version**: V4.3 (Architecture Deux Carrières)
> **Dernière mise à jour** : 13 février 2026

## Vue d'ensemble

Le système de factories permet aux joueurs de transformer des matières premières (T0) en produits finis (T1-T2, extensible T3-T5) via des usines industrielles.

- **T0** : Usines NPC — produisent automatiquement les matières premières
- **T1-T10** : Usines joueurs — 10 niveaux d'upgrade progressifs
- Les factories sont liées à un aéroport et occupent un slot limité

### Architecture

| Mode | Stockage factories | Production | Marché |
|------|-------------------|------------|--------|
| **Solo** | `SoloSaveService` → GetStoredData | Scheduler local (timers JS dans EFB) | Marché IA (prix fixes, stock illimité) |
| **Online** | SEED (Cloudflare R2) | SEED calcule et valide | Marché joueurs (offre/demande) |

---

## Modèles de données

### Factory

```typescript
interface Factory {
  id: string;                    // UUID
  company_id: string;            // FK → Company propriétaire
  airport_ident: string;         // Code ICAO (ex: "LFPG")
  name: string;                  // Nom de l'usine
  tier: number;                  // 0=NPC, 1-10=joueurs
  factory_type: string;          // Auto-détecté (food_processing, metal_smelting...)
  status: "idle" | "producing" | "maintenance" | "offline";
  current_recipe_id: string | null;
  is_active: boolean;
  max_workers: number;           // Selon tier (voir tableau)
  max_engineers: number;         // Selon tier (voir tableau)
  max_ingredients: number;       // Nb max d'ingrédients par recette (selon tier)
  food_stock: number;
  food_capacity: number;
  food_consumption_per_hour: number;
  created_at: string;            // ISO8601
}
```

### ProductionBatch

```typescript
interface ProductionBatch {
  id: string;                    // UUID
  factory_id: string;            // FK → Factory
  recipe_id: string;             // FK → Recipe
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  started_at: string;            // ISO8601
  estimated_completion: string;  // ISO8601
  completed_at: string | null;
  result_quantity: number;
  workers_assigned: number;
}
```

---

## Tiers d'usines

### T0 — Usines NPC (Matières Premières)

Les usines T0 sont gérées automatiquement et produisent les 33 items T0 :

| Keyword dans nom aéroport/zone | Item produit |
|-------------------------------|--------------|
| céréal, agricole | Raw Wheat |
| élevage, boucherie | Raw Meat |
| laiterie, laitière | Raw Milk |
| verger, fruits | Raw Fruits |
| maraîcher, légumes | Raw Vegetables |
| pêcherie, criée | Raw Fish |
| raffinerie | Crude Oil |
| gisement | Natural Gas |
| carrière | Raw Stone |
| mine | Iron Ore |
| minier | Coal |
| bois, forêt | Raw Wood |

**Paramètres T0 :**
- Stock max : 1000 items
- Production : 50 items / 5 minutes
- Items mis en vente automatiquement (marché IA en Solo, marché SEED en Online)
- Pas de workers requis — tout est automatique

### T1-T10 — Usines Joueurs

Progression en 10 tiers avec capacités croissantes :

| Tier | Max Ingrédients | Max Workers | Max Engineers | Recettes Disponibles |
|------|-----------------|-------------|---------------|---------------------|
| T1 | 2 | 10 | 0 | Recettes ≤ 2 ingrédients |
| T2 | 2 | 20 | 1 | Recettes ≤ 2 ingrédients |
| T3 | 3 | 30 | 1 | Recettes ≤ 3 ingrédients |
| T4 | 3 | 40 | 2 | Recettes ≤ 3 ingrédients |
| T5 | 4 | 50 | 2 | Recettes ≤ 4 ingrédients |
| T6 | 4 | 60 | 3 | Recettes ≤ 4 ingrédients |
| T7 | 5 | 70 | 3 | Recettes ≤ 5 ingrédients |
| T8 | 5 | 80 | 4 | Recettes ≤ 5 ingrédients |
| T9 | 5 | 90 | 4 | Toutes recettes |
| T10 | 5 | 100 | 5 | Toutes recettes |

**Règle clé** : une factory de tier N ne peut exécuter que les recettes ayant **≤ max_ingredients[N]** ingrédients. Par exemple, une T2 ne peut faire que les recettes à 2 ingrédients max (Flour, Bread, Cement...), pas celles à 3+ ingrédients.

**Exception T9-T10** : ces tiers débloquent toutes les recettes sans restriction d'ingrédients.

### Upgrade de tier

Les usines peuvent être améliorées tier par tier. Chaque upgrade :
- Augmente les capacités (workers, engineers, ingrédients)
- Coûte des crédits (CR) et potentiellement des matériaux
- Nécessite que l'usine soit en status "idle"
- Est instantané (pas de temps de construction pour V1)

| Upgrade | Coût estimé |
|---------|------------|
| T1 → T2 | 5,000 CR |
| T2 → T3 | 15,000 CR |
| T3 → T4 | 35,000 CR |
| T4 → T5 | 75,000 CR |
| T5 → T6 | 150,000 CR |
| T6 → T7 | 300,000 CR |
| T7 → T8 | 500,000 CR |
| T8 → T9 | 800,000 CR |
| T9 → T10 | 1,500,000 CR |

---

## Mécanique de Production

### 1. Démarrage d'un batch

Via `FactoryService.startProduction()` (routé par ServiceAdapter) :

```typescript
await ServiceAdapter.startProduction(factoryId, {
  recipe_id: "uuid",
  quantity: 10    // nombre de batches
});
```

**Validations :**
1. L'usine appartient à la company du joueur
2. L'usine est en status "idle"
3. Au moins 1 worker assigné (status="working")
4. Ingrédients disponibles dans `company_inventory` au même aéroport
5. Nombre d'ingrédients de la recette ≤ `factory.max_ingredients`
6. (T9-T10 bypass la règle 5)

> **Important** : Food = 0 ne bloque PAS la production — réduit seulement l'efficacité à 30%

### 2. Calcul temps de production

```
temps_total = temps_par_batch × nombre_de_batches
```

**Exemple :**
- Recette Salted Meat : 3h par batch
- Quantité : 10 batches
- Temps total = 3 × 10 = 30 heures

**Modificateurs :**
- Bonus tier workers : +5% vitesse par tier au-dessus de T1 (max +25%)
- Engineers : réduisent le temps de production (futur)

### 3. Consommation des ingrédients

Les ingrédients sont déduits de `company_inventory` au même aéroport au moment du lancement :

```
quantité_consommée = ingrédient.quantity × nombre_batches
```

### 4. Complétion

**Mode Solo** : Le scheduler local (timer JS dans l'EFB) vérifie toutes les minutes si `Date.now() >= estimated_completion`. Si oui, le batch passe en "completed".

**Mode Online** : Le SEED calcule la complétion côté serveur.

**Destination des items produits :**
- Ajoutés à `company_inventory` au `factory.airport_ident`
- Quantité = `recipe.result_quantity × nombre_batches`

### 5. Bonus Tier Workers

Les workers expérimentés augmentent la quantité produite :

```
tier_bonus = 1.0 + ((avg_worker_tier - 1) × 0.05)
result_qty = base_qty × min(tier_bonus, 1.25)
```

**Exemple :**
- 4 workers tier 3 → avg = 3
- Bonus = 1.0 + (2 × 0.05) = 1.10 (+10%)
- Max bonus : +25%

### 6. Gain XP Workers

À chaque batch complété :
```
xp_gain = recipe.tier × 10
```
Tous les workers assignés à la factory gagnent cet XP.

---

## Système Food

### Consommation

- 1 unité de food / worker assigné / heure
- Déduit par le scheduler local (Solo) ou calculé par SEED (Online)

### Effets sans nourriture

> **Important** : Food = 0 ne bloque PAS la production !

1. **Efficacité réduite à 30%** : Production plus lente (temps × 3.33)
2. **Risque blessure x2** : Chance de blessure doublée
3. **Salaire toujours payé** : Les workers sont quand même payés
4. **Production possible** : Le bouton START reste actif

### Approvisionnement food

La nourriture pour les workers provient des items tagués "food" dans l'inventaire company. La source principale est les **items T0 food** vendus par l'IA sur le marché :
- Raw Meat, Raw Fish, Raw Fruits, Raw Vegetables, Raw Milk, Raw Wheat, etc.

Le joueur peut aussi utiliser des produits transformés T1/T2 tagués "food" (Bread, Cheese...) s'il en produit, mais ce n'est pas nécessaire.

Procédure :
1. Acheter des items T0 food sur le marché
2. Les déposer dans le stock food de l'usine via `depositFood()`
3. Tout item avec le tag "food" est accepté, quel que soit son tier

---

## Slots Aéroport

Chaque aéroport a un nombre limité de slots pour les usines :

| Type Aéroport | Max Slots |
|---------------|-----------|
| large_airport | 12|
| medium_airport | 6 |
| small_airport | 3 |
| seaplane_base | 1 |
| heliport | 1 |
| closed | 0 |

Les slots sont limités pour les joueurs les usines t0 (pnj) ne comptent pas .

---

## Services (Architecture Deux Carrières)

### FactoryService

```typescript
// services/FactoryService.ts

class FactoryServiceClass {
  // Créer une factory (via ServiceAdapter)
  async createFactory(airportIdent: string, name: string, tier: number): Promise<Factory>;

  // Lister mes factories
  async getMyFactories(): Promise<Factory[]>;

  // Détails d'une factory
  async getFactory(id: string): Promise<Factory>;

  // Lancer production
  async startProduction(factoryId: string, params: {
    recipe_id: string;
    quantity: number;
  }): Promise<ProductionBatch>;

  // Annuler production
  async cancelProduction(factoryId: string): Promise<void>;

  // Upgrade tier
  async upgradeFactory(factoryId: string): Promise<Factory>;

  // Déposer food
  async depositFood(factoryId: string, itemId: string, quantity: number): Promise<void>;

  // Status food
  async getFoodStatus(factoryId: string): Promise<FoodStatus>;
}
```

### Validation recette → factory

```typescript
function canFactoryExecuteRecipe(factory: Factory, recipe: Recipe): boolean {
  // T9-T10 peuvent tout faire
  if (factory.tier >= 9) return true;

  // Sinon, vérifier le nombre d'ingrédients
  return recipe.ingredients.length <= factory.max_ingredients;
}
```

### ServiceAdapter — Factory Methods

```typescript
// Dans ServiceAdapter.ts

async createFactory(airportIdent: string, name: string): Promise<Factory> {
  if (GameModeState.isSolo()) {
    return LocalFactoryService.create(airportIdent, name);
  } else {
    return SyncService.createFactory(airportIdent, name);
  }
}

async startProduction(factoryId: string, params: ProductionParams): Promise<ProductionBatch> {
  if (GameModeState.isSolo()) {
    return LocalFactoryService.startProduction(factoryId, params);
  } else {
    return SyncService.startProduction(factoryId, params);
  }
}
```

---

## Scheduler (Mode Solo uniquement)

En mode Solo, des timers JS dans l'EFB gèrent les événements périodiques :

| Job | Intervalle | Description |
|-----|------------|-------------|
| `batch_completion` | 1 min | Vérifie et complète les batches terminés |
| `t0_auto_production` | 5 min | Production NPC T0 (AIEconomyService) |
| `food_and_injuries` | 1 heure | Consommation food + vérification blessures |
| `salary_payments` | 1 heure | Paiement salaires workers |

En mode Online, le SEED gère tout côté serveur — pas de scheduler local.

---

## Flux Production (Résumé)

```
[Ingrédients]                         [Produits]
company_inventory  ───────►  Factory  ───────►  company_inventory
     @ LFPG           │      T1-T10        │       @ LFPG
                      │                     │
              startProduction()      completeBatch()
              (consume × qty)        (output × qty)
```

**Points clés :**
- Ingrédients consommés depuis `company_inventory` au même aéroport
- Multi-batch : `quantity` × ingrédients consommés d'un coup
- Produits arrivent dans `company_inventory` après completion
- Food = 0 réduit efficacité mais ne bloque pas
- Factory tier limite les recettes par nombre d'ingrédients (sauf T9-T10)

---

## Sauvegarde

### Mode Solo

Les données factories sont incluses dans `SoloSaveData` :

```typescript
interface SoloSaveData {
  // ... autres champs existants ...
  factories: Factory[];
  production_batches: ProductionBatch[];
}
```

Sauvegardé via `SetStoredData()` toutes les 60 secondes et à chaque action importante.

### Mode Online

Les factories sont stockées sur le SEED dans le bucket R2 du joueur. Toutes les modifications passent par les endpoints SEED avec validation anti-triche.
