# Spec: Refonte XP Free Flight

## Fichier: `src/services/FlightTracker.ts`

## Problème
2 XP/min × grade_mult est trop bas. 3 min de vol dans le brouillard = 6 XP. Aucun bonus météo/landing/distance.

## Nouvelle formule

```typescript
// Dans calculateXP() ou équivalent :
const base = (flightTimeMinutes * 3) + (distanceNm * 1.5);

let bonusTotal = 1.0;
// Météo difficile (visibilité < 3nm OU vent > 15kts OU précipitations)
if (weatherDifficult) bonusTotal += 0.25;
// Vol de nuit
if (isNight) bonusTotal += 0.20;
// Landing quality
if (landingFpm < 50) bonusTotal += 0.15;       // butter
else if (landingFpm < 100) bonusTotal += 0.10;  // smooth
// Fuel economy (restant >= 25%)
if (fuelRemainingPercent >= 25) bonusTotal += 0.10;
// Temps réel (sim rate = 1x pendant >90% du vol)
if (realTimeRatio >= 0.9) bonusTotal += 0.15;

const xp = Math.max(5, Math.floor(base * bonusTotal * gradeMultiplier));
```

## Grade multiplier (inchangé)
| Score | Grade | Mult |
|-------|-------|------|
| 1200+ | S | 2.0 |
| 1000-1199 | A | 1.5 |
| 800-999 | B | 1.2 |
| 600-799 | C | 1.0 |
| 400-599 | D | 0.7 |
| <400 | F | 0.3 |

## Données météo
Le FlightTracker doit lire ces SimVars (ajouter au tick ou au finishSession) :
```
AMBIENT VISIBILITY → mètres, convertir en nm (÷ 1852). Difficile si < 3nm
AMBIENT WIND VELOCITY → knots. Difficile si > 15kts
AMBIENT PRECIP STATE → 0=aucun, 2=pluie, 4=neige. Difficile si > 0
```
`weatherDifficult = visibility < 3 || wind > 15 || precipitation > 0`

## Détection nuit
Déjà dans le code via `timeOfDay`. Nuit = `timeOfDay >= 3` OU `timeOfDay === 0` (selon la convention MSFS: 0=day, 1=dawn, 2=dusk, 3=night — vérifier).

## Détection sim rate
Accumuler le ratio de ticks où sim rate = 1.0 sur le total de ticks.
`realTimeRatio = ticksAtRate1 / totalTicks`

## Plancher
Minimum 5 XP pour tout vol complété (même très court).

## Exemple (le vol d'aujourd'hui)
```
Base: (3 × 3) + (4 × 1.5) = 9 + 6 = 15
Bonus: 1.0 + 0.25 (brouillard) = 1.25  
Grade B mult: 1.2
XP = floor(15 × 1.25 × 1.2) = floor(22.5) = 22 XP
```
Au lieu de 6 XP actuellement.

## Recap popup
Afficher les bonus actifs dans le recap (comme pour les missions). Les bonus à [-] x1.00 doivent passer à la valeur réelle si actifs.

## Fichiers touchés
- `src/services/FlightTracker.ts` — formule XP + lecture météo SimVars + accumulation sim rate
- `src/helpers/freeFlightRecapHelper.ts` — afficher les bonus réels dans le recap

## NE PAS toucher
- Le scoring /1000 (pénalités G-force, overspeed, landing) — il reste identique
- La formule XP mission (LocalMissionService) 
- Le FlightTracker state machine (idle/taxi/flying/landed)
