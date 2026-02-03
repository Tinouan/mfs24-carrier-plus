# Company System - Documentation Technique

> **Version**: V0.9 (Architecture P2P)

## Vue d'ensemble

Le système Company gère les compagnies de transport aérien des joueurs:
- **Mode P2P**: Le joueur démarre sans company et peut en acheter une (50,000 CR)
- **Wallet/Balance**: Argent de la company séparé du wallet personnel
- **Ownership Model**: Avions personnels vs avions company

**Architecture P2P**: Les données sont stockées localement en SQLite. En mode solo, le système de membres n'est pas utilisé.

---

## Tables SQLite

### `company`

Table principale de la company (une seule par joueur).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `name` | TEXT | Nom de la company |
| `owner_id` | TEXT | FK → player |
| `home_airport_ident` | TEXT | Code ICAO aéroport de base |
| `balance` | REAL | Solde en crédits |
| `created_at` | TEXT | Date de création |

### `player`

Profil du joueur.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `name` | TEXT | Nom du joueur |
| `xp` | INTEGER | Points d'expérience |
| `money` | REAL | Wallet personnel |
| `home_airport` | TEXT | Aéroport de base |
| `created_at` | TEXT | Date de création |

---

## Cycle de Vie

### Démarrage sans Company

```
[Première connexion]
       │
       │ InitService.firstLaunchSetup()
       ▼
[Joueur créé]
  ├── 100,000 CR (wallet personnel)
  ├── 1 avion personnel (C172)
  └── Pas de company
       │
       │ Joue en solo avec avion personnel
       ▼
[Tab Company] → "Aucune compagnie"
       │
       │ Formulaire d'achat
       │   - Nom de la company
       │   - Coût: 50,000 CR
       │
       ▼
[Bouton "Acheter une compagnie"]
       │
       │ InitService.purchaseCompany()
       │
       ├── Vérifier solde ≥ 50,000
       ├── Déduire 50,000 du wallet joueur
       └── Créer la company
       │
       ▼
[Company créée et active]
  ├── Balance: 0 CR
  ├── Accès aux factories
  ├── Accès aux workers
  └── Peut acheter des avions company
```

---

## Services TypeScript

### InitService

```typescript
// services/InitService.ts

class InitServiceClass {
  private readonly COMPANY_COST = 50000;

  /**
   * Acheter une company
   */
  async purchaseCompany(companyName: string): Promise<Company> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Vérifier si le joueur a déjà une company
    const existingCompany = await DatabaseManager.getCompanyByOwner(player.id);
    if (existingCompany) {
      throw new Error("Player already has a company");
    }

    // Vérifier les fonds
    if (player.money < this.COMPANY_COST) {
      throw new Error(`Insufficient funds. Need ${this.COMPANY_COST}, have ${player.money}`);
    }

    // Déduire le coût
    player.money -= this.COMPANY_COST;
    await DatabaseManager.savePlayer(player);

    // Créer la company
    const company: Company = {
      id: generateUUID(),
      name: companyName,
      balance: 0,
      owner_id: player.id,
      home_airport_ident: player.home_airport,
      created_at: new Date().toISOString(),
    };

    await DatabaseManager.put("company", company);

    // Mettre à jour le state
    companyState.info.set(company);

    return company;
  }
}
```

### CompanyService

```typescript
// services/CompanyService.ts

class CompanyServiceClass {
  // Récupérer ma company
  async getMyCompany(): Promise<Company | null>;

  // Modifier le profil company
  async updateProfile(params: {
    name?: string;
    home_airport_ident?: string;
  }): Promise<Company>;

  // Ajouter des fonds à la balance
  async addToBalance(amount: number): Promise<void>;

  // Retirer des fonds de la balance
  async withdrawFromBalance(amount: number): Promise<void>;

  // Vérifier si le joueur a une company
  async hasCompany(): Promise<boolean>;
}
```

---

## Ownership Model

### Avions personnels vs Company

Le système supporte deux types de propriété d'avion:

| Type | Champs | Description |
|------|--------|-------------|
| **Personal** | `owner_id = player_id`, `company_id = null` | Avion appartenant au joueur |
| **Company** | `owner_id = null`, `company_id = company_id` | Avion appartenant à la company |

### Table `aircraft`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `registration` | TEXT | Immatriculation |
| `type_code` | TEXT | Code ICAO type avion |
| `owner_id` | TEXT | FK → player (si personnel) |
| `company_id` | TEXT | FK → company (si company) |
| `location_icao` | TEXT | Position actuelle |
| `fuel_gallons` | REAL | Carburant actuel |

### Logique d'affichage Hangar

```typescript
async getFleet(): Promise<HangarAircraftItem[]> {
  const player = await DatabaseManager.getPlayer();
  const result: HangarAircraftItem[] = [];

  // 1. Avions personnels
  const personalAircraft = await DatabaseManager.query(
    'SELECT * FROM aircraft WHERE owner_id = ?',
    [player.id]
  );
  for (const ac of personalAircraft) {
    result.push({ ...ac, owner_type: "personal" });
  }

  // 2. Avions company (si le joueur a une company)
  const company = await DatabaseManager.getCompanyByOwner(player.id);
  if (company) {
    const companyAircraft = await DatabaseManager.query(
      'SELECT * FROM aircraft WHERE company_id = ?',
      [company.id]
    );
    for (const ac of companyAircraft) {
      result.push({ ...ac, owner_type: "company" });
    }
  }

  return result;
}
```

### Badge d'affichage UI

| Type | Badge | Couleur |
|------|-------|---------|
| Personal | 👤 PERSO | Vert |
| Company | 🏢 COMPANY | Bleu |

---

## Système de Balance

### Deux wallets distincts

| Wallet | Usage | Source |
|--------|-------|--------|
| `player.money` | Achats personnels, company | Missions, ventes perso |
| `company.balance` | Salaires, factories, achats company | Ventes company |

### Affichage dans l'UI

```
┌─────────────────────────────────────────────────────┐
│ 📦 INVENTAIRE          👤 5,000$ | 🏢 25,000$       │
└─────────────────────────────────────────────────────┘
```

Les deux wallets sont affichés dans le header des vues Market et Inventory.

### Déductions automatiques

Le scheduler local déduit automatiquement de `company.balance`:
- **Salaires workers**: Toutes les heures
- **Pénalité mort worker**: -10,000 CR
- **Frais de maintenance**: (futur)

---

## Vue Company (EFB)

### Sans Company

```
┌─────────────────────────────────────────────────────┐
│ 🏢 COMPANY                                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│              Aucune compagnie                       │
│                                                     │
│   Créer une compagnie pour débloquer:               │
│   • Usines de production                            │
│   • Recrutement de workers                          │
│   • Flotte d'avions company                         │
│                                                     │
│   ┌─────────────────────────────────────────────┐  │
│   │ Nom: [Ma Compagnie              ]           │  │
│   │                                             │  │
│   │ Votre solde: 75,000 CR                      │  │
│   │ Coût: 50,000 CR                             │  │
│   │                                             │  │
│   │           [Acheter une compagnie]           │  │
│   └─────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Avec Company

```
┌─────────────────────────────────────────────────────┐
│ 🏢 MA COMPAGNIE                    Balance: 25,000$ │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 📍 Base: LFPG (Paris CDG)                          │
│ 📅 Créée le: 22/01/2026                            │
│                                                     │
│ ───────────────────────────────────────────────────│
│                                                     │
│ 🏭 Usines: 3                                        │
│ 👷 Workers: 15                                      │
│ ✈️ Avions Company: 2                               │
│                                                     │
│ ───────────────────────────────────────────────────│
│                                                     │
│ Transfert de fonds:                                 │
│ [Perso → Company] [Company → Perso]                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Transfert de fonds

### Service de transfert

```typescript
// CompanyService.ts

async transferToCompany(amount: number): Promise<void> {
  const player = await DatabaseManager.getPlayer();
  const company = await this.getMyCompany();

  if (!company) throw new Error("No company");
  if (player.money < amount) throw new Error("Insufficient personal funds");

  player.money -= amount;
  company.balance += amount;

  await DatabaseManager.savePlayer(player);
  await DatabaseManager.saveCompany(company);

  // Update states
  authState.wallet.set(player.money);
  companyState.balance.set(company.balance);
}

async transferToPersonal(amount: number): Promise<void> {
  const player = await DatabaseManager.getPlayer();
  const company = await this.getMyCompany();

  if (!company) throw new Error("No company");
  if (company.balance < amount) throw new Error("Insufficient company balance");

  company.balance -= amount;
  player.money += amount;

  await DatabaseManager.saveCompany(company);
  await DatabaseManager.savePlayer(player);

  // Update states
  companyState.balance.set(company.balance);
  authState.wallet.set(player.money);
}
```

---

## États React (Subjects)

```typescript
// state/CompanyState.ts

export const companyState = {
  info: Subject.create<Company | null>(null),
  balance: Subject.create<number>(0),
  hasCompany: Subject.create<boolean>(false),

  // Stats
  factoriesCount: Subject.create<number>(0),
  workersCount: Subject.create<number>(0),
  aircraftCount: Subject.create<number>(0),
};
```

---

## Sync P2P

### Données synchronisées

| Donnée | Direction | Fréquence |
|--------|-----------|-----------|
| Infos company | Local uniquement | - |
| Balance | Local uniquement | - |

En mode P2P solo, les données de company ne sont pas synchronisées car chaque joueur a sa propre company locale.

### Mode Multi (futur)

Dans une future version avec multi-membres:
- Les membres verraient la même company
- La balance serait partagée
- Les transactions seraient synchronisées

---

## Limitations (Mode P2P Solo)

- **Solo uniquement**: Pas de système de membres
- **Pas d'invitations**: Chaque joueur a sa propre company
- **Pas de transfert de propriété**: Company liée au joueur
- **Pas de suppression**: Company permanente une fois créée

---

## Évolutions futures

- [ ] Système de membres (multi-joueurs dans une company)
- [ ] Permissions granulaires
- [ ] Invitations avec acceptation
- [ ] Transfert de propriété
- [ ] Historique des transactions
- [ ] Statistiques détaillées
