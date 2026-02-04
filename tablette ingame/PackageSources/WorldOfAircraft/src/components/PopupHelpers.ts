/**
 * PopupHelpers - HTML generation for popup components
 * Extracted from WorldOfAircraft.tsx for better maintainability
 *
 * These functions generate innerHTML strings for popups.
 * Event listeners must be attached by the caller after setting innerHTML.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RefuelPopupData {
  registration: string;
  aircraftType: string;
  currentFuel: number;
  maxFuel: number;
  targetFuel: number;
  pricePerGallon: number;
  translations: {
    refuelTitle: string;
    currentLevel: string;
    target: string;
    toAdd: string;
    total: string;
    cancel: string;
    full: string;
  };
}

export interface SystemsPopupData {
  registration: string;
  aircraftType: string;
  flightHours: number;
  systems: Array<{ key: string; label: string; value: number }>;
  translations: {
    systemsStatus: string;
    flightHoursShort: string;
    overallCondition: string;
    good: string;
    worn: string;
    critical: string;
    repair: string;
  };
}

export interface RepairItemData {
  system: string;
  label: string;
  currentCondition: number;
  cost: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stop keyboard event propagation to prevent MSFS from capturing key presses
 * Use on all input fields: onkeydown={stopKeyPropagation} onkeyup={stopKeyPropagation}
 * Uses both stopPropagation() and stopImmediatePropagation() for maximum blocking
 */
export function stopKeyPropagation(e: KeyboardEvent): void {
  e.stopPropagation();
  e.stopImmediatePropagation();
}

/**
 * Input props helper - returns props object to spread on input elements
 * Prevents MSFS from capturing keyboard input
 * Uses both stopPropagation() and stopImmediatePropagation() for maximum blocking
 */
export const inputStopPropagation = {
  onkeydown: (e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); },
  onkeyup: (e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); },
  onkeypress: (e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); },
};

// Declare Coherent for MSFS keyboard capture API
declare const Coherent: {
  trigger: (event: string, data?: unknown) => void;
  call: (name: string, ...args: unknown[]) => Promise<unknown>;
};

/**
 * Setup Coherent keyboard capture for an input element
 * This is the proper way to prevent MSFS from capturing keyboard input in Coherent GT
 *
 * When the input is focused, tells MSFS to stop capturing keyboard events
 * When the input loses focus, releases keyboard back to the simulator
 *
 * @param input - The HTMLInputElement to setup keyboard capture for
 * @example
 * // After your input element is rendered:
 * setupCoherentKeyboardCapture(myInputRef.instance);
 */
export function setupCoherentKeyboardCapture(input: HTMLInputElement | null): void {
  if (!input) return;

  // Generate a unique ID for this input
  const uuid = `woa-input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // When input is focused, tell MSFS to capture keyboard for the EFB
  input.addEventListener("focus", () => {
    console.log("[PopupHelpers] Input focused - requesting keyboard capture via Coherent");
    // Tell MSFS to capture keyboard input for this field
    if (typeof Coherent !== "undefined") {
      Coherent.trigger("FOCUS_INPUT_FIELD", { uuid, isPassword: input.type === "password" });
    }
  });

  // When input loses focus, release keyboard back to simulator
  input.addEventListener("blur", () => {
    console.log("[PopupHelpers] Input blurred - releasing keyboard via Coherent");
    if (typeof Coherent !== "undefined") {
      Coherent.trigger("UNFOCUS_INPUT_FIELD", uuid);
    }
  });
}

/**
 * Get gauge color based on percentage value
 */
export function getGaugeColor(value: number): string {
  if (value >= 70) return "#22c55e"; // Green
  if (value >= 40) return "#f97316"; // Orange
  return "#ef4444"; // Red
}

/**
 * Get fuel gauge color based on percentage
 */
export function getFuelGaugeColor(percent: number): string {
  if (percent > 50) return "#22c55e";
  if (percent > 25) return "#f59e0b";
  return "#ef4444";
}

// ═══════════════════════════════════════════════════════════════════════════
// REFUEL POPUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for the refuel popup
 * CSS classes for event binding:
 * - .refuel-close-btn - Close button
 * - .refuel-cancel-btn - Cancel button
 * - .refuel-full-btn - Full tank button
 * - .refuel-confirm-btn - Confirm button
 * - .refuel-slider - Fuel slider input
 */
export function renderRefuelPopupHtml(data: RefuelPopupData): string {
  const { registration, aircraftType, currentFuel, maxFuel, targetFuel, pricePerGallon, translations } = data;

  const fuelToAdd = Math.max(0, targetFuel - currentFuel);
  const cost = fuelToAdd * pricePerGallon;
  const targetPercent = maxFuel > 0 ? Math.round((targetFuel / maxFuel) * 100) : 0;
  const currentPercent = maxFuel > 0 ? Math.round((currentFuel / maxFuel) * 100) : 0;
  const gaugeColor = getFuelGaugeColor(targetPercent);

  return `
    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 100;">
      <div style="background: #1f2937; border: 2px solid #374151; border-radius: 12px; padding: 20px; width: 320px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="font-size: 18px; font-weight: 700; color: white;">${translations.refuelTitle}</div>
          <button class="refuel-close-btn" style="background: none; border: none; color: #9ca3af; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">×</button>
        </div>

        <!-- Aircraft Info -->
        <div style="font-size: 14px; color: #9ca3af; margin-bottom: 16px; padding: 10px; background: #374151; border-radius: 8px;">
          <span style="font-weight: 600; color: white;">${registration}</span> - ${aircraftType}
        </div>

        <!-- Fuel Gauge -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; color: #9ca3af; margin-bottom: 8px;">
            ${translations.currentLevel}: <span style="color: white; font-weight: 600;">${Math.round(currentFuel)} gal</span> (${currentPercent}%)
          </div>
          <div style="height: 20px; background: #374151; border-radius: 10px; overflow: hidden; position: relative;">
            <div style="position: absolute; left: ${currentPercent}%; top: 0; bottom: 0; width: 3px; background: white; z-index: 2;"></div>
            <div style="height: 100%; width: ${targetPercent}%; background: ${gaugeColor}; border-radius: 10px; transition: width 0.1s;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 6px;">
            <span style="font-size: 11px; color: #6b7280;">0 gal</span>
            <span style="font-size: 11px; color: #6b7280;">${Math.round(maxFuel)} gal</span>
          </div>
        </div>

        <!-- Slider -->
        <div style="margin-bottom: 20px;">
          <input type="range" class="refuel-slider" min="${Math.round(currentFuel)}" max="${Math.round(maxFuel)}" value="${Math.round(targetFuel)}"
            style="width: 100%; height: 12px; -webkit-appearance: none; background: #374151; border-radius: 6px; outline: none; cursor: pointer;">
        </div>

        <!-- Target + Cost Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 12px; background: #374151; border-radius: 8px;">
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${translations.target}</div>
            <div style="font-size: 24px; font-weight: 700; color: ${gaugeColor};">${Math.round(targetFuel)} gal</div>
            <div style="font-size: 11px; color: #9ca3af;">+${Math.round(fuelToAdd)} gal ${translations.toAdd}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${translations.total}</div>
            <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">$${cost.toFixed(2)}</div>
            <div style="font-size: 11px; color: #9ca3af;">@ $${pricePerGallon.toFixed(2)}/gal</div>
          </div>
        </div>

        <!-- Buttons -->
        <div style="display: flex; gap: 10px;">
          <button class="refuel-cancel-btn" style="flex: 1; padding: 14px; background: #374151; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
            ${translations.cancel}
          </button>
          <button class="refuel-full-btn" style="flex: 1; padding: 14px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
            ${translations.full}
          </button>
          <button class="refuel-confirm-btn" style="flex: 1; padding: 14px; background: #22c55e; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
            OK
          </button>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEMS POPUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for the systems status popup
 * CSS classes for event binding:
 * - .systems-close-btn - Close button
 * - .systems-repair-btn - Repair button
 */
export function renderSystemsPopupHtml(data: SystemsPopupData): string {
  const { registration, aircraftType, flightHours, systems, translations } = data;

  const overallCondition = Math.round(systems.reduce((sum, s) => sum + s.value, 0) / systems.length);
  const overallColor = getGaugeColor(overallCondition);

  const systemsHtml = systems.map(sys => {
    const color = getGaugeColor(sys.value);
    return `
      <div style="background: #374151; border-radius: 8px; padding: 10px 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 12px; color: #d1d5db;">${sys.label}</span>
          <span style="font-size: 14px; font-weight: 600; color: ${color};">${sys.value}%</span>
        </div>
        <div style="height: 8px; background: #1f2937; border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; width: ${sys.value}%; background: ${color}; border-radius: 4px; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 100;">
      <div style="background: #1f2937; border: 2px solid #374151; border-radius: 12px; padding: 20px; width: 360px; max-height: 90%; overflow-y: auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="font-size: 16px; font-weight: 600; color: white;">${translations.systemsStatus}</div>
          <button class="systems-close-btn" style="background: #374151; border: none; border-radius: 4px; padding: 4px 10px; color: #9ca3af; cursor: pointer; font-size: 14px;">[X]</button>
        </div>

        <!-- Aircraft Info -->
        <div style="background: #374151; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 14px; font-weight: 600; color: white;">${registration || "N/A"}</div>
          <div style="font-size: 12px; color: #9ca3af;">${aircraftType}</div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">${Math.round(flightHours)}${translations.flightHoursShort}</div>
        </div>

        <!-- Overall Condition -->
        <div style="background: #374151; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; color: #9ca3af; text-transform: uppercase;">${translations.overallCondition}</span>
            <span style="font-size: 18px; font-weight: 700; color: ${overallColor};">${overallCondition}%</span>
          </div>
          <div style="height: 12px; background: #1f2937; border-radius: 6px; overflow: hidden;">
            <div style="height: 100%; width: ${overallCondition}%; background: ${overallColor}; border-radius: 6px; transition: width 0.3s;"></div>
          </div>
        </div>

        <!-- Systems List -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${systemsHtml}
        </div>

        <!-- Legend -->
        <div style="display: flex; justify-content: center; gap: 16px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #374151;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 10px; height: 10px; background: #22c55e; border-radius: 2px;"></div>
            <span style="font-size: 10px; color: #9ca3af;">${translations.good} (70%+)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 10px; height: 10px; background: #f97316; border-radius: 2px;"></div>
            <span style="font-size: 10px; color: #9ca3af;">${translations.worn} (40-69%)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 10px; height: 10px; background: #ef4444; border-radius: 2px;"></div>
            <span style="font-size: 10px; color: #9ca3af;">${translations.critical} (-40%)</span>
          </div>
        </div>

        <!-- Repair Button -->
        <button class="systems-repair-btn" style="width: 100%; margin-top: 16px; padding: 12px; background: #f59e0b; color: #1a1a24; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; text-transform: uppercase;">
          ${translations.repair}
        </button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// REPAIR LIST HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for repair quote list items
 */
export function renderRepairListHtml(items: RepairItemData[], noRepairText: string, loadingText: string): string {
  if (!items || items.length === 0) {
    return `
      <div style="text-align: center; padding: 16px; color: #22c55e; font-size: 11px;">
        ${noRepairText}
      </div>
    `;
  }

  return items.map(item => {
    const pct = Math.round(item.currentCondition);
    const cost = Math.round(item.cost).toLocaleString();
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
        <div>
          <div style="font-size: 11px; color: white;">${item.label}</div>
          <div style="font-size: 9px; color: #6b7280;">${pct}% → 100%</div>
        </div>
        <div style="font-size: 11px; color: #f59e0b; font-weight: 600;">
          $${cost}
        </div>
      </div>
    `;
  }).join("");
}
