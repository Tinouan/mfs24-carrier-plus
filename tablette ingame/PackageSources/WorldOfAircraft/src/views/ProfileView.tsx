/**
 * ProfileView - Profile tab render function
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, UserInfo, ProfileSubTab, ProfileInventoryItem } from "../types";

// Import translations
import frTranslations from "../locales/fr.json";
import enTranslations from "../locales/en.json";
import deTranslations from "../locales/de.json";
import esTranslations from "../locales/es.json";
import ruTranslations from "../locales/ru.json";

const translations = {
  en: enTranslations,
  fr: frTranslations,
  de: deTranslations,
  es: esTranslations,
  ru: ruTranslations,
} as const;

/**
 * Props interface for ProfileView
 */
export interface ProfileViewProps {
  activeTab: Subject<string>;
  profileSubTab: Subject<ProfileSubTab>;
  currentLanguage: Subject<Language>;
  currentUser: Subject<UserInfo | null>;
  onGround: Subject<boolean>;
  closestAirport: Subject<string>;
  // Inventory
  profileInventory: Subject<ProfileInventoryItem[]>;
  profileInventoryLoading: Subject<boolean>;
  profileIcaoFilter: Subject<string>;
  profileItemFilter: Subject<string>;
  profileTierFilter: Subject<number | null>;
  profileIcaoFilterRef: NodeReference<HTMLInputElement>;
  profileItemFilterRef: NodeReference<HTMLInputElement>;
  profileInventoryListRef: NodeReference<HTMLDivElement>;
  onFetchProfileInventory: () => void;
  onSetProfileTierFilter: (tier: number | null) => void;
}

/**
 * Render the Profile tab content
 */
export function renderProfileTab(props: ProfileViewProps): VNode {
  const {
    activeTab,
    profileSubTab,
    currentLanguage,
    currentUser,
    onGround,
    closestAirport,
    profileInventory,
    profileInventoryLoading,
    profileIcaoFilter,
    profileItemFilter,
    profileTierFilter,
    profileIcaoFilterRef,
    profileItemFilterRef,
    profileInventoryListRef,
    onFetchProfileInventory,
    onSetProfileTierFilter,
  } = props;

  return (
    <div style={activeTab.map(t => t === "profile"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
      : "display: none;")}>

      {/* Profile Sub-Tabs Header (centered) */}
      <div style="display: flex; justify-content: center; align-items: center; padding: 10px 12px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <Button callback={(): void => profileSubTab.set("apercu")}>
            <div style={profileSubTab.map(t => t === "apercu"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].profile.overview)}
            </div>
          </Button>
          <Button callback={(): void => profileSubTab.set("licences")}>
            <div style={profileSubTab.map(t => t === "licences"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].profile.licenses)}
            </div>
          </Button>
          <Button callback={(): void => profileSubTab.set("inventaire")}>
            <div style={profileSubTab.map(t => t === "inventaire"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].profile.inventory)}
            </div>
          </Button>
          <Button callback={(): void => profileSubTab.set("transactions")}>
            <div style={profileSubTab.map(t => t === "transactions"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].profile.transactions)}
            </div>
          </Button>
          <Button callback={(): void => profileSubTab.set("messagerie")}>
            <div style={profileSubTab.map(t => t === "messagerie"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].profile.messages)}
            </div>
          </Button>
          <Button callback={(): void => profileSubTab.set("social")}>
            <div style={profileSubTab.map(t => t === "social"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].profile.social)}
            </div>
          </Button>
        </div>
      </div>

      {/* Profile Sub-Tab Content */}
      <div style="flex: 1; overflow-y: auto;">
        {/* Apercu Sub-Tab */}
        <div style={profileSubTab.map(t => t === "apercu" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* User Card */}
          <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
              <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); display: flex; align-items: center; justify-content: center;">
                <svg style="width: 28px; height: 28px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
                </svg>
              </div>
              <div style="flex: 1;">
                <div style="font-size: 18px; font-weight: 600; color: white;">
                  {MappedSubject.create(([u, lang]) => u?.username || translations[lang].settings.notConnected, currentUser, currentLanguage)}
                </div>
                <div style="font-size: 11px; color: #9ca3af;">{currentLanguage.map(l => translations[l].profile.level)} 1</div>
              </div>
            </div>

            {/* XP Progress */}
            <div style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                <span style="color: #9ca3af;">XP</span>
                <span style="color: #60a5fa;">0 / 1,000</span>
              </div>
              <div style="height: 6px; background: #1a1a24; border-radius: 3px; overflow: hidden;">
                <div style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 3px;"></div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">{currentLanguage.map(l => translations[l].profile.statistics)}</div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
              <div>
                <div style="font-size: 20px; font-weight: 700; color: white;">0</div>
                <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].profile.missions)}</div>
              </div>
              <div>
                <div style="font-size: 20px; font-weight: 700; color: white;">0h</div>
                <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].profile.flightHours)}</div>
              </div>
              <div>
                <div style="font-size: 20px; font-weight: 700; color: white;">0 nm</div>
                <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].map.distance)}</div>
              </div>
              <div>
                <div style="font-size: 20px; font-weight: 700; color: white;">-</div>
                <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].profile.averageGrade)}</div>
              </div>
            </div>
          </div>

          {/* Flight Status */}
          <div style="background: #252532; border-radius: 12px; padding: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">{currentLanguage.map(l => translations[l].profile.currentFlight)}</div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style={onGround.map(v => v
                  ? "background: rgba(34, 197, 94, 0.2); color: #22c55e; padding: 4px 12px; border-radius: 8px; font-weight: 600; font-size: 11px;"
                  : "background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 4px 12px; border-radius: 8px; font-weight: 600; font-size: 11px;")}>
                  {MappedSubject.create(([onGnd, lang]) => onGnd ? translations[lang].profile.onGround : translations[lang].profile.inFlight, onGround, currentLanguage)}
                </span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].profile.nearest)}:</span>
                <span style="font-family: monospace; color: #60a5fa; font-size: 12px; font-weight: 600;">
                  {closestAirport}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Licences Sub-Tab */}
        <div style={profileSubTab.map(t => t === "licences" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">{currentLanguage.map(l => translations[l].profile.licenses)}</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <span style="background: rgba(34, 197, 94, 0.2); color: #22c55e; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 500;">PPL</span>
              <span style="background: rgba(107, 114, 128, 0.2); color: #6b7280; padding: 4px 12px; border-radius: 12px; font-size: 11px;">IFR</span>
              <span style="background: rgba(107, 114, 128, 0.2); color: #6b7280; padding: 4px 12px; border-radius: 12px; font-size: 11px;">CPL</span>
              <span style="background: rgba(107, 114, 128, 0.2); color: #6b7280; padding: 4px 12px; border-radius: 12px; font-size: 11px;">ATPL</span>
            </div>
          </div>
          <div style="background: rgba(96, 165, 250, 0.1); border: 1px solid rgba(96, 165, 250, 0.3); border-radius: 8px; padding: 12px;">
            <p style="font-size: 11px; color: #9ca3af; margin: 0;">
              {currentLanguage.map(l => translations[l].profile.licensesInfo)}
            </p>
          </div>
        </div>

        {/* Inventaire Sub-Tab */}
        <div style={profileSubTab.map(t => t === "inventaire" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* Filters - Two columns */}
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <div style="flex: 1;">
              <input
                ref={profileIcaoFilterRef}
                type="text"
                placeholder={currentLanguage.map(l => l === "fr" ? "Aéroport (ICAO)..." : "Airport (ICAO)...")}
                value={profileIcaoFilter}
                maxLength={4}
                style="width: 100%; padding: 8px 12px; background: #252532; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; font-family: monospace; text-transform: uppercase; outline: none; box-sizing: border-box;"
                onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
              />
            </div>
            <div style="flex: 1;">
              <input
                ref={profileItemFilterRef}
                type="text"
                placeholder={currentLanguage.map(l => l === "fr" ? "Nom d'item..." : "Item name...")}
                value={profileItemFilter}
                style="width: 100%; padding: 8px 12px; background: #252532; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; outline: none; box-sizing: border-box;"
                onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
              />
            </div>
          </div>

          {/* Tier Filters */}
          <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
            <Button callback={(): void => { onSetProfileTierFilter(null); }}>
              <div style={profileTierFilter.map(t => t === null
                ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                {currentLanguage.map(l => translations[l].common.all)}
              </div>
            </Button>
            <Button callback={(): void => { onSetProfileTierFilter(0); }}>
              <div style={profileTierFilter.map(t => t === 0
                ? "padding: 6px 10px; background: #6b7280; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                T0
              </div>
            </Button>
            <Button callback={(): void => { onSetProfileTierFilter(1); }}>
              <div style={profileTierFilter.map(t => t === 1
                ? "padding: 6px 10px; background: #22c55e; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                : "padding: 6px 10px; background: #252532; color: #22c55e; border-radius: 6px; font-size: 10px;")}>
                T1
              </div>
            </Button>
            <Button callback={(): void => { onSetProfileTierFilter(2); }}>
              <div style={profileTierFilter.map(t => t === 2
                ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                : "padding: 6px 10px; background: #252532; color: #3b82f6; border-radius: 6px; font-size: 10px;")}>
                T2
              </div>
            </Button>
            <Button callback={(): void => { onSetProfileTierFilter(3); }}>
              <div style={profileTierFilter.map(t => t === 3
                ? "padding: 6px 10px; background: #a855f7; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                : "padding: 6px 10px; background: #252532; color: #a855f7; border-radius: 6px; font-size: 10px;")}>
                T3
              </div>
            </Button>
          </div>

          {/* Header */}
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">
            {MappedSubject.create(([items, lang]) => `${translations[lang].profile.personalInventory} (${items.length})`, profileInventory, currentLanguage)}
          </div>

          {/* Loading state */}
          <div style={profileInventoryLoading.map(l => l ? "display: flex; justify-content: center; padding: 24px;" : "display: none;")}>
            <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
          </div>

          {/* Inventory List */}
          <div style={profileInventoryLoading.map(l => l ? "display: none;" : "display: block;")}>
            <div ref={profileInventoryListRef} style="display: flex; flex-direction: column; gap: 8px;">
              {/* Placeholder when empty */}
              <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
                <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                  <path d="M3.27 6.96L12 12.01l8.73-5.05"/>
                  <path d="M12 22.08V12"/>
                </svg>
                <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
              </div>
            </div>
          </div>

          {/* Refresh button */}
          <div style="margin-top: 12px;">
            <Button callback={(): void => { onFetchProfileInventory(); }} disabled={profileInventoryLoading}>
              <div style={profileInventoryLoading.map(l => l
                ? "background: #374151; color: #6b7280; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px;"
                : "background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;")}>
                {MappedSubject.create(([loading, lang]) => loading ? translations[lang].common.loading : translations[lang].common.refresh, profileInventoryLoading, currentLanguage)}
              </div>
            </Button>
          </div>
        </div>

        {/* Transactions Sub-Tab */}
        <div style={profileSubTab.map(t => t === "transactions" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M12 2v20"/>
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
            <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].profile.transactionHistory)}</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">{currentLanguage.map(l => translations[l].profile.comingSoon)}</div>
          </div>
        </div>

        {/* Messagerie Sub-Tab */}
        <div style={profileSubTab.map(t => t === "messagerie" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
            </svg>
            <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].profile.messages)}</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">{currentLanguage.map(l => translations[l].profile.comingSoon)}</div>
          </div>
        </div>

        {/* Social Sub-Tab */}
        <div style={profileSubTab.map(t => t === "social" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].profile.friendsAndRankings)}</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">{currentLanguage.map(l => translations[l].profile.comingSoon)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
