/**
 * HangarView - Hangar tab render function
 * Extracted from CarrierPlus.tsx for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, AircraftDetails, RepairQuote } from "../types";

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
 * Props interface for HangarView
 */
export interface HangarViewProps {
  activeTab: Subject<string>;
  currentLanguage: Subject<Language>;
  isLoggedIn: Subject<boolean>;
  hangarLoading: Subject<boolean>;
  hangarSelectedAircraft: Subject<AircraftDetails | null>;
  hangarFilterRef: NodeReference<HTMLInputElement>;
  hangarListRef: NodeReference<HTMLDivElement>;
  hangarCargoListRef: NodeReference<HTMLDivElement>;
  hangarSystemsListRef: NodeReference<HTMLDivElement>;
  hangarEditRegPopupOpen: Subject<boolean>;
  hangarEditRegInputRef: NodeReference<HTMLInputElement>;
  hangarRepairPopupOpen: Subject<boolean>;
  hangarRepairListRef: NodeReference<HTMLDivElement>;
  hangarRepairQuote: Subject<RepairQuote | null>;
  onFetchHangarAircraftList: () => void;
  onSyncFuelFromSimulator: () => void;
  onOpenRefuelPopup: () => void;
  onOpenEditRegistrationPopup: () => void;
  onUpdateAircraftRegistration: () => void;
  onOpenRepairPopup: () => void;
  onPerformRepair: (aircraftId: string, systems: string[], wallet: "player" | "company") => void;
}

/**
 * Render the Hangar tab content
 */
export function renderHangarTab(props: HangarViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isLoggedIn,
    hangarLoading,
    hangarSelectedAircraft,
    hangarFilterRef,
    hangarListRef,
    hangarCargoListRef,
    hangarSystemsListRef,
    hangarEditRegPopupOpen,
    hangarEditRegInputRef,
    hangarRepairPopupOpen,
    hangarRepairListRef,
    hangarRepairQuote,
    onFetchHangarAircraftList,
    onSyncFuelFromSimulator,
    onOpenRefuelPopup,
    onOpenEditRegistrationPopup,
    onUpdateAircraftRegistration,
    onOpenRepairPopup,
    onPerformRepair,
  } = props;

  return (
    <div>
      {/* Hangar Tab Content */}
      <div style={activeTab.map(t => t === "hangar"
        ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
        : "display: none;")}>
        <div style="padding: 16px; color: white; overflow-y: auto; flex: 1;">
          <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">Hangar</h2>

          {/* Not logged in message */}
          <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4"/>
                <path d="M12 16h.01"/>
              </svg>
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
              <div style="color: #9ca3af; font-size: 11px;">{currentLanguage.map(l => translations[l].hangar.loginToSeeHangar)}</div>
            </div>
          </div>

          {/* Logged in - Hangar content */}
          <div style={isLoggedIn.map(l => l ? "display: flex; gap: 12px; height: calc(100% - 40px);" : "display: none;")}>

            {/* Left: Aircraft List */}
            <div style="width: 280px; background: #252532; border-radius: 8px; padding: 12px; overflow-y: auto;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 11px; color: #6b7280; text-transform: uppercase;">{currentLanguage.map(l => translations[l].company.fleet)}</span>
                <Button callback={(): void => { onFetchHangarAircraftList(); }}>
                  <div style="padding: 4px 8px; background: #3b82f6; border-radius: 4px; font-size: 9px; color: white;">
                    {currentLanguage.map(l => translations[l].common.refresh)}
                  </div>
                </Button>
              </div>

              {/* Search filter */}
              <div style="margin-bottom: 10px;">
                <input
                  ref={hangarFilterRef}
                  type="text"
                  placeholder="Rechercher (ICAO, type...)"
                  style="width: 100%; padding: 6px 10px; background: #1a1a24; border: 1px solid #374151; border-radius: 4px; color: white; font-size: 11px; outline: none; box-sizing: border-box;"
                />
              </div>

              {/* Loading */}
              <div style={hangarLoading.map(l => l ? "text-align: center; padding: 20px; color: #6b7280; font-size: 11px;" : "display: none;")}>
                {currentLanguage.map(l => translations[l].common.loading)}
              </div>

              {/* Aircraft list using ref (FSComponent pattern for dynamic lists) */}
              <div ref={hangarListRef} style={hangarLoading.map(l => l ? "display: none;" : "display: flex; flex-direction: column; gap: 6px;")}>
                <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 11px;">
                  {currentLanguage.map(l => translations[l].hangar.clickRefreshToLoad)}
                </div>
              </div>
            </div>

            {/* Right: Aircraft Details */}
            <div style="flex: 1; background: #252532; border-radius: 8px; padding: 12px; overflow-y: auto;">
              {/* No aircraft selected */}
              <div style={hangarSelectedAircraft.map(a => a ? "display: none;" : "display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #6b7280;")}>
                <svg style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M3 21h18"/>
                  <path d="M5 21V7l7-4 7 4v14"/>
                  <path d="M9 21v-6h6v6"/>
                </svg>
                <div style="font-size: 12px;">{currentLanguage.map(l => translations[l].hangar.selectAircraft)}</div>
              </div>

              {/* Aircraft selected - Details */}
              <div style={hangarSelectedAircraft.map(a => a ? "display: block;" : "display: none;")}>
                {/* Header */}
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #374151;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 18px; font-weight: 700; color: white;">
                        {hangarSelectedAircraft.map(a => a?.registration || a?.aircraft_type || "")}
                      </span>
                      <Button callback={(): void => { onOpenEditRegistrationPopup(); }}>
                        <div style="padding: 2px 6px; background: #374151; border-radius: 4px; cursor: pointer; display: flex; align-items: center;">
                          <svg style="width: 12px; height: 12px;" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </div>
                      </Button>
                    </div>
                    <div style="font-size: 12px; color: #6b7280;">
                      {hangarSelectedAircraft.map(a => a?.aircraft_model || "")}
                    </div>
                  </div>
                  <div style="text-align: right;">
                    {/* Owner badge */}
                    <span style={hangarSelectedAircraft.map(a =>
                      a?.owner_type === "player"
                        ? "font-size: 9px; padding: 2px 6px; background: #10b981; color: white; border-radius: 3px; font-weight: 600;"
                        : "font-size: 9px; padding: 2px 6px; background: #6366f1; color: white; border-radius: 3px; font-weight: 600;"
                    )}>
                      {MappedSubject.create(([a, lang]) => a?.owner_type === "player" ? translations[lang].hangar.personal : translations[lang].hangar.companyOwned, hangarSelectedAircraft, currentLanguage)}
                    </span>
                    <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">{currentLanguage.map(l => translations[l].hangar.location)}</div>
                    <div style="font-size: 14px; font-weight: 600; color: #60a5fa; font-family: monospace;">
                      {hangarSelectedAircraft.map(a => a?.current_airport_ident || "N/A")}
                    </div>
                  </div>
                </div>

                {/* Aircraft Thumbnail */}
                <div style="background: #1a1a24; border-radius: 8px; overflow: hidden; margin-bottom: 12px;">
                  <img
                    src={hangarSelectedAircraft.map(a => a?.aircraft_model
                      ? `coui://html_ui/efb_ui/efb_apps/CarrierPlus/Assets/aircraft/${a.aircraft_model.toUpperCase()}.jpg`
                      : "")}
                    alt=""
                    style="width: 100%; height: 120px; object-fit: cover; display: block;"
                    onError={(e: Event): void => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = "none";
                    }}
                  />
                </div>

                {/* Fuel Gauge */}
                <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 12px; color: white; font-weight: 600;">{currentLanguage.map(l => translations[l].hangar.fuel)}</span>
                      <Button callback={(): void => { onSyncFuelFromSimulator(); }}>
                        <div style="padding: 2px 6px; background: #374151; border-radius: 4px; font-size: 8px; color: #9ca3af;">
                          {currentLanguage.map(l => translations[l].hangar.sync)}
                        </div>
                      </Button>
                      <Button callback={(): void => { onOpenRefuelPopup(); }}>
                        <div style="padding: 2px 6px; background: #3b82f6; border-radius: 4px; font-size: 8px; color: white;">
                          {currentLanguage.map(l => translations[l].hangar.refuel)}
                        </div>
                      </Button>
                    </div>
                    <span style={hangarSelectedAircraft.map(a => {
                      const pct = a ? (a.fuel_gallons / a.fuel_capacity_gallons) * 100 : 0;
                      const color = pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";
                      return `font-size: 12px; color: ${color}; font-weight: 600;`;
                    })}>
                      {hangarSelectedAircraft.map(a => a ? `${Math.round((a.fuel_gallons / a.fuel_capacity_gallons) * 100)}%` : "0%")}
                    </span>
                  </div>
                  <div style="background: #374151; border-radius: 4px; height: 8px; overflow: hidden;">
                    <div style={hangarSelectedAircraft.map(a => {
                      const pct = a ? (a.fuel_gallons / a.fuel_capacity_gallons) * 100 : 0;
                      const color = pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";
                      return `width: ${pct}%; height: 100%; background: ${color};`;
                    })}></div>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 10px; color: #6b7280;">
                    <span>{hangarSelectedAircraft.map(a => a ? `${Math.round(a.fuel_gallons)} gal` : "0 gal")}</span>
                    <span>{hangarSelectedAircraft.map(a => a ? `${Math.round(a.fuel_capacity_gallons)} gal max` : "")}</span>
                  </div>
                </div>

                {/* Cargo & Passengers */}
                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                  <div style="flex: 1; background: #1a1a24; border-radius: 8px; padding: 12px;">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].hangar.cargo)}</div>
                    <div style="font-size: 14px; font-weight: 600; color: white;">
                      {hangarSelectedAircraft.map(a => a ? `${Math.round(a.cargo_kg)} kg` : "0 kg")}
                    </div>
                    <div style="font-size: 9px; color: #6b7280;">
                      / {hangarSelectedAircraft.map(a => a ? `${a.cargo_capacity_kg} kg` : "")}
                    </div>
                  </div>
                  <div style="flex: 1; background: #1a1a24; border-radius: 8px; padding: 12px;">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].hangar.passengers)}</div>
                    <div style="font-size: 14px; font-weight: 600; color: white;">
                      {hangarSelectedAircraft.map(a => a ? `${a.passengers}` : "0")}
                    </div>
                    <div style="font-size: 9px; color: #6b7280;">
                      / {hangarSelectedAircraft.map(a => a ? `${a.passenger_capacity}` : "")}
                    </div>
                  </div>
                </div>

                {/* Cargo Items Detail */}
                <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                  <div style="font-size: 12px; color: white; font-weight: 600; margin-bottom: 8px;">
                    {currentLanguage.map(l => l === "fr" ? "Contenu de la soute" : "Cargo Hold Contents")}
                  </div>
                  <div ref={hangarCargoListRef} style="max-height: 120px; overflow-y: auto;">
                    <div style="text-align: center; padding: 8px; color: #6b7280; font-size: 10px;">
                      {currentLanguage.map(l => translations[l].common.loading)}
                    </div>
                  </div>
                </div>

                {/* Systems Status (dynamic from API) */}
                <div style="background: #1a1a24; border-radius: 8px; padding: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-size: 12px; color: white; font-weight: 600;">{currentLanguage.map(l => translations[l].hangar.systems)}</div>
                    <Button callback={(): void => { onOpenRepairPopup(); }}>
                      <div style="padding: 4px 10px; background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; border-radius: 4px; font-size: 9px; color: #f59e0b; font-weight: 600;">
                        {currentLanguage.map(l => translations[l].hangar.repair)}
                      </div>
                    </Button>
                  </div>
                  <div ref={hangarSystemsListRef}>
                    <div style="text-align: center; padding: 12px; color: #6b7280; font-size: 10px;">
                      {currentLanguage.map(l => translations[l].common.loading)}
                    </div>
                  </div>
                </div>

                {/* License required */}
                <div style="margin-top: 12px; padding: 8px 12px; background: rgba(96, 165, 250, 0.1); border: 1px solid #60a5fa; border-radius: 6px;">
                  <span style="font-size: 10px; color: #60a5fa;">{currentLanguage.map(l => translations[l].hangar.licenseRequired)}: </span>
                  <span style="font-size: 10px; color: white; font-weight: 600;">
                    {hangarSelectedAircraft.map(a => a?.required_license || "PPL")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Registration Popup */}
        <div style={hangarEditRegPopupOpen.map(show => show
          ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;"
          : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 20px; min-width: 280px; max-width: 90%; border: 1px solid #3b82f6;">
            {/* Header */}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div style="font-size: 14px; font-weight: 600; color: #3b82f6;">
                {currentLanguage.map(l => l === "fr" ? "Modifier l'immatriculation" : "Edit Registration")}
              </div>
              <Button callback={(): void => { hangarEditRegPopupOpen.set(false); }}>
                <div style="width: 28px; height: 28px; background: #374151; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                  <span style="color: #9ca3af; font-size: 16px; font-weight: bold; line-height: 1;">X</span>
                </div>
              </Button>
            </div>

            {/* Input */}
            <div style="margin-bottom: 16px;">
              <input
                ref={hangarEditRegInputRef}
                type="text"
                maxLength={10}
                style="width: 100%; padding: 10px 12px; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 14px; font-weight: 600; text-transform: uppercase; outline: none; box-sizing: border-box;"
              />
              <div style="font-size: 10px; color: #6b7280; margin-top: 4px;">
                {currentLanguage.map(l => l === "fr" ? "2-10 caractères (ex: F-ABCD)" : "2-10 characters (e.g., N12345)")}
              </div>
            </div>

            {/* Action buttons */}
            <div style="display: flex; gap: 10px;">
              <Button callback={(): void => { hangarEditRegPopupOpen.set(false); }}>
                <div style="flex: 1; background: #374151; color: #9ca3af; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 600; text-align: center;">
                  {currentLanguage.map(l => translations[l].common.cancel)}
                </div>
              </Button>
              <Button callback={(): void => { onUpdateAircraftRegistration(); }}>
                <div style="flex: 1; background: #3b82f6; color: white; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 700; text-align: center;">
                  {currentLanguage.map(l => translations[l].common.save)}
                </div>
              </Button>
            </div>
          </div>
        </div>

        {/* Repair Popup */}
        <div style={hangarRepairPopupOpen.map(show => show
          ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;"
          : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 20px; min-width: 320px; max-width: 90%; border: 1px solid #f59e0b;">
            {/* Header */}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div style="font-size: 14px; font-weight: 600; color: #f59e0b;">
                {currentLanguage.map(l => translations[l].hangar.repairTitle)}
              </div>
              <Button callback={(): void => { hangarRepairPopupOpen.set(false); }}>
                <div style="width: 28px; height: 28px; background: #374151; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                  <span style="color: #9ca3af; font-size: 16px; font-weight: bold; line-height: 1;">X</span>
                </div>
              </Button>
            </div>

            {/* Aircraft info */}
            <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
              <div style="font-size: 13px; color: white; font-weight: 600;">
                {hangarSelectedAircraft.map(a => a?.registration || a?.aircraft_type || "")}
              </div>
              <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">
                {hangarSelectedAircraft.map(a => a?.aircraft_type || "")}
              </div>
            </div>

            {/* Repair quotes list - using ref for dynamic content */}
            <div ref={hangarRepairListRef} style="max-height: 200px; overflow-y: auto; margin-bottom: 16px;">
              <div style="text-align: center; padding: 16px; color: #6b7280; font-size: 11px;">
                {currentLanguage.map(l => translations[l].hangar.loadingQuote)}
              </div>
            </div>

            {/* Total cost */}
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(245, 158, 11, 0.1); border: 1px solid #f59e0b; border-radius: 8px; margin-bottom: 16px;">
              <span style="font-size: 12px; color: white; font-weight: 600;">{currentLanguage.map(l => translations[l].common.total)}</span>
              <span style="font-size: 14px; color: #f59e0b; font-weight: 700;">
                ${hangarRepairQuote.map(q => q ? Math.round(Number(q.total_cost)).toLocaleString() : "...")}
              </span>
            </div>

            {/* Action buttons */}
            <div style="display: flex; gap: 10px;">
              <Button callback={(): void => { hangarRepairPopupOpen.set(false); }}>
                <div style="flex: 1; background: #374151; color: #9ca3af; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 600; text-align: center;">
                  {currentLanguage.map(l => translations[l].common.cancel)}
                </div>
              </Button>
              <Button callback={(): void => {
                const aircraft = hangarSelectedAircraft.get();
                if (aircraft) {
                  onPerformRepair(aircraft.id, ["all"], "company");
                }
              }}>
                <div style="flex: 1; background: #f59e0b; color: #1a1a24; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 700; text-align: center;">
                  {currentLanguage.map(l => translations[l].hangar.repairAll)}
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
