# Items & Recipes System - Documentation Technique

## Vue d'ensemble

Le mod MFS24 Carrier Plus utilise un système d'items avec:
- **94 items** au total répartis sur 3 tiers (T0, T1, T2)
- **60 recettes** de production (30 T1, 30 T2)
- Système de transformation des matières premières vers des produits finis

---

## Tables SQL

### `game.items`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `name` | VARCHAR(100) | Nom unique de l'item |
| `tier` | INT | 0=raw, 1-5=processed |
| `tags` | TEXT[] | Tags de catégorie |
| `icon` | VARCHAR(10) | Emoji/icône |
| `base_value` | DECIMAL(10,2) | Valeur de base en crédits |
| `weight_kg` | DECIMAL(8,3) | Poids en kg |
| `is_raw` | BOOLEAN | Matière première (T0) |
| `stack_size` | INT | Taille de stack (défaut: 100) |
| `description` | VARCHAR(500) | Description |
| `created_at` | TIMESTAMPTZ | Date de création |

### `game.recipes`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `name` | VARCHAR(100) | Nom unique de la recette |
| `tier` | INT | 1-5 (tier de la recette) |
| `result_item_id` | UUID | FK → items (produit final) |
| `result_quantity` | INT | Quantité produite par batch |
| `production_time_hours` | DECIMAL(5,2) | Temps de production de base |
| `base_workers_required` | INT | Workers minimum (défaut: 10) |
| `description` | VARCHAR(500) | Description |
| `unlock_requirements` | JSONB | Conditions de déblocage |
| `created_at` | TIMESTAMPTZ | Date de création |

### `game.recipe_ingredients`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `recipe_id` | UUID | FK → recipes |
| `item_id` | UUID | FK → items (ingrédient) |
| `quantity` | INT | Quantité requise par batch |
| `position` | INT | Ordre d'affichage (0-3) |

---

## Items T0 - Matières Premières (34 items)

Les items T0 sont produits automatiquement par les usines NPC.

### Ressources Minérales

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Aluminum Ore | 18€ | 4.5kg | construction, mineral, raw |
| Clay | 4€ | 2.5kg | construction, mineral, raw |
| Coal | 10€ | 3.0kg | fuel, raw, mineral |
| Copper Ore | 12€ | 4.0kg | construction, mineral, raw, electronics |
| Granite | 10€ | 12.0kg | construction, mineral, raw |
| Graphite | 20€ | 2.0kg | construction, mineral, raw |
| Iron Ore | 15€ | 5.0kg | construction, mineral, raw |
| Limestone | 6€ | 8.0kg | construction, mineral, raw |
| Phosphate | 10€ | 3.0kg | chemical, mineral, raw |
| Rare Earth Metals | 80€ | 3.0kg | electronics, mineral, raw, advanced |
| Raw Salt | 5€ | 1.0kg | food, mineral, raw |
| Raw Silicon | 30€ | 2.0kg | electronics, mineral, raw |
| Raw Stone | 5€ | 10.0kg | construction, mineral, raw |
| Sand | 3€ | 2.0kg | construction, mineral, raw |
| Sulfur | 15€ | 2.5kg | chemical, mineral, raw |
| Titanium Ore | 45€ | 3.5kg | construction, mineral, raw |
| Uranium Ore | 100€ | 8.0kg | fuel, raw, mineral, advanced |

### Ressources Alimentaires

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Raw Cocoa | 15€ | 1.0kg | food, raw, plant |
| Raw Fish | 10€ | 2.0kg | food, raw, animal |
| Raw Fruits | 6€ | 1.2kg | food, raw, plant |
| Raw Meat | 12€ | 2.5kg | food, raw, animal |
| Raw Milk | 4€ | 2.0kg | food, raw, animal |
| Raw Sugar | 7€ | 1.0kg | food, raw, plant |
| Raw Vanilla | 50€ | 0.5kg | food, raw, plant |
| Raw Vegetables | 5€ | 1.0kg | food, raw, plant |
| Raw Wheat | 8€ | 1.5kg | food, raw, plant, grain |
| Water | 1€ | 1.0kg | food, raw |

### Ressources Énergétiques

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Biomass | 5€ | 2.0kg | fuel, raw, organic |
| Crude Oil | 25€ | 5.0kg | fuel, raw |
| Natural Gas | 20€ | 1.0kg | fuel, raw |

### Ressources Organiques

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Cotton | 8€ | 1.0kg | raw, organic |
| Raw Rubber | 12€ | 1.5kg | construction, raw, organic |
| Raw Wood | 8€ | 3.0kg | construction, raw, organic |
| Raw Water | 0.50€ | 1.0kg | raw, liquid, water |

---

## Items T1 - Produits Transformés (30 items)

Produits de première transformation nécessitant des matières premières T0.

### Métaux & Construction

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Aluminum Ingot | 55€ | 4.0kg | construction, metal, light |
| Bricks | 15€ | 6.0kg | construction, masonry |
| Cement | 20€ | 10.0kg | construction, binding |
| Copper Ingot | 38€ | 6.0kg | construction, metal, electronics |
| Glass | 25€ | 4.0kg | construction, transparent |
| Marble Slabs | 65€ | 10.0kg | construction, masonry, luxury |
| Planks | 22€ | 2.0kg | construction, wood |
| Rubber Sheets | 32€ | 2.0kg | construction, industrial |
| Silicon Wafers | 90€ | 1.5kg | electronics, advanced |
| Steel Ingot | 45€ | 8.0kg | construction, metal |
| Stone Bricks | 18€ | 8.0kg | construction, masonry |
| Titanium Ingot | 150€ | 3.0kg | construction, metal, advanced |

### Alimentaire

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Bread | 15€ | 0.5kg | food, baked |
| Butter | 28€ | 0.5kg | food, dairy |
| Cocoa Powder | 35€ | 0.6kg | food, ingredient |
| Dried Fish | 25€ | 1.5kg | food, preserved |
| Flour | 12€ | 1.0kg | food, ingredient |
| Fruit Jam | 22€ | 0.8kg | food, preserved, sweet |
| Salted Meat | 30€ | 2.0kg | food, preserved, animal |
| Sugar Syrup | 18€ | 0.8kg | food, ingredient |
| Vanilla Extract | 120€ | 0.3kg | food, ingredient, rare |
| Vegetable Stew | 20€ | 1.0kg | food, cooked |

### Carburants & Chimie

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Biofuel | 48€ | 3.5kg | fuel, renewable |
| Charcoal | 28€ | 2.5kg | fuel, solid |
| Compressed Gas | 55€ | 2.0kg | fuel, gas |
| Diesel | 60€ | 4.0kg | fuel, liquid |
| Fabric | 24€ | 1.5kg | construction, textile |
| Fertilizer | 28€ | 5.0kg | chemical, agriculture |
| Sulfuric Acid | 40€ | 4.0kg | chemical, industrial |
| Uranium Pellets | 300€ | 5.0kg | fuel, nuclear, advanced |

---

## Items T2 - Produits Avancés (30 items)

Produits nécessitant des items T1 ou combinaison T0+T1.

### Métaux & Construction

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Aluminum Frame | 88€ | 5.0kg | construction, metal, light |
| Concrete Blocks | 45€ | 15.0kg | construction, masonry |
| Reinforced Steel | 95€ | 10.0kg | construction, metal, quality |
| Steel Pipes | 82€ | 9.0kg | construction, metal, plumbing |
| Titanium Plates | 320€ | 4.0kg | construction, metal, advanced, armor |
| Window Panes | 72€ | 6.0kg | construction, transparent |
| Wire Cable | 68€ | 3.0kg | construction, metal, electronics |
| Wooden Beams | 55€ | 8.0kg | construction, wood |

### Alimentaire

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Cheese | 65€ | 1.0kg | food, dairy, quality |
| Chocolate Bar | 85€ | 0.4kg | food, sweet, luxury |
| Dried Fruit | 45€ | 0.8kg | food, preserved, sweet |
| Fruit Cake | 75€ | 1.2kg | food, baked, sweet |
| Honey Bread | 58€ | 0.7kg | food, baked, sweet, quality |
| Pastry | 38€ | 0.5kg | food, baked, sweet |
| Quality Bread | 35€ | 0.6kg | food, baked, quality |
| Sausage | 48€ | 1.5kg | food, meat, preserved |
| Smoked Fish | 55€ | 1.8kg | food, preserved, quality |
| Vegetable Soup | 42€ | 1.2kg | food, cooked, quality |

### Carburants & Chimie

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Adhesive | 68€ | 2.0kg | chemical, industrial |
| Cleaning Solution | 35€ | 3.0kg | chemical, industrial |
| Heating Oil | 88€ | 4.5kg | fuel, liquid |
| Insulation | 58€ | 3.0kg | construction, industrial |
| Jet Fuel | 135€ | 5.0kg | fuel, liquid, aviation |
| Nuclear Fuel Rod | 850€ | 8.0kg | fuel, nuclear, advanced |
| Paint | 52€ | 3.5kg | chemical, construction |
| Plastic Sheets | 62€ | 2.5kg | construction, chemical |
| Premium Biofuel | 115€ | 4.0kg | fuel, renewable, quality |
| Rocket Propellant | 285€ | 6.0kg | fuel, liquid, advanced |

### Électronique & Médical

| Nom | Valeur | Poids | Tags |
|-----|--------|-------|------|
| Circuit Board | 185€ | 2.0kg | electronics, advanced |
| Medical Bandages | 48€ | 0.5kg | medical, consumable |

---

## Recettes T1 (30 recettes)

Toutes les recettes T1 nécessitent 10 workers minimum.

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

## Système de Tags

Les items sont catégorisés par tags pour faciliter la recherche et le filtrage.

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

## Calcul de Rentabilité

### Formule de base

```
Profit = (Valeur Produit × Quantité) - Somme(Valeur Ingrédient × Quantité)
Profit/h = Profit / Temps de Production
```

### Exemples de rentabilité T1

| Recette | Coût Inputs | Valeur Output | Profit | Temps | Profit/h |
|---------|-------------|---------------|--------|-------|----------|
| Flour | 3×8€ + 1€ = 25€ | 25×12€ = 300€ | 275€ | 1h | 275€/h |
| Bread | 2×8€ + 1€ = 17€ | 20×15€ = 300€ | 283€ | 1.5h | 189€/h |
| Steel Ingot | 2×15€ + 10€ = 40€ | 5×45€ = 225€ | 185€ | 4h | 46€/h |
| Uranium Pellets | 2×100€ + 1€ = 201€ | 1×300€ = 300€ | 99€ | 12h | 8€/h |

### Exemples de rentabilité T2

| Recette | Coût Inputs | Valeur Output | Profit | Temps | Profit/h |
|---------|-------------|---------------|--------|-------|----------|
| Quality Bread | 3×12€ + 28€ + 1€ = 65€ | 15×35€ = 525€ | 460€ | 2.5h | 184€/h |
| Chocolate Bar | 2×35€ + 18€ + 28€ = 116€ | 6×85€ = 510€ | 394€ | 3h | 131€/h |
| Circuit Board | 2×90€ + 38€ = 218€ | 3×185€ = 555€ | 337€ | 8h | 42€/h |
| Nuclear Fuel Rod | 3×300€ + 2×45€ = 990€ | 1×850€ = 850€ | -140€ | 24h | -6€/h |

**Note:** Ces calculs ne prennent pas en compte les salaires des workers ni les bonus engineers.

---

## API Endpoints

### Items

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/world/items` | Liste tous les items |
| GET | `/api/world/items/{id}` | Détails d'un item |
| GET | `/api/world/items/search/{name}` | Recherche par nom |
| GET | `/api/world/stats/items` | Statistiques items |

### Recipes

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/world/recipes` | Liste toutes les recettes |
| GET | `/api/world/recipes/{id}` | Détails d'une recette |
| GET | `/api/world/recipes/{id}/ingredients` | Ingrédients d'une recette |

---

## Prochaines évolutions (T3-T5)

Les tiers 3 à 5 sont prévus pour les futures versions:

- **T3**: Produits industriels complexes (véhicules, machines)
- **T4**: Haute technologie (composants avion, électronique avancée)
- **T5**: Produits de luxe et spatiaux

Les recettes T3+ nécessiteront des factories de tier correspondant et des workers plus expérimentés.
