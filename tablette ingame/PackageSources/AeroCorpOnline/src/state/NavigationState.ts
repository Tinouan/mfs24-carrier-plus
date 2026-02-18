/**
 * NavigationState - Tab navigation state
 * Extracted from AeroCorpOnline.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { TabType, ProfileSubTab, MissionsSubTab, CompanySubTab, ContratsSubTab, MarketSubTab, BusinessSubTab } from "../types";

// ═══════════════════════════════════════════════════════════
// NAVIGATION STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface NavigationStateType {
  activeTab: Subject<TabType>;
  profileSubTab: Subject<ProfileSubTab>;
  missionsSubTab: Subject<MissionsSubTab>;
  contratsSubTab: Subject<ContratsSubTab>;
  companySubTab: Subject<CompanySubTab>;
  marketSubTab: Subject<MarketSubTab>;
  businessSubTab: Subject<BusinessSubTab>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const navigationState: NavigationStateType = {
  activeTab: Subject.create<TabType>("map"),
  profileSubTab: Subject.create<ProfileSubTab>("apercu"),
  missionsSubTab: Subject.create<MissionsSubTab>("disponibles"),
  contratsSubTab: Subject.create<ContratsSubTab>("dashboard"),
  companySubTab: Subject.create<CompanySubTab>("overview"),
  marketSubTab: Subject.create<MarketSubTab>("inventory"),
  businessSubTab: Subject.create<BusinessSubTab>("marche"),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getActiveTab = (): TabType => navigationState.activeTab.get();
export const setActiveTab = (tab: TabType): void => navigationState.activeTab.set(tab);
