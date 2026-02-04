/**
 * MissionRenderHelpers - HTML generation for mission UI components
 * Pure functions that generate innerHTML strings for mission panels.
 * Event listeners must be attached by the caller after setting innerHTML.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MissionAircraftData {
  registration: string | null;
  aircraft_type: string;
  icao_type: string | null;
  owner_type: string;
  cargo_capacity_kg: number;
  passenger_capacity: number;
  fuel_gallons: number;
  fuel_capacity_gallons: number;
  condition: number;
  hours: number;
}

export interface MissionAircraftTranslations {
  loadingAircraft: string;
  aircraftNotRecognized: string;
  registrationNotInFleet: string;
  aircraftNotDetected: string;
  addAircraftToHangar: string;
  waitingForAircraft: string;
  personalBadge: string;
  companyBadge: string;
  passengers: string;
  fuel: string;
  overallConditionLabel: string;
  detail: string;
  flightHoursShort: string;
  wear: string;
}

export interface MissionAircraftInfoState {
  loading: boolean;
  notFound: boolean;
  aircraft: MissionAircraftData | null;
  currentReg: string;
  errorMessage: string | null;
  overallConditionPercent: number | null; // From systems data if available
}

// ═══════════════════════════════════════════════════════════════════════════
// MISSION AIRCRAFT INFO HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for mission aircraft info card
 * CSS classes for event binding:
 * - .mission-refuel-btn - Refuel button
 * - .mission-systems-btn - Systems detail button
 */
export function renderMissionAircraftInfoHtml(
  state: MissionAircraftInfoState,
  translations: MissionAircraftTranslations
): string {
  const { loading, notFound, aircraft, currentReg, errorMessage, overallConditionPercent } = state;

  // Loading state
  if (loading) {
    return `
      <div style="text-align: center; padding: 16px; color: #60a5fa; font-size: 11px;">
        <div style="margin-bottom: 6px;">${translations.loadingAircraft}</div>
        <div style="width: 24px; height: 24px; border: 2px solid #60a5fa; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      </div>
    `;
  }

  // Not found / error state
  if (notFound) {
    const errorTitle = errorMessage ? "ANTI-CHEAT" : translations.aircraftNotRecognized;
    const errorDetail = errorMessage || (currentReg ? translations.registrationNotInFleet : translations.aircraftNotDetected);

    return `
      <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <svg style="width: 18px; height: 18px; fill: #ef4444;" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <span style="font-size: 12px; color: #ef4444; font-weight: 600;">${errorTitle}</span>
        </div>
        <div style="font-size: 10px; color: #fca5a5;">
          ${errorDetail}
        </div>
      </div>
    `;
  }

  // No aircraft yet
  if (!aircraft) {
    return `
      <div style="text-align: center; padding: 16px; color: #6b7280; font-size: 11px;">
        ${translations.waitingForAircraft}
      </div>
    `;
  }

  // Calculate values
  const fuelPercent = aircraft.fuel_capacity_gallons > 0
    ? Math.round((aircraft.fuel_gallons / aircraft.fuel_capacity_gallons) * 100)
    : 0;
  const fuelColor = fuelPercent < 20 ? "#ef4444" : fuelPercent < 50 ? "#f59e0b" : "#22c55e";

  // Use provided overall condition or calculate from legacy field
  const conditionPercent = overallConditionPercent !== null
    ? overallConditionPercent
    : Math.round(aircraft.condition * 100);
  const conditionColor = conditionPercent < 50 ? "#ef4444" : conditionPercent < 75 ? "#f59e0b" : "#22c55e";

  // Owner badge
  const ownerBadge = aircraft.owner_type === "personal" || aircraft.owner_type === "player"
    ? `<span style="font-size: 8px; background: #10b981; color: white; padding: 1px 6px; border-radius: 4px;">${translations.personalBadge}</span>`
    : `<span style="font-size: 8px; background: #6366f1; color: white; padding: 1px 6px; border-radius: 4px;">${translations.companyBadge}</span>`;

  return `
    <div style="background: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 10px;">
      <!-- Header: Registration + Type + Owner -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
        <div>
          <div style="font-size: 16px; font-weight: 700; color: white; font-family: monospace;">
            ${aircraft.registration || "N/A"}
          </div>
          <div style="font-size: 11px; color: #9ca3af;">${aircraft.aircraft_type}</div>
        </div>
        <div style="text-align: right;">
          ${ownerBadge}
          <div style="font-size: 9px; color: #6b7280; margin-top: 4px;">
            ${aircraft.icao_type || "---"}
          </div>
        </div>
      </div>

      <!-- Stats Row 1: Cargo + Passagers -->
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <div style="flex: 1; background: #374151; border-radius: 4px; padding: 6px 8px;">
          <div style="font-size: 8px; color: #6b7280; text-transform: uppercase;">Cargo</div>
          <div style="font-size: 14px; font-weight: 600; color: white;">${aircraft.cargo_capacity_kg} kg</div>
        </div>
        <div style="flex: 1; background: #374151; border-radius: 4px; padding: 6px 8px;">
          <div style="font-size: 8px; color: #6b7280; text-transform: uppercase;">${translations.passengers}</div>
          <div style="font-size: 14px; font-weight: 600; color: white;">${aircraft.passenger_capacity} pax</div>
        </div>
      </div>

      <!-- Stats Row 2: Fuel with gauge + Condition -->
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <!-- Fuel Card with Gauge -->
        <div style="flex: 1; background: #374151; border-radius: 4px; padding: 6px 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="font-size: 8px; color: #6b7280; text-transform: uppercase;">${translations.fuel}</div>
            <button class="mission-refuel-btn" style="font-size: 8px; background: #3b82f6; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">
              REMPLIR
            </button>
          </div>
          <!-- Fuel Gauge Bar -->
          <div style="height: 8px; background: #1f2937; border-radius: 4px; overflow: hidden; margin-bottom: 4px;">
            <div style="height: 100%; width: ${fuelPercent}%; background: ${fuelColor}; border-radius: 4px; transition: width 0.3s;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 12px; font-weight: 600; color: ${fuelColor};">${fuelPercent}%</span>
            <span style="font-size: 9px; color: #9ca3af;">${Math.round(aircraft.fuel_gallons)} / ${Math.round(aircraft.fuel_capacity_gallons)} gal</span>
          </div>
        </div>
        <!-- Condition Card with Gauge -->
        <div style="flex: 1; background: #374151; border-radius: 4px; padding: 6px 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="font-size: 8px; color: #6b7280; text-transform: uppercase;">${translations.overallConditionLabel}</div>
            <button class="mission-systems-btn" style="font-size: 8px; background: #6366f1; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">
              ${translations.detail}
            </button>
          </div>
          <!-- Condition Gauge Bar -->
          <div style="height: 8px; background: #1f2937; border-radius: 4px; overflow: hidden; margin-bottom: 4px;">
            <div style="height: 100%; width: ${conditionPercent}%; background: ${conditionColor}; border-radius: 4px;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 12px; font-weight: 600; color: ${conditionColor};">${conditionPercent}%</span>
            <span style="font-size: 9px; color: #9ca3af;">${Math.round(aircraft.hours)}${translations.flightHoursShort}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}
