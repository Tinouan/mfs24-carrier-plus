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
POST /api/inventory/market/{airport_ident}/buy
```

**Body:**

```json
{
    "seller_location_id": "uuid",
    "item_id": "uuid",
    "qty": 100
}
```

**Réponse:** L'inventaire mis à jour du buyer.

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
- **Header** - Stats globales (annonces, aéroports, valeur totale)
- **Filtres** - Recherche, aéroport, tier, prix max
- **Tier Chips** - Distribution visuelle par tier
- **Grille** - Cards des annonces avec icon, tier, prix, quantité
- **Pagination** - Navigation par pages de 50 items

### Modal d'achat

Affiche:
- Item (icon, nom, tier)
- Vendeur et aéroport
- Prix unitaire et quantité disponible
- Input quantité avec bouton MAX
- Total calculé dynamiquement

---

## Flux d'achat

```
1. Buyer sélectionne une annonce
2. Modal d'achat s'ouvre
3. Buyer choisit la quantité
4. POST /market/{airport}/buy
5. Backend:
   a. Vérifie stock disponible
   b. Vérifie solde buyer
   c. Déduit qty du seller (inventory_items)
   d. Ajoute qty au buyer (selon destination)
   e. Transfert d'argent seller → buyer
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
