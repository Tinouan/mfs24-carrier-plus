# Market System (HV) - Documentation Technique

> **Version**: V0.9 (Architecture P2P)

## Vue d'ensemble

L'Hôtel des Ventes (HV) est le système de marché global permettant aux joueurs d'acheter des ressources:
- **Mode Solo**: Ordres générés automatiquement par `AIEconomyService`
- **Mode Multi**: Ordres des autres joueurs synchronisés via P2P

**Architecture P2P**: Les données sont stockées localement en SQLite et synchronisées avec les autres joueurs via le NetworkManager.

---

## Tables SQLite

### `market_orders`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `type` | TEXT | 'sell' ou 'buy' |
| `item_id` | TEXT | FK → items |
| `quantity` | INTEGER | Quantité proposée |
| `price_per_unit` | REAL | Prix unitaire |
| `airport_ident` | TEXT | Code ICAO |
| `seller_id` | TEXT | FK → player ou 'AI' |
| `seller_type` | TEXT | 'player', 'company', 'ai' |
| `is_active` | INTEGER | Ordre actif (0/1) |
| `created_at` | TEXT | Date création |
| `expires_at` | TEXT | Date expiration (optionnel) |

### Dans `company_inventory`

Les items en vente sont aussi stockés dans `company_inventory` avec:

| Colonne | Description |
|---------|-------------|
| `for_sale` | En vente (0/1) |
| `sale_price` | Prix unitaire |
| `sale_qty` | Quantité en vente |

---

## Modes de fonctionnement

### Mode Solo (AIEconomyService)

En mode solo, `AIEconomyService` génère automatiquement des ordres de marché pour simuler une économie vivante:

```typescript
// services/AIEconomyService.ts

class AIEconomyServiceClass {
  private lastPriceUpdate = 0;
  private lastOrderGeneration = 0;

  /**
   * Appelé périodiquement (tick du scheduler)
   */
  tick(simTimeSeconds: number): void {
    // Mise à jour des prix toutes les 10 minutes sim
    if (simTimeSeconds - this.lastPriceUpdate > 600) {
      this.updatePrices();
      this.lastPriceUpdate = simTimeSeconds;
    }

    // Génération d'ordres IA toutes les 30 minutes sim
    if (simTimeSeconds - this.lastOrderGeneration > 1800) {
      this.generateAIOrders();
      this.lastOrderGeneration = simTimeSeconds;
    }
  }

  private updatePrices(): void {
    // Fluctuation ±5% sur les prix de base
    const items = DatabaseManager.query('SELECT * FROM items');
    for (const item of items) {
      const change = (Math.random() - 0.5) * 0.1;
      const newPrice = item.base_price * (1 + change);
      DatabaseManager.run(
        'UPDATE items SET current_price = ? WHERE id = ?',
        [newPrice, item.id]
      );
    }
  }

  private generateAIOrders(): void {
    // Supprimer vieux ordres IA
    DatabaseManager.run("DELETE FROM market_orders WHERE seller_id = 'AI'");

    // Générer nouveaux ordres pour items T0-T1
    const items = DatabaseManager.query(
      'SELECT * FROM items WHERE tier <= 1'
    );
    const airports = ['LFPG', 'LFPO', 'LFBO', 'LFML', 'LFSB', 'LFLL'];

    for (const item of items) {
      if (Math.random() > 0.5) continue; // 50% chance

      const airport = airports[Math.floor(Math.random() * airports.length)];
      const quantity = Math.floor(Math.random() * 50) + 10;
      const price = item.base_price * (0.9 + Math.random() * 0.2);

      DatabaseManager.run(
        `INSERT INTO market_orders
         (id, type, item_id, quantity, price_per_unit, airport_ident, seller_id, seller_type, is_active)
         VALUES (?, 'sell', ?, ?, ?, ?, 'AI', 'ai', 1)`,
        [generateUUID(), item.id, quantity, price, airport]
      );
    }
  }
}
```

### Mode Multi (P2P Sync)

En mode multi, les ordres de marché sont synchronisés entre tous les joueurs connectés:

```typescript
// NetworkManager reçoit les ordres des autres joueurs
NetworkManager.onSync((data) => {
  if (data.market_orders) {
    // Merger les ordres reçus avec les ordres locaux
    for (const order of data.market_orders) {
      if (order.seller_id !== currentPlayerId) {
        DatabaseManager.upsertMarketOrder(order);
      }
    }
    // Refresh le state
    marketState.listings.set(await MarketService.getListings());
  }
});
```

---

## Services TypeScript

### MarketService

```typescript
// services/MarketService.ts

class MarketServiceClass {
  // Liste globale du marché
  async getListings(filters?: {
    airport?: string;
    item_name?: string;
    tier?: number;
    min_price?: number;
    max_price?: number;
  }): Promise<MarketListing[]>;

  // Statistiques du marché
  async getStats(): Promise<MarketStats>;

  // Mes annonces en vente
  async getMyListings(): Promise<MarketListing[]>;

  // Acheter sur le marché
  async buy(params: {
    order_id: string;
    qty: number;
    buyer_type: 'player' | 'company';
  }): Promise<void>;

  // Mettre en vente (via InventoryService)
  async setForSale(params: SetForSaleParams): Promise<void>;

  // Annuler vente
  async cancelSale(orderId: string): Promise<void>;
}
```

### DataLayer (Abstraction)

```typescript
// En mode solo → SQLite local + AIEconomyService
DataLayer.setLocalMode();

// En mode multi → SQLite local + sync P2P
DataLayer.setNetworkMode({ host: '192.168.1.10', port: 7777 });

// Les services utilisent DataLayer
const listings = await DataLayer.getMarketListings(filters);
```

---

## Flux d'achat

```typescript
// MarketService.buy()
async buy(params: BuyParams): Promise<void> {
  const order = await this.getOrder(params.order_id);
  const buyer = params.buyer_type === 'player'
    ? await DatabaseManager.getPlayer()
    : await DatabaseManager.getCompany();

  // 1. Vérifier stock disponible
  if (order.quantity < params.qty) {
    throw new Error("Insufficient stock");
  }

  // 2. Calculer le total
  const total = order.price_per_unit * params.qty;

  // 3. Vérifier solde acheteur
  const balance = params.buyer_type === 'player'
    ? buyer.money
    : buyer.balance;
  if (balance < total) {
    throw new Error("Insufficient funds");
  }

  // 4. Déduire du vendeur
  order.quantity -= params.qty;
  if (order.quantity === 0) {
    order.is_active = false;
  }
  await DatabaseManager.saveMarketOrder(order);

  // 5. Ajouter à l'inventaire acheteur
  const inventoryType = params.buyer_type === 'player'
    ? 'player_inventory'
    : 'company_inventory';
  await InventoryService.addItem(
    inventoryType,
    order.item_id,
    params.qty,
    order.airport_ident
  );

  // 6. Transfert d'argent
  if (params.buyer_type === 'player') {
    buyer.money -= total;
    await DatabaseManager.savePlayer(buyer);
  } else {
    buyer.balance -= total;
    await DatabaseManager.saveCompany(buyer);
  }

  // 7. Créditer le vendeur (si pas IA)
  if (order.seller_type !== 'ai') {
    await this.creditSeller(order.seller_id, order.seller_type, total);
  }

  // 8. Sync P2P si connecté
  if (NetworkManager.isConnected()) {
    NetworkManager.broadcast({ market_update: order });
  }
}
```

---

## Flux de vente

```
1. Joueur sélectionne un item dans son inventaire
2. Modal de vente s'ouvre
3. Joueur définit prix et quantité
4. InventoryService.setForSale()
5. Actions:
   a. Déduit qty de l'inventaire normal (qty -= sale_qty)
   b. Crée l'annonce (for_sale=true, sale_qty, sale_price)
6. Item apparaît dans le filtre "En Vente" et sur le marché
7. Sync P2P si connecté
```

---

## Prix de base NPC (T0)

Les factories T0 (NPC) produisent automatiquement et mettent en vente:

| Produit | Prix de base |
|---------|-------------|
| Raw Wheat | 8$ |
| Raw Meat | 12$ |
| Raw Milk | 10$ |
| Raw Fish | 15$ |
| Crude Oil | 25$ |
| Iron Ore | 18$ |
| Coal | 10$ |
| Raw Wood | 6$ |
| Raw Vegetables | 8$ |
| Raw Fruits | 10$ |
| Natural Gas | 20$ |
| Raw Stone | 5$ |

**Fluctuation des prix:**
- ±5% toutes les 10 minutes (temps simulateur)
- Basé sur offre/demande (futur)

---

## Interface EFB

### Vue Marché

| Élément | Description |
|---------|-------------|
| **Wallets Header** | Affiche solde perso + solde company |
| **Filtres Tier** | Boutons T0/T1/T2/T3 pour filtrer |
| **Liste offres** | Cards avec tier coloré, nom, prix, qty, vendeur |
| **Popup achat** | Slider quantité + choix wallet + total |

### Structure UI

```
┌─────────────────────────────────────────────────────┐
│ 🏪 MARCHÉ              👤 5,000$ | 🏢 25,000$       │
│ 51 annonces | 16 aéroports                          │
├─────────────────────────────────────────────────────┤
│ 🔍 Rechercher...           [T0][T1][T2][T3]         │
├─────────────────────────────────────────────────────┤
│ ┌────────────────┐ ┌────────────────┐               │
│ │ 🌾 Raw Wheat   │ │ 🥩 Raw Meat    │               │
│ │ T0 | 8.50$/u   │ │ T0 | 12.20$/u  │               │
│ │ x100 @ LFPG    │ │ x50 @ LFML     │               │
│ │ [ACHETER]      │ │ [ACHETER]      │               │
│ └────────────────┘ └────────────────┘               │
└─────────────────────────────────────────────────────┘
```

### Modal d'achat

```
┌─────────────────────────────────────────────────────┐
│ Acheter: 🌾 Raw Wheat                               │
├─────────────────────────────────────────────────────┤
│ Prix unitaire: 8.50$                                │
│ Quantité disponible: 100                            │
│                                                     │
│ Quantité: [====○======] 50                          │
│                                                     │
│ Payer avec:                                         │
│ [● Wallet Perso (5,000$)]                          │
│ [○ Wallet Company (25,000$)]                       │
│                                                     │
│ Total: 425.00$                                      │
│                                                     │
│           [Annuler]  [Confirmer]                    │
└─────────────────────────────────────────────────────┘
```

---

## Sync P2P

### Données synchronisées

| Donnée | Direction | Fréquence |
|--------|-----------|-----------|
| Ordres de marché | Bidirectionnel | 5 sec |
| Achats/Ventes | Immédiat | Event-driven |
| Prix actuels | Bidirectionnel | 10 min |

### Monde partagé

En mode multi, tous les joueurs voient le **même marché**:
- Les ordres de vente sont visibles par tous
- Les achats sont instantanément reflétés
- L'économie est partagée entre tous les joueurs

### Conflits d'achat

Si deux joueurs tentent d'acheter le même item:
1. Le premier arrivé est servi
2. Le second reçoit une erreur "Stock insuffisant"
3. Le state est rafraîchi automatiquement

---

## Scheduler Jobs (Local)

| Job | Intervalle | Description |
|-----|------------|-------------|
| `ai_price_update` | 10 min | Mise à jour prix AIEconomyService |
| `ai_order_generation` | 30 min | Génération ordres IA (mode solo) |
| `expired_orders_cleanup` | 1 heure | Supprime ordres expirés |

---

## États React (Subjects)

```typescript
// Dans MarketState.ts
export const marketState = {
  // Données
  listings: Subject.create<MarketListing[]>([]),
  myListings: Subject.create<MarketListing[]>([]),

  // UI
  loading: Subject.create<boolean>(false),
  tierFilter: Subject.create<number | null>(null),
  searchQuery: Subject.create<string>(''),

  // Popup achat
  showBuyPopup: Subject.create<boolean>(false),
  buyItem: Subject.create<MarketListing | null>(null),
  buyQty: Subject.create<number>(1),
  buyWallet: Subject.create<'player' | 'company'>('company'),
};
```

---

## Évolutions futures

- [ ] Ordres d'achat (buy orders)
- [ ] Historique des prix
- [ ] Enchères / prix dynamiques offre/demande
- [ ] Notifications de vente
- [ ] Favoris / watchlist
