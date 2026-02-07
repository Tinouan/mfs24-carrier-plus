# Source de vérité — Docs existants vs Roadmap v4.1

**Date** : 6 février 2026  
**Objectif** : Éviter que les nouvelles phases cassent ou ignorent le travail de conception déjà fait.

---

## Principe

La roadmap v4.1 est la **feuille de route d'implémentation** (dans quel ordre on code).  
Les docs dans `/docs/` sont les **spécifications détaillées** (comment ça doit fonctionner).

→ La roadmap dit QUAND. Les docs disent COMMENT.  
→ Quand une phase touche un sujet documenté, Claude Code DOIT lire le doc correspondant.

---

## Mapping docs → phases

| Document | Contenu | Utilisé dans phase(s) | Instruction Claude Code |
|----------|---------|----------------------|------------------------|
| `aircrafts.md` | Catalogue avions, fleet, cargo, hangar, systèmes | Phase 1 (passenger_seats), Phase 3 (market avions), Phase 9 (conversion kits) | Lire AVANT de modifier Aircraft schema ou FleetService |
| `workers.md` | Workers instances uniques, stats pays, XP, blessures, salaires, 42 pays | Phase 8 (Usines) | Lire AVANT d'implémenter le système workers complet. La Phase 1 ne crée que des items "personnel" simplifiés — le vrai système workers.md arrive en Phase 8 |
| `factories.md` | Usines T0-T5, production, batches, food, slots aéroport | Phase 8 (Usines) | Lire AVANT d'implémenter les factories. Le scheduler local et la mécanique de production sont déjà spécifiés |
| `items-recipes.md` | Items T0-T5, recettes, chaîne de valeur | Phase 8 (Usines) | Lire AVANT de créer les items et recettes |
| `company.md` | Company structure, rôles, permissions | Phase 4 (Company étendue) | Lire AVANT d'implémenter les rôles CEO/Officier/Pilote/Recrue |
| `profile.md` | Profil joueur, progression, stats | Phase 2 (Free Flight XP), Phase 5 (Certifications) | Lire AVANT de modifier le système de progression |
| `anticheat-seed.md` | Anti-triche mode Online, SEED validation | Toutes phases Online | Lire pour toute feature qui touche au SEED |
| `spec-freeflight-xp-efb.md` | Free Flight XP v2.7, grading, bonuses | Phase 2 | Spec complète déjà prête |
| `roadmap-complete-woa-v4.1.md` | Structure onglets, planning, timeline | Toutes phases | Référence principale pour l'ordre d'implémentation |

---

## Règles pour les prompts Claude Code

### Règle 1 — Lire avant de coder
Chaque prompt de phase DOIT inclure :
```
Avant de commencer, lis les fichiers suivants dans docs/ :
- docs/[fichier pertinent].md
```

### Règle 2 — Ne pas réinventer
Si un doc existe sur le sujet, utiliser ses spécifications (tables DB, types TypeScript, logique métier). Ne pas inventer de nouvelles structures incompatibles.

### Règle 3 — Enrichir, pas remplacer
Les phases enrichissent les systèmes existants. Exemple :
- Phase 1 ajoute `passenger_seats` au schema Aircraft → doit respecter la structure de `aircrafts.md`
- Phase 8 implémente les workers → doit suivre `workers.md` (stats pays, XP, blessures), pas réinventer un système simplifié

### Règle 4 — Zéro régression
Chaque prompt doit inclure :
```
CONTRAINTE : Ne pas modifier les fichiers/fonctions hors scope.
Vérifier que le build passe (0 errors, 0 warnings).
Vérifier que les données existantes en DB ne sont pas effacées (pas de recreation de tables).
```

### Règle 5 — Tester entre chaque phase
Le joueur DOIT tester en jeu entre chaque phase avant de passer à la suivante.

---

## Phase 1 vs workers.md — Clarification

La Phase 1 crée des items "personnel" SIMPLIFIÉS :
- 4 items basiques : worker, engineer, pilot, copilot
- Poids fixe 80 kg, pas de stats individuelles
- Embarquables comme du cargo dans les avions
- Spawn IA simple aux aéroports

La Phase 8 implémentera le VRAI système workers.md :
- Instances uniques avec stats (speed, resistance)
- Variation ±20% par nationalité (42 pays)
- Système XP et tiers (Novice → Maître)
- Blessures, mort, salaires
- Assignation aux factories

→ En Phase 8, les items "personnel" simplifiés de Phase 1 seront REMPLACÉS par les worker_instances de workers.md. C'est prévu et normal.

---

## Workflow par phase

```
Pour chaque phase :

1. Je (Claude.ai) prépare :
   - La spec de phase (ce qu'il faut faire)
   - Le prompt Claude Code (comment le faire)
   - La liste des docs à lire

2. Le joueur :
   - Copie la spec dans docs/
   - Colle le prompt dans Claude Code
   - Attend le build clean

3. Le joueur TESTE EN JEU :
   - Vérifie les nouvelles features
   - Vérifie que rien n'est cassé (avion au bon endroit, inventaire intact, etc.)
   
4. Si bug :
   - Prompt de fix AVANT de passer à la phase suivante
   
5. Si OK :
   - Phase suivante
```
