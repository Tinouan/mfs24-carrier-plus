/**
 * CargoTransferPopup - Cargo load/unload popup component
 * Extracted from MissionsView.tsx for better maintainability
 * Shows item info, quantity slider, and action buttons
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language } from "../types";

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

// ═══════════════════════════════════════════════════════════
// CARGO POPUP ITEM TYPE
// ═══════════════════════════════════════════════════════════

export interface CargoPopupItem {
  item_id: string;
  item_name: string;
  weight_kg: number;
  max_qty: number;
  location_id?: string;
  // V5.1: Weight info for popup display
  aircraft_cargo_kg?: number;
  aircraft_cargo_max_kg?: number;
}

// ═══════════════════════════════════════════════════════════
// PROPS INTERFACE
// ═══════════════════════════════════════════════════════════

export interface CargoTransferPopupProps {
  showCargoPopup: Subject<boolean>;
  cargoPopupDirection: Subject<"load" | "unload">;
  cargoPopupItem: Subject<CargoPopupItem | null>;
  cargoPopupSliderRef: NodeReference<HTMLInputElement>;
  cargoPopupQtyRef: NodeReference<HTMLSpanElement>;
  currentLanguage: Subject<Language>;
  onCloseCargoPopup: () => void;
  onConfirmCargoTransfer: () => Promise<void>;
  onSetCargoQty: (qty: number) => void;
}

// ═══════════════════════════════════════════════════════════
// RENDER FUNCTION
// ═══════════════════════════════════════════════════════════

export function renderCargoTransferPopup(props: CargoTransferPopupProps): VNode {
  const {
    showCargoPopup,
    cargoPopupDirection,
    cargoPopupItem,
    cargoPopupSliderRef,
    cargoPopupQtyRef,
    currentLanguage,
    onCloseCargoPopup,
    onConfirmCargoTransfer,
    onSetCargoQty,
  } = props;

  return (
    <div style={showCargoPopup.map(show => show
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;"
      : "display: none;")}>
      <div style="background: #252532; border-radius: 12px; padding: 20px; min-width: 280px; max-width: 90%; border: 1px solid #374151;">
        {/* Header */}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style={cargoPopupDirection.map(d => d === "load"
            ? "font-size: 14px; font-weight: 600; color: #3b82f6;"
            : "font-size: 14px; font-weight: 600; color: #f59e0b;")}>
            {MappedSubject.create(([d, lang]) => d === "load" ? translations[lang].missions.loadToAircraft : translations[lang].missions.unloadFromAircraft, cargoPopupDirection, currentLanguage)}
          </div>
          <Button callback={(): void => { onCloseCargoPopup(); }}>
            <div style="color: #9ca3af; cursor: pointer; padding: 4px; display: flex; align-items: center;"><svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" style="width:18px;height:18px;"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
          </Button>
        </div>

        {/* Item info */}
        <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 14px; color: white; font-weight: 600; margin-bottom: 4px;">
            {cargoPopupItem.map(i => i?.item_name || "")}
          </div>
          <div style="font-size: 11px; color: #6b7280;">
            {MappedSubject.create(([i, lang]) => i ? `${i.weight_kg}kg ${translations[lang].missions.perUnit} • ${i.max_qty} ${translations[lang].missions.available}` : "", cargoPopupItem, currentLanguage)}
          </div>
        </div>

        {/* V5.1: Aircraft weight info (load only) */}
        <div style={MappedSubject.create(([d, item]) => {
          if (d === "load" && item?.aircraft_cargo_max_kg && item.aircraft_cargo_max_kg > 0) {
            return "background: #1a1a24; border-radius: 8px; padding: 10px; margin-bottom: 16px;";
          }
          return "display: none;";
        }, cargoPopupDirection, cargoPopupItem)}>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 11px; color: #9ca3af;">
              {currentLanguage.map(l => translations[l].missions.aircraftWeight || "Aircraft")}:
            </span>
            <span style="font-size: 11px; color: white; font-weight: 600;">
              {cargoPopupItem.map(i => i ? `${Math.round(i.aircraft_cargo_kg || 0)} / ${Math.round(i.aircraft_cargo_max_kg || 0)} kg` : "")}
            </span>
          </div>
          <div style="width: 100%; height: 4px; background: #374151; border-radius: 2px; overflow: hidden;">
            <div style={cargoPopupItem.map(i => {
              if (!i?.aircraft_cargo_max_kg || i.aircraft_cargo_max_kg <= 0) return "width: 0%; height: 100%;";
              const pct = Math.min(100, Math.round(((i.aircraft_cargo_kg || 0) / i.aircraft_cargo_max_kg) * 100));
              const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
              return `width: ${pct}%; height: 100%; background: ${color}; border-radius: 2px;`;
            })} />
          </div>
          <div style="font-size: 10px; color: #6b7280; margin-top: 4px;">
            {MappedSubject.create(([i, lang]) => {
              if (!i?.aircraft_cargo_max_kg) return "";
              const remaining = Math.max(0, (i.aircraft_cargo_max_kg || 0) - (i.aircraft_cargo_kg || 0));
              return `${translations[lang].missions.remainingCapacity || "Remaining"}: ${Math.round(remaining)} kg`;
            }, cargoPopupItem, currentLanguage)}
          </div>
        </div>

        {/* Quantity slider with 1/Max buttons */}
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].common.quantity)}:</span>
            <span ref={cargoPopupQtyRef} style="font-size: 16px; color: #22c55e; font-weight: 700;">1</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <Button callback={(): void => { onSetCargoQty(1); }}>
              <div style="background: #374151; color: white; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;">1</div>
            </Button>
            <input
              ref={cargoPopupSliderRef}
              type="range"
              min="1"
              max="100"
              value="1"
              style="flex: 1; height: 8px; border-radius: 4px; background: #374151; outline: none; cursor: pointer;"
            />
            <Button callback={(): void => { const item = cargoPopupItem.get(); onSetCargoQty(item?.max_qty || 1); }}>
              <div style="background: #22c55e; color: white; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;">Max</div>
            </Button>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; margin-top: 4px; padding: 0 40px;">
            <span>1</span>
            <span>{cargoPopupItem.map(i => i?.max_qty || 1)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style="display: flex; gap: 10px;">
          <Button callback={(): void => { onCloseCargoPopup(); }}>
            <div style="flex: 1; background: #374151; color: #9ca3af; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 600; text-align: center;">
              {currentLanguage.map(l => translations[l].common.cancel)}
            </div>
          </Button>
          <Button callback={(): void => { void onConfirmCargoTransfer(); }}>
            <div style={cargoPopupDirection.map(d => d === "load"
              ? "flex: 1; background: #3b82f6; color: white; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 600; text-align: center;"
              : "flex: 1; background: #f59e0b; color: #1a1a24; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 600; text-align: center;")}>
              {MappedSubject.create(([d, lang]) => d === "load" ? `${translations[lang].missions.load} >>` : `<< ${translations[lang].missions.unload}`, cargoPopupDirection, currentLanguage)}
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
