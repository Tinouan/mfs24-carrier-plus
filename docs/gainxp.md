# XP Gain System (updated 2026-02-21)

## 3 Sources of XP

| Source | Base Rate | Max Multiplier | Notes |
|--------|-----------|----------------|-------|
| Mission | 4 XP/nm | ×2.0 (grade S) | Complex formula, many bonuses |
| Free Flight | 2 XP/min | ×2.0 (grade S) | Simple, no bonuses |
| Contract | 0.5 XP/nm + 0.1 XP/kg | ×1.0 | Fixed, no multipliers |

---

## 1. Mission XP (`LocalMissionService.ts` — `calculateXPV2()`)

### Formula
```
TOTAL_XP = base × cargo_mult × total_additive × (1 + realtime) × grade_mult × anticheat

base_xp         = distance_nm × 4
cargo_multiplier = 1.0..1.5
total_additive   = 1 + night + fuel + lights
realtime_bonus   = 0..1.0
grade_multiplier = 0.2..2.0
anticheat_penalty = 0.5 or 1.0
```

### Cargo Multiplier (fill %)
| Fill % | Mult |
|--------|------|
| 76-100% | 1.5 |
| 51-75% | 1.3 |
| 26-50% | 1.2 |
| 1-25% | 1.1 |
| 0% | 1.0 |

### Night Bonus
- `0.50` if night flight, `0` otherwise

### Fuel Bonus (remaining %)
| Remaining % | Bonus |
|-------------|-------|
| ≥25% | 0.20 |
| 20-24% | 0.15 |
| 15-19% | 0.10 |
| 10-14% | 0.05 |
| <10% | 0 |
| unlimited_fuel | 0 (forced) |

### Lights Bonus (compliance ratio)
| Compliance | Bonus |
|------------|-------|
| 100% | 0.15 |
| 90-99% | 0.10 |
| 75-89% | 0.05 |
| <75% | 0 |

### Real-Time Bonus (sim rate ratio)
| Real-Time % | Bonus |
|-------------|-------|
| 100% | 1.00 |
| 90-99% | 0.70 |
| 75-89% | 0.50 |
| 50-74% | 0.30 |
| 25-49% | 0.15 |
| <25% | 0 |

### Anti-Cheat Penalties
| Flag | Effect |
|------|--------|
| slew_used | XP × 0.5 |
| crash_occurred | XP × 0.5 |
| unlimited_fuel | fuel_bonus = 0 only |

---

## 2. Mission Scoring (`calculateScoresV2()` — /1000 scale)

### 4 Categories

**Landing (0-450 pts)** — touchdown FPM:
| FPM | Pts |
|-----|-----|
| bounce (>0) | 0 |
| -60 to 0 | 450 |
| -120 to -61 | 418 |
| -180 to -121 | 375 |
| -240 to -181 | 315 |
| -300 to -241 | 248 |
| -400 to -301 | 170 |
| -500 to -401 | 90 |
| -700 to -501 | 34 |
| < -700 | 0 |

**G-Force (0-200 pts)** — max G during flight:
| Max G | Pts |
|-------|-----|
| ≤1.3 | 200 |
| ≤1.5 | 180 |
| ≤1.8 | 150 |
| ≤2.0 | 120 |
| ≤2.5 | 80 |
| ≤3.0 | 40 |
| >3.0 | 0 |

**Destination (0-250 pts)** — binary:
- 250 if final ICAO = destination ICAO, 0 otherwise

**Distance (0-100 pts)** — actual/planned ratio:
| Ratio | Pts |
|-------|-----|
| 95-105% | 100 |
| 90-110% | 80 |
| 85-115% | 60 |
| 80-120% | 40 |
| other | 20 |

### Grade from Score (`calculateGradeV2()`)
| Score | Grade | XP Mult |
|-------|-------|---------|
| 950+ | S | 2.0 |
| 850-949 | A | 1.5 |
| 750-849 | B | 1.2 |
| 650-749 | C | 1.0 |
| 500-649 | D | 0.7 |
| 350-499 | E | 0.5 |
| <350 | F | 0.2 |

---

## 3. Free Flight XP (`FlightTracker.ts`)

### Formula
```
XP = flight_time_minutes × 2 × grade_multiplier
```

### Scoring (base 1000)
Penalties:
- Landing FPM > 500: **-200**
- Landing FPM 300-500: **-100**
- Landing FPM 200-300: **-50**
- G-force > 2.5: **-100**
- Overspeed detected: **-100**

Bonuses:
- Landing FPM < 100: **+150**
- Landing FPM < 50: **+100** (cumulative with above)

### Grade
| Score | Grade | XP Mult |
|-------|-------|---------|
| 1200+ | S | 2.0 |
| 1000-1199 | A | 1.5 |
| 800-999 | B | 1.2 |
| 600-799 | C | 1.0 |
| 400-599 | D | 0.7 |
| <400 | F | 0.3 |

### Landing Quality
| FPM | Quality |
|-----|---------|
| <50 | "butter" |
| 50-100 | "smooth" |
| 100-200 | "normal" |
| 200-500 | "hard" |
| >500 | "crash" |

---

## 4. Contract XP (`LocalContractService.ts`)

### Formula
```
XP = (distance_nm × 0.5) + (cargo_weight_kg × 0.1)
```

No grade, no bonuses, no multipliers. Fixed calculation on completion.

### Contract Money Reward
```
Reward CR = distance_nm × (cargo_weight_kg / 100) × 2 × difficulty_mult

difficulty_mult:
  >400 nm → 1.5
  150-400 nm → 1.0
  <150 nm → 0.8
```

---

## 5. Level System (`PlayerHelpers.ts`)

### Formula
```
Level N requires: N × 1000 XP to reach next level
Total XP for Level N: N × (N-1) / 2 × 1000
```

| Level | Total XP Required |
|-------|-------------------|
| 1 | 0 |
| 2 | 1,000 |
| 3 | 3,000 |
| 5 | 10,000 |
| 10 | 45,000 |
| 20 | 190,000 |

No rank names — numeric levels only.

---

## 6. Server-Side Validation (`seed-server/src/index.ts`)

### Server XP (differs from client)
```
Mission:      floor(distance_nm × 2 × score_mult × trust_mod)
Free Flight:  floor((distance_nm × 0.5 + landings × 25) × trust_mod)
```

### Trust System
- Starting score: **100**
- XP penalty: trust < 30 → **50% XP reduction**

| Penalty | Trust Impact |
|---------|-------------|
| TELEPORT_SUSPECTED | -30 |
| SPEED_HACK_SUSPECTED | -25 |
| MONEY_MANIPULATION | -40 |
| FUEL_CHEAT_SUSPECTED | -15 |
| IMPOSSIBLE_DISTANCE | -20 |
| IMPOSSIBLE_G_FORCE | -10 |
| FLIGHT_TOO_FAST | -10 |
| FUEL_ANOMALY | -10 |

### Server Validation Checks
- Max flight duration: 1440 min (24h)
- Max average speed: ~300 kts
- Departure position must match stated ICAO
- Max G-force: 10G
- Min flight time: 30% of estimated

---

## Flow Summary

```
Mission Completion:
  MissionController.completeMissionV1()
    → trackingManager.getFlightSummary()
    → LocalMissionService.completeMissionV1()
        → calculateScoresV2() → /1000 score
        → calculateGradeV2() → S..F
        → calculateXPV2() → final XP
    → player.xp += earned

Free Flight Session End:
  FlightTracker.finishSession()
    → calculateScore() → base 1000 ± penalties/bonuses
    → calculateGrade() → S..F
    → calculateXP() → minutes × 2 × grade_mult
    → player.xp += earned

Contract Delivery:
  LocalContractService.completeContract()
    → xp = (distance × 0.5) + (cargo_kg × 0.1)
    → player.xp += xp
    → player.money += reward CR
```

---

## Files Summary
| File | Role |
|------|------|
| `src/services/LocalMissionService.ts` | Mission XP V2, scoring, grades |
| `src/services/FlightTracker.ts` | Free flight XP, scoring |
| `src/services/LocalContractService.ts` | Contract XP + rewards |
| `src/helpers/PlayerHelpers.ts` | Level calculation |
| `src/managers/TrackingManager.ts` | getFlightSummary() for mission scoring |
| `src/controllers/MissionController.ts` | Mission completion trigger |
| `seed-server/src/index.ts` | Server-side XP + trust validation |
