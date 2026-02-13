# Workers System — Documentation Technique

> **Version**: V4.3 (Architecture Deux Carrières)
> **Dernière mise à jour** : 13 février 2026

## Vue d'ensemble

Les workers sont des **instances uniques** avec des stats individuelles — pas de simples items empilables. Chaque worker a sa propre nationalité, vitesse, résistance et progression XP.

- Achetables sur le marché (large_airport uniquement)
- Propriété de la **company** ou du **joueur** (owner_type)
- 42 nationalités avec stats de base différentes
- Progression XP : Novice → Maître (5 tiers)
- Système de blessures et mort

### Architecture

| Mode | Stockage workers | Achat | Salaires |
|------|-----------------|-------|----------|
| **Solo** | `SoloSaveService` → GetStoredData | Marché IA (prix fixes) | Scheduler local (timer JS) |
| **Online** | SEED (Cloudflare R2) | Marché joueurs | SEED calcule |

---

## Modèle de données

### WorkerInstance

```typescript
interface WorkerInstance {
  id: string;                    // UUID unique
  owner_company_id: string | null;  // FK → Company (si propriété company)
  owner_player_id: string | null;   // FK → Player (si propriété perso)
  owner_type: "company" | "personal";
  item_id: string;               // FK → Item (Worker-XX dans seed.json)
  airport_ident: string;         // Aéroport de localisation
  country_code: string;          // Code pays ISO (FR, DE, US...)

  // Stats individuelles (générées aléatoirement ±20%)
  speed: number;                 // 1-100 — vitesse de travail
  resistance: number;            // 1-100 — résistance aux blessures
  xp: number;                    // Points d'expérience
  tier: number;                  // 1-5 (auto-calculé via XP)
  hourly_salary: number;         // Salaire horaire en CR

  // État
  status: "available" | "working" | "injured" | "dead";
  factory_id: string | null;     // FK → Factory (si assigné)

  // Vente
  for_sale: boolean;
  sale_price: number | null;

  // Dates
  injured_at: string | null;     // ISO8601
  created_at: string;            // ISO8601
}
```

---

## Cycle de Vie

```
[Achat sur le marché]
     │
     │ WorkerService.createWorker()
     │ Stats générées selon nationalité (±20%)
     ▼
[Inventaire Company/Perso] (status: available, factory_id: null)
     │
     ├─── Vendre sur HV ──► [Marché]
     │
     │ WorkerService.assignToFactory()
     ▼
[Assigné à une Factory] (status: working, factory_id: set)
     │
     ├─── Production → +XP, risque blessure
     │
     │ WorkerService.unassignFromFactory()
     ▼
[Retour Inventaire] (status: available, factory_id: null)
     │
     ├─── Blessure → (status: injured) → guérison ou mort
     └─── Mort → (status: dead) → pénalité -10,000 CR
```

---

## Génération des Workers

### Stats de base par pays

Chaque nationalité a des stats de base différentes. À l'achat, les stats finales sont générées avec une variation aléatoire de ±20% (±10% pour le salaire).

```typescript
function generateWorker(countryCode: string, airportIdent: string): WorkerInstance {
  const stats = CountryWorkerStats[countryCode];

  // Variation ±20% sur speed et resistance
  const speed = clamp(
    Math.round(stats.base_speed * (0.8 + Math.random() * 0.4)),
    1, 100
  );
  const resistance = clamp(
    Math.round(stats.base_resistance * (0.8 + Math.random() * 0.4)),
    1, 100
  );

  // Variation ±10% sur le salaire
  const salary = stats.base_hourly_salary * (0.9 + Math.random() * 0.2);

  return {
    id: generateUUID(),
    country_code: countryCode,
    airport_ident: airportIdent,
    speed,
    resistance,
    hourly_salary: Math.round(salary * 100) / 100,
    xp: 0,
    tier: 1,
    status: "available",
    factory_id: null,
    // ... autres champs
  };
}
```

### Exemples de stats par pays

| Pays | Code | Speed | Resistance | Salaire/h | Profil |
|------|------|-------|------------|-----------|--------|
| France | FR | 55 | 50 | 15 CR | Équilibré |
| Germany | DE | 60 | 50 | 16 CR | Rapide |
| USA | US | 55 | 52 | 18 CR | Cher mais solide |
| Japan | JP | 65 | 45 | 22 CR | Très rapide, fragile |
| China | CN | 52 | 55 | 6 CR | Pas cher, résistant |
| India | IN | 50 | 48 | 4 CR | Très économique |

**Exemple concret — Worker Français :**
- Stats base FR : speed=55, resistance=50, salary=15
- Worker généré : speed 44-66, resistance 40-60, salaire 13.50-16.50 CR/h

### Disponibilité à l'achat

Les workers sont achetables **uniquement aux large_airport**. Le marché IA (Solo) propose des workers des pays de la région géographique de l'aéroport. En Online, les joueurs vendent leurs propres workers.

---

## 42 Pays disponibles

| Région | Pays (codes ISO) |
|--------|------------------|
| Europe | FR, DE, GB, ES, IT, PL, NL, BE, SE, NO, FI, DK, AT, CH, PT, IE, GR, CZ, HU, RO |
| Americas | US, CA, MX, BR, AR, CO, CL |
| Asie | CN, JP, KR, IN, ID, TH, VN, PH, MY, SG |
| Moyen-Orient | AE, SA, TR |
| Afrique | ZA, EG |
| Océanie | AU, NZ |

Les stats complètes de chaque pays sont stockées dans `data/seed.json` sous `country_worker_stats`.

---

## Progression XP

### Tiers et XP requis

| Tier | Nom | XP requis | Bonus Speed | Bonus Production |
|------|-----|-----------|-------------|-----------------|
| 1 | Novice | 0 | — | — |
| 2 | Apprenti | 1,000 | +5% | +5% quantité |
| 3 | Compagnon | 5,000 | +10% | +10% quantité |
| 4 | Expert | 15,000 | +15% | +15% quantité |
| 5 | Maître | 50,000 | +20% | +25% quantité (cap) |

### Gain XP

À chaque batch complété par la factory où le worker est assigné :
```
xp_gain = recipe.tier × 10
```
Tous les workers assignés gagnent cet XP (même les blessés en convalescence ne gagnent rien car ils ne travaillent pas).

### Auto-calcul du tier

```typescript
function calculateWorkerTier(xp: number): number {
  if (xp >= 50000) return 5;
  if (xp >= 15000) return 4;
  if (xp >= 5000) return 3;
  if (xp >= 1000) return 2;
  return 1;
}
```

---

## Système de Blessures

### Risque de blessure

- **Risque base** : 0.5% par heure de travail
- **Sans food** : Risque x2 (1% par heure)
- **Résistance** : Réduit le risque — `risque_final = risque_base × (1 - resistance/200)`
- Vérifié par le scheduler local (Solo) ou SEED (Online) toutes les heures

**Exemple :**
- Worker avec resistance=60, avec food : `0.5% × (1 - 60/200) = 0.5% × 0.7 = 0.35%`
- Worker avec resistance=60, sans food : `1.0% × 0.7 = 0.70%`

### Durée de blessure

- Durée aléatoire : 1-10 jours de jeu
- Pendant la blessure : `status = "injured"`, ne peut pas travailler
- Le worker est automatiquement retiré de la factory

### Mort

- Si blessure > 10 jours sans soins → mort
- Worker `status = "dead"` — supprimé de l'inventaire
- **Pénalité** : -10,000 CR déduit du wallet company

### Soins (futur)

- Achat de Medical Bandages (item T2) pour réduire le temps de guérison
- Chaque Medical Bandages réduit de 2 jours le temps de guérison

---

## Consommation Food

- **Taux** : 1 food / worker assigné / heure
- La food est consommée depuis le `food_stock` de la factory
- Le joueur doit approvisionner la factory en items "food"

### Effets sans nourriture

| Aspect | Avec food | Sans food |
|--------|-----------|-----------|
| Efficacité | 100% | 30% |
| Risque blessure | 0.5%/h | 1.0%/h (x2) |
| Salaire | Payé | Payé quand même |
| Production | Normale | Possible mais lente |

---

## Paiement des Salaires

### Calcul

Toutes les heures (simulées), pour chaque factory :
```
coût_horaire = somme(worker.hourly_salary) pour chaque worker avec status="working"
```

### Mode Solo

Le scheduler local déduit de `company.balance` toutes les heures.

### Mode Online

Le SEED calcule et déduit automatiquement.

### Insuffisance de fonds

Si `company.balance < coût_horaire` :
- Workers non payés cette heure
- Notification à l'utilisateur (couleur orange #f59e0b)
- Risque de départ (futur) : workers non payés pendant 24h+ peuvent quitter

---

## Assignation aux Factories

### Validations

```typescript
async function assignToFactory(workerId: string, factoryId: string): Promise<void> {
  const worker = await WorkerService.getWorker(workerId);
  const factory = await FactoryService.getFactory(factoryId);

  // 1. Worker doit appartenir à la company
  if (worker.owner_company_id !== currentCompanyId) {
    throw new Error("Worker does not belong to your company");
  }

  // 2. Worker doit être disponible
  if (worker.status !== "available") {
    throw new Error("Worker is not available");
  }

  // 3. Worker doit être au même aéroport
  if (worker.airport_ident !== factory.airport_ident) {
    throw new Error("Worker must be at the same airport as factory");
  }

  // 4. Factory ne doit pas être pleine
  const currentWorkers = await WorkerService.getFactoryWorkers(factoryId);
  if (currentWorkers.length >= factory.max_workers) {
    throw new Error("Factory is full");
  }

  // 5. Assigner
  worker.factory_id = factoryId;
  worker.status = "working";
  await ServiceAdapter.save();
}
```

---

## Services (Architecture Deux Carrières)

### WorkerService

```typescript
// services/WorkerService.ts

class WorkerServiceClass {
  // Créer un worker (achat)
  async createWorker(countryCode: string, airportIdent: string): Promise<WorkerInstance>;

  // Lister tous les workers de la company
  async getAllWorkers(): Promise<WorkerInstance[]>;

  // Workers disponibles à un aéroport
  async getWorkersAtAirport(airportIdent: string): Promise<WorkerInstance[]>;

  // Détails d'un worker
  async getWorker(id: string): Promise<WorkerInstance>;

  // Assigner à une factory
  async assignToFactory(workerId: string, factoryId: string): Promise<void>;

  // Retirer d'une factory
  async unassignFromFactory(workerId: string): Promise<void>;

  // Workers d'une factory
  async getFactoryWorkers(factoryId: string): Promise<WorkerInstance[]>;

  // Soigner un worker blessé (futur)
  async healWorker(workerId: string, bandageItemId: string): Promise<void>;
}
```

### ServiceAdapter — Worker Methods

```typescript
// Dans ServiceAdapter.ts

async buyWorker(countryCode: string, airportIdent: string): Promise<WorkerInstance> {
  if (GameModeState.isSolo()) {
    return LocalWorkerService.buy(countryCode, airportIdent);
  } else {
    return SyncService.buyWorker(countryCode, airportIdent);
  }
}

async assignWorkerToFactory(workerId: string, factoryId: string): Promise<void> {
  if (GameModeState.isSolo()) {
    return LocalWorkerService.assignToFactory(workerId, factoryId);
  } else {
    return SyncService.assignWorkerToFactory(workerId, factoryId);
  }
}
```

---

## Intégration Frontend (EFB)

### Vue Inventaire

Les workers apparaissent dans la vue Inventaire globale (Market > Inventaire) :
- Drapeau du pays : texte code ISO (pas d'emoji — Coherent GT affiche des carrés)
- Status : couleur de fond (vert=#22c55e available, orange=#f59e0b working, rouge=#ef4444 injured)
- Stats affichées : SPD [valeur] / RES [valeur]
- Filtres : "Workers" et "En Travail"

### Factory Management

Dans le futur tab Factory ou modal dédié :
- Liste des workers assignés avec stats
- Bouton "Assigner" → liste des workers disponibles au même aéroport
- Bouton "Retirer" pour désassigner un worker
- Indicateur food stock avec couleur (vert > 50%, orange 10-50%, rouge < 10%)

---

## Sauvegarde

### Mode Solo

Les workers sont inclus dans `SoloSaveData` :

```typescript
interface SoloSaveData {
  // ... autres champs existants ...
  workers: WorkerInstance[];
}
```

### Mode Online

Les workers sont stockés sur le SEED. Toutes les modifications (achat, assignation, blessure) passent par les endpoints SEED avec validation.

---

## Scheduler Jobs (Mode Solo uniquement)

| Job | Intervalle | Description |
|-----|------------|-------------|
| `salary_payments` | 1 heure | Paie les salaires de tous les workers "working" |
| `injury_check` | 1 heure | Vérifie les blessures (probabilité par worker) |
| `injury_healing` | 1 heure | Avance la guérison des workers blessés |
| `death_check` | 1 heure | Vérifie si un worker blessé > 10 jours → mort |
| `food_consumption` | 1 heure | Déduit food_stock des factories |

En mode Online, le SEED gère tout — pas de scheduler local.
