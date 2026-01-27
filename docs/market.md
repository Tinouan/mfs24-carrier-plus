# Market System (HV) - Documentation Technique

## Vue d'ensemble

L'Hôtel des Ventes (HV) est le système de marché global permettant aux joueurs d'acheter des ressources vendues par d'autres joueurs ou par les NPC (T0).

---

## Architecture

### Tables utilisées

Le marché utilise les tables **legacy** du système d'inventaire:

| Table | Usage |
|-------|-------|
| `game.inventory_locations` | Entrepôts des vendeurs |
| `game.inventory_items` | Items en vente (`for_sale=true`) |
| `game.items` | Référentiel des items (tier, icon, base_value) |
| `game.companies` | Vendeurs (NPC ou joueurs) |

### Champs clés pour la vente

Dans `inventory_items`:

| Colonne | Type | Description |
|---------|------|-------------|
| `for_sale` | BOOLEAN | Item en vente sur le marché |
| `sale_price` | DECIMAL | Prix unitaire de vente |
| `sale_qty` | INT | Quantité proposée à la vente |

---

## API Endpoints

### Liste globale du marché

```http
GET /api/inventory/market
```

**Query Parameters:**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `airport` | string | Filtrer par code ICAO (ex: LFPG) |
| `item_name` | string | Recherche partielle sur le nom |
| `tier` | int | Filtrer par tier (0-5) |
| `min_price` | float | Prix minimum |
| `max_price` | float | Prix maximum |
| `limit` | int | Pagination - max 500 (défaut: 100) |
| `offset` | int | Pagination - décalage |

**Réponse:**

```json
[
    {
        "location_id": "uuid",
        "airport_ident": "LFPG",
        "company_id": "uuid",
        "company_name": "World Resources",
        "item_id": "uuid",
        "item_code": "Raw Wheat",
        "item_name": "Raw Wheat",
        "item_tier": 0,
        "item_icon": "🌾",
        "sale_price": "8.00",
        "sale_qty": 1000
    }
]
```

### Statistiques du marché

```http
GET /api/inventory/market/stats
```

**Réponse:**

```json
{
    "total_listings": 51,
    "total_airports": 16,
    "total_items_for_sale": 50040,
    "total_value": "448620.00",
    "airports_with_listings": ["LFBD", "LFPG", "LFML", ...],
    "tier_distribution": {
        "T0": 51,
        "T1": 0,
        "T2": 0
    }
}
```

### Marché par aéroport (Legacy)

```http
GET /api/inventory/market/{airport_ident}
```

Retourne uniquement les annonces d'un aéroport spécifique.

### Acheter sur le marché

```http
POST /api/inventory/market/buy
```

**Body:**

```json
{
    "seller_location_id": "uuid",
    "item_code": "Steel Ingot",
    "qty": 100,
    "buyer_type": "company"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `seller_location_id` | UUID | Location du vendeur |
| `item_code` | string | Nom de l'item (ex: "Steel Ingot") |
| `qty` | int | Quantité à acheter |
| `buyer_type` | string | `"player"` (wallet perso) ou `"company"` (wallet company, défaut) |

**Validations:**
- Stock en vente suffisant (`sale_qty` ≥ qty demandé)
- Balance suffisante (wallet perso ou company selon `buyer_type`)
- Acheteur n'est pas le vendeur

**Actions automatiques:**
1. Déduction du stock vendeur (`sale_qty` diminué)
2. Création warehouse acheteur si inexistant (même aéroport)
3. Ajout à l'inventaire acheteur (company_warehouse ou player_warehouse selon `buyer_type`)
4. Transfert d'argent (wallet perso ou company)
5. Audits côté vendeur (market_sell) et acheteur (market_buy)

**Réponse:** L'inventaire mis à jour du buyer.

### Mes annonces en vente

```http
GET /api/inventory/my-listings
```

Retourne les items que je vends actuellement (pour affichage dans l'inventaire).

**Réponse:** Liste de `MarketListingOut`

### Annuler une vente (V0.8)

```http
POST /api/inventory/cancel-sale
```

**Body:**

```json
{
    "location_id": "uuid",
    "item_code": "Steel Ingot"
}
```

**Actions:**
1. Retourne les items au stock de l'inventaire
2. Retire l'annonce du marché
3. Audit (remove_from_sale)

---

## Schémas Pydantic

### MarketListingOut

```python
class MarketListingOut(BaseModel):
    location_id: UUID
    airport_ident: str
    company_id: UUID
    company_name: str
    item_id: UUID
    item_code: str
    item_name: str
    item_tier: int
    item_icon: str | None
    sale_price: Decimal
    sale_qty: int
```

### MarketStatsOut

```python
class MarketStatsOut(BaseModel):
    total_listings: int
    total_airports: int
    total_items_for_sale: int
    total_value: Decimal
    airports_with_listings: list[str]
    tier_distribution: dict[str, int]
```

---

## Frontend (Webmap)

### Vue Marché

Accessible via le menu latéral "Marché".

**Composants:**
- **Header** - Stats globales (annonces, aéroports, valeur totale) + **Wallets (V0.8)**
- **Filtres** - Recherche, aéroport, tier, prix max
- **Tier Chips** - Distribution visuelle par tier
- **Grille** - Cards des annonces avec icon, tier, prix, quantité
- **Pagination** - Navigation par pages de 50 items

### Affichage Wallets (V0.8)

Le header affiche les deux wallets disponibles:
- 👤 **Wallet Perso** - Solde personnel du joueur
- 🏢 **Wallet Company** - Solde de la company

Ces wallets sont également affichés dans la vue Inventaire.

### Modal d'achat (V0.8)

Affiche:
- Item (icon, nom, tier)
- Vendeur et aéroport
- Prix unitaire et quantité disponible
- Input quantité avec bouton MAX
- **Sélecteur wallet** (Perso/Company) - permet de choisir quel wallet utilise pour l'achat
- Total calculé dynamiquement
- Solde disponible du wallet sélectionné

---

## Flux de vente (V0.8)

```
1. Seller sélectionne un item dans son inventaire
2. Modal de vente s'ouvre
3. Seller définit prix et quantité
4. POST /inventory/set-for-sale
5. Backend:
   a. Déduit qty de l'inventaire normal (qty -= sale_qty)
   b. Crée l'annonce (for_sale=true, sale_qty, sale_price)
   c. Audit (set_for_sale)
6. Item apparaît dans le filtre "En Vente" et sur le marché
```

**Note V0.8:** Les items mis en vente sont **déduits** de l'inventaire normal et stockés séparément. Lors de l'annulation, ils sont retournés à l'inventaire.

---

## Flux d'achat

```
1. Buyer sélectionne une annonce
2. Modal d'achat s'ouvre
3. Buyer choisit la quantité et le wallet (perso/company)
4. POST /inventory/market/buy
5. Backend:
   a. Vérifie stock disponible (sale_qty)
   b. Vérifie solde buyer (wallet perso ou company)
   c. Déduit sale_qty du seller
   d. Ajoute qty au buyer (warehouse au même aéroport)
   e. Transfert d'argent buyer → seller
6. Frontend refresh
```

---

## NPC (T0) et marché

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
| ... | ... |

**Cycle de production T0:**
- Toutes les 5 minutes
- +50 items par cycle
- Stock max: 1000 items par produit
- Mise en vente automatique au prix de base

---

## Permissions

Pour acheter/vendre, les membres d'une company doivent avoir:

| Permission | Description |
|------------|-------------|
| `can_buy_market` | Acheter sur le marché |
| `can_sell_market` | Mettre en vente des items |

---

## Exemples d'utilisation

### Rechercher du blé pas cher

```bash
curl "http://localhost:8000/api/inventory/market?item_name=wheat&max_price=10"
```

### Voir les stats du marché

```bash
curl "http://localhost:8000/api/inventory/market/stats"
```

### Filtrer par tier T0 à Paris

```bash
curl "http://localhost:8000/api/inventory/market?airport=LFPG&tier=0"
```

---

## EFB Tablet (V0.8)

L'onglet Market est également disponible dans l'EFB in-game.

### Fonctionnalités EFB

| Élément | Description |
|---------|-------------|
| **Wallets Header** | Affiche solde perso + solde company |
| **Filtres Tier** | Boutons T0/T1/T2/T3 pour filtrer |
| **Liste offres** | Cards avec tier coloré, nom, prix, qty, vendeur |
| **Popup achat** | Slider quantité + choix wallet + total |

### Particularités Coherent GT

- Les listes sont rendues via **refs + innerHTML** (pas de `.map()` JSX)
- Les clicks sont gérés via **addEventListener** après le rendu
- Le total d'achat utilise un **Subject** reactif séparé

### État React (Subjects)

```typescript
// Données
private marketListings = Subject.create<MarketListing[]>([]);
private walletPersonal = Subject.create<number>(0);

// UI
private marketLoading = Subject.create<boolean>(false);
private marketTierFilter = Subject.create<number | null>(null);

// Popup achat
private showMarketBuyPopup = Subject.create<boolean>(false);
private marketBuyItem = Subject.create<MarketItem | null>(null);
private marketBuyQty = Subject.create<number>(1);
private marketBuyTotal = Subject.create<number>(0);
private marketBuyWallet = Subject.create<"player" | "company">("company");
```

### Flux d'achat EFB

```
1. User clique sur une offre
2. openMarketBuyPopup() - charge les infos item
3. User ajuste quantité via slider
4. updateMarketBuyQty() - met à jour total
5. User choisit wallet (perso/company)
6. confirmMarketBuy() - POST /inventory/market/buy
7. Refresh listings + ferme popup
```
