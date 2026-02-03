/**
 * CompanyState - Company data and members state
 * Extracted from CarrierPlus.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { CompanyData, CompanyMember, CompanyFleetItem } from "../types";

// ═══════════════════════════════════════════════════════════
// COMPANY STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface CompanyStateType {
  // Full company data object
  companyData: Subject<CompanyData | null>;
  companyMembers: Subject<CompanyMember[]>;
  companyFleet: Subject<CompanyFleetItem[]>;
  companyLoading: Subject<boolean>;

  // Direct access fields (for P2P persistence)
  companyId: Subject<string>;
  companyName: Subject<string>;
  companyBalance: Subject<number>;

  // Buy company form (P2P mode)
  buyCompanyName: Subject<string>;
  buyCompanyLoading: Subject<boolean>;
  buyCompanyError: Subject<string | null>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const companyState: CompanyStateType = {
  // Full company data object
  companyData: Subject.create<CompanyData | null>(null),
  companyMembers: Subject.create<CompanyMember[]>([]),
  companyFleet: Subject.create<CompanyFleetItem[]>([]),
  companyLoading: Subject.create(false),

  // Direct access fields (for P2P persistence)
  companyId: Subject.create<string>(""),
  companyName: Subject.create<string>(""),
  companyBalance: Subject.create<number>(0),

  // Buy company form (P2P mode)
  buyCompanyName: Subject.create<string>(""),
  buyCompanyLoading: Subject.create(false),
  buyCompanyError: Subject.create<string | null>(null),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getCompanyData = (): CompanyData | null => companyState.companyData.get();
export const getCompanyBalance = (): number => companyState.companyData.get()?.balance ?? 0;
export const hasCompany = (): boolean => companyState.companyData.get() !== null;

export const clearCompanyData = (): void => {
  companyState.companyData.set(null);
  companyState.companyMembers.set([]);
  companyState.companyFleet.set([]);
};
