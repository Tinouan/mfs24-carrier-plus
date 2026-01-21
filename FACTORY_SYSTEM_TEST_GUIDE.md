# Factory System - Guide de Test Complet

Ce guide permet de tester l'ensemble du système d'usines de bout en bout.

## Prérequis

1. **API en cours d'exécution**
```bash
docker ps | grep msfs_game_api
```

2. **Accès Swagger UI**
```
http://localhost:8080/api/docs
```

3. **Compte utilisateur et company créés**

## Flow de test complet

### 1. Authentification

**Endpoint:** `POST /auth/register` ou `POST /auth/login`

```json
{
  "email": "test@example.com",
  "password": "test123"
}
```

Récupérer le JWT token et l'utiliser pour tous les appels suivants (bouton "Authorize" dans Swagger).

### 2. Créer une company

**Endpoint:** `POST /company`

```json
{
  "name": "Test Transport Co",
  "home_airport_ident": "LFPG"
}
```

### 3. Vérifier les items disponibles

**Endpoint:** `GET /world/items?tier=0`

Récupérer quelques `item_id` pour les tests (ex: Iron Ore, Coal, etc.)

### 4. Vérifier les recettes disponibles

**Endpoint:** `GET /world/recipes?tier=1`

Récupérer un `recipe_id` et noter les ingrédients nécessaires.

Exemple de recette T1:
```json
{
  "id": "uuid-here",
  "name": "Iron Ingot",
  "tier": 1,
  "production_time_hours": 2,
  "ingredients": [
    {"item_id": "iron-ore-id", "quantity": 3},
    {"item_id": "coal-id", "quantity": 1}
  ]
}
```

### 5. Créer une usine

**Endpoint:** `POST /api/factories`

```json
{
  "airport_ident": "LFPG",
  "name": "Iron Processing Plant"
}
```

**Vérifications automatiques:**
- ✅ Aéroport existe
- ✅ Slots disponibles (LFPG = large airport = 12 slots)
- ✅ Company propriétaire

**Réponse attendue:** Factory créée avec `status: "idle"`

### 6. Ajouter des items au warehouse

Pour tester, il faut d'abord avoir des items dans le warehouse de l'aéroport.

**Option A - Via SQL (pour test):**
```sql
-- Créer warehouse si nécessaire
INSERT INTO game.inventory_locations (company_id, kind, airport_ident, name)
VALUES ('your-company-id', 'warehouse', 'LFPG', 'Warehouse @ LFPG')
ON CONFLICT DO NOTHING;

-- Ajouter items
INSERT INTO game.inventory_items (location_id, item_id, qty)
SELECT
  (SELECT id FROM game.inventory_locations WHERE company_id = 'your-company-id' AND airport_ident = 'LFPG' LIMIT 1),
  'iron-ore-item-id',
  100
ON CONFLICT (location_id, item_id) DO UPDATE SET qty = inventory_items.qty + 100;
```

### 7. Déposer items dans le factory storage

**Endpoint:** `POST /api/factories/{factory_id}/storage/deposit`

```json
{
  "item_id": "iron-ore-item-id",
  "quantity": 10
}
```

Répéter pour chaque ingrédient nécessaire à la recette.

**Vérifications automatiques:**
- ✅ Items disponibles dans warehouse
- ✅ Transfer warehouse → factory storage
- ✅ Transaction loggée

### 8. Vérifier le storage de l'usine

**Endpoint:** `GET /api/factories/{factory_id}/storage`

**Réponse attendue:**
```json
{
  "factory_id": "uuid",
  "items": [
    {
      "item_id": "iron-ore-id",
      "item_name": "Iron Ore",
      "item_icon": "iron_ore.png",
      "quantity": 10
    },
    {
      "item_id": "coal-id",
      "item_name": "Coal",
      "item_icon": "coal.png",
      "quantity": 5
    }
  ]
}
```

### 9. Embaucher des workers

**Endpoint:** `POST /api/factories/{factory_id}/workers`

```json
{
  "first_name": "Jean",
  "last_name": "Dupont"
}
```

Embaucher 2-3 workers.

**Vérifications automatiques:**
- ✅ Limite 10 workers max par factory

### 10. Lister les workers

**Endpoint:** `GET /api/factories/{factory_id}/workers`

**Réponse attendue:**
```json
[
  {
    "id": "uuid",
    "factory_id": "factory-uuid",
    "first_name": "Jean",
    "last_name": "Dupont",
    "tier": 0,
    "health": 100,
    "happiness": 80,
    "xp": 0,
    "is_active": true,
    "created_at": "2026-01-21T..."
  }
]
```

### 11. (Optionnel) Embaucher un engineer

**Endpoint:** `POST /api/engineers`

```json
{
  "factory_id": "factory-uuid",
  "name": "Marie Curie",
  "specialization": "metal_smelting"
}
```

**Vérifications automatiques:**
- ✅ 1 engineer max par factory
- ✅ Factory appartient à la company

### 12. Démarrer la production

**Endpoint:** `POST /api/factories/{factory_id}/production`

```json
{
  "recipe_id": "iron-ingot-recipe-id",
  "workers_assigned": 2
}
```

**Vérifications automatiques:**
- ✅ Ingrédients suffisants en storage
- ✅ Workers assignés ≤ workers disponibles
- ✅ Détection bonus engineer
- ✅ Consommation des ingrédients
- ✅ Factory status → "producing"

**Réponse attendue:**
```json
{
  "id": "batch-uuid",
  "factory_id": "factory-uuid",
  "recipe_id": "recipe-uuid",
  "status": "pending",
  "started_at": "2026-01-21T...",
  "estimated_completion": "2026-01-21T...",
  "result_quantity": 5,
  "workers_assigned": 2,
  "engineer_bonus_applied": true,
  "created_at": "2026-01-21T..."
}
```

### 13. Vérifier le storage après production

**Endpoint:** `GET /api/factories/{factory_id}/storage`

Les ingrédients devraient avoir été consommés.

### 14. Lister les batches de production

**Endpoint:** `GET /api/factories/{factory_id}/production`

**Réponse attendue:** Liste des batches avec statuts.

### 15. Arrêter la production (optionnel)

**Endpoint:** `POST /api/factories/{factory_id}/production/stop`

**Vérifications:**
- ✅ Factory status → "idle"
- ✅ Batch current → "cancelled"

### 16. Retirer des items du storage

**Endpoint:** `POST /api/factories/{factory_id}/storage/withdraw`

```json
{
  "item_id": "iron-ingot-id",
  "quantity": 3
}
```

**Vérifications automatiques:**
- ✅ Items disponibles en storage
- ✅ Transfer factory storage → warehouse
- ✅ Warehouse créé automatiquement si nécessaire

### 17. Statistiques globales

**Endpoint:** `GET /api/factories/stats/overview`

**Réponse attendue:**
```json
{
  "total_factories": 1,
  "idle_factories": 0,
  "producing_factories": 1,
  "paused_factories": 0,
  "broken_factories": 0,
  "total_workers": 3,
  "total_engineers": 1,
  "total_production_hours": 2
}
```

### 18. Tester la suppression d'usine

**Important:** Avant de supprimer:
1. Arrêter la production si active
2. Retirer tous les items du storage
3. Workers seront automatiquement libérés

**Endpoint:** `DELETE /api/factories/{factory_id}`

**Vérifications automatiques:**
- ✅ Pas de production active
- ✅ Storage vide
- ✅ Soft delete (is_active = false)

## Tests de validation

### Test des limites

**1. Slots d'usines:**
```bash
# Créer 13 factories à LFPG (large = 12 slots max)
# La 13ème doit échouer avec erreur "no available factory slots"
```

**2. Workers par factory:**
```bash
# Embaucher 11 workers dans une factory
# Le 11ème doit échouer avec erreur "maximum worker capacity"
```

**3. Engineer par factory:**
```bash
# Embaucher 2 engineers dans même factory
# Le 2ème doit échouer avec erreur "already has an engineer"
```

**4. Production sans ingrédients:**
```bash
# Démarrer production sans avoir déposé les ingrédients
# Doit échouer avec erreur "Insufficient {item_name} in storage"
```

**5. Production sans workers:**
```bash
# Assigner 5 workers alors que factory n'en a que 2
# Doit échouer avec erreur "Only 2 available"
```

### Test des flows d'erreur

**1. Aéroport inexistant:**
```json
POST /api/factories
{
  "airport_ident": "XXXX",
  "name": "Test"
}
```
Expected: `404 Airport XXXX not found`

**2. Aéroport sans slots:**
```json
POST /api/factories
{
  "airport_ident": "US-0001", // closed airport
  "name": "Test"
}
```
Expected: `400 does not support factories`

**3. Suppression avec production active:**
```bash
# Démarrer production puis supprimer factory
```
Expected: `400 Cannot delete factory with active production`

**4. Suppression avec items en storage:**
```bash
# Laisser items en storage puis supprimer
```
Expected: `400 Cannot delete factory with items in storage`

## Requêtes SQL utiles pour vérification

### Vérifier les factories
```sql
SELECT
  f.id,
  f.name,
  f.airport_ident,
  f.status,
  f.factory_type,
  c.name as company_name,
  COUNT(DISTINCT w.id) as worker_count,
  COUNT(DISTINCT e.id) as engineer_count
FROM game.factories f
JOIN game.companies c ON f.company_id = c.id
LEFT JOIN game.workers w ON w.factory_id = f.id AND w.is_active = true
LEFT JOIN game.engineers e ON e.factory_id = f.id AND e.is_active = true
WHERE f.is_active = true
GROUP BY f.id, c.name;
```

### Vérifier le storage
```sql
SELECT
  f.name as factory_name,
  i.name as item_name,
  i.tier,
  fs.quantity
FROM game.factory_storage fs
JOIN game.factories f ON fs.factory_id = f.id
JOIN game.items i ON fs.item_id = i.id
WHERE f.is_active = true
ORDER BY f.name, i.name;
```

### Vérifier les transactions
```sql
SELECT
  f.name as factory_name,
  i.name as item_name,
  ft.transaction_type,
  ft.quantity,
  ft.notes,
  ft.created_at
FROM game.factory_transactions ft
JOIN game.factories f ON ft.factory_id = f.id
JOIN game.items i ON ft.item_id = i.id
ORDER BY ft.created_at DESC
LIMIT 20;
```

### Vérifier les slots d'aéroports
```sql
SELECT
  a.ident,
  a.name,
  a.type,
  a.max_factory_slots,
  COUNT(f.id) as occupied_slots
FROM public.airports a
LEFT JOIN game.factories f ON f.airport_ident = a.ident AND f.is_active = true
WHERE a.max_factory_slots > 0
GROUP BY a.ident, a.name, a.type, a.max_factory_slots
HAVING COUNT(f.id) > 0
ORDER BY occupied_slots DESC
LIMIT 20;
```

## Checklist finale

- [ ] Authentification fonctionne
- [ ] Création company fonctionne
- [ ] Création factory avec validation aéroport
- [ ] Validation slots disponibles
- [ ] Dépôt items warehouse → factory storage
- [ ] Embauche workers (max 10)
- [ ] Embauche engineer (max 1 per factory)
- [ ] Démarrage production avec validations
- [ ] Consommation ingrédients au démarrage
- [ ] Détection bonus engineer
- [ ] Retrait items factory storage → warehouse
- [ ] Warehouse auto-création si nécessaire
- [ ] Arrêt production
- [ ] Statistiques globales
- [ ] Suppression factory avec validations
- [ ] Toutes les erreurs sont gérées proprement

## Notes importantes

1. **Pas de système de temps réel encore:**
   - `estimated_completion` est un placeholder
   - Les batches ne se complètent pas automatiquement
   - À implémenter dans une future phase

2. **Pas de coûts encore:**
   - Construction factory = gratuite
   - Embauche workers/engineers = gratuite
   - À implémenter quand système économique sera défini

3. **Workers XP et tier:**
   - Les workers commencent en T0
   - XP devrait augmenter pendant production
   - Trigger auto-update tier pas encore implémenté

4. **Factory type:**
   - Devrait être auto-détecté par trigger depuis les recettes
   - Pas encore implémenté

5. **T0 NPC factories:**
   - Système pas encore implémenté
   - Ne compteront pas dans les slots

## Troubleshooting

### Erreur "Airport not found"
- Vérifier que la table `public.airports` existe et contient des données
- Exécuter les scripts SQL de création airports

### Erreur "No warehouse found"
- Créer manuellement un warehouse via SQL (voir section 6)
- Ou utiliser l'endpoint withdraw qui crée automatiquement

### Erreur "Factory not found"
- Vérifier que la factory appartient bien à votre company
- Vérifier que `is_active = true`

### API ne répond pas
```bash
docker ps
docker logs msfs_game_api
docker restart msfs_game_api
```
