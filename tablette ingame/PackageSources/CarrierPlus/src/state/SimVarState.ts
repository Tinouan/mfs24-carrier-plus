/**
 * SimVarState - Flight data from simulator variables
 * Extracted from CarrierPlus.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { LandingRating } from "../types";

// ═══════════════════════════════════════════════════════════
// SIMVAR STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface SimVarStateType {
  // Position
  latitude: Subject<number>;
  longitude: Subject<number>;
  altitude: Subject<number>;
  heading: Subject<number>;

  // Speeds
  groundSpeed: Subject<number>;
  verticalSpeed: Subject<number>;
  airspeed: Subject<number>;

  // Status
  onGround: Subject<boolean>;
  gForce: Subject<number>;

  // Fuel
  fuelQuantity: Subject<number>;

  // Landing detection
  touchdownVelocity: Subject<number>;
  lastLandingRate: Subject<number | null>;
  landingRating: Subject<LandingRating>;

  // Nearest airport
  closestAirport: Subject<string>;

  // Current aircraft registration (anti-cheat)
  currentSimAircraftReg: Subject<string>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const simVarState: SimVarStateType = {
  // Position
  latitude: Subject.create(0),
  longitude: Subject.create(0),
  altitude: Subject.create(0),
  heading: Subject.create(0),

  // Speeds
  groundSpeed: Subject.create(0),
  verticalSpeed: Subject.create(0),
  airspeed: Subject.create(0),

  // Status
  onGround: Subject.create(true),
  gForce: Subject.create(1.0),

  // Fuel
  fuelQuantity: Subject.create(0),

  // Landing detection
  touchdownVelocity: Subject.create(0),
  lastLandingRate: Subject.create<number | null>(null),
  landingRating: Subject.create<LandingRating>(null),

  // Nearest airport
  closestAirport: Subject.create("----"),

  // Current aircraft registration
  currentSimAircraftReg: Subject.create(""),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getPosition = () => ({
  lat: simVarState.latitude.get(),
  lon: simVarState.longitude.get(),
  alt: simVarState.altitude.get(),
  hdg: simVarState.heading.get(),
});

export const isOnGround = (): boolean => simVarState.onGround.get();
