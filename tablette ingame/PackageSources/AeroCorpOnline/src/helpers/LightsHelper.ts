/**
 * LightsHelper - Shared lights compliance evaluation
 *
 * Used by:
 * - TrackingManager (missions) — with FlightPhase-based isDescending
 * - FreeFlightController (free flight) — with VS-based isDescending
 *
 * 4-state system:
 * 0 = grey  (OFF + not required)
 * 1 = green (ON + required)
 * 2 = red   (OFF + required)
 * 3 = orange (ON + not required)
 */

export interface LightsStatus {
  nav: number;
  strobe: number;
  beacon: number;
  landing: number;
  taxi: number;
  missing: number;      // count of state === 2
  unnecessary: number;  // count of state === 3
  statusColor: string;  // "green" | "orange" | "red"
}

/**
 * Evaluate lights compliance based on flight state.
 *
 * @param onGround - is aircraft on the ground
 * @param isNightOrDusk - timeOfDay >= 2
 * @param altitude - altitude in ft MSL
 * @param isDescending - VS < -300 for free flight, or FlightPhase-based for missions
 * @param lightsOn - current state of each light
 */
export function evaluateLightsStatus(
  onGround: boolean,
  isNightOrDusk: boolean,
  altitude: number,
  isDescending: boolean,
  lightsOn: { nav: boolean; strobe: boolean; beacon: boolean; landing: boolean; taxi: boolean }
): LightsStatus {
  // Requirements by phase
  const beaconReq = true;
  const strobeReq = !onGround;
  const navReq = isNightOrDusk;
  const landingReq = (isNightOrDusk && !onGround) || (!onGround && altitude < 10000 && isDescending);
  const taxiReq = onGround;

  // 4-state evaluation
  const evaluate = (isOn: boolean, required: boolean): number => {
    if (isOn) return required ? 1 : 3;
    return required ? 2 : 0;
  };

  const nav = evaluate(lightsOn.nav, navReq);
  const strobe = evaluate(lightsOn.strobe, strobeReq);
  const beacon = evaluate(lightsOn.beacon, beaconReq);
  const landing = evaluate(lightsOn.landing, landingReq);
  const taxi = evaluate(lightsOn.taxi, taxiReq);

  const allStates = [nav, strobe, beacon, landing, taxi];
  const missing = allStates.filter(s => s === 2).length;
  const unnecessary = allStates.filter(s => s === 3).length;
  const statusColor = missing > 0 ? "red" : unnecessary > 0 ? "orange" : "green";

  return { nav, strobe, beacon, landing, taxi, missing, unnecessary, statusColor };
}
