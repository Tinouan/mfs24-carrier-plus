# Import Airports via Directus - Guide Complet

## 🎯 Objectif

Importer les données d'aéroports depuis OurAirports dans Directus (pas directement en SQL) pour éviter les doublons et maintenir Directus comme source de vérité.

## ⚠️ Pourquoi via Directus?

**Architecture actuelle:**
- `public` schema = géré par **Directus** (données monde)
- `game` schema = géré par **FastAPI** (données gameplay)

**Avantages import via Directus:**
- ✅ Directus reste la source de vérité
- ✅ Interface admin pour gérer les airports
- ✅ Pas de doublon de données
- ✅ Cohérence avec l'architecture
- ✅ Les triggers PostgreSQL fonctionnent quand même

## 📋 Prérequis

1. **Directus opérationnel**
```bash
docker ps | grep msfs_directus
# Doit être "Up"
```

2. **Accès Directus**
- URL: `http://localhost:8055`
- Credentials: voir `.env` (DIRECTUS_ADMIN_EMAIL / DIRECTUS_ADMIN_PASSWORD)

3. **Fichier airports.csv**
- Source: [OurAirports Data](https://ourairports.com/data/)
- Télécharger: `airports.csv` (~28,000 aéroports)

## 🔧 Étape 1: Préparer la structure de table

### Option A: Via Directus UI (Recommandé)

1. **Se connecter à Directus**
   - Ouvrir `http://localhost:8055`
   - Login avec admin credentials

2. **Créer la collection "airports"**
   - Aller dans: Settings → Data Model
   - Cliquer "Create Collection"
   - Nom: `airports`
   - Schema: `public` (important!)

3. **Ajouter les champs**

**Champs de base (OurAirports):**
- `id` - Integer, Primary Key, Auto Increment
- `ident` - String(10), Required, Unique
- `type` - String(50), Nullable
- `name` - String, Nullable
- `latitude_deg` - Float, Nullable
- `longitude_deg` - Float, Nullable
- `elevation_ft` - Integer, Nullable
- `continent` - String(10), Nullable
- `iso_country` - String(10), Nullable
- `iso_region` - String(20), Nullable
- `municipality` - String, Nullable
- `scheduled_service` - String(5), Nullable ('yes'/'no')
- `gps_code` - String(10), Nullable
- `iata_code` - String(10), Nullable
- `local_code` - String(10), Nullable
- `home_link` - String, Nullable
- `wikipedia_link` - String, Nullable
- `keywords` - Text, Nullable

**Champs factory system (custom):**
- `max_factory_slots` - Integer, Default: 0, Required
- `occupied_slots` - Integer, Default: 0, Required

### Option B: Via SQL direct (si Directus bug)

Si Directus ne permet pas de créer la table dans le schéma `public`:

```bash
docker exec -i msfs_db psql -U msfs -d msfs < sql/create_airports_table.sql
```

## 🔧 Étape 2: Ajouter les triggers PostgreSQL

**Important:** Les triggers doivent être créés **avant** l'import des données.

```bash
# Exécuter le script de triggers
docker exec -i msfs_db psql -U msfs -d msfs < sql/calculate_airport_slots.sql
```

**Ce que font les triggers:**
- Auto-calcul de `max_factory_slots` basé sur `type` et `scheduled_service`
- Configuration: 12/6/3/1/0 slots selon type d'aéroport
- S'exécute automatiquement sur INSERT/UPDATE

**Vérifier que les triggers sont créés:**
```sql
docker exec msfs_db psql -U msfs -d msfs -c "\
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname = 'trigger_calculate_max_slots';"
```

Expected output:
```
         tgname          | tgrelid
-------------------------+----------
 trigger_calculate_max_slots | airports
```

## 🔧 Étape 3: Importer les données via Directus

### Méthode 1: Import CSV via Directus UI

1. **Préparer le CSV**
   - Télécharger `airports.csv` depuis OurAirports
   - **Important:** S'assurer que les colonnes correspondent

2. **Import dans Directus**
   - Aller dans: Content → airports (collection)
   - Cliquer sur "Import" (icône upload)
   - Sélectionner `airports.csv`
   - Mapper les colonnes:
     - `id` → `id`
     - `ident` → `ident`
     - `type` → `type`
     - etc.
   - **Laisser vides:** `max_factory_slots`, `occupied_slots` (triggers les rempliront)

3. **Lancer l'import**
   - Cliquer "Import"
   - Attendre la fin (peut prendre 2-5 minutes pour 28k rows)

4. **Vérifier les triggers**
   - Les triggers devraient avoir calculé `max_factory_slots` automatiquement
   - Voir Étape 4 pour vérification

### Méthode 2: Import SQL direct (fallback)

Si Directus UI échoue ou est trop lent:

```bash
# 1. Convertir CSV en SQL INSERT statements
# (Utiliser un script Python ou outil en ligne)

# 2. Exécuter l'import
docker exec -i msfs_db psql -U msfs -d msfs < airports_import.sql
```

**Script Python pour convertir CSV → SQL:**
```python
import csv
import sys

print("-- Airports import")
print("BEGIN;")

with open('airports.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        values = [
            row.get('id', 'NULL'),
            f"'{row.get('ident', '')}'" if row.get('ident') else 'NULL',
            f"'{row.get('type', '')}'" if row.get('type') else 'NULL',
            f"'{row.get('name', '').replace(\"'\", \"''\")}'" if row.get('name') else 'NULL',
            row.get('latitude_deg', 'NULL'),
            row.get('longitude_deg', 'NULL'),
            row.get('elevation_ft', 'NULL'),
            f"'{row.get('continent', '')}'" if row.get('continent') else 'NULL',
            f"'{row.get('iso_country', '')}'" if row.get('iso_country') else 'NULL',
            f"'{row.get('iso_region', '')}'" if row.get('iso_region') else 'NULL',
            f"'{row.get('municipality', '').replace(\"'\", \"''\")}'" if row.get('municipality') else 'NULL',
            f"'{row.get('scheduled_service', '')}'" if row.get('scheduled_service') else 'NULL',
            f"'{row.get('gps_code', '')}'" if row.get('gps_code') else 'NULL',
            f"'{row.get('iata_code', '')}'" if row.get('iata_code') else 'NULL',
            f"'{row.get('local_code', '')}'" if row.get('local_code') else 'NULL',
        ]

        print(f"INSERT INTO public.airports (id, ident, type, name, latitude_deg, longitude_deg, elevation_ft, continent, iso_country, iso_region, municipality, scheduled_service, gps_code, iata_code, local_code) VALUES ({', '.join(values)});")

print("COMMIT;")
```

## ✅ Étape 4: Vérifier l'import

### 1. Vérifier le nombre de rows

```sql
docker exec msfs_db psql -U msfs -d msfs -c "\
SELECT COUNT(*) as total_airports FROM public.airports;"
```

Expected: ~28,000 airports

### 2. Vérifier les triggers ont fonctionné

```sql
docker exec msfs_db psql -U msfs -d msfs -c "\
SELECT
  type,
  max_factory_slots,
  COUNT(*) as count
FROM public.airports
GROUP BY type, max_factory_slots
ORDER BY max_factory_slots DESC;"
```

Expected output:
```
      type       | max_factory_slots | count
-----------------+-------------------+-------
 large_airport   |                12 |  ~500
 medium_airport  |                 6 | ~4000
 small_airport   |                 3 | ~9000
 heliport        |                 1 | ~8000
 seaplane_base   |                 1 |  ~400
 closed          |                 0 | ~6000
```

### 3. Vérifier quelques aéroports connus

```sql
docker exec msfs_db psql -U msfs -d msfs -c "\
SELECT ident, name, type, max_factory_slots
FROM public.airports
WHERE ident IN ('LFPG', 'KJFK', 'EGLL', 'RJTT');"
```

Expected:
```
 ident |           name            |     type      | max_factory_slots
-------+---------------------------+---------------+-------------------
 LFPG  | Charles de Gaulle         | large_airport |                12
 KJFK  | John F Kennedy Int'l      | large_airport |                12
 EGLL  | London Heathrow           | large_airport |                12
 RJTT  | Tokyo Int'l (Haneda)      | large_airport |                12
```

### 4. Vérifier dans Directus UI

- Ouvrir `http://localhost:8055`
- Aller dans: Content → airports
- Vérifier que les données sont visibles
- Vérifier que `max_factory_slots` est rempli

## 🐛 Troubleshooting

### Problème: Directus ne montre pas la collection

**Solution:**
```bash
# Refresh Directus schema
docker restart msfs_directus

# Attendre 30 secondes, puis recharger la page
```

### Problème: Les triggers ne se sont pas exécutés

**Symptômes:** `max_factory_slots` = 0 partout

**Solution:**
```sql
-- Forcer le recalcul sur tous les airports
docker exec msfs_db psql -U msfs -d msfs -c "\
UPDATE public.airports SET type = type;"
```

Le trigger s'exécutera sur l'UPDATE et recalculera les slots.

### Problème: Import CSV échoue dans Directus

**Solution:** Utiliser la méthode SQL directe (Méthode 2)

### Problème: Erreur "duplicate key value violates unique constraint"

**Cause:** La table contient déjà des données

**Solution:**
```sql
-- Vider la table avant import
docker exec msfs_db psql -U msfs -d msfs -c "\
TRUNCATE TABLE public.airports RESTART IDENTITY CASCADE;"
```

## 🔄 Mettre à jour les données

Si OurAirports publie une nouvelle version:

1. **Télécharger le nouveau CSV**
2. **Backup actuel:**
```bash
docker exec msfs_db pg_dump -U msfs -d msfs -t public.airports > airports_backup.sql
```

3. **Truncate et réimporter:**
```sql
TRUNCATE TABLE public.airports RESTART IDENTITY CASCADE;
-- Puis réimporter via Directus ou SQL
```

## 📊 Requêtes utiles après import

### Compter factories possibles par pays

```sql
docker exec msfs_db psql -U msfs -d msfs -c "\
SELECT
  iso_country,
  SUM(max_factory_slots) as total_slots,
  COUNT(*) as airports_count
FROM public.airports
WHERE max_factory_slots > 0
GROUP BY iso_country
ORDER BY total_slots DESC
LIMIT 20;"
```

### Trouver les meilleurs aéroports pour factories

```sql
docker exec msfs_db psql -U msfs -d msfs -c "\
SELECT
  ident,
  name,
  type,
  municipality,
  iso_country,
  max_factory_slots
FROM public.airports
WHERE max_factory_slots = 12
ORDER BY name
LIMIT 50;"
```

### Vérifier les aéroports avec factories existantes

```sql
docker exec msfs_db psql -U msfs -d msfs -c "\
SELECT
  a.ident,
  a.name,
  a.max_factory_slots,
  COUNT(f.id) as factories_count
FROM public.airports a
LEFT JOIN game.factories f ON f.airport_ident = a.ident AND f.is_active = true
WHERE a.max_factory_slots > 0
GROUP BY a.ident, a.name, a.max_factory_slots
HAVING COUNT(f.id) > 0
ORDER BY factories_count DESC;"
```

## ✅ Checklist finale

Avant de considérer l'import terminé:

- [ ] Table `public.airports` existe
- [ ] Triggers PostgreSQL créés
- [ ] ~28,000 airports importés
- [ ] `max_factory_slots` calculé automatiquement (pas tous à 0)
- [ ] Données visibles dans Directus UI
- [ ] Quelques aéroports connus vérifiés (LFPG, KJFK, etc.)
- [ ] Endpoint FastAPI `/api/factories` peut créer des factories

## 🎯 Étape suivante

Une fois les airports importés, tu peux:

1. **Tester la création de factories:**
```bash
# Via Swagger UI: http://localhost:8080/api/docs
POST /api/factories
{
  "airport_ident": "LFPG",
  "name": "Paris Production Plant"
}
```

2. **Suivre le guide de test complet:**
   - Voir `FACTORY_SYSTEM_TEST_GUIDE.md`

---

**Note:** Cette approche maintient la cohérence avec l'architecture où Directus gère les données monde (`public` schema) et évite les doublons de données.
