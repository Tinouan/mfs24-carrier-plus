# Factory System - Notes Importantes

## 🎯 État actuel: Phase 2B COMPLÉTÉE ✅

Le système d'usines est **fonctionnel et prêt** pour utilisation/test.

## Architecture du système

### Modèles de données

**6 tables principales:**
1. `game.factories` - Usines (company_id + airport_ident)
2. `game.workers` - Employés (factory_id, tier 0-5, XP)
3. `game.engineers` - Workers améliorés (factory_id, bonus 10-50%)
4. `game.factory_storage` - Stockage local usine
5. `game.production_batches` - Lots de production
6. `game.factory_transactions` - Audit (consumed/input/output)

**1 table world data:**
- `public.airports` - Avec `max_factory_slots` et `occupied_slots`

### Relations clés

```
Company (1) ─── (N) Factory
                     │
                     ├── (N) Workers
                     ├── (1) Engineer (max)
                     ├── (N) Factory Storage Items
                     └── (N) Production Batches

Airport (ident) ─── (N) Factory (airport_ident, no FK)
```

## Slots d'usines par aéroport

| Type d'aéroport | Max slots | Note |
|-----------------|-----------|------|
| Large (scheduled service) | 12 | LFPG, KJFK, etc. |
| Medium | 6 | Aéroports régionaux |
| Small | 3 | Petits aéroports |
| Heliport / Seaplane | 1 | Installations spéciales |
| Autres | 0 | Pas d'usines |

**Important:** Les usines T0 NPC (futures) ne comptent PAS dans ces limites.

## Limites système

- **10 workers max** par factory
- **1 engineer max** par factory
- **Pas de limite** sur le storage (à définir plus tard si besoin)
- **Pas de limite** sur les production batches (historique illimité)

## Engineers vs Workers

**Workers:**
- Plusieurs par factory (max 10)
- Système de tiers T0-T5 basé sur XP
- XP gagnée pendant production
- Peuvent voyager en avion (future phase)

**Engineers:**
- 1 seul par factory
- Bonus de production +10-50%
- Pas de système de tiers (juste experience)
- Peuvent voyager en avion (future phase)
- **Simplifiés:** Plus de contraintes de spécialisation ou d'aéroport

## Flow de production

```
1. Player crée factory à un aéroport (validation slots)
2. Player embauche workers (max 10)
3. Player embauche engineer optionnel (max 1)
4. Player dépose items: Warehouse → Factory Storage
5. Player démarre production:
   ├── Validation ingrédients suffisants
   ├── Validation workers disponibles
   ├── Détection bonus engineer
   └── Consommation immédiate des ingrédients
6. Production s'exécute (temps: recipe.production_time_hours)
7. Player récupère items: Factory Storage → Warehouse
8. Items dans warehouse peuvent être chargés dans avions (future)
```

## Flow d'inventaires

```
Factory Production → Factory Storage
                          ↓
                  [withdraw endpoint]
                          ↓
                  Company Warehouse (par aéroport)
                          ↓
                  [load aircraft - future]
                          ↓
                  Aircraft Cargo (in transit)
                          ↓
                  [unload aircraft - future]
                          ↓
                  Company Warehouse (destination)
```

## Endpoints implémentés (18)

### CRUD Factories (5)
- `GET /api/factories` - Liste
- `POST /api/factories` - Créer ✅ avec validation slots
- `GET /api/factories/{id}` - Détails
- `PATCH /api/factories/{id}` - Modifier
- `DELETE /api/factories/{id}` - Supprimer ✅ avec validations

### Production (3)
- `POST /api/factories/{id}/production` - Démarrer ✅ validation complète
- `GET /api/factories/{id}/production` - Liste batches
- `POST /api/factories/{id}/production/stop` - Arrêter

### Workers (3)
- `POST /api/factories/{id}/workers` - Embaucher ✅ limite 10
- `GET /api/factories/{id}/workers` - Liste
- `DELETE /api/factories/{id}/workers/{id}` - Licencier

### Engineers (3)
- `POST /api/engineers` - Embaucher ✅ limite 1 per factory
- `GET /api/engineers` - Liste
- `DELETE /api/engineers/{id}` - Licencier

### Storage (3)
- `GET /api/factories/{id}/storage` - Voir inventaire
- `POST /api/factories/{id}/storage/deposit` - Déposer ✅ validation warehouse
- `POST /api/factories/{id}/storage/withdraw` - Retirer ✅ auto-create warehouse

### Stats (1)
- `GET /api/factories/stats/overview` - Statistiques globales

## Validations implémentées

### create_factory
- ✅ Aéroport existe dans `public.airports`
- ✅ Aéroport supporte les usines (max_slots > 0)
- ✅ Slots disponibles (count < max_slots)
- ⏳ Coût construction (préparé, pas implémenté)

### delete_factory
- ✅ Pas de production active
- ✅ Storage doit être vide
- ✅ Workers libérés automatiquement
- ⏳ Remboursement partiel (préparé, pas implémenté)

### start_production
- ✅ Ingrédients suffisants en storage
- ✅ Workers assignés ≤ workers disponibles
- ✅ Détection bonus engineer (si présent)
- ✅ Consommation ingrédients
- ✅ Transactions loggées

### hire_worker
- ✅ Limite 10 workers par factory
- ⏳ Coût embauche (préparé, pas implémenté)

### hire_engineer
- ✅ 1 engineer max par factory
- ✅ Factory appartient à la company
- ⏳ Coût embauche (préparé, pas implémenté)

### deposit_to_storage
- ✅ Warehouse existe à l'aéroport
- ✅ Items disponibles en quantité suffisante
- ✅ Transfer warehouse → factory storage

### withdraw_from_storage
- ✅ Items disponibles en storage
- ✅ Warehouse créé automatiquement si nécessaire
- ✅ Transfer factory storage → warehouse

## Fonctionnalités à implémenter (futures phases)

### Phase immédiate (tests)
- [ ] Tests complets via Swagger UI
- [ ] Import data OurAirports dans `public.airports`
- [ ] Validation du flow complet

### Phase court terme (ajouts backend)
- [ ] Système de temps réel pour production batches
  - Completion automatique après production_time_hours
  - Worker XP gain automatique
  - Items ajoutés au storage automatiquement
- [ ] Worker tier auto-update trigger (basé sur XP)
- [ ] Factory type auto-detection trigger (basé sur recipes)
- [ ] Système de coûts
  - Construction factory
  - Embauche workers/engineers
  - Maintenance usines

### Phase moyen terme (Aircraft System)
- [ ] Aircraft cargo management
- [ ] Load/unload items (parking, moteurs éteints)
- [ ] Passenger transport (workers/engineers)
- [ ] Flight tracking
- [ ] in_transit status pour items/personnel

### Phase long terme
- [ ] NPC T0 factories
- [ ] Advanced mechanics (upgrades, maintenance, breakdown)
- [ ] Economic simulation & balancing
- [ ] Missions intégrant factories
- [ ] Real-time updates (WebSockets)

## Fichiers importants

### SQL
- `sql/create_airports_table.sql` - Table airports avec slots
- `sql/calculate_airport_slots.sql` - Trigger auto-calcul slots
- `sql/migrate_engineers_to_factory.sql` - Migration engineer model
- `sql/v0_5_factories_phase2.sql` - Tables factory system

### Modèles Python
- `game-api/app/models/airport.py` - Modèle Airport
- `game-api/app/models/factory.py` - Modèle Factory
- `game-api/app/models/worker.py` - Modèle Worker
- `game-api/app/models/engineer.py` - Modèle Engineer (corrigé)
- `game-api/app/models/factory_storage.py` - Stockage
- `game-api/app/models/production_batch.py` - Batches
- `game-api/app/models/factory_transaction.py` - Transactions

### Routers & Schemas
- `game-api/app/routers/factories.py` - 18 endpoints (800+ lignes)
- `game-api/app/schemas/factories.py` - Schémas Pydantic

### Documentation
- `ARCHITECTURE.md` - Architecture complète du projet
- `FACTORY_SYSTEM_TEST_GUIDE.md` - Guide de test complet
- `SESSION_2026-01-21.md` - Résumé de la session

## Commandes Docker utiles

```bash
# Status containers
docker ps

# Logs API
docker logs msfs_game_api -f

# Restart API
docker restart msfs_game_api

# SQL dans DB
docker exec -i msfs_db psql -U msfs -d msfs

# Exemple: compter factories
docker exec msfs_db psql -U msfs -d msfs -c "SELECT COUNT(*) FROM game.factories WHERE is_active = true;"
```

## Points de vigilance

### 1. Airport data
La table `public.airports` doit contenir des données.
Si vide, aucune factory ne peut être créée.

**Solution:** Importer OurAirports CSV via Directus ou SQL.

### 2. Company warehouse
Pour déposer items dans factory storage, il faut d'abord:
1. Avoir un warehouse à l'aéroport
2. Avoir des items dans ce warehouse

**Solution:** Créer warehouse via SQL ou laisser withdraw le créer automatiquement.

### 3. Production batches
Actuellement, les batches ne se complètent pas automatiquement.
Le système de temps réel n'est pas implémenté.

**Solution future:** Background job ou WebSocket pour complétion automatique.

### 4. Factory type
Le champ `factory_type` n'est pas auto-rempli par trigger.

**Solution future:** Trigger PostgreSQL basé sur `current_recipe_id`.

### 5. Worker XP et tiers
Les workers ne gagnent pas automatiquement d'XP pendant production.
Le tier n'est pas mis à jour automatiquement.

**Solution future:** Trigger ou background job pour XP/tier updates.

## Sécurité et permissions

**Actuellement implémenté:**
- ✅ JWT authentication sur tous les endpoints
- ✅ Validation company ownership (via _get_my_company)
- ✅ Validation factory ownership (via _get_factory_or_404)
- ✅ Soft deletes (is_active = false)

**À considérer:**
- Rate limiting (protection contre spam)
- Input sanitization (déjà géré par Pydantic)
- Audit logs plus détaillés
- Permissions par rôle (admin/member)

## Performance

**Requêtes optimisées:**
- Index sur factory_id, company_id, airport_ident
- Eager loading minimal (pas de N+1 queries)
- COUNT() queries efficaces avec indexes

**À optimiser si besoin:**
- Cache pour world data (items, recipes)
- Pagination sur liste factories si > 100
- Batch operations pour mass updates

## Conclusion

Le Factory System Phase 2B est **100% fonctionnel** et prêt pour:
1. Tests utilisateur via Swagger UI
2. Intégration frontend (tablette MSFS)
3. Expansion vers Aircraft System (Phase 0.6)

**Prochaine étape logique:** Import airports data et tests end-to-end.
