/**
 * SidebarTab - Reusable sidebar navigation tab component
 * Reduces repetitive tab button code in main render
 */
import { FSComponent, VNode, Subject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { TabType } from "../types";

// ═══════════════════════════════════════════════════════════
// TAB ICONS (SVG paths)
// ═══════════════════════════════════════════════════════════

export const TAB_ICONS: Record<TabType, VNode> = {
  profile: (
    <>
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
    </>
  ),
  map: (
    <>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </>
  ),
  missions: (
    <>
      <path d="M21.5 11.5L12 17L2.5 11.5"/>
      <path d="M21.5 6.5L12 12L2.5 6.5L12 1L21.5 6.5Z"/>
      <path d="M21.5 16.5L12 22L2.5 16.5"/>
    </>
  ),
  company: (
    <>
      <path d="M3 21h18"/>
      <path d="M5 21V7l8-4v18"/>
      <path d="M19 21V11l-6-4"/>
      <path d="M9 9v.01"/>
      <path d="M9 12v.01"/>
      <path d="M9 15v.01"/>
      <path d="M9 18v.01"/>
    </>
  ),
  contrats: (
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6"/>
      <path d="M16 13H8"/>
      <path d="M16 17H8"/>
      <path d="M10 9H8"/>
    </>
  ),
  market: (
    <>
      <path d="M12 2v20"/>
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </>
  ),
  hangar: (
    <>
      <path d="M3 21h18"/>
      <path d="M5 21V7l7-4 7 4v14"/>
      <path d="M9 21v-6h6v6"/>
      <path d="M10 10h4"/>
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
    </>
  ),
};

// ═══════════════════════════════════════════════════════════
// SIDEBAR TAB PROPS
// ═══════════════════════════════════════════════════════════

export interface SidebarTabProps {
  tabId: TabType;
  activeTab: Subject<TabType>;
  onClick: () => void;
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR TAB COMPONENT
// ═══════════════════════════════════════════════════════════

export function renderSidebarTab(props: SidebarTabProps): VNode {
  const { tabId, activeTab, onClick } = props;
  const icon = TAB_ICONS[tabId];

  return (
    <Button callback={onClick}>
      <div style={activeTab.map(t => t === tabId
        ? "width: 40px; height: 32px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.3); border-left: 2px solid #3b82f6;"
        : "width: 40px; height: 32px; display: flex; align-items: center; justify-content: center; background: transparent; border-left: 2px solid transparent;")}>
        <svg
          style="width: 18px; height: 18px;"
          viewBox="0 0 24 24"
          fill="none"
          stroke={activeTab.map(t => t === tabId ? "#3b82f6" : "#ffffff")}
          stroke-width="1.5"
        >
          {icon}
        </svg>
      </div>
    </Button>
  );
}
