# Fichiers à nettoyer

Ce document liste les fichiers temporaires et obsolètes créés durant les sessions de développement.

## 🗑️ Fichiers à supprimer

### Scripts .bat temporaires (6 fichiers)
Ces scripts ont été créés pour tester des connexions et déploiements sur le NAS. Ils ne sont plus nécessaires car on travaille maintenant en local avec Docker Desktop.

```
check_companies.bat
check_companies_v2.bat
redeploy.bat
check_ports.bat
deploy_step_by_step.bat
deploy_api_changes.bat
```

### Scripts Python de déploiement (2 fichiers)
Ces scripts exécutaient du SQL via SSH sur le NAS. Maintenant que le `/api/sql/execute` existe, on peut les supprimer.

```
execute_sql.py
execute_sql_via_api.py
```

### Documentation obsolète du dossier claude/ (multiple fichiers)
Le dossier `claude/` contient des analyses et documentations de sessions précédentes qui ne sont plus d'actualité maintenant que la Phase 2 est en cours.

```
claude/docs/DEPLOY.md
claude/docs/DOCKER-PERMISSIONS.md
claude/docs/NEXT-STEPS.md
claude/docs/1-configure-sudo.md
claude/docs/2-deploy.md
claude/docs/START-HERE.md
claude/docs/STATUS-REPORT.md
claude/README.md
claude/SUMMARY.md
claude/ANALYSE-PROJET.md
claude/ORGANISATION-PROJETS-CLAUDE.md
claude/RESUME-ANALYSE.md
```

### Documentation obsolète du dossier .claude-projects/factories/ (6 fichiers)
Ces fichiers documentaient les phases 1 et 2 durant leur développement. Maintenant remplacés par SESSION_SUMMARY.md et NEXT_SESSION.md.

```
.claude-projects/factories/PROJECT-INIT.md
.claude-projects/factories/DESIGN.md
.claude-projects/factories/PHASE1-TESTING.md
.claude-projects/factories/PHASE1-COMPLETE.md
.claude-projects/factories/PHASE2-COMPLETE.md
.claude-projects/factories/TEST-PHASE1-PHASE2.md
.claude-projects/factories/QUICK-START.md
```

### Autres fichiers obsolètes (2 fichiers)

```
GUIDE-DEPLOIEMENT.md           # Remplacé par NEXT_SESSION.md
INSTRUCTIONS_SQL.md            # Remplacé par NEXT_SESSION.md
```

## ✅ Fichiers à GARDER

### Documentation principale (4 fichiers)
```
README.md                       # Documentation principale du projet
ROADMAP.md                      # Feuille de route du projet
SESSION_SUMMARY.md              # Résumé de la dernière session (2025-01-21)
NEXT_SESSION.md                 # Tâches pour la prochaine session
```

### Code source de l'API
```
game-api/app/**/*.py            # Tous les fichiers Python de l'API
```

### Scripts SQL
```
sql/v0_0_init_base_schema_standalone.sql
sql/v0_5_factories_schema_minimal.sql
sql/v0_5_factories_phase2.sql
sql/seed_items_t0.sql
sql/seed_items_t1_t2.sql
sql/seed_recipes_t1_t2.sql
```

### Configuration Docker
```
docker-compose.yml
.env
```

### Fichiers légaux et Git
```
LEGAL.md
.github/pull_request_template.md
.gitignore
```

## 📋 Commandes pour nettoyer

### Windows (PowerShell)
```powershell
# Supprimer les scripts .bat
Remove-Item check_companies.bat, check_companies_v2.bat, redeploy.bat, check_ports.bat, deploy_step_by_step.bat, deploy_api_changes.bat

# Supprimer les scripts Python temporaires
Remove-Item execute_sql.py, execute_sql_via_api.py

# Supprimer les dossiers de documentation obsolètes
Remove-Item -Recurse -Force claude/
Remove-Item -Recurse -Force .claude-projects/

# Supprimer les fichiers de documentation obsolètes
Remove-Item GUIDE-DEPLOIEMENT.md, INSTRUCTIONS_SQL.md
```

### Linux/Mac (bash)
```bash
# Supprimer les scripts .bat (si transféré sur NAS)
rm -f check_companies.bat check_companies_v2.bat redeploy.bat check_ports.bat deploy_step_by_step.bat deploy_api_changes.bat

# Supprimer les scripts Python temporaires
rm -f execute_sql.py execute_sql_via_api.py

# Supprimer les dossiers de documentation obsolètes
rm -rf claude/
rm -rf .claude-projects/

# Supprimer les fichiers de documentation obsolètes
rm -f GUIDE-DEPLOIEMENT.md INSTRUCTIONS_SQL.md
```

## ⚠️ Notes importantes

1. **Backup avant suppression**: Si vous n'êtes pas sûr, créez un backup:
   ```bash
   mkdir ../mfs24-carrier-plus-backup
   cp -r claude/ .claude-projects/ ../mfs24-carrier-plus-backup/
   ```

2. **Git**: Si ces fichiers sont trackés par Git, utilisez `git rm` au lieu de `rm`:
   ```bash
   git rm -r claude/ .claude-projects/
   git rm check_companies.bat execute_sql.py
   git commit -m "chore: clean up obsolete documentation and temporary scripts"
   ```

3. **sql_executor.py**: Le fichier `game-api/app/routers/sql_executor.py` est marqué comme "DEV ONLY" mais doit être **GARDÉ** pour l'instant car il est utilisé pour exécuter les scripts SQL. Il faudra le supprimer avant le déploiement en production.

---

**Date de création**: 2025-01-21
**Prochaine révision**: Après déploiement Phase 2 complète sur le NAS
