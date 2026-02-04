/**
 * FreeFlightState - State management for free flight (career mode)
 * Simpler than missions - just track flight time, landings, fuel usage
 */
import { Subject } from "@microsoft/msfs-sdk";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FreeFlightStatus = "idle" | "preparing" | "in_flight" | "paused" | "completed";

export interface FreeFlightSession {
  id: string;
  aircraft_id: string;
  aircraft_registration: string;
  aircraft_type: string;
  start_airport: string;
  start_time: Date;
  end_airport?: string;
  end_time?: Date;
  flight_time_minutes: number;
  landings_count: number;
  fuel_used_gallons: number;
  distance_flown_nm: number;
  xp_earned: number;
}

export interface FreeFlightStats {
  totalFlightTime: number;      // Minutes
  totalLandings: number;
  totalDistanceNm: number;
  totalFuelUsed: number;        // Gallons
  sessionsToday: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

export const freeFlightState = {
  // Current session
  status: Subject.create<FreeFlightStatus>("idle"),
  currentSession: Subject.create<FreeFlightSession | null>(null),

  // P2P persistence fields
  sessionId: Subject.create<string>(""),
  isTracking: Subject.create<boolean>(false),
  startAirport: Subject.create<string>(""),
  xpEarned: Subject.create<number>(0),
  distanceNm: Subject.create<number>(0),  // Alias for distanceFlownNm

  // Flight tracking (real-time)
  flightTimeMinutes: Subject.create<number>(0),
  distanceFlownNm: Subject.create<number>(0),
  fuelUsedGallons: Subject.create<number>(0),
  landingsCount: Subject.create<number>(0),
  currentAltitude: Subject.create<number>(0),
  groundSpeed: Subject.create<number>(0),

  // Start position (for distance calculation)
  startLat: Subject.create<number>(0),
  startLon: Subject.create<number>(0),
  startFuelGallons: Subject.create<number>(0),

  // Airport detection
  departureAirport: Subject.create<string>(""),
  currentAirport: Subject.create<string | null>(null),
  isOnGround: Subject.create<boolean>(true),

  // XP preview
  estimatedXp: Subject.create<number>(0),
  xpPerMinute: Subject.create<number>(1), // Base XP rate

  // UI state
  showEndFlightConfirm: Subject.create<boolean>(false),
  loading: Subject.create<boolean>(false),
  error: Subject.create<string | null>(null),

  // Today's stats (from API)
  todayStats: Subject.create<FreeFlightStats | null>(null),
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function resetFreeFlightState(): void {
  freeFlightState.status.set("idle");
  freeFlightState.currentSession.set(null);
  freeFlightState.flightTimeMinutes.set(0);
  freeFlightState.distanceFlownNm.set(0);
  freeFlightState.fuelUsedGallons.set(0);
  freeFlightState.landingsCount.set(0);
  freeFlightState.startLat.set(0);
  freeFlightState.startLon.set(0);
  freeFlightState.startFuelGallons.set(0);
  freeFlightState.departureAirport.set("");
  freeFlightState.currentAirport.set(null);
  freeFlightState.estimatedXp.set(0);
  freeFlightState.error.set(null);
}

export function formatFlightTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}
