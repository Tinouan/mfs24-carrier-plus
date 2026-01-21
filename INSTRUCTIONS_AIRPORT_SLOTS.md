# Instructions pour ajouter les slots d'usines aux aéroports

## ⚠️ IMPORTANT : Vérifier d'abord si la table airports existe

La table `airports` doit exister dans Directus avant d'exécuter ce script.

### Méthode 1 : Vérifier via Docker (RECOMMANDÉ)

1. Ouvre un terminal / PowerShell
2. Va dans le dossier du projet :
   ```powershell
   cd C:\Users\tinou\Documents\mfs24-carrier-plus
   ```

3. Vérifie si la table airports existe :
   ```powershell
   docker exec msfs_db psql -U msfs -d msfs -c "\dt public.*" | findstr airport
   ```

   - **Si tu vois `public.airports`** → Continue à l'étape suivante
   - **Si tu ne vois rien** → La table n'existe pas encore, il faut d'abord importer airports.csv dans Directus

---

## 📝 Exécuter le script SQL

### Option A : Via Docker (PLUS SIMPLE)

Dans ton terminal/PowerShell, dans le dossier du projet :

```powershell
docker exec -i msfs_db psql -U msfs -d msfs < sql\add_airport_factory_slots.sql
```

Cette commande va :
1. Se connecter à la base de données PostgreSQL
2. Exécuter le script SQL
3. Ajouter les colonnes `max_factory_slots` et `occupied_slots`
4. Créer le trigger automatique
5. Calculer les slots pour tous les aéroports existants

### Option B : Via un client PostgreSQL (pgAdmin, DBeaver, etc.)

Si tu as un client PostgreSQL installé :

1. Connecte-toi à la base avec ces paramètres :
   - Host: `localhost`
   - Port: `5432`
   - Database: `msfs`
   - User: `msfs`
   - Password: (celui dans ton fichier `.env`, variable `POSTGRES_PASSWORD`)

2. Ouvre le fichier `sql/add_airport_factory_slots.sql`
3. Exécute le script

---

## ✅ Vérifier que ça a fonctionné

Après avoir exécuté le script, vérifie que les colonnes existent :

```powershell
docker exec msfs_db psql -U msfs -d msfs -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'airports' AND column_name IN ('max_factory_slots', 'occupied_slots');"
```

Tu devrais voir :
```
     column_name      | data_type
----------------------+-----------
 max_factory_slots    | integer
 occupied_slots       | integer
```

Et pour voir la distribution des slots par type d'aéroport :

```powershell
docker exec msfs_db psql -U msfs -d msfs -c "SELECT type, MAX(max_factory_slots) as slots, COUNT(*) as count FROM public.airports GROUP BY type ORDER BY slots DESC LIMIT 10;"
```

---

## 🚨 Si la table airports n'existe pas encore

Si la table `public.airports` n'existe pas, tu dois d'abord :

1. Importer `airports.csv` dans Directus via l'interface web (http://localhost:8055)
2. OU créer manuellement la table airports
3. Puis revenir exécuter ce script

---

## 📊 Ce que fait le script en détail

1. **Ajoute 2 colonnes** :
   - `max_factory_slots` : Nombre maximum d'usines T1+ autorisées (calculé automatiquement)
   - `occupied_slots` : Nombre actuel d'usines T1+ (mis à jour par l'API)

2. **Crée un trigger automatique** qui calcule `max_factory_slots` :
   - Large airports avec service régulier : **12 slots**
   - Medium airports : **6 slots**
   - Small airports : **3 slots**
   - Heliports/seaplane bases : **0 slots** (pas d'usines)

3. **Important** : Les usines T0 (NPC) ne comptent PAS dans ces limites
   - Seules les usines T1+ des joueurs comptent

---

## 🔧 Prochaines étapes après l'exécution

Une fois ce script exécuté, il faudra :

1. Modifier l'endpoint `POST /api/factories` pour vérifier les slots disponibles
2. Implémenter la logique d'incrémentation de `occupied_slots` lors de la création d'usine
3. Décrémenter `occupied_slots` lors de la suppression d'usine

Veux-tu que je t'aide avec ça après ?
