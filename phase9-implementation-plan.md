# Phase 9 — Usines, Workers & Économie

## Plan d'implémentation complet

> **Date** : 13 février 2026
> **Prérequis** : Phase 8 (Debug Online) terminée
> **Estimation totale** : 20-25h découpées en 9 sous-phases
> **Principe** : Prix et équilibrage économique = PLACEHOLDERS. Passe dédiée plus tard.
> **UI** : Sous-onglet dans Company

---

## Vue d'ensemble des sous-phases

```
Phase 9.0  — Refactoring pré-usines (si nécessaire)     ~3h
Phase 9.1  — Seed Data : 93 items + 60 recettes          ~2h
Phase 9.2  — Types TypeScript + Services statiques        ~2h
Phase 9.3  — Workers : modèle + génération + 42 pays     ~3h
Phase 9.4  — Factories : modèle + création + slots       ~3h
Phase 9.5  — Production : batches + scheduler local      ~4h
Phase 9.6  — Workers avancé : XP, blessures, salaires    ~3h
Phase 9.7  — UI Company > Usines                         ~4h
Phase 9.8  — Intégration Market + tests complets         ~2h
```

**Règle** : Tester en jeu entre CHAQUE sous-phase. Ne pas enchaîner sans valider.

---

## Phase 9.0 — Refactoring pré-usines (~3h)

### Objectif
Vérifier l'état du refactoring et extraire les controllers nécessaires AVANT d'ajouter du code.

### Prompt Claude Code

```
Avant de commencer, vérifie l'état actuel du fichier WorldOfAircraft.tsx :
1. Combien de lignes fait-il ?
2. Existe-t-il déjà un dossier controllers/ ? Si oui, quels fichiers ?
3. Liste-moi les méthodes principales (nom + ligne) du fichier principal.

Si WorldOfAircraft.tsx fait plus de 5000 lignes ET qu'il n'y a pas encore de
MarketController.ts, HangarController.ts, MissionController.ts :

Extraire dans l'ordre :
1. src/controllers/MarketController.ts
   - Toute la logique market (fetch, buy, sell, orders, catalog avions)
   - Toute la logique inventaire (fetch, render grouped)
2. src/controllers/HangarController.ts
   - fetchHangarAircraftList, fetchAircraftDetails
   - fetchAircraftSystems, fetchHangarCargo
   - refuelHangarAircraft, repair logic
3. src/controllers/MissionController.ts
   - createMission, completeMission
   - fetchActiveMission, cancelMission
   - loadCargoItem, flight tracking

Règles :
- Les controllers reçoivent les refs DOM et les states en constructeur
- Les Views existantes appellent les controllers au lieu du fichier principal
- Les States et Services ne changent PAS
- Build clean (0 errors, 0 warnings) après CHAQUE extraction
- Tester que le jeu fonctionne normalement après

Si WorldOfAircraft.tsx fait déjà < 3000 lignes ou si les controllers existent,
SKIP cette phase et dis-moi l'état actuel.
```

### Validation
- [ ] Build clean
- [ ] Jeu fonctionnel (missions, market, hangar OK)
- [ ] WorldOfAircraft.tsx < 3000 lignes (idéalement ~1500)

---

## Phase 9.1 — Seed Data : 93 items + 60 recettes (~2h)

### Objectif
Créer le fichier `data/seed.json` avec toutes les données statiques du jeu.
Remplacer les items de test actuels par les vrais items T0-T2.

### Prompt Claude Code

```
Avant de commencer, lis les fichiers suivants dans docs/ :
- docs/items-recipes.md
- docs/workers.md

TÂCHE : Créer/mettre à jour data/seed.json avec les données complètes.

CONTRAINTE : Ne pas modifier les fichiers/fonctions hors scope.
Vérifier que le build passe (0 errors, 0 warnings).

=== 1. Structure seed.json ===

{
  "version": "9.1",
  "items": [ ... ],         // 93 items (33 T0 + 30 T1 + 30 T2)
  "recipes": [ ... ],       // 60 recettes (30 T1 + 30 T2)
  "country_worker_stats": [ ... ]  // 42 pays
}

=== 2. Items ===

Générer les 93 items depuis docs/items-recipes.md.
Chaque item :
{
  "id": "item_[nom_snake_case]",   // Ex: "item_iron_ore"
  "name": "Iron Ore",
  "tier": 0,
  "tags": ["construction", "mineral", "raw"],
  "icon": "Fe",                     // 2-3 lettres, PAS d'emoji
  "base_value": 15,                 // PLACEHOLDER — sera rééquilibré plus tard
  "weight_kg": 5.0,
  "is_raw": true,
  "stack_size": 100,
  "description": "Iron ore for steel production"
}

IMPORTANT sur les icônes :
- PAS d'emoji (Coherent GT affiche des carrés)
- Utiliser 1 à 3 lettres représentatives : Fe, Al, Cu, Wh, Mt, Mk, etc.
- Pour les foods : Bd (Bread), Ch (Cheese), Fl (Flour), etc.
- Pour les fuels : Di (Diesel), JF (Jet Fuel), etc.

=== 3. Recettes ===

Générer les 60 recettes depuis docs/items-recipes.md.
Chaque recette :
{
  "id": "recipe_[nom_snake_case]",  // Ex: "recipe_steel_ingot"
  "name": "Steel Ingot",
  "tier": 1,
  "result_item_id": "item_steel_ingot",
  "result_quantity": 5,
  "production_time_hours": 4,
  "base_workers_required": 10,
  "ingredients": [
    { "item_id": "item_iron_ore", "quantity": 2, "position": 0 },
    { "item_id": "item_coal", "quantity": 1, "position": 1 }
  ],
  "description": "Smelt iron ore into steel ingots"
}

=== 4. Country Worker Stats ===

42 pays avec stats de base. Format :
{
  "country_code": "FR",
  "country_name": "France",
  "region": "europe",
  "base_speed": 55,
  "base_resistance": 50,
  "base_hourly_salary": 15,
  "worker_buy_price": 500
}

Voici les 42 pays (PLACEHOLDER prix — équilibrage IRL plus tard) :

Europe (20) :
FR(55/50/15) DE(60/50/16) GB(55/48/17) ES(50/52/12) IT(52/50/13)
PL(48/55/8) NL(58/48/18) BE(55/49/16) SE(58/46/20) NO(56/47/22)
FI(57/48/19) DK(56/47/19) AT(55/50/17) CH(60/48/25) PT(50/52/11)
IE(54/49/17) GR(48/53/10) CZ(50/54/9) HU(49/55/8) RO(47/56/7)

Americas (7) :
US(55/52/18) CA(56/50/17) MX(48/54/6) BR(50/55/7) AR(49/53/7)
CO(47/54/5) CL(50/52/8)

Asie (10) :
CN(52/55/6) JP(65/45/22) KR(62/47/18) IN(50/48/4) ID(48/52/4)
TH(50/53/5) VN(49/54/4) PH(48/50/4) MY(52/51/6) SG(60/46/20)

Moyen-Orient (3) :
AE(52/48/15) SA(50/50/12) TR(50/55/8)

Afrique (2) :
ZA(48/54/6) EG(47/53/5)

Océanie (2) :
AU(55/50/18) NZ(54/51/17)

=== 5. Migration items existants ===

Les items de test actuels dans le code doivent être remplacés :
- Chercher tous les items "de test" dans seed.json ou items.json existant
- Les remplacer par les 93 items ci-dessus
- S'assurer que l'inventaire du joueur actuel ne crash pas
  (si des items de test sont dans l'inventaire, les ignorer silencieusement)

=== 6. Supprimer "Raw Water" ===

Si un item "Raw Water" existe, le supprimer. Seul "Water" (1 CR, 1kg) reste.

Build clean + pas de régression sur les features existantes.
```

### Validation
- [ ] `data/seed.json` contient 93 items, 60 recettes, 42 pays
- [ ] Build clean
- [ ] Market affiche les nouveaux items (via AIEconomyService en Solo)
- [ ] Aucun crash si l'inventaire avait des anciens items

---

## Phase 9.2 — Types TypeScript + Services statiques (~2h)

### Objectif
Ajouter les types et services pour les items, recettes, factories et workers.

### Prompt Claude Code

```
Avant de commencer, lis :
- docs/items-recipes.md
- docs/factories.md
- docs/workers.md
- data/seed.json (créé en 9.1)

TÂCHE : Ajouter les types et services statiques.

CONTRAINTE : Ne pas modifier les fichiers/fonctions hors scope.

=== 1. Types (dans types/index.ts) ===

Ajouter ces interfaces (NE PAS supprimer les types existants) :

// --- Items & Recipes ---
interface Item {
  id: string;
  name: string;
  tier: number;
  tags: string[];
  icon: string;
  base_value: number;
  weight_kg: number;
  is_raw: boolean;
  stack_size: number;
  description: string;
}

interface RecipeIngredient {
  item_id: string;
  quantity: number;
  position: number;
}

interface Recipe {
  id: string;
  name: string;
  tier: number;
  result_item_id: string;
  result_quantity: number;
  production_time_hours: number;
  base_workers_required: number;
  ingredients: RecipeIngredient[];
  description: string;
}

// --- Factories ---
type FactoryStatus = "idle" | "producing" | "maintenance" | "offline";

interface Factory {
  id: string;
  company_id: string;
  airport_ident: string;
  name: string;
  tier: number;              // 0=NPC, 1-10=joueurs
  factory_type: string;
  status: FactoryStatus;
  current_recipe_id: string | null;
  is_active: boolean;
  max_workers: number;
  max_engineers: number;
  max_ingredients: number;
  food_stock: number;
  food_capacity: number;
  food_consumption_per_hour: number;
  created_at: string;
}

interface ProductionBatch {
  id: string;
  factory_id: string;
  recipe_id: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  quantity: number;
  started_at: string;
  estimated_completion: string;
  completed_at: string | null;
  result_quantity: number;
  workers_assigned: number;
}

// --- Workers ---
type WorkerStatus = "available" | "working" | "injured" | "dead";

interface WorkerInstance {
  id: string;
  owner_company_id: string | null;
  owner_player_id: string | null;
  owner_type: "company" | "personal";
  item_id: string;
  airport_ident: string;
  country_code: string;
  speed: number;
  resistance: number;
  xp: number;
  tier: number;
  hourly_salary: number;
  status: WorkerStatus;
  factory_id: string | null;
  for_sale: boolean;
  sale_price: number | null;
  injured_at: string | null;
  injury_duration_days: number;
  created_at: string;
}

interface CountryWorkerStats {
  country_code: string;
  country_name: string;
  region: string;
  base_speed: number;
  base_resistance: number;
  base_hourly_salary: number;
  worker_buy_price: number;
}

// --- Factory Tier Config ---
interface FactoryTierConfig {
  tier: number;
  max_ingredients: number;
  max_workers: number;
  max_engineers: number;
  upgrade_cost: number;
}

=== 2. Constantes (dans constants/index.ts ou nouveau constants/factory.ts) ===

export const FACTORY_TIER_CONFIG: FactoryTierConfig[] = [
  { tier: 1,  max_ingredients: 2, max_workers: 10,  max_engineers: 0, upgrade_cost: 0 },
  { tier: 2,  max_ingredients: 2, max_workers: 20,  max_engineers: 1, upgrade_cost: 5000 },
  { tier: 3,  max_ingredients: 3, max_workers: 30,  max_engineers: 1, upgrade_cost: 15000 },
  { tier: 4,  max_ingredients: 3, max_workers: 40,  max_engineers: 2, upgrade_cost: 35000 },
  { tier: 5,  max_ingredients: 4, max_workers: 50,  max_engineers: 2, upgrade_cost: 75000 },
  { tier: 6,  max_ingredients: 4, max_workers: 60,  max_engineers: 3, upgrade_cost: 150000 },
  { tier: 7,  max_ingredients: 5, max_workers: 70,  max_engineers: 3, upgrade_cost: 300000 },
  { tier: 8,  max_ingredients: 5, max_workers: 80,  max_engineers: 4, upgrade_cost: 500000 },
  { tier: 9,  max_ingredients: 5, max_workers: 90,  max_engineers: 4, upgrade_cost: 800000 },
  { tier: 10, max_ingredients: 5, max_workers: 100, max_engineers: 5, upgrade_cost: 1500000 },
];

export const FACTORY_CREATION_COST = 10000; // PLACEHOLDER

export const AIRPORT_FACTORY_SLOTS: Record<string, number> = {
  large_airport: 10,
  medium_airport: 5,
  small_airport: 2,
  seaplane_base: 1,
  heliport: 1,
  closed: 0,
};

export const WORKER_XP_TIERS = [
  { tier: 1, name: "Novice",    xp_required: 0 },
  { tier: 2, name: "Apprenti",  xp_required: 1000 },
  { tier: 3, name: "Compagnon", xp_required: 5000 },
  { tier: 4, name: "Expert",    xp_required: 15000 },
  { tier: 5, name: "Maître",    xp_required: 50000 },
];

=== 3. Services statiques ===

Créer services/ItemService.ts :
- Charge les items depuis seed.json au init()
- getAllItems(), getItemById(id), getItemsByTier(tier), getItemsByTag(tag)
- searchItems(query) — recherche par nom ou tag

Créer services/RecipeService.ts :
- Charge les recettes depuis seed.json au init()
- getAllRecipes(), getRecipeById(id), getRecipesByTier(tier)
- getRecipesForFactory(factoryTier, maxIngredients) — filtre par nb ingrédients
- calculateProfit(recipeId) — retourne {cost, revenue, profit, profitPerHour}

=== 4. Init ===

Dans InitService.ts, ajouter l'appel à ItemService.init() et RecipeService.init()
au démarrage, AVANT le reste.

Build clean + test.
```

### Validation
- [ ] Build clean
- [ ] `ItemService.getAllItems()` retourne 93 items
- [ ] `RecipeService.getAllRecipes()` retourne 60 recettes
- [ ] `RecipeService.getRecipesForFactory(2, 2)` retourne les recettes à ≤2 ingrédients
- [ ] Jeu fonctionnel, pas de régression

---

## Phase 9.3 — Workers : modèle + génération + 42 pays (~3h)

### Objectif
Système de workers complet : création, génération stats, achat.
Remplace les items "personnel" simplifiés de Phase 1.

### Prompt Claude Code

```
Avant de commencer, lis docs/workers.md

TÂCHE : Implémenter le système workers complet.

CONTRAINTE : Ne pas modifier les fichiers/fonctions hors scope.
Les items "personnel" simplifiés de Phase 1 (worker, engineer, pilot, copilot)
sont REMPLACÉS par le nouveau système. Les anciens items restent dans seed.json
mais ne sont plus spawnés par l'IA.

=== 1. WorkerService (services/WorkerService.ts) ===

class WorkerServiceClass {
  private countryStats: CountryWorkerStats[] = [];

  init(): void {
    // Charger country_worker_stats depuis seed.json
  }

  // Générer un worker avec stats aléatoires (±20%)
  generateWorker(countryCode: string, airportIdent: string, ownerType: "company" | "personal", ownerId: string): WorkerInstance {
    const stats = this.getCountryStats(countryCode);
    // Variation ±20% speed, resistance
    // Variation ±10% salary
    // tier = 1, xp = 0, status = "available"
    // Retourner l'instance
  }

  // Stats d'un pays
  getCountryStats(code: string): CountryWorkerStats

  // Tous les pays disponibles
  getAllCountries(): CountryWorkerStats[]

  // Pays par région
  getCountriesByRegion(region: string): CountryWorkerStats[]

  // Calculer le tier d'un worker à partir de son XP
  calculateTier(xp: number): number {
    if (xp >= 50000) return 5;
    if (xp >= 15000) return 4;
    if (xp >= 5000) return 3;
    if (xp >= 1000) return 2;
    return 1;
  }

  // Ajouter de l'XP à un worker
  addXP(worker: WorkerInstance, amount: number): WorkerInstance {
    worker.xp += amount;
    worker.tier = this.calculateTier(worker.xp);
    return worker;
  }
}

=== 2. State (state/FactoryState.ts — NOUVEAU) ===

Créer un nouveau state pour les factories et workers :

export const factoryState = {
  factories: Subject.create<Factory[]>([]),
  workers: Subject.create<WorkerInstance[]>([]),
  productionBatches: Subject.create<ProductionBatch[]>([]),
  isLoading: Subject.create<boolean>(false),
};

=== 3. SoloSaveService — Extension ===

Ajouter workers et factories à SoloSaveData :

interface SoloSaveData {
  // ... champs existants (NE PAS toucher) ...
  factories: Factory[];
  workers: WorkerInstance[];
  production_batches: ProductionBatch[];
}

Dans save() : sauvegarder factoryState.factories, .workers, .productionBatches
Dans load() : restaurer dans factoryState
Dans createNewGame() : factories=[], workers=[], production_batches=[]

=== 4. Achat de workers sur le marché ===

Modifier LocalMarketService / AIEconomyService pour proposer des workers à l'achat :
- Workers disponibles UNIQUEMENT aux large_airport
- L'IA propose 3-5 workers de nationalités variées par aéroport
- Le pays est choisi selon la région géographique de l'aéroport :
  - Aéroports européens → workers européens principalement
  - Aéroports asiatiques → workers asiatiques principalement
  - Mélange possible (20% de workers d'autres régions)
- Prix d'achat = country_worker_stats.worker_buy_price

Quand le joueur achète un worker :
1. Déduire le prix du wallet (perso ou company)
2. Appeler WorkerService.generateWorker() pour créer l'instance
3. Ajouter à factoryState.workers
4. Sauvegarder via ServiceAdapter.save()

Build clean + test : aller dans un large_airport, vérifier que des workers
sont proposés à l'achat dans le Market, acheter un worker, vérifier qu'il
apparaît dans l'inventaire avec ses stats.
```

### Validation
- [ ] Build clean
- [ ] Workers proposés à l'achat en large_airport
- [ ] Achat fonctionne (déduction argent, worker dans inventaire)
- [ ] Stats aléatoires (vitesse/résistance varient entre workers du même pays)
- [ ] Sauvegarde/chargement fonctionne (quitter → revenir → workers toujours là)

---

## Phase 9.4 — Factories : modèle + création + slots (~3h)

### Objectif
Créer des usines, les attacher aux aéroports, gérer les slots.

### Prompt Claude Code

```
Avant de commencer, lis docs/factories.md

TÂCHE : Implémenter la création et gestion des factories.

CONTRAINTE : Ne pas modifier les fichiers/fonctions hors scope.

=== 1. LocalFactoryService (services/LocalFactoryService.ts) ===

class LocalFactoryServiceClass {
  // Créer une factory T1
  async createFactory(airportIdent: string, name: string): Promise<Factory> {
    // Vérifier : joueur a une company
    // Vérifier : company.balance >= FACTORY_CREATION_COST
    // Vérifier : slots disponibles à l'aéroport
    // Déduire le coût
    // Créer la factory T1 avec les valeurs de FACTORY_TIER_CONFIG[0]
    // Ajouter à factoryState.factories
    // Sauvegarder
  }

  // Lister mes factories
  async getMyFactories(): Promise<Factory[]> {
    return factoryState.factories.get().filter(f => f.company_id === myCompanyId);
  }

  // Factories à un aéroport
  async getFactoriesAtAirport(airportIdent: string): Promise<Factory[]>

  // Slots restants à un aéroport
  async getRemainingSlots(airportIdent: string, airportType: string): Promise<number> {
    const maxSlots = AIRPORT_FACTORY_SLOTS[airportType] || 0;
    const usedSlots = factoryState.factories.get()
      .filter(f => f.airport_ident === airportIdent).length;
    return maxSlots - usedSlots;
  }

  // Upgrade factory
  async upgradeFactory(factoryId: string): Promise<Factory> {
    // Vérifier : factory existe et appartient à ma company
    // Vérifier : factory.status === "idle"
    // Vérifier : tier < 10
    // Vérifier : company.balance >= upgrade_cost
    // Déduire le coût
    // Appliquer le nouveau tier (FACTORY_TIER_CONFIG)
    // Sauvegarder
  }

  // Supprimer une factory
  async deleteFactory(factoryId: string): Promise<void> {
    // Vérifier : factory.status === "idle"
    // Vérifier : aucun worker assigné
    // Supprimer de factoryState
    // Sauvegarder
  }
}

=== 2. Assignation workers → factory ===

Dans WorkerService ou LocalFactoryService :

async assignWorkerToFactory(workerId: string, factoryId: string): Promise<void> {
  // Vérifier : worker.owner_company_id === factory.company_id
  // Vérifier : worker.status === "available"
  // Vérifier : worker.airport_ident === factory.airport_ident
  // Vérifier : factory workers count < factory.max_workers
  // Mettre à jour worker : status="working", factory_id=factoryId
  // Sauvegarder
}

async unassignWorkerFromFactory(workerId: string): Promise<void> {
  // Mettre à jour worker : status="available", factory_id=null
  // Sauvegarder
}

=== 3. ServiceAdapter — extension ===

Ajouter dans ServiceAdapter.ts les méthodes factory :
- createFactory, getMyFactories, upgradeFactory, deleteFactory
- assignWorkerToFactory, unassignWorkerFromFactory
Chaque méthode route vers LocalFactoryService (Solo) ou SyncService (Online).

Pour l'instant, le mode Online peut retourner une erreur "Factories not yet
available in Online mode" — on implémentera les endpoints SEED plus tard.

Build clean + test.
```

### Validation
- [ ] Build clean
- [ ] Créer une factory coûte des CR
- [ ] Slots limités par type d'aéroport
- [ ] Upgrade fonctionne (T1→T2→T3...)
- [ ] Assignation worker ↔ factory fonctionne
- [ ] Sauvegarde/chargement OK

---

## Phase 9.5 — Production : batches + scheduler local (~4h)

### Objectif
Lancer des productions, consommer ingrédients, compléter les batches.

### Prompt Claude Code

```
Avant de commencer, lis docs/factories.md et docs/items-recipes.md

TÂCHE : Implémenter le système de production.

=== 1. startProduction ===

async startProduction(factoryId: string, recipeId: string, quantity: number): Promise<ProductionBatch> {
  const factory = getFactory(factoryId);
  const recipe = RecipeService.getRecipeById(recipeId);

  // VALIDATIONS :
  // 1. Factory appartient à ma company
  // 2. Factory status === "idle"
  // 3. Au moins 1 worker assigné (status="working")
  // 4. Recette compatible avec factory :
  //    - Si factory.tier >= 9 → toutes recettes OK
  //    - Sinon : recipe.ingredients.length <= factory.max_ingredients
  // 5. Ingrédients disponibles dans company_inventory @ factory.airport_ident
  //    Pour chaque ingrédient : qty_in_inventory >= ingredient.quantity × quantity

  // CONSOMMATION :
  // Déduire les ingrédients de company_inventory
  // ingredient.quantity × quantity pour chaque ingrédient

  // CRÉATION BATCH :
  const timeHours = recipe.production_time_hours * quantity;
  const batch: ProductionBatch = {
    id: generateUUID(),
    factory_id: factoryId,
    recipe_id: recipeId,
    status: "in_progress",
    quantity: quantity,
    started_at: new Date().toISOString(),
    estimated_completion: new Date(Date.now() + timeHours * 3600000).toISOString(),
    completed_at: null,
    result_quantity: recipe.result_quantity * quantity,
    workers_assigned: getWorkerCountForFactory(factoryId),
  };

  // Mettre à jour factory : status="producing", current_recipe_id=recipeId
  // Ajouter batch à factoryState.productionBatches
  // Sauvegarder

  return batch;
}

=== 2. Scheduler local (Solo) ===

Créer managers/FactoryScheduler.ts :

class FactorySchedulerClass {
  private batchInterval: number | null = null;
  private hourlyInterval: number | null = null;

  start(): void {
    // Vérification batches toutes les 60 secondes
    this.batchInterval = setInterval(() => this.checkBatches(), 60000);

    // Jobs horaires toutes les 60 minutes (simulées)
    this.hourlyInterval = setInterval(() => this.hourlyTick(), 3600000);
  }

  stop(): void {
    if (this.batchInterval) clearInterval(this.batchInterval);
    if (this.hourlyInterval) clearInterval(this.hourlyInterval);
  }

  // === Vérification batches (toutes les minutes) ===
  private checkBatches(): void {
    const now = new Date().toISOString();
    const batches = factoryState.productionBatches.get();

    for (const batch of batches) {
      if (batch.status === "in_progress" && batch.estimated_completion <= now) {
        this.completeBatch(batch);
      }
    }
  }

  // === Complétion d'un batch ===
  private completeBatch(batch: ProductionBatch): void {
    const recipe = RecipeService.getRecipeById(batch.recipe_id);
    const factory = getFactory(batch.factory_id);

    // 1. Calculer bonus tier workers
    const workers = getWorkersForFactory(factory.id);
    const avgTier = workers.reduce((sum, w) => sum + w.tier, 0) / workers.length;
    const tierBonus = Math.min(1.25, 1.0 + (avgTier - 1) * 0.05);
    const finalQty = Math.floor(batch.result_quantity * tierBonus);

    // 2. Ajouter produits à company_inventory @ factory.airport_ident
    addToInventory(factory.company_id, recipe.result_item_id, finalQty, factory.airport_ident);

    // 3. XP workers : recipe.tier × 10 pour chaque worker assigné
    for (const worker of workers) {
      WorkerService.addXP(worker, recipe.tier * 10);
    }

    // 4. Mettre à jour batch : status="completed", completed_at=now
    // 5. Mettre à jour factory : status="idle", current_recipe_id=null
    // 6. Sauvegarder
  }

  // === Tick horaire ===
  private hourlyTick(): void {
    // Sera implémenté en Phase 9.6
    // (food, salaires, blessures)
  }
}

Démarrer le scheduler dans InitService quand mode Solo :
if (GameModeState.isSolo()) {
  FactoryScheduler.start();
}

=== 3. T0 Auto-Production (AIEconomyService) ===

Modifier AIEconomyService pour générer les 33 items T0 sur le marché :
- Toutes les 5 minutes (sim), chaque T0 est restocké
- Stock illimité (qty=999) au prix base_value
- Disponible à tous les aéroports (simplifié pour V1)

Build clean + test complet :
1. Créer une factory
2. Assigner un worker
3. Acheter des ingrédients sur le marché
4. Lancer une production simple (ex: Flour = 3x Raw Wheat + 1x Water)
5. Attendre la complétion (ou modifier le timer pour tester rapidement)
6. Vérifier que le produit apparaît dans l'inventaire
```

### Validation
- [ ] Build clean
- [ ] Production démarre (ingrédients consommés)
- [ ] Batch se complète après le temps prévu
- [ ] Produits ajoutés à l'inventaire avec bonus tier
- [ ] Workers gagnent de l'XP
- [ ] Items T0 disponibles sur le marché IA
- [ ] Sauvegarde/chargement préserve les batches en cours

---

## Phase 9.6 — Workers avancé : XP, blessures, salaires (~3h)

### Objectif
Compléter le hourlyTick() du scheduler avec food, blessures, salaires.

### Prompt Claude Code

```
Avant de commencer, lis docs/workers.md

TÂCHE : Implémenter le tick horaire complet du scheduler.

=== 1. Consommation food ===

Dans FactoryScheduler.hourlyTick() :

Pour chaque factory active (status="producing" ou ayant des workers "working") :
  - workersCount = nombre de workers avec status="working" dans cette factory
  - foodNeeded = workersCount × 1
  - Si factory.food_stock >= foodNeeded :
      factory.food_stock -= foodNeeded
  - Sinon :
      factory.food_stock = 0
      // Marquer la factory comme "no_food" pour les calculs suivants

=== 2. Paiement salaires ===

Pour chaque worker avec status="working" :
  - Déduire worker.hourly_salary de company.balance
  - Si company.balance < 0 :
      // Notification (couleur orange #f59e0b) : "Fonds insuffisants pour les salaires"
      // Le salaire est quand même "dû" mais la company est en négatif

=== 3. Blessures ===

Pour chaque worker avec status="working" :
  - baseRisk = 0.005 (0.5% par heure)
  - Si factory sans food : baseRisk = 0.01 (1% — doublé)
  - resistanceModifier = 1 - (worker.resistance / 200)
  - finalRisk = baseRisk × resistanceModifier
  - Si Math.random() < finalRisk :
      worker.status = "injured"
      worker.injured_at = new Date().toISOString()
      worker.injury_duration_days = 1 + Math.floor(Math.random() * 10) // 1-10 jours
      worker.factory_id = null // Retiré automatiquement de la factory

=== 4. Guérison / Mort ===

Pour chaque worker avec status="injured" :
  - daysSinceInjury = (now - injured_at) en jours
  - Si daysSinceInjury >= worker.injury_duration_days :
      worker.status = "available"
      worker.injured_at = null
  - Si daysSinceInjury > 10 ET pas soigné :
      worker.status = "dead"
      // Déduire 10000 CR de company.balance
      // Notification rouge (#ef4444) : "Un worker est décédé ! -10,000 CR"

=== 5. Efficacité food sur la production ===

Modifier completeBatch() : si la factory n'avait pas de food pendant la production,
le temps effectif est multiplié par 3.33 (efficacité 30%).

Approche simplifiée pour V1 : vérifier food_stock au moment de completeBatch().
Si food_stock === 0, retarder estimated_completion de +2h (approximation).

=== 6. Dépôt de food dans une factory ===

Ajouter LocalFactoryService.depositFood(factoryId, itemId, quantity) :
  - Vérifier : item est tagué "food" (T0 ou T1/T2, tout ce qui a le tag "food")
  - Les items T0 food (Raw Meat, Raw Fish, Raw Fruits, etc.) sont la source
    principale de nourriture — le joueur les achète sur le marché IA
  - Vérifier : item est dans company_inventory au même aéroport
  - Déduire de l'inventaire
  - Ajouter à factory.food_stock (1 unité de food = 1 item food)
  - factory.food_capacity = max(food_capacity, food_stock) -- ou fixe par tier

Build clean + test complet du cycle workers.
```

### Validation
- [ ] Build clean
- [ ] Salaires déduits chaque heure
- [ ] Food consommée
- [ ] Blessures surviennent (tester avec food=0 pour risque plus élevé)
- [ ] Workers guérissent après la durée prévue
- [ ] Mort possible si > 10 jours blessé
- [ ] Dépôt de food fonctionne

---

## Phase 9.7 — UI Company > Usines (~4h)

### Objectif
Créer l'interface utilisateur pour gérer les usines dans Company.

### Prompt Claude Code

```
Avant de commencer, lis docs/efb-tablet.md pour les contraintes UI Coherent GT.

RAPPELS UI :
- PAS d'emojis (affiche des carrés dans Coherent GT)
- Utiliser des couleurs : orange=#f59e0b, rouge=#ef4444, vert=#22c55e
- Inline styles uniquement
- Button + callback (pas de formulaires)
- Refs + innerHTML (pas .map JSX)

TÂCHE : Créer l'UI des usines comme sous-onglet de Company.

=== 1. Nouveau controller : src/controllers/FactoryController.ts ===

Centralise toute la logique UI des usines :
- fetchFactories() → met à jour les refs
- fetchWorkers() → workers de la company
- handleCreateFactory(airportIdent, name)
- handleUpgradeFactory(factoryId)
- handleDeleteFactory(factoryId)
- handleAssignWorker(workerId, factoryId)
- handleUnassignWorker(workerId)
- handleStartProduction(factoryId, recipeId, quantity)
- handleCancelProduction(factoryId)
- handleDepositFood(factoryId, itemId, quantity)
- renderFactoryList() → HTML string
- renderFactoryDetail(factoryId) → HTML string
- renderWorkerList(factoryId?) → HTML string
- renderRecipeSelector(factoryId) → HTML string

=== 2. Company > sous-onglet "Usines" ===

Ajouter un sous-onglet dans la vue Company existante.
Les sous-onglets Company deviennent : [Overview | Membres | Historique | Messagerie | Usines]

=== 3. Vue liste des usines ===

Afficher pour chaque factory :
- Nom + Tier (ex: "Steel Mill T3")
- Aéroport (ICAO)
- Status avec couleur :
  - idle → fond vert clair, texte "En attente"
  - producing → fond orange clair, texte "Production..." + temps restant
  - offline → fond gris
- Workers : "4/30 workers"
- Food : barre de progression (vert>50%, orange 10-50%, rouge<10%)
- Bouton [Détails]

Bouton [+ Nouvelle Usine] en haut (ouvre un modal/popup pour choisir nom + aéroport)

=== 4. Vue détail d'une factory ===

Quand on clique [Détails] :

Section INFOS :
- Nom, Tier, Aéroport
- Bouton [Upgrade T3→T4] avec coût affiché (si idle)
- Bouton [Supprimer] (rouge, si idle et vide)

Section WORKERS :
- Liste des workers assignés : [Pays] SPD:55 RES:48 T2 — [Retirer]
- Bouton [+ Assigner Worker] → popup avec workers "available" au même aéroport

Section PRODUCTION :
- Si idle :
  - Sélecteur de recette (filtrées par tier/ingrédients de la factory)
  - Pour chaque recette : nom, temps, ingrédients requis, quantité dispo
  - Input quantité (nombre de batches)
  - Bouton [Lancer Production] (vert)
- Si producing :
  - Recette en cours
  - Barre de progression (temps écoulé / temps total)
  - Temps restant estimé
  - Bouton [Annuler] (rouge)

Section FOOD :
- Stock actuel / capacité
- Bouton [Déposer Food] → popup avec items "food" dans l'inventaire

=== 5. Notifications ===

Utiliser le système de notification existant (s'il y en a un) ou ajouter
des messages temporaires en haut de la vue :
- Vert : "Production de Flour terminée ! +25 Flour"
- Orange : "Fonds insuffisants pour les salaires"
- Rouge : "Worker décédé — pénalité 10,000 CR"

Build clean + test complet de l'UI.
```

### Validation
- [ ] Build clean
- [ ] Sous-onglet "Usines" visible dans Company
- [ ] Liste des usines affichée
- [ ] Création d'usine fonctionne
- [ ] Détail d'usine : workers, production, food
- [ ] Lancer une production depuis l'UI
- [ ] Voir la progression en temps réel
- [ ] Notifications fonctionnelles

---

## Phase 9.8 — Intégration Market + tests complets (~2h)

### Objectif
S'assurer que tout s'intègre : market affiche les vrais items, on peut acheter
des ingrédients, produire, et vendre les produits finis.

### Prompt Claude Code

```
TÂCHE : Intégration finale et tests.

=== 1. Market — Afficher les 93 items ===

Vérifier que AIEconomyService / LocalMarketService génère des ordres pour :
- Tous les 33 items T0 (matières premières)
- Workers par région géographique (large_airport uniquement)
- Les items T1/T2 ne sont PAS vendus par l'IA — ils sont craftés par les joueurs

=== 2. Inventaire — Afficher les nouveaux items ===

Vérifier que les items produits apparaissent correctement dans :
- Market > Inventaire (avec icône 2-3 lettres, pas emoji)
- Le poids total est calculé correctement
- Les tags permettent de filtrer

=== 3. Vente de produits finis ===

Les items craftés (T1/T2) doivent pouvoir être :
- Vendus sur le marché via sell order (système existant Phase 3)
- Chargés comme cargo dans les avions (système existant)
- Utilisés comme ingrédients dans d'autres recettes

=== 4. Flow complet de test ===

Tester le cycle complet en jeu :
1. Aller sur un large_airport
2. Acheter des workers (market)
3. Acheter des matières premières T0 (market)
4. Créer une usine T1 (Company > Usines)
5. Assigner les workers
6. Acheter de la nourriture T0 (Raw Meat, Raw Fruits, etc.) sur le market
7. Déposer la food dans l'usine
8. Lancer une production de Flour (3x Raw Wheat + 1x Water)
9. Attendre la complétion
10. Le Flour apparaît dans l'inventaire
11. Utiliser le Flour comme ingrédient pour du Bread (si on a aussi du Water)
12. Vendre le Bread sur le market

=== 5. Food pour les usines ===

La nourriture pour les workers vient des items T0 tagués "food" :
Raw Meat, Raw Fish, Raw Fruits, Raw Vegetables, Raw Milk, Raw Wheat, etc.
Ces items sont vendus par l'IA sur le marché — le joueur les achète et
les dépose dans l'usine. Pas besoin de vendre du T1.

IMPORTANT : tout item avec le tag "food" peut nourrir les workers,
y compris les T0. Le système depositFood() doit accepter n'importe
quel item tagué "food", pas seulement les T1.

L'IA ne vend JAMAIS de T1 ou T2. Seuls les 33 items T0 sont sur le marché IA.

=== 6. Fix bugs éventuels ===

Corriger tout bug trouvé pendant le test.
Vérifier la sauvegarde/chargement complet.

Build clean final.
```

### Validation
- [ ] Build clean
- [ ] Flow complet fonctionnel (achat → production → vente)
- [ ] Sauvegarde/chargement préserve TOUT (factories, workers, batches, inventaire)
- [ ] Pas de régression sur les features existantes (missions, hangar, profil, contrats)

---

## Résumé des fichiers créés/modifiés

### Fichiers CRÉÉS

| Fichier | Phase | Description |
|---------|-------|-------------|
| `data/seed.json` (mis à jour) | 9.1 | 93 items + 60 recettes + 42 pays |
| `services/ItemService.ts` | 9.2 | Service items statique |
| `services/RecipeService.ts` | 9.2 | Service recettes statique |
| `services/WorkerService.ts` | 9.3 | Génération et gestion workers |
| `state/FactoryState.ts` | 9.3 | State réactif factories/workers |
| `services/LocalFactoryService.ts` | 9.4 | CRUD factories (mode Solo) |
| `managers/FactoryScheduler.ts` | 9.5 | Scheduler local (batches, food, salaires) |
| `controllers/FactoryController.ts` | 9.7 | Controller UI usines |
| `constants/factory.ts` | 9.2 | Config tiers, slots, XP |

### Fichiers MODIFIÉS

| Fichier | Phase | Changement |
|---------|-------|------------|
| `types/index.ts` | 9.2 | + interfaces Factory, Worker, Recipe, etc. |
| `services/SoloSaveService.ts` | 9.3 | + factories, workers, batches dans save/load |
| `services/ServiceAdapter.ts` | 9.4 | + méthodes factory/worker |
| `services/InitService.ts` | 9.2, 9.5 | + init ItemService, RecipeService, scheduler |
| `services/AIEconomyService.ts` | 9.5, 9.8 | + items T0 + food T1 sur le marché |
| `services/LocalMarketService.ts` | 9.3 | + achat workers |
| Vue Company | 9.7 | + sous-onglet "Usines" |

---

## Économie — À faire APRÈS (phase dédiée)

Ce qui est PLACEHOLDER et sera rééquilibré plus tard :
- base_value de chaque item (→ prix proches IRL par pays)
- hourly_salary des workers (→ salaires proches IRL par pays)
- worker_buy_price (→ coût embauche réaliste)
- FACTORY_CREATION_COST et upgrade costs
- Marge bénéficiaire des recettes
- Prix de vente IA des items food
- Production rate des T0 NPC
- Quantités produites par batch

L'objectif de la passe économie sera :
- Cohérence avec les prix réels (1 CR ≈ X €/$)
- Les pays low-cost = workers moins chers mais stats moyennes
- Les pays riches = workers chers mais performants
- Rentabilité progressive : T0→T1 facile, T2 demande de l'optimisation
- Le transport par avion a un vrai coût qui impacte les marges
