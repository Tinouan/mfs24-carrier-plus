/**
 * CompanyPermissions - Role-based access control for company actions
 * Phase 4: Company Extended
 */

import type { CompanyRole } from "../types";

// ═══════════════════════════════════════════════════════════
// PERMISSION MATRIX
// ═══════════════════════════════════════════════════════════

export type CompanyAction =
  | "missions"
  | "market_buy"
  | "market_sell"
  | "transfer_in"
  | "transfer_out"
  | "invite"
  | "manage_roles"
  | "message_pin";

const ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  ceo:     { missions: true, market_buy: true, market_sell: true, transfer_in: true, transfer_out: true, invite: true, manage_roles: true, message_pin: true },
  officer: { missions: true, market_buy: true, market_sell: true, transfer_in: true, transfer_out: true, invite: true, manage_roles: false, message_pin: false },
  pilot:   { missions: true, market_buy: false, market_sell: false, transfer_in: true, transfer_out: false, invite: false, manage_roles: false, message_pin: false },
  recruit: { missions: false, market_buy: false, market_sell: false, transfer_in: true, transfer_out: false, invite: false, manage_roles: false, message_pin: false },
};

// ═══════════════════════════════════════════════════════════
// GUARD FUNCTION
// ═══════════════════════════════════════════════════════════

export function hasCompanyPermission(role: CompanyRole | string, action: string): boolean {
  // Map legacy roles
  const mappedRole = role === "owner" ? "ceo" : role === "admin" ? "officer" : role === "member" ? "recruit" : role;
  return ROLE_PERMISSIONS[mappedRole]?.[action] ?? false;
}

// ═══════════════════════════════════════════════════════════
// BADGE HELPERS
// ═══════════════════════════════════════════════════════════

export function getRoleBadgeColor(role: CompanyRole | string): string {
  switch (role) {
    case "ceo": case "owner": return "#eab308";
    case "officer": case "admin": return "#3b82f6";
    case "pilot": return "#22c55e";
    case "recruit": case "member": return "#6b7280";
    default: return "#6b7280";
  }
}

export function getRoleLabel(role: CompanyRole | string): string {
  switch (role) {
    case "ceo": case "owner": return "CEO";
    case "officer": case "admin": return "OFFICER";
    case "pilot": return "PILOT";
    case "recruit": case "member": return "RECRUIT";
    default: return role.toUpperCase();
  }
}
