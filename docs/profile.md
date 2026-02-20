# Profile System - Documentation Technique (P2P)

## Vue d'ensemble

Le système de profils gère les données du joueur en mode P2P (local-first).

**Architecture** : SQLite local via `DatabaseManager`

---

## Collection localStorage

### `player`

Profil joueur (stocké dans localStorage avec préfixe `aerocorp_`).

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string | UUID unique |
| `name` | string | Nom du joueur |
| `email` | string? | Email (optionnel) |
| `nationality` | string? | Code pays (ex: "FR") |
| `preferred_airport` | string? | Aéroport de base (ICAO) |
| `money` | number | Crédits (CR) |
| `xp` | number | Points d'expérience |
| `trust_score` | number | Score anti-cheat (0-100) |
| `is_premium` | boolean | Compte premium |
| `created_at` | string | Date de création (ISO) |
| `updated_at` | string | Dernière modification |
| `last_login_at` | string? | Dernière connexion |

---

## Services TypeScript

### InitService

Gère la création du profil au premier lancement.

```typescript
// services/InitService.ts

class InitService {
  // Vérifier si un joueur existe
  async hasPlayer(): Promise<boolean>
  
  // Créer le joueur (first launch)
  async createPlayer(data: {
    name: string;
    nationality: string;
    homeAirport: string;
  }): Promise<Player>
  
  // Récupérer le joueur actuel
  async getPlayer(): Promise<Player | null>
  
  // Mettre à jour le profil
  async updatePlayer(updates: Partial<Player>): Promise<Player>
}
```

### PlayerRouter

Abstraction pour accéder aux données joueur.

```typescript
// services/PlayerRouter.ts

class PlayerRouter {
  // Récupérer le profil
  async getProfile(): Promise<Player>
  
  // Mettre à jour le profil
  async updateProfile(updates: Partial<Player>): Promise<Player>
  
  // Récupérer le solde
  async getBalance(): Promise<number>
  
  // Modifier le solde (après mission, achat, etc.)
  async updateBalance(amount: number): Promise<number>
}
```

---

## First Launch Flow

```
[MSFS démarre]
       │
       ▼
[EFB s'ouvre] → InitService.hasPlayer()
       │
       ├── Player existe?
       │         │
       │    Non  │  Oui
       │         │
       │         ▼
       │   [Charger profil existant]
       │   authState.isP2PMode.set(true)
       │
       ▼
[Welcome Popup]
       │
       │ Saisie:
       │ - Nom du pilote
       │ - Nationalité
       │ - Aéroport de base
       │
       ▼
[InitService.createPlayer()]
       │
       ├── Créer profil (100,000 CR)
       ├── Créer avion personnel (C172)
       └── Générer ordres marché IA
       │
       ▼
[Jeu prêt - Mode P2P actif]
```

---

## Données initiales

### Nouveau joueur

```typescript
const newPlayer = {
  id: generateUUID(),
  name: "Nom saisi",
  nationality: "FR",
  home_airport: "LFPG",
  money: 100000,  // 100,000 CR de départ
  xp: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
```

### Avion personnel initial

```typescript
const starterAircraft = {
  id: generateUUID(),
  owner_id: player.id,
  owner_type: "player",  // Personnel, pas company
  aircraft_type: "C172",
  registration: "F-" + randomLetters(4),
  current_airport_ident: player.home_airport,
  fuel_gallons: 40,
  fuel_capacity_gallons: 53,
  cargo_capacity_kg: 150,
  status: "available",
};
```

---

## State Management

### AuthState (state/AuthState.ts)

```typescript
export const authState = {
  // Mode P2P actif (toujours true en P2P)
  isP2PMode: Subject.create<boolean>(false),
  
  // Premier lancement (affiche welcome popup)
  isFirstLaunch: Subject.create<boolean>(false),
  
  // Joueur connecté localement
  isLoggedIn: Subject.create<boolean>(false),
  
  // Infos joueur
  currentUser: Subject.create<UserInfo | null>(null),
};
```

---

## Différence avec l'ancien système

| Aspect | Ancien (Serveur) | Nouveau (P2P) |
|--------|------------------|---------------|
| Authentification | Email + password | Nom seulement |
| Stockage | PostgreSQL distant | SQLite local |
| Token | JWT Bearer | Aucun |
| Création compte | `/auth/register` | `InitService.createPlayer()` |
| Lecture profil | `GET /profile/me` | `PlayerRouter.getProfile()` |
| Sécurité | Hash Argon2 | Données locales |

---

## Career Stats — Free Flight

Les free flights mettent à jour les career stats du pilote :
- `total_flight_time_minutes` += durée du vol
- `total_landings` += 1
- `total_distance_nm` += distance parcourue

Ces stats sont aussi rafraîchies dans `authState` après chaque vol
pour affichage immédiat dans le profil (sans recharger).

---

## Évolutions futures

### Statistiques pilote
- [x] `total_flight_time_minutes` - Minutes de vol (free flight)
- [x] `total_landings` - Nombre d'atterrissages (free flight)
- [x] `total_distance_nm` - Distance parcourue (free flight)
- [ ] `total_cargo_kg` - Cargo transporté

### Progression
- [ ] `pilot_level` - Niveau calculé depuis XP
- [ ] `achievements` - Badges/accomplissements (JSON)

### Licences
- [ ] `licenses` - JSON avec types de licences
  - PPL (défaut)
  - IFR (à débloquer)
  - CPL (à débloquer)
  - ATPL (à débloquer)

### Préférences (dans SettingsState)
- [x] Langue (fr, en, de, es, ru)
- [x] Unités (métrique/impérial)
- [ ] Thème UI

---

## Sync P2P (futur)

En mode multijoueur, le profil sera synchronisé :

```
┌─────────────────────────────────────────┐
│            SYNC PROFIL P2P               │
│                                          │
│   SQLite local                           │
│        │                                 │
│        ▼                                 │
│   NetworkManager.syncProfile()           │
│        │                                 │
│        ▼                                 │
│   Shard (autre joueur HOST)             │
│        │                                 │
│        ▼                                 │
│   Classements mondiaux                   │
│   (XP, heures de vol, cargo)            │
└─────────────────────────────────────────┘
```

**Données synchronisées** :
- Nom, XP, statistiques (pour classements)

**Données locales uniquement** :
- Money (anti-cheat)
- Position actuelle

---

## Exemple d'utilisation

### Vérifier si premier lancement

```typescript
const hasPlayer = await InitService.hasPlayer();
if (!hasPlayer) {
  authState.isFirstLaunch.set(true);
  // Afficher welcome popup
}
```

### Créer le profil

```typescript
const player = await InitService.createPlayer({
  name: welcomeNameInput.value,
  nationality: selectedCountry,
  homeAirport: selectedAirport,
});

authState.currentUser.set({
  id: player.id,
  username: player.name,
  email: "", // Pas d'email en P2P
});
authState.isLoggedIn.set(true);
authState.isP2PMode.set(true);
```

### Récupérer le solde

```typescript
const balance = await PlayerRouter.getBalance();
marketState.walletPersonal.set(balance);
```
