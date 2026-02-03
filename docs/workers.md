# Workers System - Documentation Technique

> **Version**: V0.9 (Architecture P2P)

## Vue d'ensemble

Le système Workers gère les travailleurs comme des **items individuels** avec stats uniques:
- Chaque worker est une instance unique avec ses propres stats
- Workers sont des items achetables (Worker-FR, Worker-CN, etc.)
- Stats générées aléatoirement selon la nationalité (±20%)
- Intégration avec l'inventaire company
- Visible dans la vue Inventaire globale

**Architecture P2P**: Les données sont stockées localement en SQLite et synchronisées avec les autres joueurs via le NetworkManager.

---

## Tables SQLite

### `worker_instances`

Table principale pour les workers item-based.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `owner_company_id` | TEXT | FK → companies (propriétaire) |
| `owner_player_id` | TEXT | FK → player (propriétaire alternatif) |
| `item_id` | TEXT | FK → items (Worker-XX item) |
| `airport_ident` | TEXT | Aéroport de localisation |
| `country_code` | TEXT | Code pays (FR, DE, US...) |
| `speed` | INTEGER (1-100) | Vitesse de travail |
| `resistance` | INTEGER (1-100) | Résistance aux blessures |
| `xp` | INTEGER | Points d'expérience |
| `tier` | INTEGER (1-5) | Niveau (auto-calculé via XP) |
| `hourly_salary` | REAL | Salaire horaire |
| `status` | TEXT | available, working, injured, dead |
| `factory_id` | TEXT | FK → factories (si assigné) |
| `for_sale` | INTEGER | En vente (0/1) |
| `sale_price` | REAL | Prix de vente |
| `injured_at` | TEXT | Date de blessure (ISO8601) |
| `created_at` | TEXT | Date création |

**Contraintes:**
- `speed BETWEEN 1 AND 100`
- `resistance BETWEEN 1 AND 100`
- `xp >= 0`
- `tier BETWEEN 1 AND 5`
- `hourly_salary > 0`
- `status IN ('available', 'working', 'injured', 'dead')`

### `country_worker_stats`

Stats de base par nationalité pour la génération.

| Colonne | Type | Description |
|---------|------|-------------|
| `country_code` | TEXT | PK - Code pays ISO |
| `country_name` | TEXT | Nom du pays |
| `base_speed` | INTEGER | Vitesse de base (30-70) |
| `base_resistance` | INTEGER | Résistance de base (30-70) |
| `base_hourly_salary` | REAL | Salaire horaire de base |

**Exemples de stats par pays:**

| Pays | Speed | Resistance | Salaire/h |
|------|-------|------------|-----------|
| France (FR) | 55 | 50 | 15$ |
| Germany (DE) | 60 | 50 | 16$ |
| USA (US) | 55 | 52 | 18$ |
| Japan (JP) | 65 | 45 | 22$ |
| China (CN) | 52 | 55 | 6$ |
| India (IN) | 50 | 48 | 4$ |

---

## Cycle de Vie d'un Worker

```
[Achat/Création]
     |
     | WorkerService.createWorker()
     v
[Inventaire Company] (status: available, factory_id: NULL)
     |
     | WorkerService.assignToFactory()
     v
[Assigné Factory] (status: working, factory_id: set)
     |
     +--- Production -> +XP, risque blessure
     |
     | WorkerService.unassignFromFactory()
     v
[Retour Inventaire] (status: available, factory_id: NULL)
     |
     +--- Visible dans vue Inventaire
     +--- Peut être vendu sur HV
```

---

## Génération des Workers

### Formule de génération

```typescript
// Stats de base du pays
const baseSpeed = countryStats.base_speed;
const baseResistance = countryStats.base_resistance;
const baseSalary = countryStats.base_hourly_salary;

// Variation ±20%
const speed = Math.round(baseSpeed * (0.8 + Math.random() * 0.4));
const resistance = Math.round(baseResistance * (0.8 + Math.random() * 0.4));
const salary = baseSalary * (0.9 + Math.random() * 0.2);

// Contraintes: 1-100 pour stats
const finalSpeed = Math.max(1, Math.min(100, speed));
const finalResistance = Math.max(1, Math.min(100, resistance));
```

### Exemple - Worker Français

Stats France: speed=55, resistance=50, salary=15$

Worker généré:
- Speed: 44-66 (55 ± 20%)
- Resistance: 40-60 (50 ± 20%)
- Salaire: 13.50$-16.50$ (15$ ± 10%)

---

## Services TypeScript

### WorkerService

```typescript
// services/WorkerService.ts

class WorkerServiceClass {
  // Créer un worker (achat)
  async createWorker(countryCode: string, airportIdent: string): Promise<Worker>;

  // Lister tous les workers de la company
  async getAllWorkers(): Promise<Worker[]>;

  // Workers disponibles à un aéroport
  async getWorkersAtAirport(airportIdent: string): Promise<Worker[]>;

  // Détails d'un worker
  async getWorker(id: string): Promise<Worker>;

  // Assigner à une factory
  async assignToFactory(workerId: string, factoryId: string): Promise<void>;

  // Retirer d'une factory
  async unassignFromFactory(workerId: string): Promise<void>;

  // Workers d'une factory
  async getFactoryWorkers(factoryId: string): Promise<Worker[]>;
}
```

### Validations assignation

```typescript
// WorkerService.assignToFactory()
async assignToFactory(workerId: string, factoryId: string): Promise<void> {
  const worker = await this.getWorker(workerId);
  const factory = await FactoryService.getFactory(factoryId);

  // Worker doit appartenir à la company
  if (worker.owner_company_id !== currentCompanyId) {
    throw new Error("Worker does not belong to your company");
  }

  // Worker doit être disponible
  if (worker.status !== "available") {
    throw new Error("Worker is not available");
  }

  // Worker doit être au même aéroport
  if (worker.airport_ident !== factory.airport_ident) {
    throw new Error("Worker must be at the same airport as factory");
  }

  // Factory ne doit pas être pleine
  const currentWorkers = await this.getFactoryWorkers(factoryId);
  if (currentWorkers.length >= factory.max_workers) {
    throw new Error("Factory is full");
  }

  // Assigner
  worker.factory_id = factoryId;
  worker.status = "working";
  await DatabaseManager.saveWorker(worker);
}
```

---

## Intégration Frontend

### Vue Inventaire

Les workers apparaissent dans la vue Inventaire globale avec:
- Drapeau du pays (emoji)
- Status icon: ✅ available, 🔧 working, 🤕 injured
- Stats affichées: ⚡speed 🛡️resistance
- Filtres: "Workers" et "En Travail"

### Factory Management Modal

Le modal de gestion factory affiche:
- Workers actuellement assignés
- Bouton pour ouvrir le modal d'assignation
- Liste des workers disponibles à l'aéroport

---

## Progression XP

### Tiers et XP requis

| Tier | XP requis | Bonus Speed |
|------|-----------|-------------|
| Novice (1) | 0 | - |
| Apprenti (2) | 1,000 | +5% |
| Compagnon (3) | 5,000 | +10% |
| Expert (4) | 15,000 | +15% |
| Maître (5) | 50,000 | +20% |

### Gain XP

À chaque batch complété par la factory:
```
xp_gain = recipe.tier × 10
```

Tous les workers assignés gagnent cet XP.

---

## Système de Blessures

### Risque de blessure

- **Risque base**: 0.5% par heure de travail
- **Sans food**: Risque x2 (1% par heure)
- **Calcul**: Vérifié par le scheduler local toutes les heures

### Durée de blessure

- Blessure aléatoire: 1-10 jours
- Pendant la blessure: status = "injured", ne peut pas travailler

### Mort

- Si blessure > 10 jours sans soins → mort
- Worker status = "dead"
- **Pénalité**: -10,000 CR déduit du wallet company

### Soins (futur)

- Possibilité d'acheter des soins médicaux
- Réduit le temps de guérison

---

## Consommation Food

- **Taux**: 1 food / worker / heure
- **Sans food**:
  - Efficacité réduite à 30%
  - Risque blessure doublé
  - Salaire toujours payé

---

## Paiement Salaires

### Scheduler local

Toutes les heures (simulées), le scheduler:
1. Compte les workers `status = 'working'`
2. Calcule le total: `sum(hourly_salary)`
3. Déduit de `company.balance`

### Insuffisance de fonds

Si `company.balance < total_salaries`:
- Workers non payés cette heure
- Risque de départ (futur)
- Notification à l'utilisateur

---

## Scheduler Jobs (Local)

| Job | Intervalle | Description |
|-----|------------|-------------|
| `salary_payments` | 1 heure | Paie les salaires workers |
| `injury_processing` | 1 heure | Traite blessures (guérison/mort) |
| `food_and_injuries` | 1 heure | Consomme food + check blessures |

Ces jobs s'exécutent localement dans l'EFB via des timers JavaScript.

---

## Sync P2P

### Données synchronisées

| Donnée | Direction | Fréquence |
|--------|-----------|-----------|
| Liste workers | Bidirectionnel | 5 sec |
| Assignation factory | Bidirectionnel | 5 sec |
| Status workers | Bidirectionnel | 5 sec |

### Données locales uniquement

- Préférences d'affichage UI
- Filtres sélectionnés

---

## 42 Pays disponibles

Les workers peuvent provenir de 42 pays différents, chacun avec ses propres stats de base:

| Région | Pays |
|--------|------|
| Europe | FR, DE, GB, ES, IT, PL, NL, BE, SE, NO, FI, DK, AT, CH, PT, IE, GR, CZ, HU, RO |
| Americas | US, CA, MX, BR, AR, CO, CL |
| Asia | CN, JP, KR, IN, ID, TH, VN, PH, MY, SG |
| Middle East | AE, SA, TR |
| Africa | ZA, EG |
| Oceania | AU, NZ |
