/**
 * freeFlightRecapHelper - Builds translations and renders free flight recap popup
 */
import type { FreeFlightRecapData } from "../state/FreeFlightState";
import { renderFreeFlightRecapHtml, type FreeFlightRecapTranslations } from "./FreeFlightRenderHelpers";

/**
 * Build FreeFlightRecapTranslations from a locale's freeFlight section.
 * The JSON keys match FreeFlightRecapTranslations exactly.
 */
export function buildRecapTranslations(freeFlight: Record<string, string>): FreeFlightRecapTranslations {
  return {
    reportTitle: freeFlight.reportTitle,
    departure: freeFlight.departure,
    arrival: freeFlight.arrival,
    distance: freeFlight.distance,
    flightTime: freeFlight.flightTime,
    fuelRemaining: freeFlight.fuelRemaining,
    flightQuality: freeFlight.flightQuality,
    landing: freeFlight.landing,
    gforceMax: freeFlight.gforceMax,
    atcCompliance: freeFlight.atcCompliance,
    violations: freeFlight.violations,
    bonuses: freeFlight.bonuses,
    bonusRealTime: freeFlight.bonusRealTime,
    bonusNight: freeFlight.bonusNight,
    bonusAtc: freeFlight.bonusAtc,
    bonusFuelEco: freeFlight.bonusFuelEco,
    bonusNoAP: freeFlight.bonusNoAP,
    bonusBadWeather: freeFlight.bonusBadWeather,
    totalBonus: freeFlight.totalBonus,
    result: freeFlight.result,
    score: freeFlight.score,
    grade: freeFlight.grade,
    xpEarned: freeFlight.xpEarned,
    moneyEarned: freeFlight.moneyEarned,
    moneyDisabled: freeFlight.moneyDisabled,
    close: freeFlight.close,
    butter: freeFlight.butter,
    smooth: freeFlight.smooth,
    normal: freeFlight.normal,
    hard: freeFlight.hard,
    crash: freeFlight.crash,
    perfect: freeFlight.perfect,
    ok: freeFlight.ok,
    poor: freeFlight.poor,
  };
}

/**
 * Render recap popup HTML into element and bind close button.
 */
export function renderAndBindRecap(
  el: HTMLDivElement,
  recapData: FreeFlightRecapData,
  freeFlight: Record<string, string>,
  onClose: () => void
): void {
  const recapTr = buildRecapTranslations(freeFlight);
  el.innerHTML = renderFreeFlightRecapHtml(recapData, recapTr);

  const closeBtn = el.querySelector(".ff-recap-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", onClose);
  }
}
