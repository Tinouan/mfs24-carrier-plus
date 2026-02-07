# PROMPT CLAUDE CODE — Phase 4 : Company étendue

Lis d'abord ces fichiers pour comprendre l'existant :
- `src/WorldOfAircraft.tsx` (onglet Company existant)
- `src/services/LocalMarketService.ts` (getCompanyInfo, getCompanyMembers, etc.)
- `src/managers/DatabaseManager.ts` (modèles Company, CompanyMember)
- `src/state/` (tous les states)
- `src/locales/en.json` et `src/locales/fr.json`

---

## Vue d'ensemble Phase 4

### Structure onglet Company après modification
```
Company : [Overview | Membres | Historique | Messagerie]
```

---

## 4A — Système de rôles (CEO/Officier/Pilote/Recrue)

### Modèle DB

Ajouter un champ `role` au modèle `CompanyMember` dans DatabaseManager.ts :

```typescript
interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  username: string;
  role: "ceo" | "officer" | "pilot" | "recruit";
  joined_at: string;
  updated_at: string;
}
```

### Matrice de permissions

```typescript
const ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  ceo:     { missions: true, market_buy: true, market_sell: true, transfer_in: true, transfer_out: true, invite: true, manage_roles: true, message_pin: true },
  officer: { missions: true, market_buy: true, market_sell: true, transfer_in: true, transfer_out: true, invite: true, manage_roles: false, message_pin: false },
  pilot:   { missions: true, market_buy: false, market_sell: false, transfer_in: true, transfer_out: false, invite: false, manage_roles: false, message_pin: false },
  recruit: { missions: false, market_buy: false, market_sell: false, transfer_in: true, transfer_out: false, invite: false, manage_roles: false, message_pin: false },
};
```

Notes :
- `transfer_in` = joueur → company (investir). Tout le monde peut investir.
- `transfer_out` = company → joueur (retirer). CEO et Officer uniquement.
- `recruit` : peut voler avec un avion company mais ne peut pas créer de missions.

### Guards
Créer une fonction utilitaire :
```typescript
function hasCompanyPermission(role: string, action: string): boolean {
  return ROLE_PERMISSIONS[role]?.[action] ?? false;
}
```

Appliquer les guards dans :
- Market > Achats : bouton "Acheter company" désactivé si pas `market_buy`
- Market > Inventaire : bouton "Vendre" items company désactivé si pas `market_sell`
- Company > Overview : boutons virements selon `transfer_in` / `transfer_out`
- Company > Membres : dropdown rôle visible seulement si `manage_roles`

### UI Company > Membres

Chaque membre affiche son rôle avec un badge coloré :
```
┌────────────────────────────────────────────┐
│  Tinou           CEO        Fondateur      │
│                  [dropdown si CEO]          │
│────────────────────────────────────────────│
│  PilotJohn       Pilote     Depuis 3j      │
│                  [dropdown si CEO]          │
│────────────────────────────────────────────│
│  Newbie42        Recrue     Depuis 1h      │
│                  [dropdown si CEO]          │
└────────────────────────────────────────────┘
```

Couleurs badges rôles :
- CEO : or (#eab308)
- Officer : bleu (#3b82f6)
- Pilot : vert (#22c55e)
- Recruit : gris (#6b7280)

Le CEO peut changer le rôle via un dropdown sur chaque membre (sauf lui-même).

### Mode Solo
En Solo, le joueur est automatiquement CEO et seul membre. L'UI Membres est visible mais affiche seulement le joueur. Le dropdown de rôle n'apparaît pas (inutile en solo).

---

## 4B — Virements joueur ↔ company

### UI dans Company > Overview

Ajouter une section "Finances" :

```
┌─ Finances ─────────────────────────────────┐
│  Solde company : 10,000 CR                 │
│  Mon solde perso : 44,860 CR               │
│                                            │
│  ┌─ Transférer vers company ─────────────┐ │
│  │  Montant: [________] CR    [Envoyer]  │ │
│  └───────────────────────────────────────┘ │
│                                            │
│  ┌─ Retirer de la company ───────────────┐ │
│  │  Montant: [________] CR    [Retirer]  │ │
│  │  (CEO et Officier uniquement)         │ │
│  └───────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### Backend dans LocalMarketService.ts

```typescript
async transferToCompany(amount: number): Promise<void> {
  // Vérifier permission transfer_in
  // Déduire de player.money
  // Ajouter à company.balance
  // Logger transaction type "transfer_to_company"
  // forceSave()
}

async transferFromCompany(amount: number): Promise<void> {
  // Vérifier permission transfer_out (CEO/Officer)
  // Déduire de company.balance
  // Ajouter à player.money
  // Logger transaction type "transfer_from_company"
  // forceSave()
}
```

### Types de transaction à ajouter
- `transfer_to_company` : joueur → company
- `transfer_from_company` : company → joueur

### Validation
- Montant > 0
- Montant ≤ solde source
- Permission vérifiée par rôle

---

## 4C — Company > Historique

### Nouveau sous-onglet
Affiche toutes les transactions liées à la company, filtrées depuis le TransactionLog où `wallet = "company"`.

Types affichés :
- `market_buy` (achat company)
- `market_sell` (vente company)
- `aircraft_buy` (achat avion company)
- `aircraft_sell` (vente avion company)
- `transfer_to_company` (investissement)
- `transfer_from_company` (retrait)
- `mission_reward` (récompense mission company)

### UI
Même style que Market > Historique (cards avec fond #252532, pastilles colorées, montants en CR).

Ajouter le nom du membre qui a fait l'action quand disponible :
```
● Achat marché                        -5,000 CR
  raw-meat x10 @ LFPG
  Par: Tinou — 07 fév 2026, 08:15
```

### Refresh auto à l'ouverture du sous-onglet.

---

## 4D — Company > Messagerie

### Mode Solo
Afficher un overlay :
```
┌────────────────────────────────────────────┐
│                                            │
│     Messagerie                             │
│                                            │
│     Disponible en mode Online              │
│     La messagerie company nécessite une    │
│     connexion au serveur SEED.             │
│                                            │
│     [Passer en mode Online]                │
│                                            │
└────────────────────────────────────────────┘
```

Le bouton "Passer en mode Online" ne fait rien pour l'instant (futur), juste un placeholder.

### Mode Online (infrastructure prête, pas fonctionnel)
Préparer l'UI et le modèle même si le backend Online n'existe pas encore :

#### Modèle DB
```typescript
interface CompanyMessage {
  id: string;
  company_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_pinned: boolean;
  is_system: boolean;  // true pour les messages auto-générés
  created_at: string;
}
```

Ajouter `"company_messages"` dans les stores de DatabaseManager + PERSISTENT_STORES.

#### UI
```
┌─ Messagerie ───────────────────────────────┐
│  📌 Bienvenue dans Tinou Aviation !        │
│     Par: Tinou (CEO) — 07/02/2026          │
│────────────────────────────────────────────│
│  [Système] Company créée avec 10,000 CR    │
│  07/02/2026 08:00                          │
│────────────────────────────────────────────│
│  [Système] Cessna 172 achetée pour 50,000  │
│  07/02/2026 08:15                          │
│────────────────────────────────────────────│
│                                            │
│  [Écrire un message...         ] [Envoyer] │
└────────────────────────────────────────────┘
```

#### Messages système auto-générés
En Solo (et Online), générer automatiquement des messages système quand :
- La company est créée
- Un avion company est acheté/vendu
- Un virement est effectué
- Un membre rejoint/quitte (Online)

Ces messages ont `is_system: true` et un style différent (fond plus sombre, texte gris italique).

#### Message épinglé
Le CEO peut épingler UN message (clic long ou bouton pin). Le message épinglé apparaît toujours en haut avec un fond spécial.

---

## Résumé des modifications par fichier

| Fichier | Modifications |
|---------|--------------|
| DatabaseManager.ts | Ajouter `role` à CompanyMember, modèle CompanyMessage, store `company_messages` dans PERSISTENT_STORES |
| LocalMarketService.ts | `transferToCompany()`, `transferFromCompany()`, `postCompanyMessage()`, `getCompanyMessages()`, `pinMessage()` |
| WorldOfAircraft.tsx | UI Company sous-onglets (Overview enrichi, Membres avec rôles, Historique, Messagerie) |
| MarketState.ts ou CompanyState.ts | States pour messagerie, transferts |
| en.json / fr.json | i18n clés company.*, roles.*, transfer.*, messaging.* |

## Contraintes
- `npm run build` → 0 errors, 0 warnings
- Pattern Coherent GT : inline styles uniquement, pas d'emoji (affiche carrés)
- Badges rôles : couleurs (or/bleu/vert/gris) pas emoji
- Montants en CR, formatés avec `toLocaleString()`
- Mode Solo : Messagerie = overlay "Disponible en mode Online"
- Mode Solo : Rôles visibles mais un seul membre (CEO)
- Mode Solo : Messages système auto-générés quand même (log d'activité)
- Refresh auto de chaque sous-onglet à l'ouverture
- Guards permissions appliqués sur TOUS les boutons concernés
