/**
 * NavigationState - Tab navigation state
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { TabType, ProfileSubTab, MissionsSubTab, CompanySubTab } from "../types";

// ═══════════════════════════════════════════════════════════
// NAVIGATION STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface NavigationStateType {
  activeTab: Subject<TabType>;
  profileSubTab: Subject<ProfileSubTab>;
  missionsSubTab: Subject<MissionsSubTab>;
  companySubTab: Subject<CompanySubTab>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const navigationState: NavigationStateType = {
  activeTab: Subject.create<TabType>("map"),
  profileSubTab: Subject.create<ProfileSubTab>("apercu"),
  missionsSubTab: Subject.create<MissionsSubTab>("apercu"),
  companySubTab: Subject.create<CompanySubTab>("apercu"),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getActiveTab = (): TabType => navigationState.activeTab.get();
export const setActiveTab = (tab: TabType): void => navigationState.activeTab.set(tab);
