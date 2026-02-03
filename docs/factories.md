# Factory System - Documentation Technique

> **Version**: V0.9 (Architecture P2P)

## Vue d'ensemble

Le système de factories permet aux joueurs de transformer des matières premières (T0) en produits finis (T1-T5) via des usines industrielles.

**Architecture P2P**: Les données sont stockées localement en SQLite et synchronisées avec les autres joueurs via le NetworkManager.

---

## Tables SQLite

### `factories`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `company_id` | TEXT | FK → companies |
| `airport_ident` | TEXT | Code ICAO aéroport |
| `name` | TEXT | Nom de l'usine |
| `tier` | INTEGER (0-5) | Niveau usine (T0=NPC, T1-T5=joueurs) |
| `factory_type` | TEXT | Auto-détecté (food_processing, metal_smelting...) |
| `status` | TEXT | idle, producing, maintenance, offline |
| `current_recipe_id` | TEXT | Recette en cours |
| `is_active` | INTEGER | Usine active (0/1) |
| `max_workers` | INTEGER | Capacité workers (T1=10, T5=50) |
| `max_engineers` | INTEGER | Capacité engineers (T1=2, T5=10) |
| `food_stock` | INTEGER | Stock nourriture actuel |
| `food_capacity` | INTEGER | Capacité max nourriture |
| `food_consumption_per_hour` | REAL | Consommation horaire |

### `production_batches`

Lots de production en cours/terminés.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `factory_id` | TEXT | FK → factories |
| `recipe_id` | TEXT | FK → recipes |
| `status` | TEXT | pending, in_progress, completed, failed, cancelled |
| `started_at` | TEXT | Début production (ISO8601) |
| `estimated_completion` | TEXT | Fin estimée |
| `completed_at` | TEXT | Fin réelle |
| `result_quantity` | INTEGER | Quantité produite |
| `workers_assigned` | INTEGER | Nombre de workers |

---

## Types d'usines

### T0 - Usines NPC (Matières Premières)

Les usines T0 sont gérées automatiquement par `AIEconomyService` et produisent des matières premières:

| Keyword dans nom | Item produit |
|------------------|--------------|
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

**Paramètres T0:**
- Stock max: 1000 items
- Production: 50 items / 5 minutes
- Items mis en vente automatiquement au marché IA

### T1-T5 - Usines Joueurs

| Tier | Workers Max | Engineers Max | Recettes Disponibles |
|------|-------------|---------------|---------------------|
| T1 | 10 | 2 | T1 uniquement |
| T2 | 15 | 3 | T1, T2 |
| T3 | 25 | 5 | T1, T2, T3 |
| T4 | 35 | 7 | T1-T4 |
| T5 | 50 | 10 | Toutes |

---

## Mécanique de Production

### 1. Démarrage d'un batch

Via `FactoryService.startProduction()`:

```typescript
await FactoryService.startProduction(factoryId, {
  recipe_id: "uuid",
  quantity: 10
});
```

**Validations:**
1. L'usine appartient à la company du joueur
2. L'usine est en status "idle"
3. Au moins 1 worker assigné (status="working")
4. Ingrédients disponibles dans `company_inventory` @ même aéroport
5. Tier recette <= Tier usine

> **Note**: Food = 0 ne bloque PAS la production, seulement réduit l'efficacité (30%)

### 2. Calcul temps de production

```
temps_total = temps_par_batch × nombre_de_batches
```

**Exemple:**
- Recette Salted Meat: 3h par batch
- Quantity: 10 batches
- Temps total = 3 × 10 = 30 heures

**Modificateurs:**
- Bonus tier workers: +5% par tier au-dessus de T1 (max +25%)

### 3. Consommation des ingrédients

Les ingrédients sont déduits directement de `company_inventory` au même aéroport:

```
quantité_consommée = ingrédient.quantity × nombre_batches
```

### 4. Completion automatique

Le scheduler local vérifie toutes les minutes:
- Si `NOW() >= estimated_completion`
- Si oui: status → completed

**Destination des items produits:**
- Items ajoutés directement à `company_inventory` @ `factory.airport_ident`
- Quantité = `recipe.result_quantity × nombre_batches`

### 5. Bonus Tier Workers

```
tier_bonus = 1.0 + ((avg_tier - 1) × 0.05)
result_qty = base_qty × min(tier_bonus, 1.25)
```

**Exemple:**
- 4 workers tier 3 → avg = 3
- Bonus = 1.0 + (2 × 0.05) = 1.10 (+10%)
- Max bonus: +25%

### 6. Gain XP Workers

À chaque batch complété:
```
xp_gain = recipe.tier × 10
```

Tous les workers assignés à la factory gagnent cet XP.

---

## Système Food

### Consommation

- 1 unité de food / worker / heure
- Calculé et déduit localement par le scheduler EFB

### Effets sans nourriture

> **Important**: Food = 0 ne bloque PAS la production !

1. **Efficacité réduite à 30%**: Production plus lente
2. **Risque blessure x2**: Chance de blessure doublée
3. **Salaire toujours payé**: Les workers sont quand même payés
4. **Production possible**: Le bouton START reste actif

---

## Slots Aéroport

Chaque aéroport a un nombre limité de slots pour les usines:

| Type Aéroport | Max Slots |
|---------------|-----------|
| large_airport | 10 |
| medium_airport | 5 |
| small_airport | 2 |
| seaplane_base | 1 |
| heliport | 1 |
| closed | 0 |

---

## Services TypeScript

### FactoryService

```typescript
// services/FactoryService.ts

class FactoryServiceClass {
  // Créer une factory
  async createFactory(airportIdent: string, name: string): Promise<Factory>;

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

  // Déposer food
  async depositFood(factoryId: string, quantity: number): Promise<void>;

  // Status food
  async getFoodStatus(factoryId: string): Promise<FoodStatus>;
}
```

### DataLayer (Abstraction)

Le `DataLayer` choisit automatiquement entre SQLite local et sync réseau:

```typescript
// En mode solo → SQLite local
DataLayer.setLocalMode();

// En mode multi → Via peer
DataLayer.setNetworkMode({ host: '192.168.1.10', port: 7777 });

// Les services utilisent DataLayer
const factories = await DataLayer.getFactories(companyId);
```

---

## Scheduler Jobs (Local)

| Job | Intervalle | Description |
|-----|------------|-------------|
| `batch_completion` | 1 min | Complète les batches terminés |
| `t0_auto_production` | 5 min | Production NPC T0 (AIEconomyService) |
| `food_and_injuries` | 1 heure | Consommation food + blessures |

Ces jobs s'exécutent localement dans l'EFB via des timers JavaScript.

---

## Sync P2P

### Données synchronisées

| Donnée | Direction | Fréquence |
|--------|-----------|-----------|
| Liste factories | Bidirectionnel | 5 sec |
| Production status | Bidirectionnel | 5 sec |
| Slots occupés | Bidirectionnel | 5 sec |

### Données locales uniquement

- Configuration UI
- Préférences utilisateur

---

## Flux Production

```
[Ingrédients]                         [Produits]
company_inventory  ───────►  Factory  ───────►  company_inventory
     @ LFPG           │        T1+          │       @ LFPG
                      │                     │
              startProduction()      completeBatch()
              (consume × qty)        (output × qty)
```

**Points clés:**
- Ingrédients consommés depuis `company_inventory`
- Multi-batch: `quantity` × ingrédients consommés
- Produits arrivent dans `company_inventory` après completion
- Food = 0 réduit efficacité mais ne bloque pas
