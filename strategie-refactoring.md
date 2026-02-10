# Stratégie Refactoring — WorldOfAircraft.tsx

**Date** : 9 février 2026
**Problème** : Fichier principal à 7922 lignes, ~118 méthodes — God Object
**Objectif** : Ramener WorldOfAircraft.tsx à ~1500 lignes max (orchestrateur + render)

---

## Architecture cible

```
WorldOfAircraft.tsx (~1500 lignes)
  │  = Orchestrateur : init, render, routing entre controllers
  │
  ├── controllers/          ← NOUVEAU : logique métier par domaine
  │   ├── MarketController.ts      (~800 lignes)
  │   ├── ContractController.ts    (~400 lignes)
  │   ├── CompanyController.ts     (~600 lignes)
  │   ├── HangarController.ts      (~800 lignes)
  │   ├── MissionController.ts     (~700 lignes)
  │   ├── MapController.ts         (~500 lignes)
  │   └── ProfileController.ts     (~400 lignes)
  │
  ├── views/                ← Existe déjà : rendu JSX par onglet
  │   ├── MarketView.tsx
  │   ├── CompanyView.tsx
  │   ├── ContractView.tsx
  │   ├── HangarView.tsx
  │   ├── MissionView.tsx
  │   └── ProfileView.tsx
  │
  ├── helpers/              ← Existe déjà : fonctions de rendu DOM
  ├── managers/             ← Existe déjà : tracking, persistence
  ├── services/             ← Existe déjà : LocalXxxService, Routers
  ├── state/                ← Existe déjà : states réactifs
  └── types/                ← Existe déjà
```

### Principe d'un Controller

Chaque controller regroupe :
- Les refs DOM de son domaine
- Les méthodes fetch/handle/action de son domaine
- L'accès aux Routers et States

```typescript
// Exemple : controllers/MarketController.ts
import { MarketRouter } from "../services";
import { marketState, profileState } from "../state";
import { DatabaseManager } from "../managers/DatabaseManager";

export class MarketController {
  // Refs
  private marketListingsRef: FSComponent.Ref<HTMLDivElement>;
  // ...

  constructor(refs: MarketRefs, translate: TranslateFunc) {
    this.marketListingsRef = refs.listings;
    this.t = translate;
  }

  async fetchMarketData(): Promise<void> { /* ... */ }
  async fetchMySellOrders(): Promise<void> { /* ... */ }
  async cancelSellOrder(orderId: string): Promise<void> { /* ... */ }
  async fetchAircraftCatalog(): Promise<void> { /* ... */ }
  async purchaseAircraft(id: string, owner: string): Promise<void> { /* ... */ }
  async sellAircraft(id: string): Promise<void> { /* ... */ }
  async fetchMarketInventory(): Promise<void> { /* ... */ }
  async fetchWallets(): Promise<void> { /* ... */ }
}
```

WorldOfAircraft.tsx instancie les controllers et délègue :
```typescript
class WorldOfAircraft extends App {
  private marketController: MarketController;
  private contractController: ContractController;
  // ...

  onInstall() {
    this.marketController = new MarketController(refs, this.t);
    this.contractController = new ContractController(refs, this.t);
  }

  // Le render() appelle les views qui appellent les controllers
}
```

---

## Plan d'extraction progressif

### Refactor 6.0 — Avant Phase 6 Social (maintenant)
```
Extraire : ContractController (~400 lignes)
  - fetchAvailableContracts, fetchActiveContracts, fetchCompletedContracts
  - acceptContract, completeContract, cancelContract
  - Toutes les refs contrats
Raison : contrats = code le plus récent, le plus propre, facile à extraire
Gain : WorldOfAircraft.tsx passe de 7900 à ~7500 lignes
```

### Refactor 6.1 — Avec Phase 6 Social
```
Extraire : CompanyController (~600 lignes)
  - fetchCompanyData, handleTransfer, fetchCompanyHistory
  - fetchCompanyMessages, handleSendCompanyMessage, handlePinMessage
  - handleBuyCompany, toutes les refs company
Raison : company + social = même domaine, on extrait ensemble
Gain : ~6900 lignes
```

### Refactor 7.0 — Avec Phase 7 Transferts Map
```
Extraire : MapController (~500 lignes)
  - fetchAirportsForMap, fetchHelipadsForMap
  - handleMapClick, fetchNearbyAirports
  - Toute la logique OpenLayers
  - + logique transferts (nouvelle)
Raison : la map va grossir avec les transferts, autant extraire
Gain : ~6400 lignes
```

### Refactor 8.0 — Avant Phase 8 Debug
```
Extraire : MarketController (~1500 lignes) ← le plus gros bloc
  - fetchMarketData, fetchMySellOrders, cancelSellOrder
  - fetchAircraftCatalog, purchaseAircraft, sellAircraft
  - fetchMarketInventory, fetchWallets
  - Toute la logique sell popups, buy popups
  - fetchProfileInventory, fetchCompanyInventory
Gain : ~4900 lignes
```

### Refactor 9.0 — Avant Phase 9 Usines
```
Extraire : HangarController (~800 lignes)
  - fetchHangarAircraftList, fetchAircraftDetails
  - fetchAircraftSystems, fetchHangarCargo
  - refuelHangarAircraft, repair logic
Extraire : MissionController (~700 lignes)
  - createMissionV11, completeMissionV1
  - fetchActiveMission, cancelMission
  - loadCargoItem, flight tracking
Gain : ~3400 lignes
```

### Résultat final
```
WorldOfAircraft.tsx : ~1500 lignes
  - Init, render, routing, event wiring
  - Instanciation des 7 controllers
  - Pas de logique métier directe
```

---

## Règles de refactoring

1. **Un controller par prompt** — jamais tout d'un coup
2. **Tests après chaque extraction** — build + test in-game
3. **Les Views existantes ne changent pas** — elles appellent les controllers au lieu du fichier principal
4. **Les States ne changent pas** — les controllers lisent/écrivent les mêmes states
5. **Les Services ne changent pas** — les controllers appellent les mêmes Routers

---

## Timeline intégrée

```
Phase 6  : Social + Messagerie    + Refactor 6.0 (ContractCtrl) + 6.1 (CompanyCtrl)
Phase 7  : Transferts Map         + Refactor 7.0 (MapCtrl)
Phase 8  : Debug & Validation     + Refactor 8.0 (MarketCtrl)
Phase 9  : Usines                 + Refactor 9.0 (HangarCtrl + MissionCtrl)
Phase 10 : Kits conversion        (pas de refactor, code ajouté dans HangarCtrl)
Phase 11 : Vols IA                (nouveau controller AIFlightCtrl)
Phase 12 : Certifications         (nouveau controller CertificationCtrl)
```

---

## Pourquoi progressif et pas tout d'un coup ?

| Tout d'un coup | Progressif |
|----------------|------------|
| 2-3 jours de refactor pur sans feature | 30 min de refactor par phase |
| Risque élevé de casser tout | Risque limité à un domaine |
| Motivation en baisse (pas de feature visible) | Chaque phase avance le jeu ET nettoie |
| Un seul gros test à la fin | Test après chaque extraction |
| Conflits Git massifs | Petits commits propres |
