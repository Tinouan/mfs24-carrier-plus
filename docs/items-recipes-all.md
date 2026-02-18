# Items & Recipes — Documentation Complete T0-T5

> **Version**: V5.0 (T0 a T5)
> **Derniere mise a jour** : 13/02/2026
> **Sources fusionnees** : items-recipes.md, new-items-recipes-t2-t5.md

---


---

<!-- Source: items-recipes.md -->

# Items & Recipes System — Documentation Technique

> **Version**: V4.3 (Architecture Deux Carrières)
> **Dernière mise à jour** : 13 février 2026

## Vue d'ensemble

Le système d'items et recettes forme la base de l'économie d'AeroCorp Online :
- **93 items** répartis sur 3 tiers (T0, T1, T2) — extensible vers T3-T5 à terme
- **60 recettes** de production (30 T1, 30 T2)
- Chaîne de transformation : matières premières T0 → produits transformés T1 → produits avancés T2

### Architecture

| Mode | Stockage items | Stockage recettes |
|------|---------------|-------------------|
| **Solo** | `SoloSaveService` → GetStoredData (MSFS natif) | Données statiques dans `data/seed.json` |
| **Online** | SEED (Cloudflare R2) via SyncService | Données statiques dans `data/seed.json` |

Les items et recettes sont des **données statiques** chargées au démarrage depuis `data/seed.json`. Seuls les inventaires (quantités possédées) sont dynamiques et sauvegardés selon le mode.

---

## Modèles de données

### Item

```typescript
interface Item {
  id: string;           // UUID unique
  name: string;         // Nom unique (ex: "Iron Ore")
  tier: number;         // 0=raw, 1-2=processed (futur: 3-5)
  tags: string[];       // Tags pour filtrage (ex: ["construction", "mineral", "raw"])
  icon: string;         // Icône texte (pas d'emoji — Coherent GT affiche des carrés)
  base_value: number;   // Valeur de base en crédits (CR)
  weight_kg: number;    // Poids en kg
  is_raw: boolean;      // true = matière première T0
  stack_size: number;   // Taille de stack (défaut: 100)
  description: string;  // Description courte
}
```

### Recipe

```typescript
interface Recipe {
  id: string;                    // UUID unique
  name: string;                  // Nom de la recette (= nom du produit)
  tier: number;                  // 1-5 (tier requis de la factory)
  result_item_id: string;        // FK → Item produit
  result_quantity: number;       // Quantité produite par batch
  production_time_hours: number; // Temps de production de base (heures)
  base_workers_required: number; // Workers minimum (défaut: 10)
  ingredients: RecipeIngredient[];
  description: string;
}

interface RecipeIngredient {
  item_id: string;   // FK → Item (ingrédient)
  quantity: number;   // Quantité requise par batch
  position: number;   // Ordre d'affichage (0-3)
}
```

---

## Items T0 — Matières Premières (33 items)

Produits automatiquement par les usines NPC (T0). Vendus sur le marché IA en Solo, marché joueurs en Online.

### Ressources Minérales (17 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Aluminum Ore | 18 CR | 4.5 kg | construction, mineral, raw |
| Clay | 4 CR | 2.5 kg | construction, mineral, raw |
| Coal | 10 CR | 3.0 kg | fuel, raw, mineral |
| Copper Ore | 12 CR | 4.0 kg | construction, mineral, raw, electronics |
| Granite | 10 CR | 12.0 kg | construction, mineral, raw |
| Graphite | 20 CR | 2.0 kg | construction, mineral, raw |
| Iron Ore | 15 CR | 5.0 kg | construction, mineral, raw |
| Limestone | 6 CR | 8.0 kg | construction, mineral, raw |
| Phosphate | 10 CR | 3.0 kg | chemical, mineral, raw |
| Rare Earth Metals | 80 CR | 3.0 kg | electronics, mineral, raw, advanced |
| Raw Salt | 5 CR | 1.0 kg | food, mineral, raw |
| Raw Silicon | 30 CR | 2.0 kg | electronics, mineral, raw |
| Raw Stone | 5 CR | 10.0 kg | construction, mineral, raw |
| Sand | 3 CR | 2.0 kg | construction, mineral, raw |
| Sulfur | 15 CR | 2.5 kg | chemical, mineral, raw |
| Titanium Ore | 45 CR | 3.5 kg | construction, mineral, raw |
| Uranium Ore | 100 CR | 8.0 kg | fuel, raw, mineral, advanced |

### Ressources Alimentaires (10 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Raw Cocoa | 15 CR | 1.0 kg | food, raw, plant |
| Raw Fish | 10 CR | 2.0 kg | food, raw, animal |
| Raw Fruits | 6 CR | 1.2 kg | food, raw, plant |
| Raw Meat | 12 CR | 2.5 kg | food, raw, animal |
| Raw Milk | 4 CR | 2.0 kg | food, raw, animal |
| Raw Sugar | 7 CR | 1.0 kg | food, raw, plant |
| Raw Vanilla | 50 CR | 0.5 kg | food, raw, plant |
| Raw Vegetables | 5 CR | 1.0 kg | food, raw, plant |
| Raw Wheat | 8 CR | 1.5 kg | food, raw, plant, grain |
| Water | 1 CR | 1.0 kg | food, raw, liquid |

### Ressources Énergétiques (3 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Biomass | 5 CR | 2.0 kg | fuel, raw, organic |
| Crude Oil | 25 CR | 5.0 kg | fuel, raw |
| Natural Gas | 20 CR | 1.0 kg | fuel, raw |

### Ressources Organiques (3 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Cotton | 8 CR | 1.0 kg | raw, organic |
| Raw Rubber | 12 CR | 1.5 kg | construction, raw, organic |
| Raw Wood | 8 CR | 3.0 kg | construction, raw, organic |

---

## Items T1 — Produits Transformés (30 items)

Première transformation nécessitant des matières premières T0.

### Métaux & Construction (12 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Aluminum Ingot | 55 CR | 4.0 kg | construction, metal, light |
| Bricks | 15 CR | 6.0 kg | construction, masonry |
| Cement | 20 CR | 10.0 kg | construction, binding |
| Copper Ingot | 38 CR | 6.0 kg | construction, metal, electronics |
| Glass | 25 CR | 4.0 kg | construction, transparent |
| Marble Slabs | 65 CR | 10.0 kg | construction, masonry, luxury |
| Planks | 22 CR | 2.0 kg | construction, wood |
| Rubber Sheets | 32 CR | 2.0 kg | construction, industrial |
| Silicon Wafers | 90 CR | 1.5 kg | electronics, advanced |
| Steel Ingot | 45 CR | 8.0 kg | construction, metal |
| Stone Bricks | 18 CR | 8.0 kg | construction, masonry |
| Titanium Ingot | 150 CR | 3.0 kg | construction, metal, advanced |

### Alimentaire (10 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Bread | 15 CR | 0.5 kg | food, baked |
| Butter | 28 CR | 0.5 kg | food, dairy |
| Cocoa Powder | 35 CR | 0.6 kg | food, ingredient |
| Dried Fish | 25 CR | 1.5 kg | food, preserved |
| Flour | 12 CR | 1.0 kg | food, ingredient |
| Fruit Jam | 22 CR | 0.8 kg | food, preserved, sweet |
| Salted Meat | 30 CR | 2.0 kg | food, preserved, animal |
| Sugar Syrup | 18 CR | 0.8 kg | food, ingredient |
| Vanilla Extract | 120 CR | 0.3 kg | food, ingredient, rare |
| Vegetable Stew | 20 CR | 1.0 kg | food, cooked |

### Carburants & Chimie (8 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Biofuel | 48 CR | 3.5 kg | fuel, renewable |
| Charcoal | 28 CR | 2.5 kg | fuel, solid |
| Compressed Gas | 55 CR | 2.0 kg | fuel, gas |
| Diesel | 60 CR | 4.0 kg | fuel, liquid |
| Fabric | 24 CR | 1.5 kg | construction, textile |
| Fertilizer | 28 CR | 5.0 kg | chemical, agriculture |
| Sulfuric Acid | 40 CR | 4.0 kg | chemical, industrial |
| Uranium Pellets | 300 CR | 5.0 kg | fuel, nuclear, advanced |

---

## Items T2 — Produits Avancés (30 items)

Produits nécessitant des items T1 ou combinaison T0+T1.

### Métaux & Construction (8 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Aluminum Frame | 88 CR | 5.0 kg | construction, metal, light |
| Concrete Blocks | 45 CR | 15.0 kg | construction, masonry |
| Reinforced Steel | 95 CR | 10.0 kg | construction, metal, quality |
| Steel Pipes | 82 CR | 9.0 kg | construction, metal, plumbing |
| Titanium Plates | 320 CR | 4.0 kg | construction, metal, advanced, armor |
| Window Panes | 72 CR | 6.0 kg | construction, transparent |
| Wire Cable | 68 CR | 3.0 kg | construction, metal, electronics |
| Wooden Beams | 55 CR | 8.0 kg | construction, wood |

### Alimentaire (10 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Cheese | 65 CR | 1.0 kg | food, dairy, quality |
| Chocolate Bar | 85 CR | 0.4 kg | food, sweet, luxury |
| Dried Fruit | 45 CR | 0.8 kg | food, preserved, sweet |
| Fruit Cake | 75 CR | 1.2 kg | food, baked, sweet |
| Honey Bread | 58 CR | 0.7 kg | food, baked, sweet, quality |
| Pastry | 38 CR | 0.5 kg | food, baked, sweet |
| Quality Bread | 35 CR | 0.6 kg | food, baked, quality |
| Sausage | 48 CR | 1.5 kg | food, meat, preserved |
| Smoked Fish | 55 CR | 1.8 kg | food, preserved, quality |
| Vegetable Soup | 42 CR | 1.2 kg | food, cooked, quality |

### Carburants & Chimie (10 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Adhesive | 68 CR | 2.0 kg | chemical, industrial |
| Cleaning Solution | 35 CR | 3.0 kg | chemical, industrial |
| Heating Oil | 88 CR | 4.5 kg | fuel, liquid |
| Insulation | 58 CR | 3.0 kg | construction, industrial |
| Jet Fuel | 135 CR | 5.0 kg | fuel, liquid, aviation |
| Nuclear Fuel Rod | 1200 CR | 8.0 kg | fuel, nuclear, advanced |
| Paint | 52 CR | 3.5 kg | chemical, construction |
| Plastic Sheets | 62 CR | 2.5 kg | construction, chemical |
| Premium Biofuel | 115 CR | 4.0 kg | fuel, renewable, quality |
| Rocket Propellant | 285 CR | 6.0 kg | fuel, liquid, advanced |

### Électronique & Médical (2 items)

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Circuit Board | 185 CR | 2.0 kg | electronics, advanced |
| Medical Bandages | 48 CR | 0.5 kg | medical, consumable |

---

## Recettes T1 (30 recettes)

Toutes les recettes T1 nécessitent 10 workers minimum et une factory T1+.
Chaque recette T1 utilise 2-4 ingrédients T0.

### Recettes Métaux

| Recette | Temps | Produit | Ingrédients |
|---------|-------|---------|-------------|
| Aluminum Ingot | 5h | 4x | 2x Aluminum Ore + 2x Coal |
| Copper Ingot | 3h | 5x | 2x Copper Ore + 1x Coal |
| Steel Ingot | 4h | 5x | 2x Iron Ore + 1x Coal |
| Titanium Ingot | 8h | 2x | 3x Titanium Ore + 2x Coal |
| Silicon Wafers | 6h | 4x | 2x Raw Silicon + 2x Coal |

### Recettes Construction

| Recette | Temps | Produit | Ingrédients |
|---------|-------|---------|-------------|
| Bricks | 2h | 12x | 3x Clay + 1x Coal |
| Cement | 2.5h | 10x | 2x Limestone + 1x Water |
| Glass | 3h | 6x | 4x Sand + 1x Coal |
| Marble Slabs | 3h | 4x | 2x Granite + 1x Water |
| Planks | 1h | 10x | 2x Raw Wood + 1x Water |
| Rubber Sheets | 2h | 8x | 3x Raw Rubber + 1x Sulfur |
| Stone Bricks | 2h | 8x | 3x Raw Stone + 1x Water |
| Fabric | 1.5h | 12x | 4x Cotton + 1x Water |

### Recettes Alimentaires

| Recette | Temps | Produit | Ingrédients |
|---------|-------|---------|-------------|
| Bread | 1.5h | 20x | 2x Raw Wheat + 1x Water |
| Butter | 2h | 5x | 4x Raw Milk + 1x Raw Salt |
| Cocoa Powder | 2h | 8x | 3x Raw Cocoa + 1x Raw Sugar |
| Dried Fish | 2h | 10x | 2x Raw Fish + 1x Raw Salt |
| Flour | 1h | 25x | 3x Raw Wheat + 1x Water |
| Fruit Jam | 3h | 12x | 3x Raw Fruits + 1x Raw Sugar |
| Salted Meat | 3h | 8x | 2x Raw Meat + 1x Raw Salt |
| Sugar Syrup | 1h | 10x | 2x Raw Sugar + 1x Water |
| Vanilla Extract | 4h | 3x | 2x Raw Vanilla + 1x Water |
| Vegetable Stew | 2h | 15x | 3x Raw Vegetables + 2x Water |

### Recettes Carburants & Chimie

| Recette | Temps | Produit | Ingrédients |
|---------|-------|---------|-------------|
| Biofuel | 6h | 7x | 4x Biomass + 1x Water |
| Charcoal | 4h | 6x | 2x Coal + 1x Raw Wood |
| Compressed Gas | 2h | 5x | 3x Natural Gas + 1x Coal |
| Diesel | 3h | 8x | 3x Crude Oil + 1x Coal |
| Fertilizer | 2h | 10x | 3x Phosphate + 1x Water |
| Sulfuric Acid | 3h | 6x | 3x Sulfur + 2x Water |
| Uranium Pellets | 12h | 1x | 2x Uranium Ore + 1x Water |

---

## Recettes T2 (30 recettes)

Recettes avancées utilisant des produits T1 ou combinaisons T0+T1.
Nécessitent une factory T2+.

### Recettes Métaux & Construction

| Recette | Temps | Produit | Ingrédients |
|---------|-------|---------|-------------|
| Aluminum Frame | 5h | 4x | 3x Aluminum Ingot |
| Concrete Blocks | 4h | 8x | 2x Cement + 2x Stone Bricks + 1x Water |
| Reinforced Steel | 6h | 4x | 3x Steel Ingot + 1x Aluminum Ingot |
| Steel Pipes | 4h | 6x | 3x Steel Ingot |
| Titanium Plates | 10h | 2x | 2x Titanium Ingot |
| Window Panes | 3h | 5x | 3x Glass + 1x Aluminum Ingot |
| Wire Cable | 2h | 12x | 2x Copper Ingot + 1x Rubber Sheets |
| Wooden Beams | 3h | 6x | 4x Planks |
| Insulation | 2h | 10x | 2x Rubber Sheets + 1x Fabric |

### Recettes Alimentaires

| Recette | Temps | Produit | Ingrédients |
|---------|-------|---------|-------------|
| Cheese | 8h | 4x | 5x Raw Milk + 1x Raw Salt |
| Chocolate Bar | 3h | 6x | 2x Cocoa Powder + 1x Sugar Syrup + 1x Butter |
| Dried Fruit | 6h | 10x | 4x Raw Fruits + 1x Raw Sugar |
| Fruit Cake | 4h | 5x | 2x Flour + 2x Fruit Jam + 1x Sugar Syrup |
| Honey Bread | 3h | 8x | 2x Bread + 2x Sugar Syrup + 1x Vanilla Extract |
| Pastry | 2h | 8x | 2x Flour + 2x Butter + 1x Sugar Syrup |
| Quality Bread | 2.5h | 15x | 3x Flour + 1x Butter + 1x Water |
| Sausage | 3h | 10x | 3x Salted Meat + 1x Raw Salt |
| Smoked Fish | 4h | 8x | 2x Dried Fish + 1x Raw Wood + 1x Raw Salt |
| Vegetable Soup | 2h | 12x | 2x Vegetable Stew + 1x Bread |

### Recettes Carburants

| Recette | Temps | Produit | Ingrédients |
|---------|-------|---------|-------------|
| Heating Oil | 3h | 8x | 2x Diesel + 1x Coal |
| Jet Fuel | 4h | 6x | 2x Diesel + 1x Crude Oil |
| Nuclear Fuel Rod | 24h | 1x | 3x Uranium Pellets + 2x Steel Ingot |
| Premium Biofuel | 8h | 5x | 3x Biofuel + 1x Sulfuric Acid |
| Rocket Propellant | 10h | 2x | 2x Jet Fuel + 2x Sulfuric Acid |

### Recettes Chimie & Industrie

| Recette | Temps | Produit | Ingrédients |
|---------|-------|---------|-------------|
| Adhesive | 3h | 6x | 2x Raw Rubber + 1x Sulfuric Acid |
| Cleaning Solution | 2h | 10x | 1x Sulfuric Acid + 3x Water |
| Paint | 2.5h | 8x | 1x Crude Oil + 1x Sulfuric Acid + 1x Water |
| Plastic Sheets | 3h | 8x | 2x Crude Oil + 1x Sulfuric Acid |

### Recettes Électronique & Médical

| Recette | Temps | Produit | Ingrédients |
|---------|-------|---------|-------------|
| Circuit Board | 8h | 3x | 2x Silicon Wafers + 1x Copper Ingot |
| Medical Bandages | 2h | 15x | 3x Fabric + 1x Water |

---

## Calcul de Rentabilité

### Formule de base

```
Profit = (Valeur Produit × Quantité) - Somme(Valeur Ingrédient × Quantité)
Profit/h = Profit / Temps de Production
```

Note : ces calculs ne prennent pas en compte les salaires workers ni les bonus tiers.

### Exemples T1

| Recette | Coût Inputs | Valeur Output | Profit | Temps | Profit/h |
|---------|-------------|---------------|--------|-------|----------|
| Flour | 3×8 + 1 = 25 CR | 25×12 = 300 CR | 275 CR | 1h | 275 CR/h |
| Bread | 2×8 + 1 = 17 CR | 20×15 = 300 CR | 283 CR | 1.5h | 189 CR/h |
| Steel Ingot | 2×15 + 10 = 40 CR | 5×45 = 225 CR | 185 CR | 4h | 46 CR/h |
| Uranium Pellets | 2×100 + 1 = 201 CR | 1×300 = 300 CR | 99 CR | 12h | 8 CR/h |

### Exemples T2

| Recette | Coût Inputs | Valeur Output | Profit | Temps | Profit/h |
|---------|-------------|---------------|--------|-------|----------|
| Quality Bread | 3×12 + 28 + 1 = 65 CR | 15×35 = 525 CR | 460 CR | 2.5h | 184 CR/h |
| Chocolate Bar | 2×35 + 18 + 28 = 116 CR | 6×85 = 510 CR | 394 CR | 3h | 131 CR/h |
| Circuit Board | 2×90 + 38 = 218 CR | 3×185 = 555 CR | 337 CR | 8h | 42 CR/h |
| Nuclear Fuel Rod | 3×300 + 2×45 = 990 CR | 1×1200 = 1200 CR | 210 CR | 24h | 9 CR/h |

Nuclear Fuel Rod : rentabilité faible mais valeur unitaire très élevée — item stratégique pour les missions cargo haut de gamme et contracts spéciaux.

---

## Système de Tags

### Tags Principaux

| Tag | Description | Exemples |
|-----|-------------|----------|
| `raw` | Matière première T0 | Iron Ore, Raw Wheat |
| `food` | Produit alimentaire | Bread, Cheese |
| `fuel` | Carburant/énergie | Diesel, Biofuel |
| `construction` | Matériaux de construction | Steel Ingot, Bricks |
| `chemical` | Produit chimique | Sulfuric Acid, Fertilizer |
| `electronics` | Composant électronique | Silicon Wafers, Circuit Board |
| `medical` | Produit médical | Medical Bandages |

### Tags Secondaires

| Tag | Description |
|-----|-------------|
| `mineral` | Ressource minérale |
| `organic` | Ressource organique |
| `plant` | Origine végétale |
| `animal` | Origine animale |
| `metal` | Produit métallique |
| `wood` | Produit en bois |
| `textile` | Tissu/textile |
| `liquid` | Liquide |
| `gas` | Gaz |

### Tags de Qualité

| Tag | Description |
|-----|-------------|
| `quality` | Produit de qualité supérieure |
| `luxury` | Produit de luxe |
| `advanced` | Technologie avancée |
| `rare` | Ressource rare |

---

## Services (Architecture Deux Carrières)

### ItemService

```typescript
// services/ItemService.ts
// Charge les données statiques depuis data/seed.json

class ItemServiceClass {
  private items: Item[] = [];

  init(): void {
    // Charger depuis seed.json au démarrage
    this.items = seedData.items;
  }

  getAllItems(): Item[] {
    return this.items;
  }

  getItemById(id: string): Item | null {
    return this.items.find(i => i.id === id) || null;
  }

  getItemsByTier(tier: number): Item[] {
    return this.items.filter(i => i.tier === tier);
  }

  getItemsByTag(tag: string): Item[] {
    return this.items.filter(i => i.tags.includes(tag));
  }

  searchItems(query: string): Item[] {
    const q = query.toLowerCase();
    return this.items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.tags.some(t => t.includes(q))
    );
  }
}

export const ItemService = new ItemServiceClass();
```

### RecipeService

```typescript
// services/RecipeService.ts
// Charge les données statiques depuis data/seed.json

class RecipeServiceClass {
  private recipes: Recipe[] = [];

  init(): void {
    this.recipes = seedData.recipes;
  }

  getAllRecipes(): Recipe[] {
    return this.recipes;
  }

  getRecipeById(id: string): Recipe | null {
    return this.recipes.find(r => r.id === id) || null;
  }

  getRecipesByTier(tier: number): Recipe[] {
    return this.recipes.filter(r => r.tier === tier);
  }

  getRecipesForFactory(factoryTier: number): Recipe[] {
    // Une factory peut exécuter les recettes de son tier et en dessous
    return this.recipes.filter(r => r.tier <= factoryTier);
  }

  getRecipeIngredients(recipeId: string): RecipeIngredient[] {
    const recipe = this.getRecipeById(recipeId);
    return recipe?.ingredients || [];
  }
}

export const RecipeService = new RecipeServiceClass();
```

---

## Seed Data (data/seed.json)

Les 93 items et 60 recettes sont packagés dans `data/seed.json` et chargés au démarrage de l'EFB. Ce fichier est identique en Solo et Online — c'est de la donnée statique de référence.

```
data/seed.json
├── items: Item[]          // 93 items (33 T0, 30 T1, 30 T2)
├── recipes: Recipe[]      // 60 recettes (30 T1, 30 T2)
├── country_worker_stats   // Stats par pays (42 pays)
└── version: string        // Pour migration future
```

---

## Prochaines évolutions (T3-T5)

Les tiers 3 à 5 sont prévus pour les futures versions :

- **T3** : Produits industriels complexes (véhicules, machines)
- **T4** : Haute technologie (composants avion, électronique avancée)
- **T5** : Produits de luxe et spatiaux

Les recettes T3+ nécessiteront des factories de tier correspondant (T3-T10) et des workers plus expérimentés.


---

<!-- Source: new-items-recipes-t2-t5.md -->

# Nouveaux Items & Recettes T2-T5

## Rappel des contraintes usines

| Tier usine | Slots ingrédients | Recettes accessibles |
|------------|-------------------|---------------------|
| T1-T2 | 2 slots | T1, T2 |
| T3-T4 | 3 slots | T1 à T3 (T3), T1 à T4 (T4) |
| T5-T6 | 4 slots | T1 à T5 |
| T7-T10 | 5 slots | Toutes |

**Règle** : On peut mélanger les tiers d'ingrédients librement. Une recette T4 peut utiliser du T0 + T1 + T3.
**Contrainte slots** : Le nombre d'ingrédients UNIQUES de la recette ≤ slots max du tier d'usine minimum requis.

- Recettes T2 : max **2 ingrédients uniques** (usine T2 = 2 slots)
- Recettes T3 : max **3 ingrédients uniques** (usine T3 = 3 slots)
- Recettes T4 : max **3 ingrédients uniques** (usine T4 = 3 slots)
- Recettes T5 : max **4 ingrédients uniques** (usine T5 = 4 slots)

---

# ITEMS T2 SUPPLÉMENTAIRES (20 items)

On ajoute 20 items T2 aux 30 existants.

### Construction & Industrie

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Steel Beam | 120€ | 15.0kg | construction, metal, structural |
| Copper Wire | 52€ | 1.5kg | electronics, metal, wiring |
| Fiberglass | 78€ | 2.0kg | construction, composite |
| Plywood | 38€ | 4.0kg | construction, wood |
| Ceramic Tiles | 42€ | 5.0kg | construction, masonry |
| Rubber Gasket | 45€ | 0.8kg | construction, industrial, seal |
| Steel Nails | 28€ | 2.0kg | construction, metal, fastener |

### Alimentaire

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Canned Fish | 65€ | 1.0kg | food, preserved, quality |
| Spiced Meat | 72€ | 1.8kg | food, meat, spiced |
| Fruit Juice | 30€ | 1.0kg | food, drink, sweet |
| Cheese Wheel | 95€ | 3.0kg | food, dairy, luxury |
| Chili Sauce | 55€ | 0.6kg | food, sauce, spiced |
| Vanilla Cake | 145€ | 1.0kg | food, baked, luxury |

### Chimie & Énergie

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Lubricant | 75€ | 3.0kg | chemical, industrial, oil |
| Graphite Rod | 58€ | 1.5kg | construction, industrial |
| Dye | 48€ | 1.0kg | chemical, textile |
| Battery Cell | 125€ | 2.5kg | electronics, energy |
| Firebricks | 55€ | 8.0kg | construction, industrial, heat |
| Asphalt | 35€ | 10.0kg | construction, road |
| Tempered Glass | 68€ | 5.0kg | construction, transparent, quality |

---

# RECETTES T2 SUPPLÉMENTAIRES (20 recettes)

Toutes avec **2 ingrédients uniques** (slots T1-T2).

### Construction & Industrie

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Steel Beam | 5h | 3x | 3× Reinforced Steel + 2× Iron Ore | T2+T0 |
| Copper Wire | 2h | 10x | 2× Copper Ingot + 1× Rubber Sheets | T1+T1 |
| Fiberglass | 4h | 6x | 3× Glass + 2× Plastic Sheets | T1+T2 |
| Plywood | 2h | 8x | 3× Planks + 1× Adhesive | T1+T2 |
| Ceramic Tiles | 3h | 10x | 3× Clay + 2× Sand | T0+T0 |
| Rubber Gasket | 2h | 12x | 2× Rubber Sheets + 1× Sulfuric Acid | T1+T1 |
| Steel Nails | 1.5h | 20x | 2× Steel Ingot + 1× Coal | T1+T0 |
| Firebricks | 4h | 6x | 3× Bricks + 2× Charcoal | T1+T1 |
| Asphalt | 2h | 10x | 3× Crude Oil + 2× Sand | T0+T0 |
| Tempered Glass | 3h | 5x | 3× Glass + 1× Compressed Gas | T1+T1 |

### Alimentaire

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Canned Fish | 3h | 8x | 2× Smoked Fish + 1× Steel Ingot | T2+T1 |
| Spiced Meat | 4h | 6x | 2× Salted Meat + 2× Pepper | T1+T0 |
| Fruit Juice | 1.5h | 12x | 3× Raw Fruits + 1× Water | T0+T0 |
| Cheese Wheel | 10h | 3x | 4× Cheese + 1× Raw Salt | T2+T0 |
| Chili Sauce | 2h | 10x | 3× Chili + 1× Raw Salt | T0+T0 |
| Vanilla Cake | 4h | 4x | 2× Pastry + 1× Vanilla Extract | T2+T1 |

### Chimie & Énergie

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Lubricant | 3h | 6x | 2× Crude Oil + 1× Sulfuric Acid | T0+T1 |
| Graphite Rod | 3h | 8x | 3× Graphite + 1× Coal | T0+T0 |
| Dye | 2h | 10x | 2× Raw Cocoa + 1× Sulfuric Acid | T0+T1 |
| Battery Cell | 6h | 3x | 2× Copper Ingot + 1× Sulfuric Acid | T1+T1 |

---

# ITEMS T3 — Produits Intermédiaires (15 items)

Produits industriels nécessitant des usines T3+ (3 slots max).

### Construction Avancée

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Structural Panel | 180€ | 12.0kg | construction, composite, structural |
| Insulated Wall | 155€ | 10.0kg | construction, composite |
| Armored Plate | 420€ | 8.0kg | construction, metal, armor |
| Hydraulic Cylinder | 280€ | 6.0kg | mechanical, industrial |

### Électronique & Machines

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Electric Motor | 350€ | 8.0kg | electronics, mechanical, industrial |
| Sensor Module | 290€ | 1.0kg | electronics, advanced |
| Power Supply | 210€ | 3.0kg | electronics, energy |
| LED Panel | 165€ | 1.5kg | electronics, lighting |

### Alimentaire Premium

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Premium Chocolate | 185€ | 0.5kg | food, luxury, sweet |
| Gourmet Meal | 140€ | 2.0kg | food, luxury, cooked |
| Aged Cheese | 195€ | 1.5kg | food, dairy, luxury, aged |

### Chimie Avancée & Énergie

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Carbon Fiber | 380€ | 1.0kg | construction, composite, advanced |
| Industrial Solvent | 120€ | 3.0kg | chemical, industrial |
| Turbine Blade | 520€ | 5.0kg | mechanical, advanced, aviation |
| Advanced Battery | 450€ | 4.0kg | electronics, energy, advanced |

---

# RECETTES T3 (15 recettes)

Toutes avec **3 ingrédients uniques** (slots T3-T4).

### Construction Avancée

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Structural Panel | 6h | 4x | 2× Steel Beam + 2× Insulation + 1× Adhesive | T2+T2+T2 |
| Insulated Wall | 5h | 4x | 2× Plywood + 2× Insulation + 1× Paint | T2+T2+T2 |
| Armored Plate | 8h | 2x | 2× Titanium Plates + 1× Reinforced Steel + 1× Carbon Fiber | T2+T2+T3 ⚠ |
| Hydraulic Cylinder | 6h | 3x | 2× Steel Pipes + 1× Lubricant + 1× Rubber Gasket | T2+T2+T2 |

**⚠ Armored Plate** : Utilise Carbon Fiber (T3). Ça veut dire qu'il faut d'abord produire le Carbon Fiber, puis l'utiliser. Cela crée une **chaîne séquentielle** au sein du même tier, ce qui est intentionnel pour le gameplay.

### Électronique & Machines

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Electric Motor | 8h | 2x | 2× Copper Wire + 1× Steel Ingot + 1× Rare Earth Metals | T2+T1+T0 |
| Sensor Module | 10h | 3x | 1× Circuit Board + 1× Silicon Wafers + 1× Copper Wire | T2+T1+T2 |
| Power Supply | 5h | 4x | 2× Battery Cell + 1× Copper Wire + 1× Circuit Board | T2+T2+T2 |
| LED Panel | 4h | 6x | 1× Circuit Board + 1× Glass + 1× Rare Earth Metals | T2+T1+T0 |

### Alimentaire Premium

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Premium Chocolate | 6h | 5x | 2× Chocolate Bar + 1× Vanilla Extract + 1× Butter | T2+T1+T1 |
| Gourmet Meal | 4h | 4x | 1× Spiced Meat + 1× Quality Bread + 1× Vegetable Soup | T2+T2+T2 |
| Aged Cheese | 12h | 3x | 3× Cheese Wheel + 1× Raw Salt + 1× Raw Wood | T2+T0+T0 |

### Chimie Avancée & Énergie

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Carbon Fiber | 8h | 3x | 3× Graphite Rod + 2× Plastic Sheets + 1× Sulfuric Acid | T2+T2+T1 |
| Industrial Solvent | 3h | 6x | 2× Sulfuric Acid + 1× Diesel + 1× Water | T1+T1+T0 |
| Turbine Blade | 12h | 2x | 2× Titanium Plates + 1× Reinforced Steel + 1× Graphite Rod | T2+T2+T2 |
| Advanced Battery | 10h | 2x | 3× Battery Cell + 1× Rare Earth Metals + 1× Graphite Rod | T2+T0+T2 |

---

# ITEMS T4 — Produits Finis (10 items)

Produits haute technologie et équipements complets.

### Aviation & Mécanique

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Avionics Unit | 1,200€ | 4.0kg | aviation, electronics, advanced |
| Landing Gear Part | 850€ | 12.0kg | aviation, mechanical, structural |
| Navigation System | 980€ | 2.0kg | aviation, electronics |

### Industrie & Énergie

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Solar Panel | 680€ | 8.0kg | electronics, energy, renewable |
| Industrial Robot Arm | 1,500€ | 15.0kg | mechanical, electronics, advanced |
| Generator | 920€ | 20.0kg | mechanical, energy |

### Haute Technologie

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Satellite Dish | 750€ | 6.0kg | electronics, communication |
| Medical Scanner | 1,800€ | 10.0kg | medical, electronics, advanced |

### Construction Premium

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Prefab Module | 580€ | 25.0kg | construction, structural, prefab |
| Climate Control Unit | 720€ | 8.0kg | mechanical, electronics |

---

# RECETTES T4 (10 recettes)

Toutes avec **3 ingrédients uniques** (slots T3-T4).

### Aviation & Mécanique

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Avionics Unit | 16h | 1x | 2× Sensor Module + 1× Circuit Board + 1× Power Supply | T3+T2+T3 |
| Landing Gear Part | 12h | 2x | 2× Hydraulic Cylinder + 2× Reinforced Steel + 1× Rubber Gasket | T3+T2+T2 |
| Navigation System | 14h | 1x | 1× Sensor Module + 1× LED Panel + 1× Circuit Board | T3+T3+T2 |

### Industrie & Énergie

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Solar Panel | 10h | 2x | 3× Silicon Wafers + 1× Aluminum Frame + 1× Wire Cable | T1+T2+T2 |
| Industrial Robot Arm | 20h | 1x | 2× Electric Motor + 1× Sensor Module + 2× Reinforced Steel | T3+T3+T2 |
| Generator | 14h | 1x | 2× Electric Motor + 2× Copper Wire + 1× Turbine Blade | T3+T2+T3 |

### Haute Technologie

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Satellite Dish | 8h | 2x | 2× Aluminum Frame + 1× Sensor Module + 1× Wire Cable | T2+T3+T2 |
| Medical Scanner | 24h | 1x | 1× Sensor Module + 1× LED Panel + 2× Circuit Board | T3+T3+T2 |

### Construction Premium

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Prefab Module | 8h | 2x | 2× Structural Panel + 2× Insulated Wall + 1× Window Panes | T3+T3+T2 |
| Climate Control Unit | 10h | 2x | 1× Electric Motor + 2× Copper Wire + 1× Compressed Gas | T3+T2+T1 |

---

# ITEMS T5 — Luxe & Ultra-Tech (8 items)

Produits de très haute valeur, endgame.

### Aviation Elite

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Flight Computer | 3,500€ | 3.0kg | aviation, electronics, advanced, luxury |
| Aircraft Engine Part | 5,200€ | 18.0kg | aviation, mechanical, advanced |

### Technologie Spatiale

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Satellite Component | 4,800€ | 5.0kg | electronics, space, advanced |
| Nuclear Reactor Core | 12,000€ | 25.0kg | energy, nuclear, advanced |

### Luxe & Rare

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Luxury Watch | 2,800€ | 0.2kg | luxury, precision |
| Fine Dining Set | 950€ | 3.0kg | food, luxury, gourmet |

### Médical & Recherche

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Surgical Robot | 8,500€ | 12.0kg | medical, electronics, advanced, luxury |
| Research Lab Kit | 3,200€ | 8.0kg | medical, chemical, advanced |

---

# RECETTES T5 (8 recettes)

Toutes avec **4 ingrédients uniques** (slots T5-T6).

### Aviation Elite

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Flight Computer | 24h | 1x | 1× Avionics Unit + 1× Navigation System + 1× Advanced Battery + 1× Sensor Module | T4+T4+T3+T3 |
| Aircraft Engine Part | 36h | 1x | 2× Turbine Blade + 1× Titanium Plates + 1× Hydraulic Cylinder + 1× Lubricant | T3+T2+T3+T2 |

### Technologie Spatiale

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Satellite Component | 30h | 1x | 1× Navigation System + 1× Solar Panel + 1× Carbon Fiber + 1× Satellite Dish | T4+T4+T3+T4 |
| Nuclear Reactor Core | 48h | 1x | 3× Nuclear Fuel Rod + 2× Armored Plate + 1× Hydraulic Cylinder + 1× Sensor Module | T2+T3+T3+T3 |

### Luxe & Rare

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Luxury Watch | 16h | 2x | 1× Titanium Ingot + 1× Silicon Wafers + 1× Rare Earth Metals + 1× Tempered Glass | T1+T1+T0+T2 |
| Fine Dining Set | 8h | 3x | 1× Premium Chocolate + 1× Aged Cheese + 1× Gourmet Meal + 1× Vanilla Extract | T3+T3+T3+T1 |

### Médical & Recherche

| Recette | Temps | Produit | Ingrédients | Mix tiers |
|---------|-------|---------|-------------|-----------|
| Surgical Robot | 40h | 1x | 1× Industrial Robot Arm + 1× Medical Scanner + 1× Sensor Module + 1× Power Supply | T4+T4+T3+T3 |
| Research Lab Kit | 20h | 1x | 1× Medical Scanner + 1× Industrial Solvent + 1× Circuit Board + 1× Tempered Glass | T4+T3+T2+T2 |

---

# CHAÎNES DE PRODUCTION COMPLÈTES

Exemples de supply chains du T0 au T5 :

### Chaîne Aviation (T0 → T5)

```
T0: Iron Ore + Coal
  ↓
T1: Steel Ingot
  ↓
T2: Reinforced Steel + Copper Wire
  ↓
T3: Turbine Blade + Hydraulic Cylinder
  ↓
T4: Avionics Unit + Navigation System
  ↓
T5: Flight Computer (3,500€)
     Aircraft Engine Part (5,200€)
```

### Chaîne Électronique (T0 → T5)

```
T0: Raw Silicon + Coal + Copper Ore + Rare Earth
  ↓
T1: Silicon Wafers + Copper Ingot
  ↓
T2: Circuit Board + Battery Cell + Copper Wire
  ↓
T3: Sensor Module + Power Supply + Electric Motor + Advanced Battery
  ↓
T4: Medical Scanner + Industrial Robot Arm + Navigation System
  ↓
T5: Surgical Robot (8,500€)
     Satellite Component (4,800€)
```

### Chaîne Food Luxury (T0 → T5)

```
T0: Raw Cocoa + Raw Vanilla + Raw Milk + Raw Meat + Pepper
  ↓
T1: Cocoa Powder + Vanilla Extract + Butter + Salted Meat
  ↓
T2: Chocolate Bar + Pastry + Cheese + Spiced Meat + Quality Bread
  ↓
T3: Premium Chocolate + Gourmet Meal + Aged Cheese
  ↓
T5: Fine Dining Set (950€)
```

### Chaîne Nucléaire (T0 → T5)

```
T0: Uranium Ore + Water + Iron Ore + Coal + Titanium Ore
  ↓
T1: Uranium Pellets + Steel Ingot + Titanium Ingot
  ↓
T2: Nuclear Fuel Rod + Reinforced Steel + Titanium Plates
  ↓
T3: Armored Plate + Hydraulic Cylinder + Sensor Module
  ↓
T5: Nuclear Reactor Core (12,000€)
```

---

# STATISTIQUES FINALES

## Totaux items

| Tier | Existants | Nouveaux | Total |
|------|-----------|----------|-------|
| T0 | 38 | 0 | **38** |
| T1 | 30 | 0 | **30** |
| T2 | 30 | +20 | **50** |
| T3 | 0 | +15 | **15** |
| T4 | 0 | +10 | **10** |
| T5 | 0 | +8 | **8** |
| **TOTAL** | **98** | **+53** | **151 items** |

## Totaux recettes

| Tier | Existantes | Nouvelles | Total |
|------|------------|-----------|-------|
| T1 | 30 | 0 | **30** |
| T2 | 30 | +20 | **50** |
| T3 | 0 | +15 | **15** |
| T4 | 0 | +10 | **10** |
| T5 | 0 | +8 | **8** |
| **TOTAL** | **60** | **+53** | **113 recettes** |

## Répartition par nombre d'ingrédients uniques

| Ingrédients uniques | T1 | T2 | T3 | T4 | T5 | Total |
|---------------------|----|----|----|----|----|----|
| 1 | 0 | 4 | 0 | 0 | 0 | 4 |
| 2 | 30 | 46 | 0 | 0 | 0 | 76 |
| 3 | 0 | 0 | 15 | 10 | 0 | 25 |
| 4 | 0 | 0 | 0 | 0 | 8 | 8 |

## Valeurs par tier (moyenne)

| Tier | Valeur moyenne | Temps moyen | Rentabilité gameplay |
|------|---------------|-------------|---------------------|
| T0 | ~20€ | Auto (NPC) | Matière première |
| T1 | ~55€ | 2.5h | Accessible, bon ratio |
| T2 | ~95€ | 4h | Intermédiaire |
| T3 | ~310€ | 7.5h | Investissement sérieux |
| T4 | ~1,100€ | 14h | Haute valeur, lent |
| T5 | ~5,100€ | 28h | Endgame, très rentable si pipeline optimisé |

---

# NOTES GAMEPLAY

## Progression naturelle

1. **Début** : Usine T1 → recettes T1 simples (Bread, Steel Ingot)
2. **Milieu** : Usine T2 → recettes T2 (Circuit Board, Canned Fish)
3. **Mi-avancé** : Usine T3 → Electric Motor, Sensor Module (3 ingrédients = logistique + complexe)
4. **Avancé** : Usine T4 → Avionics Unit, Industrial Robot Arm
5. **Endgame** : Usine T5 → Flight Computer, Nuclear Reactor Core (4 ingrédients = empire logistique requis)

## Goulots d'étranglement stratégiques

| Ressource | Pourquoi c'est un goulot |
|-----------|-------------------------|
| Rare Earth Metals | 6 usines NPC (Chine surtout) → nécessaire pour Electric Motor, Sensor Module, Advanced Battery, Luxury Watch |
| Titanium Ore | Peu d'usines NPC → chaîne vers Armored Plate → Nuclear Reactor Core |
| Vanilla | 7 usines NPC → Premium Chocolate → Fine Dining Set |
| Circuit Board | Utilisé par Sensor Module, Navigation, Power Supply → goulot T3-T4 |
| Sensor Module | Utilisé par 5 recettes T4-T5 → le composant le plus demandé |

## Recettes "raccourci" (T0 direct dans recettes hautes)

| Recette | Ingrédient T0 direct | Pourquoi |
|---------|---------------------|----------|
| Electric Motor | Rare Earth Metals (T0) | Aimants = matière première directe |
| LED Panel | Rare Earth Metals (T0) | Phosphores LED = terres rares |
| Aged Cheese | Raw Salt + Raw Wood (T0) | Affinage traditionnel |
| Luxury Watch | Rare Earth + Titanium Ingot (T0+T1) | Composants de base nobles |
| Solar Panel | Silicon Wafers (T1) | Cellules solaires directes |

Ces raccourcis sont intentionnels pour que les joueurs ne soient pas obligés de tout transformer en T2 avant de passer au T3+.

