# Prochaine Session - Points de Reprise

**Date session précédente:** 2026-01-21
**Phase actuelle:** Factory System Phase 2B ✅ COMPLÉTÉE

## 🎉 Ce qui a été fait

### Factory System Phase 2B - 100% Complété

**Développement:**
- ✅ 18 endpoints factories implémentés avec validations complètes
- ✅ Airport model créé pour `public.airports`
- ✅ Système de slots d'usines par aéroport (12/6/3/1/0)
- ✅ Engineer model corrigé (factory-based au lieu de airport-based)
- ✅ Validations business sur tous les endpoints critiques
- ✅ Transfers inventory (warehouse ↔ factory storage)

**Documentation:**
- ✅ ARCHITECTURE.md mis à jour avec gameplay loop
- ✅ FACTORY_SYSTEM_TEST_GUIDE.md créé (guide complet)
- ✅ FACTORY_SYSTEM_NOTES.md créé (notes importantes)
- ✅ FACTORY_SYSTEM_TODO.md créé (roadmap future)
- ✅ SESSION_2026-01-21.md créé (résumé session)

**SQL:**
- ✅ Triggers PostgreSQL pour auto-calcul airport slots
- ✅ Migration engineer model (airport_ident → factory_id)
- ✅ Tables factories complètes

## 🚀 Prochaines étapes immédiates

### 1. Import Airports Data (PRIORITÉ 1)
**Status:** 🔴 BLOQUANT

Sans données d'aéroports, le système ne peut pas être testé.

**Actions:**
1. Télécharger `airports.csv` depuis [OurAirports](https://ourairports.com/data/)
2. Option A (recommandé): Import via Directus
   - Uploader CSV dans collection "airports"
   - Vérifier mapping colonnes
3. Option B: Import SQL direct
   - Convertir CSV en SQL INSERT
   - Exécuter via `docker exec`

**Vérification:**
```sql
SELECT COUNT(*) FROM public.airports;
-- Expected: ~28,000 rows

SELECT type, max_factory_slots, COUNT(*)
FROM public.airports
WHERE max_factory_slots > 0
GROUP BY type, max_factory_slots;
```

### 2. Tests End-to-End (PRIORITÉ 2)
**Status:** 🟡 EN ATTENTE

Suivre le guide `FACTORY_SYSTEM_TEST_GUIDE.md`:
1. Créer compte + company
2. Créer factory à un aéroport
3. Embaucher workers + engineer
4. Déposer items en storage
5. Démarrer production
6. Vérifier consommation ingrédients
7. Retirer items produits
8. Tester toutes les validations

**Résultat attendu:** Tous les endpoints fonctionnent sans erreur.

### 3. Configuration Production (PRIORITÉ 3)
**Status:** 🟡 TODO

Avant déploiement NAS:
- [ ] Retirer endpoint `/sql/execute` (ligne ~88 dans main.py)
- [ ] Vérifier logs configurés
- [ ] Tester sur NAS
- [ ] Backup database

## 🔧 Fonctionnalités à implémenter ensuite

### Court terme (1-2 semaines)

**Background Jobs - Production Completion:**
```python
# Option 1: APScheduler (simple, in-process)
from apscheduler.schedulers.background import BackgroundScheduler

def complete_production_batches():
    # Find batches where estimated_completion <= now
    # Set status = "completed"
    # Add result items to factory storage
    # Add XP to workers
    # Set factory status = "idle"

scheduler = BackgroundScheduler()
scheduler.add_job(complete_production_batches, 'interval', minutes=1)
scheduler.start()

# Option 2: Celery (scalable, separate worker)
# Mieux pour production mais plus complexe
```

**Triggers Database:**
```sql
-- 1. Worker tier auto-update (sur UPDATE xp)
-- 2. Factory type auto-detection (sur UPDATE current_recipe_id)
-- Voir FACTORY_SYSTEM_TODO.md pour SQL complet
```

### Moyen terme (3-4 semaines)

**Aircraft & Flight System (Phase 0.6):**
- Aircraft cargo management
- Load/unload items (parking, moteurs éteints)
- Passenger transport (workers/engineers)
- Flight tracking & status

**Priorité selon gameplay:**
1. Aircraft cargo (essentiel pour transport items)
2. Flight tracking (position avion)
3. Passenger transport (workers/engineers)

## 📚 Fichiers à consulter

### Documentation principale
- `ARCHITECTURE.md` - Vue d'ensemble complète
- `FACTORY_SYSTEM_TEST_GUIDE.md` - Tests step-by-step
- `FACTORY_SYSTEM_NOTES.md` - Points importants
- `FACTORY_SYSTEM_TODO.md` - Roadmap détaillée

### Code important
- `game-api/app/routers/factories.py` - 18 endpoints (800+ lignes)
- `game-api/app/models/` - Tous les modèles factory system
- `sql/` - Scripts SQL (airports, migrations)

### Résumé sessions
- `SESSION_2026-01-21.md` - Résumé session aujourd'hui

## 🎯 Objectifs selon priorité

### 🔴 CRITIQUE (bloquant)
1. Import airports data
2. Tests end-to-end basiques

### 🟠 HAUTE (important mais pas bloquant)
1. Background job production completion
2. Triggers database (tier, factory_type)
3. Tests automatisés (pytest)

### 🟡 MOYENNE (amélioration)
1. Economic system (costs)
2. Worker health/happiness degradation
3. Factory upgrades/maintenance

### 🟢 BASSE (futur)
1. Aircraft & Flight system
2. NPC T0 factories
3. Missions system
4. Real-time updates (WebSockets)

## 💡 Questions à considérer

### Design Decisions

**1. Background Jobs - Quelle solution?**
- APScheduler: Simple, in-process, bon pour dev/small scale
- Celery: Scalable, separate worker, mieux pour production
- **Recommandation:** Commencer APScheduler, migrer Celery si besoin

**2. Worker XP Gain - Quand?**
- À la fin de production (bulk)
- Progressivement pendant production (real-time)
- **Recommandation:** À la fin (plus simple)

**3. Production Time - Real ou Placeholder?**
- Real time (production prend réellement X heures)
- Accelerated (1h réelle = 1 jour game time)
- **Recommandation:** Real time pour commencer, ajuster selon gameplay

**4. Economic Balance - Comment tester?**
- Définir coûts factories/workers
- Calculer profitabilité moyenne production
- Équilibrer pour gameplay fun
- **Recommandation:** Commencer généreux, ajuster après tests

### Technical Decisions

**1. Tests - Quelle stratégie?**
```python
# Option A: Unit tests (rapide, isolé)
def test_create_factory_validates_airport():
    ...

# Option B: Integration tests (realistic)
def test_full_production_flow():
    # Create factory → hire workers → produce → withdraw
    ...

# Recommandation: Les deux, commencer integration
```

**2. Logging - Quel niveau?**
```python
# Dev: DEBUG (tout)
# Production: INFO (important events)
# Errors: toujours ERROR/CRITICAL

# Recommandation: INFO pour production
```

**3. Monitoring - Quels metrics?**
- Response times endpoints
- Database query performance
- Background job execution
- Error rates
- **Recommandation:** Commencer simple (logs), ajouter metrics après

## 🔗 Liens utiles

### Données
- [OurAirports Data](https://ourairports.com/data/) - CSV airports
- [MSFS SDK](https://docs.flightsimulator.com/) - Documentation MSFS

### Outils
- [Swagger UI](http://localhost:8080/api/docs) - Test API
- [Directus](http://localhost:8055) - CMS admin
- [DBeaver](https://dbeaver.io/) - Database client

### Ressources
- [FastAPI Docs](https://fastapi.tiangolo.com/) - Framework
- [SQLAlchemy ORM](https://docs.sqlalchemy.org/) - Database
- [Pydantic](https://docs.pydantic.dev/) - Validation

## ✨ Session suivante - Checklist

Avant de commencer:
- [ ] Lire `FACTORY_SYSTEM_NOTES.md` (refresh mémoire)
- [ ] Vérifier API running (`docker ps`)
- [ ] Vérifier airports data importées
- [ ] Préparer compte test + company

Pendant la session:
- [ ] Suivre `FACTORY_SYSTEM_TEST_GUIDE.md`
- [ ] Noter bugs/issues rencontrés
- [ ] Documenter décisions prises
- [ ] Mettre à jour NEXT_SESSION.md

Après la session:
- [ ] Commit + push code
- [ ] Mettre à jour SESSION_[DATE].md
- [ ] Mettre à jour ARCHITECTURE.md si changements
- [ ] Mettre à jour NEXT_SESSION.md pour session suivante

## 📞 Aide-mémoire rapide

### Commandes Docker
```bash
# Start all
docker compose up -d

# Restart API
docker restart msfs_game_api

# Logs API
docker logs msfs_game_api -f

# SQL
docker exec -i msfs_db psql -U msfs -d msfs
```

### Commandes SQL utiles
```sql
-- Compter factories
SELECT COUNT(*) FROM game.factories WHERE is_active = true;

-- Voir airports avec factories
SELECT a.ident, a.name, COUNT(f.id) as factories
FROM public.airports a
LEFT JOIN game.factories f ON f.airport_ident = a.ident AND f.is_active = true
GROUP BY a.ident, a.name
HAVING COUNT(f.id) > 0;

-- Voir production batches
SELECT f.name, r.name, pb.status, pb.workers_assigned
FROM game.production_batches pb
JOIN game.factories f ON pb.factory_id = f.id
JOIN game.recipes r ON pb.recipe_id = r.id
ORDER BY pb.created_at DESC
LIMIT 10;
```

### API Test rapide
```bash
# Health check
curl http://localhost:8080/api/health

# List items
curl http://localhost:8080/api/world/items?tier=0

# List recipes
curl http://localhost:8080/api/world/recipes?tier=1
```

---

**Bon courage pour la prochaine session! 🚀**
