# Factory System - TODO List

## 🎯 Phase actuelle: Phase 2B ✅ COMPLÉTÉE

Tous les endpoints sont implémentés avec validations business.

## 📋 TODO Immédiat (avant production)

### 1. Import Airports Data
**Priorité:** CRITIQUE
**Status:** 🔴 Bloquant

Sans données d'aéroports, aucune factory ne peut être créée.

**Actions:**
```bash
# Option A: Via Directus (recommandé)
1. Télécharger airports.csv depuis OurAirports
2. Importer via Directus UI dans collection "airports"
3. Exécuter trigger SQL pour calculer max_factory_slots

# Option B: Import SQL direct
1. Télécharger airports.csv
2. Convertir en INSERT statements
3. Exécuter sql/create_airports_table.sql
4. Import data
5. Trigger s'exécute automatiquement
```

**Vérification:**
```sql
SELECT COUNT(*) FROM public.airports;
-- Expected: ~28,000+ rows

SELECT type, max_factory_slots, COUNT(*)
FROM public.airports
GROUP BY type, max_factory_slots
ORDER BY max_factory_slots DESC;
-- Should show 12, 6, 3, 1, 0 slot categories
```

### 2. Tests End-to-End
**Priorité:** HAUTE
**Status:** 🟡 En attente

Suivre le guide `FACTORY_SYSTEM_TEST_GUIDE.md` et valider:
- [ ] Flow complet: création → production → retrait
- [ ] Toutes les validations fonctionnent
- [ ] Toutes les erreurs sont gérées proprement
- [ ] Pas de bugs critiques

### 3. Configuration Production
**Priorité:** HAUTE
**Status:** 🟡 En attente

Avant déploiement sur NAS:
- [ ] Retirer endpoint `/sql/execute` (DEV ONLY)
- [ ] Configurer logs production
- [ ] Configurer CORS si nécessaire
- [ ] Variables d'environnement NAS (.env)

## 🔧 TODO Fonctionnalités Manquantes

### Phase 2C: Automation & Background Jobs

#### 1. Production Batch Completion
**Status:** 🔴 Pas implémenté

**Problème actuel:**
Les batches restent en "pending" indéfiniment.
`estimated_completion` est un placeholder.

**Solution:**
```python
# Background job (APScheduler ou Celery)
def complete_production_batches():
    """
    Exécuté chaque minute:
    1. Trouver batches avec estimated_completion <= now
    2. Mettre status = "completed"
    3. Ajouter result items au factory storage
    4. Ajouter XP aux workers
    5. Factory status = "idle"
    """
```

**Impacts:**
- Workers gagnent XP automatiquement
- Items apparaissent en storage
- Factory devient disponible pour nouvelle production

#### 2. Worker Tier Auto-Update
**Status:** 🔴 Pas implémenté

**Problème actuel:**
Workers restent en T0 même après gagner XP.

**Solution:**
```sql
-- Trigger PostgreSQL ou Python function
CREATE OR REPLACE FUNCTION update_worker_tier()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.xp >= 2000 THEN NEW.tier := 5;
    ELSIF NEW.xp >= 1000 THEN NEW.tier := 4;
    ELSIF NEW.xp >= 500 THEN NEW.tier := 3;
    ELSIF NEW.xp >= 250 THEN NEW.tier := 2;
    ELSIF NEW.xp >= 100 THEN NEW.tier := 1;
    ELSE NEW.tier := 0;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER worker_tier_update
BEFORE UPDATE OF xp ON game.workers
FOR EACH ROW EXECUTE FUNCTION update_worker_tier();
```

#### 3. Factory Type Auto-Detection
**Status:** 🔴 Pas implémenté

**Problème actuel:**
`factory.factory_type` reste NULL même après assigner recette.

**Solution:**
```sql
-- Trigger sur factories.current_recipe_id
CREATE OR REPLACE FUNCTION update_factory_type()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_recipe_id IS NOT NULL THEN
        SELECT tags[1] INTO NEW.factory_type
        FROM game.recipes
        WHERE id = NEW.current_recipe_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER factory_type_update
BEFORE UPDATE OF current_recipe_id ON game.factories
FOR EACH ROW EXECUTE FUNCTION update_factory_type();
```

#### 4. Worker Health/Happiness Degradation
**Status:** 🔴 Pas implémenté

**Design:**
- Health: -5 par heure pendant production
- Happiness: dépend de conditions usine
- Workers avec health < 20 ne peuvent pas travailler
- Workers avec happiness < 30 produisent moins

**Solution future:**
Background job qui met à jour health/happiness périodiquement.

### Phase 2D: Economic System

#### 1. Factory Construction Costs
**Status:** 🟡 Préparé, pas implémenté

**À définir:**
```python
FACTORY_BASE_COST = 50000  # Exemple
# Facteurs:
# - Type d'aéroport (large = plus cher)
# - Nombre de factories existantes (scaling)
# - Emplacement géographique
```

**Impact code:**
```python
# Dans create_factory endpoint
if c.balance < FACTORY_BASE_COST:
    raise HTTPException(400, "Insufficient funds")
c.balance -= FACTORY_BASE_COST
# Log transaction
```

#### 2. Worker/Engineer Hiring Costs
**Status:** 🟡 Préparé, pas implémenté

**À définir:**
```python
WORKER_BASE_COST = 1000
ENGINEER_BASE_COST = 5000
# Facteurs:
# - Tier (workers T3+ plus chers)
# - Spécialisation (engineers spécialisés plus chers)
# - Localisation (grandes villes plus chères)
```

#### 3. Operating Costs
**Status:** 🔴 Pas conçu

**Coûts potentiels:**
- Maintenance usine (mensuel)
- Salaires workers/engineers (mensuel)
- Électricité/ressources (par production)
- Réparations si breakdown

### Phase 2E: Advanced Features

#### 1. Factory Upgrades
**Status:** 🔴 Pas conçu

**Idées:**
- Upgrade capacity (plus de storage)
- Upgrade speed (production plus rapide)
- Upgrade workers (max workers augmenté)
- Upgrade efficiency (moins d'inputs requis)

#### 2. Factory Maintenance
**Status:** 🔴 Pas conçu

**Système proposé:**
- Durabilité diminue avec usage
- Maintenance requise périodiquement
- Status "maintenance" empêche production
- Coût maintenance proportionnel à taille

#### 3. Factory Breakdown/Failure
**Status:** 🔴 Pas conçu

**Système proposé:**
- Chance de breakdown augmente si:
  - Durabilité faible
  - Maintenance négligée
  - Workers malheureux/fatigués
- Status "offline" = non fonctionnel
- Réparation coûte plus cher que maintenance

#### 4. Recipe Research/Unlock
**Status:** 🔴 Pas conçu

**Système proposé:**
- Toutes les recettes pas disponibles dès le début
- Research points via production
- Déblocage progressif T1 → T2 → T3
- Engineers accélèrent research

## 🚀 Phase 0.6: Aircraft & Flight System

### Integration avec Factory System

#### 1. Aircraft Cargo
**Priority:** HAUTE
**Status:** 🔴 À concevoir

**Besoins:**
- Table `game.aircraft_cargo` (aircraft_id, item_id, quantity)
- Load endpoint: Warehouse → Aircraft
- Unload endpoint: Aircraft → Warehouse
- Validation: avion au parking, moteurs éteints

**Design proposé:**
```python
@router.post("/aircraft/{aircraft_id}/cargo/load")
def load_cargo(
    aircraft_id: UUID,
    data: CargoLoadIn,  # {item_id, quantity}
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # 1. Verify aircraft belongs to company
    # 2. Verify aircraft at parking (not in flight)
    # 3. Verify engines off
    # 4. Verify warehouse has items
    # 5. Verify cargo capacity not exceeded
    # 6. Transfer: Warehouse → Aircraft cargo
    # 7. Log transaction
```

#### 2. Aircraft Passengers
**Priority:** MOYENNE
**Status:** 🔴 À concevoir

**Besoins:**
- Table `game.aircraft_passengers` (aircraft_id, worker_id?, engineer_id?)
- Embark endpoint: Worker/Engineer → Aircraft
- Disembark endpoint: Aircraft → Destination
- Workers/Engineers in_transit status

**Questions design:**
- Workers détachés de factory pendant vol?
- Limiter nombre passagers par aircraft?
- Coût transport passagers?

#### 3. Flight Tracking
**Priority:** HAUTE
**Status:** 🔴 À concevoir

**Besoins:**
- Table `game.flights` (aircraft_id, origin, destination, status, cargo_snapshot)
- Create flight endpoint
- Complete flight endpoint
- Position tracking (optional, complex)

**Statuses:**
- `planned` - Vol créé, pas encore décollé
- `boarding` - Chargement cargo/passagers en cours
- `departed` - En vol (cargo/passagers in_transit)
- `arrived` - Atterri, déchargement possible
- `completed` - Déchargement fait, vol terminé

## 🔮 Future Phases (Long terme)

### Phase 0.7: NPC T0 Factories
**Status:** 🔴 Concept

**Objectif:**
Usines de base (T0 components) gérées par NPC.
Fournissent matières premières pour économie.

**Caractéristiques:**
- Pas de workers/engineers requis
- Production automatique constante
- Prix fixes pour achat components T0
- Ne comptent PAS dans slots aéroports
- Distribuées stratégiquement sur la map

### Phase 0.8: Missions System
**Status:** 🔴 Concept

**Integration avec factories:**
- Missions de production (produire X items)
- Missions de transport (livrer items à destination)
- Missions de construction (construire usine à location)
- Récompenses: XP, argent, déblocage recettes

### Phase 0.9: Real-time Updates
**Status:** 🔴 Concept

**WebSocket events:**
- Production completed
- Worker XP gained
- Factory breakdown
- Engineer research completed
- Cargo loaded/unloaded

### Phase 1.0: Economic Simulation
**Status:** 🔴 Concept

**Système complexe:**
- Offre/demande dynamique
- Prix fluctuants sur marché
- Événements économiques (crises, booms)
- Compétition entre players
- Trade routes optimization

## 📊 Métriques à implémenter

### Factory Analytics
- [ ] Production efficiency par factory
- [ ] Most profitable factories
- [ ] Worker productivity tracking
- [ ] Engineer bonus effectiveness
- [ ] Storage turnover rate

### Company Analytics
- [ ] Total production value
- [ ] Most produced items
- [ ] Factory ROI (return on investment)
- [ ] Operating costs vs revenue
- [ ] Network coverage map

### Global Economy
- [ ] Market trends (items prix/volume)
- [ ] Most active airports
- [ ] Total factories by region
- [ ] Production bottlenecks
- [ ] Supply chain visualization

## 🐛 Known Issues

### Mineur (non-bloquant)
- [ ] estimated_completion est placeholder (fixed timestamp)
- [ ] factory_type reste NULL après assigner recette
- [ ] Workers ne gagnent pas XP automatiquement
- [ ] Health/Happiness ne se dégradent pas

### Cosmétique
- [ ] Messages d'erreur pourraient être plus user-friendly
- [ ] Pas de confirmation messages sur succès
- [ ] Pas de warnings sur actions destructives

### Documentation
- [ ] OpenAPI descriptions à améliorer
- [ ] Exemples de requêtes dans Swagger
- [ ] Diagrammes architecture manquants

## ✅ Checklist Production-Ready

**Backend:**
- [x] Tous les endpoints implémentés
- [x] Validations business en place
- [x] Erreurs gérées proprement
- [ ] Background jobs (production completion)
- [ ] Triggers database (tier, factory_type)
- [ ] Tests automatisés (pytest)
- [ ] Logging production-ready
- [ ] Rate limiting
- [ ] Monitoring/alerting

**Data:**
- [ ] Airports data imported
- [x] Items data seeded
- [x] Recipes data seeded
- [ ] Balance économique testé

**Documentation:**
- [x] Architecture documentée
- [x] API endpoints documentés
- [x] Guide de test créé
- [ ] Changelog maintenu
- [ ] API versioning strategy

**Déploiement:**
- [ ] Docker compose production-ready
- [ ] Variables d'environnement sécurisées
- [ ] Backups database configurés
- [ ] CI/CD pipeline
- [ ] Rollback strategy

## 📈 Roadmap Timeline (estimation)

**Semaine 1-2:**
- Import airports data
- Tests end-to-end
- Bug fixes mineurs

**Semaine 3-4:**
- Background jobs (production completion)
- Triggers database
- Tests automatisés

**Semaine 5-8:**
- Aircraft & Flight system
- Cargo management
- Passenger transport

**Semaine 9-12:**
- Economic system (costs)
- NPC T0 factories
- Missions basic

**Semaine 13+:**
- Real-time updates
- Advanced features
- Economic simulation

---

**Note:** Ces estimations sont indicatives et peuvent varier selon les priorités et la complexité rencontrée.
