/**
 * PlayerHelpers - Player progression and stats helper functions
 * Pure functions for level calculation and stats formatting
 */

import type { LevelInfo } from "../types";

// ═══════════════════════════════════════════════════════════
// LEVEL CALCULATION
// ═══════════════════════════════════════════════════════════

/**
 * Calcule le niveau du joueur depuis son XP total
 * Courbe progressive : chaque niveau demande un peu plus d'XP
 * Level 1 = 0 XP, Level 2 = 1000 XP, Level 3 = 3000 XP, etc.
 *
 * @param xp Total XP earned by the player
 * @returns LevelInfo object with level, currentXp, nextLevelXp, and progress
 */
export function calculateLevel(xp: number): LevelInfo {
  if (xp < 0) xp = 0;

  // Formule : XP requis pour level N = N * 1000
  // Total XP pour atteindre level N = sum(1..N-1) * 1000 = N*(N-1)/2 * 1000
  let level = 1;
  let totalRequired = 0;

  while (totalRequired + level * 1000 <= xp) {
    totalRequired += level * 1000;
    level++;
  }

  const currentXp = xp - totalRequired;
  const nextLevelXp = level * 1000;
  const progress = nextLevelXp > 0 ? (currentXp / nextLevelXp) * 100 : 0;

  return {
    level,
    currentXp,
    nextLevelXp,
    progress: Math.min(100, Math.max(0, progress)),
  };
}

// ═══════════════════════════════════════════════════════════
// STATS FORMATTING
// ═══════════════════════════════════════════════════════════

/**
 * Format flight time from minutes to human-readable string
 * @param minutes Total flight time in minutes
 * @returns Formatted string like "45h 30min" or "2h 15min"
 */
export function formatFlightTime(minutes: number): string {
  if (minutes < 0 || isNaN(minutes)) return "0h";

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) {
    return `${mins}min`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}min`;
}

/**
 * Format distance in nautical miles
 * @param nm Distance in nautical miles
 * @returns Formatted string like "1,234 nm"
 */
export function formatDistance(nm: number): string {
  if (nm < 0 || isNaN(nm)) return "0 nm";
  return `${Math.round(nm).toLocaleString()} nm`;
}

/**
 * Format money/currency
 * @param amount Amount in credits/dollars
 * @returns Formatted string like "$12,345"
 */
export function formatMoney(amount: number): string {
  if (isNaN(amount)) return "0 CR";
  return `${Math.round(amount).toLocaleString()} CR`;
}

/**
 * Format money with explicit sign (+/-)
 * @param amount Amount in credits
 * @returns Formatted string like "+12,345 CR" or "-12,345 CR"
 */
export function formatMoneyWithSign(amount: number): string {
  if (isNaN(amount)) return "0 CR";
  const abs = Math.round(Math.abs(amount));
  return amount >= 0 ? `+${abs.toLocaleString()} CR` : `-${abs.toLocaleString()} CR`;
}

/**
 * Get nationality flag emoji from ISO country code
 * @param countryCode ISO 3166-1 alpha-2 country code
 * @returns Flag emoji or empty string if invalid
 */
export function getCountryFlag(countryCode: string | undefined): string {
  if (!countryCode || countryCode.length !== 2) return "";

  // Convert country code to regional indicator symbols
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));

  return String.fromCodePoint(...codePoints);
}
