# Système Usines T1-T10 — Spécification Complète

## Vue d'ensemble

Les usines joueur vont de T1 à T10. Les recettes vont de T1 à T5.

- **T1 → T5** : Chaque tier débloque de nouvelles recettes + augmente capacité
- **T6 → T10** : Pas de nouvelles recettes, mais capacité massive → production industrielle

**Analogie** : T1-T5 = déverrouiller du contenu. T6-T10 = scaler la production.

---

## Tableau des tiers

| Tier | Slots ingr. | Workers max | Engineers max | Food cap. | Recettes accessibles |
|------|-------------|-------------|---------------|-----------|---------------------|
| T1 | 2 | 10 | 0 | 200 | T1 uniquement |
| T2 | 2 | 20 | 1 | 500 | T1, T2 |
| T3 | 3 | 30 | 1 | 1,000 | T1 à T3 |
| T4 | 3 | 40 | 2 | 2,000 | T1 à T4 |
| T5 | 4 | 50 | 2 | 3,000 | T1 à T5 (toutes) |
| T6 | 4 | 60 | 3 | 4,000 | T1 à T5 (toutes) |
| T7 | 5 | 70 | 3 | 5,000 | T1 à T5 (toutes) |
| T8 | 5 | 80 | 4 | 7,000 | T1 à T5 (toutes) |
| T9 | 5 | 90 | 4 | 9,000 | T1 à T5 (toutes) |
| T10 | 5 | 100 | 5 | 12,000 | T1 à T5 (toutes) |

### Ce que chaque palier apporte

| Passage | Nouveau |
|---------|---------|
| T1→T2 | +1 engineer, recettes T2, +10 workers |
| T2→T3 | +1 slot (→3), recettes T3 |
| T3→T4 | +1 engineer, recettes T4 |
| T4→T5 | +1 slot (→4), recettes T5 (toutes) |
| T5→T6 | +1 engineer, +10 workers |
| T6→T7 | +1 slot (→5), +10 workers |
| T7→T8 | +1 engineer, +10 workers |
| T8→T9 | +10 workers |
| T9→T10 | +1 engineer (→5 max), +10 workers (→100 max) |

---

## Construction d'une usine T1

### Conditions

- Le joueur possède une **company**
- L'aéroport a des **slots disponibles** (large=12, medium=6, small=3)
- Le joueur est à l'aéroport (ou son avion y est)
- Le joueur a les **fonds** suffisants

### Coût de construction T1

| Ressource | Quantité |
|-----------|----------|
| Crédits (CR) | 25,000 CR |

Construction instantanée en T1 — le joueur paie et l'usine est créée en `idle`.

### Ce qui est créé

```typescript
{
  id: generateUUID(),
  company_id: player.company_id,
  airport_ident: "LFRK",
  name: "Usine T1",          // Renommable
  tier: 1,
  status: "idle",
  is_active: 1,
  max_workers: 10,
  max_engineers: 0,
  food_stock: 0,
  food_capacity: 200,
  current_recipe_id: null,
  last_recipe_id: null,
  last_result_item_id: null,
}
```

---

## Upgrade d'usine (T1 → T10)

### Principe

L'upgrade se fait sur place, même aéroport, même slot. Pendant l'upgrade l'usine est en status `upgrading` et ne peut pas produire. Les workers et engineers restent assignés mais ne travaillent pas (pas de salaire pendant l'upgrade).

### Coûts d'upgrade

| Upgrade | Coût CR | Items requis | Temps |
|---------|---------|-------------|-------|
| T1 → T2 | 5000 | 10× Steel Ingot + 5× Bricks | 2h |
| T2 → T3 | 10 000 | 15× Reinforced Steel + 10× Cement + 5× Glass | 4h |
| T3 → T4 | 20 000 | 20× Reinforced Steel + 10× Window Panes + 5× Wire Cable | 6h |
| T4 → T5 | 40 000 | 15× Steel Beam + 10× Insulation + 5× Circuit Board | 10h |
| T5 → T6 | 60 000 | 20× Steel Beam + 10× Structural Panel + 5× Electric Motor | 14h |
| T6 → T7 | 90 000 | 15× Structural Panel + 10× Armored Plate + 5× Sensor Module | 18h |
| T7 → T8 | 130 000 | 20× Armored Plate + 10× Power Supply + 5× Advanced Battery | 24h |
| T8 → T9 | 180 000 | 10× Avionics Unit + 10× Generator + 5× Industrial Robot Arm | 36h |
| T9 → T10 | 250 000 | 5× Satellite Component + 5× Flight Computer + 3× Surgical Robot | 48h |

### Logique d'upgrade

Les items requis sont consommés depuis `company_inventory` au même aéroport.

```typescript
async upgradeFactory(factoryId: string): Promise<void> {
  const factory = await this.getFactory(factoryId);
  
  // Validations
  if (factory.tier >= 10) throw new Error("Déjà tier max");
  if (factory.status !== "idle") throw new Error("L'usine doit être idle");
  
  const nextTier = factory.tier + 1;
  const upgradeCost = UPGRADE_COSTS[nextTier];
  
  // Vérifier les CR
  const company = await CompanyService.getCompany(factory.company_id);
  if (company.money < upgradeCost.credits) {
    throw new Error("Fonds insuffisants");
  }
  
  // Vérifier les items requis
  for (const item of upgradeCost.items) {
    const stock = await InventoryService.getStock(
      factory.company_id, factory.airport_ident, item.item_id
    );
    if (stock < item.quantity) {
      throw new Error(`${item.name}: ${stock}/${item.quantity} requis`);
    }
  }
  
  // Consommer CR
  await CompanyService.deductMoney(factory.company_id, upgradeCost.credits);
  
  // Consommer items
  for (const item of upgradeCost.items) {
    await InventoryService.removeStock(
      factory.company_id, factory.airport_ident, 
      item.item_id, item.quantity
    );
  }
  
  // Lancer l'upgrade
  factory.status = "upgrading";
  factory.upgrade_started_at = new Date().toISOString();
  factory.upgrade_completion = addHours(new Date(), upgradeCost.time_hours).toISOString();
  factory.upgrade_target_tier = nextTier;
  await this.saveFactory(factory);
}
```

### Completion de l'upgrade

Le scheduler vérifie toutes les minutes :

```typescript
// Dans le scheduler
async checkUpgrades(): Promise<void> {
  const upgradingFactories = await DatabaseManager.query(
    `SELECT * FROM factories WHERE status = 'upgrading' 
     AND upgrade_completion <= ?`,
    [new Date().toISOString()]
  );
  
  for (const factory of upgradingFactories) {
    const newTier = factory.upgrade_target_tier;
    const tierConfig = FACTORY_TIERS[newTier];
    
    factory.tier = newTier;
    factory.status = "idle";
    factory.max_workers = tierConfig.max_workers;
    factory.max_engineers = tierConfig.max_engineers;
    factory.food_capacity = tierConfig.food_capacity;
    factory.upgrade_started_at = null;
    factory.upgrade_completion = null;
    factory.upgrade_target_tier = null;
    factory.name = factory.name.replace(/T\d+/, `T${newTier}`);
    // Seulement si le nom est encore le nom par défaut
    
    await this.saveFactory(factory);
  }
}
```

---

## Configuration des tiers (constante)

```typescript
const FACTORY_TIERS: Record<number, FactoryTierConfig> = {
  1:  { max_ingredients: 2, max_workers: 10,  max_engineers: 0, food_capacity: 200,   max_recipe_tier: 1 },
  2:  { max_ingredients: 2, max_workers: 20,  max_engineers: 1, food_capacity: 500,   max_recipe_tier: 2 },
  3:  { max_ingredients: 3, max_workers: 30,  max_engineers: 1, food_capacity: 1000,  max_recipe_tier: 3 },
  4:  { max_ingredients: 3, max_workers: 40,  max_engineers: 2, food_capacity: 2000,  max_recipe_tier: 4 },
  5:  { max_ingredients: 4, max_workers: 50,  max_engineers: 2, food_capacity: 3000,  max_recipe_tier: 5 },
  6:  { max_ingredients: 4, max_workers: 60,  max_engineers: 3, food_capacity: 4000,  max_recipe_tier: 5 },
  7:  { max_ingredients: 5, max_workers: 70,  max_engineers: 3, food_capacity: 5000,  max_recipe_tier: 5 },
  8:  { max_ingredients: 5, max_workers: 80,  max_engineers: 4, food_capacity: 7000,  max_recipe_tier: 5 },
  9:  { max_ingredients: 5, max_workers: 90,  max_engineers: 4, food_capacity: 9000,  max_recipe_tier: 5 },
  10: { max_ingredients: 5, max_workers: 100, max_engineers: 5, food_capacity: 12000, max_recipe_tier: 5 },
};

interface FactoryTierConfig {
  max_ingredients: number;
  max_workers: number;
  max_engineers: number;
  food_capacity: number;
  max_recipe_tier: number; // La recette max que cette usine peut produire
}
```

---

## Coûts d'upgrade (constante)

```typescript
interface UpgradeCost {
  credits: number;
  items: { item_id: string; name: string; quantity: number }[];
  time_hours: number;
}

const UPGRADE_COSTS: Record<number, UpgradeCost> = {
  // targetTier → coût
  2: {
    credits: 50_000,
    items: [
      { item_id: "steel_ingot",    name: "Steel Ingot",       quantity: 10 },
      { item_id: "bricks",         name: "Bricks",            quantity: 5 },
    ],
    time_hours: 2,
  },
  3: {
    credits: 100_000,
    items: [
      { item_id: "reinforced_steel", name: "Reinforced Steel", quantity: 15 },
      { item_id: "cement",           name: "Cement",           quantity: 10 },
      { item_id: "glass",            name: "Glass",            quantity: 5 },
    ],
    time_hours: 4,
  },
  4: {
    credits: 200_000,
    items: [
      { item_id: "reinforced_steel", name: "Reinforced Steel", quantity: 20 },
      { item_id: "window_panes",     name: "Window Panes",     quantity: 10 },
      { item_id: "wire_cable",       name: "Wire Cable",       quantity: 5 },
    ],
    time_hours: 6,
  },
  5: {
    credits: 400_000,
    items: [
      { item_id: "steel_beam",    name: "Steel Beam",     quantity: 15 },
      { item_id: "insulation",    name: "Insulation",     quantity: 10 },
      { item_id: "circuit_board", name: "Circuit Board",  quantity: 5 },
    ],
    time_hours: 10,
  },
  6: {
    credits: 600_000,
    items: [
      { item_id: "steel_beam",        name: "Steel Beam",        quantity: 20 },
      { item_id: "structural_panel",  name: "Structural Panel",  quantity: 10 },
      { item_id: "electric_motor",    name: "Electric Motor",    quantity: 5 },
    ],
    time_hours: 14,
  },
  7: {
    credits: 900_000,
    items: [
      { item_id: "structural_panel",  name: "Structural Panel",  quantity: 15 },
      { item_id: "armored_plate",     name: "Armored Plate",     quantity: 10 },
      { item_id: "sensor_module",     name: "Sensor Module",     quantity: 5 },
    ],
    time_hours: 18,
  },
  8: {
    credits: 1_300_000,
    items: [
      { item_id: "armored_plate",     name: "Armored Plate",     quantity: 20 },
      { item_id: "power_supply",      name: "Power Supply",      quantity: 10 },
      { item_id: "advanced_battery",  name: "Advanced Battery",  quantity: 5 },
    ],
    time_hours: 24,
  },
  9: {
    credits: 1_800_000,
    items: [
      { item_id: "avionics_unit",       name: "Avionics Unit",        quantity: 10 },
      { item_id: "generator",           name: "Generator",            quantity: 10 },
      { item_id: "industrial_robot_arm", name: "Industrial Robot Arm", quantity: 5 },
    ],
    time_hours: 36,
  },
  10: {
    credits: 2_500_000,
    items: [
      { item_id: "satellite_component", name: "Satellite Component",  quantity: 5 },
      { item_id: "flight_computer",     name: "Flight Computer",      quantity: 5 },
      { item_id: "surgical_robot",      name: "Surgical Robot",       quantity: 3 },
    ],
    time_hours: 48,
  },
};
```

---

## Validation de production

La logique complète pour savoir si une recette peut tourner dans une usine :

```typescript
function canProduceRecipe(factory: Factory, recipe: Recipe): { ok: boolean; error?: string } {
  // 1. Tier de la recette ≤ max_recipe_tier de l'usine
  const tierConfig = FACTORY_TIERS[factory.tier];
  if (recipe.tier > tierConfig.max_recipe_tier) {
    return { ok: false, error: `Recette T${recipe.tier} — usine T${factory.tier} ne peut faire que T1-T${tierConfig.max_recipe_tier}` };
  }
  
  // 2. Nombre d'ingrédients uniques ≤ slots disponibles
  if (recipe.unique_ingredient_count > tierConfig.max_ingredients) {
    return { ok: false, error: `${recipe.unique_ingredient_count} ingrédients — usine T${factory.tier} n'a que ${tierConfig.max_ingredients} slots` };
  }
  
  // Les deux conditions doivent être remplies
  return { ok: true };
}
```

### Exemples concrets

| Usine | Recette | Ingrédients uniques | Tier recette | Résultat |
|-------|---------|--------------------:|:------------:|----------|
| T1 | Bread (T1) | 2 | 1 | ✅ OK |
| T1 | Circuit Board (T2) | 2 | 2 | ❌ Tier trop haut |
| T2 | Circuit Board (T2) | 2 | 2 | ✅ OK |
| T2 | Premium Chocolate (T3) | 3 | 3 | ❌ Tier trop haut + 3 slots > 2 max |
| T3 | Premium Chocolate (T3) | 3 | 3 | ✅ OK |
| T3 | Avionics Unit (T4) | 3 | 4 | ❌ Tier trop haut |
| T4 | Avionics Unit (T4) | 3 | 4 | ✅ OK |
| T4 | Bread (T1) | 2 | 1 | ✅ OK (downgrade autorisé) |
| T5 | Flight Computer (T5) | 4 | 5 | ✅ OK |
| T6 | Flight Computer (T5) | 4 | 5 | ✅ OK (T6 accède à T5) |
| T10 | Bread (T1) | 2 | 1 | ✅ OK (une T10 fait tout) |

---

## Intérêt gameplay des tiers 6-10

Pourquoi upgrade au-delà de T5 si les recettes sont déjà toutes débloquées ?

### 1. Volume de production

Plus de workers = production plus rapide grâce aux bonus.

| Tier | Workers | Efficacité base (avec workers) | Temps réel pour Flight Computer (24h base) |
|------|---------|-------------------------------|-------------------------------------------|
| T5 | 50 | 100% | 24h |
| T7 | 70 | 100% + meilleurs bonus | ~18h |
| T10 | 100 | 100% + bonus max | ~12h |

### 2. Plus d'engineers = meilleur bonus vitesse

| Tier | Engineers max | Bonus cumulé |
|------|:------------:|:------------:|
| T5 | 2 | +18% (10+8) |
| T6 | 3 | +24% (10+8+6) |
| T7 | 3 | +24% |
| T8 | 4 | +29% (10+8+6+5) |
| T9 | 4 | +29% |
| T10 | 5 | +33% (10+8+6+5+4) |

### 3. Autonomie food

| Tier | Food cap. | Avec 50 workers (50 food/h) | Avec 100 workers (100 food/h) |
|------|-----------|:---------------------------:|:-----------------------------:|
| T5 | 3,000 | 60h d'autonomie | 30h |
| T7 | 5,000 | 100h | 50h |
| T10 | 12,000 | 240h (10 jours) | 120h (5 jours) |

### 4. Le 5ème slot (T7+)

Les usines T7+ ont 5 slots d'ingrédients. Même si aucune recette actuelle n'utilise 5 ingrédients, c'est prévu pour de futures recettes T5+ ultra-complexes (ex: Station Spatiale, Avion Complet, etc.).

---

## Coût total T1 → T10

| De T1 à... | CR cumulés | Temps cumulé |
|------------|-----------|:------------:|
| T2 | 75,000 | 2h |
| T3 | 175,000 | 6h |
| T4 | 375,000 | 12h |
| T5 | 775,000 | 22h |
| T6 | 1,375,000 | 36h |
| T7 | 2,275,000 | 54h |
| T8 | 3,575,000 | 78h |
| T9 | 5,375,000 | 114h |
| T10 | 7,875,000 | 162h |

**T10 = investissement massif endgame** : ~8M CR + items T5 rares + presque 7 jours d'upgrade total.

---

## Modifications base de données

### Colonnes à ajouter à `factories`

```sql
ALTER TABLE factories ADD COLUMN upgrade_started_at TEXT DEFAULT NULL;
ALTER TABLE factories ADD COLUMN upgrade_completion TEXT DEFAULT NULL;
ALTER TABLE factories ADD COLUMN upgrade_target_tier INTEGER DEFAULT NULL;
```

### Valeurs de la colonne tier

Changer le type de `INTEGER (0-5)` à `INTEGER (0-10)` dans la doc. SQLite n'a pas de contrainte de range, donc pas besoin de modifier le schéma réel — juste la validation côté code.

---

## UI — Bouton Upgrade dans la vue usine

### Condition d'affichage

```typescript
const canUpgrade = factory.tier < 10 && factory.status === 'idle';
```

### Affichage dans le header de la vue Factory

```
┌─── Mon Usine T3 [✏] ──────────────────────────┐
│                                                 │
│  Tier 3/10           [Améliorer → T4]           │
│  ████████░░░░░░░░░░░░  (30%)                    │
│                                                 │
```

### Popup de confirmation upgrade

```
┌─── Améliorer vers T4 ──────────────────────┐
│                                             │
│  Coût : 200,000 CR                          │
│                                             │
│  Items requis :                             │
│  [✅] 20× Reinforced Steel  (stock: 25)    │
│  [✅] 10× Window Panes      (stock: 12)    │
│  [❌] 5× Wire Cable         (stock: 3)     │
│                                             │
│  Durée : 6 heures                           │
│                                             │
│  Nouveautés T4 :                            │
│  • Recettes T4 débloquées                   │
│  • +1 engineer (→ 2 max)                    │
│  • +10 workers (→ 40 max)                   │
│  • Food +1,000 (→ 2,000 max)               │
│                                             │
│  [Annuler]        [Améliorer] (grisé si ❌) │
└─────────────────────────────────────────────┘
```

### Pendant l'upgrade

L'usine affiche un état spécial :

```
┌─── Mon Usine T3 → T4 ─────────────────────────┐
│                                                 │
│  AMÉLIORATION EN COURS                          │
│  ██████████████░░░░░░  67% — ~2h restantes      │
│                                                 │
│  Production bloquée pendant l'upgrade           │
│  Workers en pause (pas de salaire)              │
│                                                 │
│  [Annuler l'upgrade] (perd les items, rend CR)  │
│                                                 │
```

### Annulation d'upgrade

- **CR** : Remboursés à 80% (pénalité 20%)
- **Items** : Perdus (pas de remboursement)
- **L'usine revient** au tier précédent en status `idle`

---

## Résumé pour Claude Code

### Fichiers à modifier/créer

| Fichier | Action |
|---------|--------|
| `constants/factoryTiers.ts` | Créer avec `FACTORY_TIERS` et `UPGRADE_COSTS` |
| `services/FactoryService.ts` | Ajouter `upgradeFactory()`, `cancelUpgrade()`, `checkUpgrades()` |
| `services/FactoryService.ts` | Modifier `startProduction()` → ajouter validation `canProduceRecipe()` |
| `managers/LocalScheduler.ts` | Ajouter job `check_upgrades` (1 min) |
| Table `factories` | Ajouter colonnes `upgrade_started_at`, `upgrade_completion`, `upgrade_target_tier` |
| EFB Factory View | Ajouter bouton Upgrade + popup confirmation + état "upgrading" |

### Règles critiques

1. **tier < 10 && status === "idle"** pour upgrade
2. **recipe.tier ≤ FACTORY_TIERS[factory.tier].max_recipe_tier** pour produire
3. **recipe.unique_ingredients ≤ FACTORY_TIERS[factory.tier].max_ingredients** pour produire
4. **Les deux conditions ci-dessus doivent être vraies** (ET logique, pas OU)
5. **Pendant upgrade** : status = "upgrading", pas de production, pas de salaire workers
6. **Annulation** : 80% CR rendus, items perdus
