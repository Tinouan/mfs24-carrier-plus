# Tracking System (updated 2026-02-21)

## Architecture — Post SimVar Centralization

All SimVar reads are centralized in `SimVarReader.ts`. Two read frequencies:
- **500ms** (`readCriticalSimVars()`) — 15 fields for UI + position
- **2000ms** (`readFullSnapshot()`) — 70+ fields for mission tracking

### SimVarReader (`src/services/SimVarReader.ts`) — NEW
Single source of truth for SimVar reads. Exports:

**Types:**
- `FlightPhase` enum — 9 phases: PARKING, TAXI_OUT, TAKEOFF_ROLL, INITIAL_CLIMB, CLIMB, CRUISE, DESCENT, APPROACH, TAXI_IN
- `CriticalSnapshot` — 15 fields (lat, lon, altitude, heading, groundSpeed, airspeed, verticalSpeed, gForce, fuelQuantity, fuelCapacity, touchdownVelocity, onGround, closestAirport, atcId, engineRunning)
- `TrackingSnapshot` — 70+ fields (position, speeds, G-force, aircraft limits, gear/flaps, fuel, weights, lights, environment, ATC, GPS, anti-cheat, aircraft info, wear, extras)
- `FlightSummary` — accumulated flight data for scoring (touchdownVS, maxGForce, fuel%, cargo%, night, simRateAvg, lightsCompliance, anti-cheat flags, ATC deviations)

**Functions:**
- `readCriticalSimVars(): CriticalSnapshot` — fast 500ms read
- `readFullSnapshot(progressPercent): TrackingSnapshot` — full 2s read + derived calculations (fuelPercent, payloadLbs, cargoPercent, flightPhase)
- `detectFlightPhase(snap, progressPercent): FlightPhase` — 9-phase detection
- `haversineDistanceNm(lat1, lon1, lat2, lon2)` — shared utility (deduplicated)

### Data Flow
```
readSimVars() [AeroCorpOnline.tsx, every 500ms]
  │
  ├─ readCriticalSimVars() → CriticalSnapshot
  │   ├─ simVarState.*.set(snap.*) → UI subscriptions
  │   ├─ PositionService.updateSimPosition() + updateSimVar()
  │   ├─ trackingManager.processUILandingDetection()
  │   └─ freeFlightController.tick(snap) → FlightTracker.tick(FlightTickData)
  │
  └─ [Separate interval: FLIGHT_TRACKING_INTERVAL_MS = 2000ms]
      └─ TrackingManager.trackFlightV1()
          ├─ readFullSnapshot(progressPercent) → TrackingSnapshot (70+ SimVars)
          ├─ Accumulate: anti-cheat, simRate, night, ATC deviations, lights compliance
          ├─ Detect: waypoints, phases, progress, bonuses
          └─ callbacks.onTrackingStateUpdate() → TrackingState Subjects → UI
```

---

## TrackingManager (`src/managers/TrackingManager.ts`) — Mission Tracking

### V4 Accumulators (private state)
- `tickCount` — multi-frequency counter
- `simRateSamples: number[]` — for average at end of flight
- `nightTickCount / totalTickCount` — night flight detection (>50%)
- `slewDetected / crashDetected / unlimitedFuelDetected` — anti-cheat flags
- `atcAltDeviations / atcDistDeviations: number[]` — ATC deviation tracking (every 3 ticks ~6s)
- `touchdownVS` — from PLANE TOUCHDOWN NORMAL VELOCITY * 60 (more reliable than instantaneous VS)
- `lightsComplianceSum / lightsComplianceTicks` — per-tick ratio averaging

### Multi-Frequency Processing
- **Every tick (2s):** position, speeds, G-force, lights, phase, anti-cheat, simRate, night
- **Every 3 ticks (~6s):** ATC deviation accumulation (only while airborne)
- Full snapshot is always read; accumulation frequency varies.

### getFlightSummary(): FlightSummary
Called by MissionController at mission completion. Returns:
- touchdownVS, maxGForce (from accumulators)
- simRateAverage (mean of simRateSamples)
- isNightFlight (nightTickCount/totalTickCount > 0.5)
- lightsCompliance (sum/ticks)
- slewUsed, crashOccurred, unlimitedFuelUsed
- atcAltDeviationAvg, atcDistDeviationAvg
- fuelPercentStart/End, cargoPercent, flightDurationSec

### Lights Compliance
Requirements depend on phase/time:
- **BEACON:** always required (engines running)
- **STROBE:** required when airborne
- **NAV:** required at night/dusk (timeOfDay >= 2)
- **LANDING:** required (night+airborne) OR (descending below 10000ft)
- **TAXI:** required on ground

Visual states: 0=grey (off, not required), 1=green (on), 2=red (off but required)

### Phase Detection (9 phases via FlightPhase enum)
```
ON GROUND:
  GS < 5 kts → PARKING
  On runway + progress < 10% → TAKEOFF_ROLL
  On runway + progress >= 10% → TAXI_IN
  Not runway + progress < 10% → TAXI_OUT
  Not runway + progress >= 10% → TAXI_IN

AIRBORNE:
  AGL < 1500 ft + VS > 300 → INITIAL_CLIMB
  AGL < 3000 ft + VS < -300 → APPROACH
  VS > 500 → CLIMB
  VS < -500 → DESCENT
  else → CRUISE
```

---

## FlightTracker (`src/services/FlightTracker.ts`) — Free Flight
See [freeflight-system.md](freeflight-system.md) for full state machine.

Receives `FlightTickData` via FreeFlightController mapping:
```
CriticalSnapshot → FreeFlightController.tick(snap) → FlightTracker.tick({
  onGround: snap.onGround, airspeed: snap.airspeed, ...
  fuelGallons: snap.fuelQuantity, fuelCapacity: snap.fuelCapacity, ...
})
```

---

## Scoring — Mission Completion

### Flow
```
MissionController.completeMissionV1()
  ├─ trackingManager.getFlightSummary() → FlightSummary
  ├─ Build CompleteMissionV1Request with summary data
  └─ MissionRouter.completeMissionV1() → LocalMissionService
      ├─ calculateScoresV2() → /1000 scale (landing 450, gforce 200, destination 250, distance 100)
      ├─ calculateGradeV2() → S/A/B/C/D/E/F
      └─ calculateXPV2() → final XP with all bonuses
```

### XP Formula (V2)
```
base_xp = distance_nm * 4
cargo_multiplier = 1.0..1.5 (by fill %)
total_additive = 1 + night(0.50) + fuel(0..0.20) + lights(0..0.15)
real_time_bonus = 0..1.0 (by sim rate ratio)
grade_multiplier = 0.2(F)..2.0(S)
anticheat_penalty = (slew || crash) ? 0.5 : 1.0

TOTAL_XP = base * cargo_mult * total_additive * (1 + realtime) * grade_mult * anticheat
```

### Anti-Cheat Penalties
- **Slew detected:** XP × 0.5, cheated=true
- **Crash occurred:** XP × 0.5, cheated=true
- **Unlimited fuel:** fuel_bonus = 0 (no other penalty)
- **Payload tampering:** XP × 0.5 (checked by MissionController at 500ft AGL)

---

## State Subjects

### SimVarState (`src/state/SimVarState.ts`) — 15 Subjects
Updated every 500ms by readSimVars():
- Position: latitude, longitude, altitude, heading
- Speeds: groundSpeed, verticalSpeed, airspeed
- Status: onGround, gForce
- Fuel: fuelQuantity
- Landing: touchdownVelocity, lastLandingRate, landingRating
- Airport: closestAirport
- Aircraft: currentSimAircraftReg

### TrackingState (`src/state/TrackingState.ts`) — 34 Subjects
Updated every 2s by TrackingManager:
- Progress (3): distanceFlown, progressPercent, currentAltitude
- Fuel (3): fuelPercent, fuelUsed, fuelMax
- Simulation (3): simRate, canAccelerate, apActive
- Time (3): realTime, simTime, timeRatio
- Bonuses (5): night, cargo, eco, landing, realTime
- Cargo (2): cargoExpected, cargoActual
- ATC (2): atcCompliance, atcViolations
- V2 Grade (5): gradeEstimated, scoreEstimated, scoreGforce, gforceAlert, cargoFillPercent
- V2 ATC (4): atcAssignedAlt, atcAltDeviation, atcCruiseSpd, atcSpdDeviation
- V3 Lights (7): lightNav, lightStrobe, lightBeacon, lightLanding, lightTaxi, lightsMissing, lightsAlert

---

## Key Constants
- `SIMVAR_UPDATE_INTERVAL_MS = 500` — readSimVars() frequency
- `FLIGHT_TRACKING_INTERVAL_MS = 2000` — TrackingManager tick frequency

## Files Summary
| File | Role |
|------|------|
| `src/services/SimVarReader.ts` | Centralized SimVar reads + types |
| `src/managers/TrackingManager.ts` | Mission tracking (2s loop, accumulators, FlightSummary) |
| `src/services/FlightTracker.ts` | Free flight tracking (receives FlightTickData) |
| `src/controllers/FreeFlightController.ts` | Bridge: CriticalSnapshot → FlightTickData |
| `src/controllers/MissionController.ts` | Mission completion flow, uses getFlightSummary() |
| `src/services/LocalMissionService.ts` | XP/grade scoring, anti-cheat penalties |
| `src/state/SimVarState.ts` | 15 UI Subjects (500ms) |
| `src/state/TrackingState.ts` | 34 UI Subjects (2s) |
| `src/AeroCorpOnline.tsx` | readSimVars() entry point |
