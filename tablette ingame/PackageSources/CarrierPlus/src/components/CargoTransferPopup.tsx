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
  } = props;

  return (
    <div style={showCargoPopup.map(show => show
      ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;"
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
            <div style="color: #9ca3af; font-size: 18px; cursor: pointer; padding: 4px;">✕</div>
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

        {/* Quantity slider */}
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].common.quantity)}:</span>
            <span ref={cargoPopupQtyRef} style="font-size: 16px; color: #22c55e; font-weight: 700;">1</span>
          </div>
          <input
            ref={cargoPopupSliderRef}
            type="range"
            min="1"
            max="100"
            value="1"
            style="width: 100%; height: 8px; border-radius: 4px; background: #374151; outline: none; cursor: pointer;"
          />
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; margin-top: 4px;">
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
              {MappedSubject.create(([d, lang]) => d === "load" ? `${translations[lang].missions.load} →` : `← ${translations[lang].missions.unload}`, cargoPopupDirection, currentLanguage)}
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
