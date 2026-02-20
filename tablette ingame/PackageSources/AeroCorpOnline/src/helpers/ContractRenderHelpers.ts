/**
 * ContractRenderHelpers - HTML rendering for contract UI
 * Phase 5B: Available contracts, active contracts, completed contracts
 */

import { formatMoney } from "./PlayerHelpers";
import type { ContractOffer, ActiveContract } from "../types";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ContractTranslations {
  available: string;
  myContracts: string;
  active: string;
  accept: string;
  cancel: string;
  complete: string;
  reward: string;
  distance: string;
  cargo: string;
  passengers: string;
  noContracts: string;
  maxReached: string;
  completed: string;
  cancelled: string;
  acceptForPlayer: string;
  acceptForCompany: string;
  proposedBy: string;
  license: string;
  weight: string;
  inProgress: string;
  wallet: string;
  personal: string;
  company: string;
  deliverAt: string;
  confirmCancel: string;
  cancelConfirmMsg: string;
  confirm: string;
  delivered: string;
  xpEarned: string;
  timeTaken: string;
  close: string;
  filterAll: string;
  filterVeryShort: string;
  filterShort: string;
  filterMedium: string;
  filterLong: string;
  filterCargo: string;
  filterPassengers: string;
  filterMixed: string;
  sortReward: string;
  sortDistance: string;
  noActive: string;
  noCompleted: string;
  refresh: string;
  minutes: string;
  acceptedOn: string;
}

export interface ContractFilters {
  distance: "all" | "very_short" | "short" | "medium" | "long";
  type: "all" | "items" | "passengers" | "mixed";
  sort: "reward" | "distance";
}

// ═══════════════════════════════════════════════════════════
// CONTRACT FILTERS (rendered to separate ref — stays outside scroll area)
// ═══════════════════════════════════════════════════════════

export function renderContractFiltersHtml(
  tr: ContractTranslations,
  filters: ContractFilters
): string {
  return `
    <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; align-items: center; padding: 4px 0;">
      <div style="display: flex; gap: 4px; align-items: center;">
        <span style="color: #6b7280; font-size: 10px; margin-right: 2px;">${tr.distance}:</span>
        <button class="contract-filter-btn" data-filter="distance" data-value="all" style="padding: 4px 8px; background: ${filters.distance === "all" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.filterAll}</button>
        <button class="contract-filter-btn" data-filter="distance" data-value="very_short" style="padding: 4px 8px; background: ${filters.distance === "very_short" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.filterVeryShort}</button>
        <button class="contract-filter-btn" data-filter="distance" data-value="short" style="padding: 4px 8px; background: ${filters.distance === "short" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.filterShort}</button>
        <button class="contract-filter-btn" data-filter="distance" data-value="medium" style="padding: 4px 8px; background: ${filters.distance === "medium" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.filterMedium}</button>
        <button class="contract-filter-btn" data-filter="distance" data-value="long" style="padding: 4px 8px; background: ${filters.distance === "long" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.filterLong}</button>
      </div>
      <div style="display: flex; gap: 4px; align-items: center;">
        <span style="color: #6b7280; font-size: 10px; margin-right: 2px;">Type:</span>
        <button class="contract-filter-btn" data-filter="type" data-value="all" style="padding: 4px 8px; background: ${filters.type === "all" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.filterAll}</button>
        <button class="contract-filter-btn" data-filter="type" data-value="items" style="padding: 4px 8px; background: ${filters.type === "items" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.filterCargo}</button>
        <button class="contract-filter-btn" data-filter="type" data-value="passengers" style="padding: 4px 8px; background: ${filters.type === "passengers" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.filterPassengers}</button>
        <button class="contract-filter-btn" data-filter="type" data-value="mixed" style="padding: 4px 8px; background: ${filters.type === "mixed" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.filterMixed}</button>
      </div>
      <div style="display: flex; gap: 4px; align-items: center;">
        <span style="color: #6b7280; font-size: 10px; margin-right: 2px;">Tri:</span>
        <button class="contract-filter-btn" data-filter="sort" data-value="reward" style="padding: 4px 8px; background: ${filters.sort === "reward" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.sortReward}</button>
        <button class="contract-filter-btn" data-filter="sort" data-value="distance" style="padding: 4px 8px; background: ${filters.sort === "distance" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 9px; cursor: pointer;">${tr.sortDistance}</button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// AVAILABLE CONTRACTS (cards only — filters rendered separately)
// ═══════════════════════════════════════════════════════════

export function renderAvailableContractsHtml(
  contracts: ContractOffer[],
  tr: ContractTranslations,
  filters: ContractFilters
): string {
  // Filter
  let filtered = contracts.filter(c => c.status === "available");

  if (filters.distance === "very_short") filtered = filtered.filter(c => c.distance_nm < 50);
  else if (filters.distance === "short") filtered = filtered.filter(c => c.distance_nm >= 50 && c.distance_nm < 150);
  else if (filters.distance === "medium") filtered = filtered.filter(c => c.distance_nm >= 150 && c.distance_nm <= 400);
  else if (filters.distance === "long") filtered = filtered.filter(c => c.distance_nm > 400);

  if (filters.type !== "all") filtered = filtered.filter(c => c.cargo_type === filters.type);

  // Sort
  if (filters.sort === "reward") filtered.sort((a, b) => b.reward_cr - a.reward_cr);
  else if (filters.sort === "distance") filtered.sort((a, b) => a.distance_nm - b.distance_nm);

  if (filtered.length === 0) {
    return `
      <div style="text-align: center; padding: 32px; color: #6b7280; font-size: 12px;">
        ${tr.noContracts}
      </div>
    `;
  }

  return filtered.map(c => {
    const cargoTypeLabel = c.cargo_type === "passengers" ? tr.passengers : c.cargo_type === "mixed" ? `${tr.cargo} + ${tr.passengers}` : tr.cargo;
    const licenseBadge = `<span style="padding: 2px 6px; background: rgba(59, 130, 246, 0.3); color: #60a5fa; border-radius: 4px; font-size: 10px; font-weight: 600;">${c.required_license}</span>`;

    return `
      <div style="background: #252532; border-radius: 8px; padding: 16px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: white;">${c.origin_icao} > ${c.destination_icao}</div>
            <div style="font-size: 11px; color: #9ca3af;">${tr.distance}: ${c.distance_nm} nm</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; color: #9ca3af;">${cargoTypeLabel} ${c.cargo_weight_kg} kg</div>
            ${licenseBadge}
          </div>
        </div>
        <div style="font-size: 12px; color: white; margin-bottom: 8px;">${c.cargo_description}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div>
            <span style="font-size: 16px; font-weight: 700; color: #22c55e;">${formatMoney(c.reward_cr)}</span>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; color: #6b7280;">${tr.proposedBy}: ${c.creator_name}</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="contract-accept-btn" data-contract-id="${c.id}" data-wallet="player" style="flex: 1; padding: 8px; background: #22c55e; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">${tr.acceptForPlayer}</button>
          <button class="contract-accept-btn" data-contract-id="${c.id}" data-wallet="company" style="flex: 1; padding: 8px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">${tr.acceptForCompany}</button>
        </div>
      </div>
    `;
  }).join("");
}

// ═══════════════════════════════════════════════════════════
// ACTIVE CONTRACTS
// ═══════════════════════════════════════════════════════════

export function renderActiveContractsHtml(
  contracts: ActiveContract[],
  tr: ContractTranslations,
  closestAirport: string,
  onGround: boolean
): string {
  const inProgress = contracts.filter(c => c.status === "in_progress");

  if (inProgress.length === 0) {
    return `
      <div style="text-align: center; padding: 32px; color: #6b7280; font-size: 12px;">
        ${tr.noActive}
      </div>
    `;
  }

  return inProgress.map(c => {
    // Format accepted date: DD/MM HH:MM
    const acceptedDate = new Date(c.accepted_at);
    const day = String(acceptedDate.getDate()).padStart(2, "0");
    const month = String(acceptedDate.getMonth() + 1).padStart(2, "0");
    const hours = String(acceptedDate.getHours()).padStart(2, "0");
    const mins = String(acceptedDate.getMinutes()).padStart(2, "0");
    const acceptedStr = `${day}/${month} ${hours}:${mins}`;

    // Can deliver?
    const canDeliver = onGround && closestAirport === c.destination_icao;
    const deliverStyle = canDeliver
      ? "flex: 1; padding: 8px; background: #22c55e; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;"
      : "flex: 1; padding: 8px; background: #374151; color: #6b7280; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: not-allowed;";
    const deliverTitle = canDeliver ? "" : `title="${tr.deliverAt} ${c.destination_icao}"`;

    const walletLabel = c.wallet === "company" ? tr.company : tr.personal;

    return `
      <div style="background: #252532; border-radius: 8px; padding: 16px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: white;">${c.origin_icao} > ${c.destination_icao}</div>
            <div style="font-size: 12px; color: #9ca3af;">${c.cargo_description}</div>
          </div>
          <div style="text-align: right;">
            <span style="padding: 2px 8px; background: rgba(34, 197, 94, 0.2); color: #22c55e; border-radius: 4px; font-size: 10px; font-weight: 600;">${tr.inProgress}</span>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 16px; font-weight: 700; color: #22c55e;">${formatMoney(c.reward_cr)}</span>
          <span style="font-size: 12px; color: #9ca3af;">${tr.wallet}: ${walletLabel}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="font-size: 11px; color: #6b7280;">${tr.acceptedOn}: ${acceptedStr}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="contract-cancel-btn" data-contract-id="${c.id}" style="padding: 8px 16px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">${tr.cancel}</button>
          <button class="contract-deliver-btn" data-contract-id="${c.id}" ${deliverTitle} style="${deliverStyle}" ${canDeliver ? "" : "disabled"}>${tr.complete}</button>
        </div>
      </div>
    `;
  }).join("");
}

// ═══════════════════════════════════════════════════════════
// COMPLETED CONTRACTS
// ═══════════════════════════════════════════════════════════

export function renderCompletedContractsHtml(
  contracts: ActiveContract[],
  tr: ContractTranslations
): string {
  const completed = contracts.filter(c => c.status !== "in_progress");
  completed.sort((a, b) => new Date(b.completed_at || b.accepted_at).getTime() - new Date(a.completed_at || a.accepted_at).getTime());

  if (completed.length === 0) {
    return `
      <div style="text-align: center; padding: 16px; color: #6b7280; font-size: 11px;">
        ${tr.noCompleted}
      </div>
    `;
  }

  return completed.slice(0, 20).map(c => {
    let statusColor = "#22c55e";
    let statusLabel = tr.completed;
    if (c.status === "cancelled") { statusColor = "#6b7280"; statusLabel = tr.cancelled; }

    return `
      <div style="background: #252532; border-radius: 6px; padding: 10px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 12px; font-weight: 600; color: white;">${c.origin_icao} > ${c.destination_icao}</div>
          <div style="font-size: 10px; color: #6b7280;">${c.cargo_description}</div>
        </div>
        <div style="text-align: right;">
          <span style="padding: 2px 6px; background: rgba(${statusColor === "#22c55e" ? "34,197,94" : statusColor === "#ef4444" ? "239,68,68" : "107,114,128"}, 0.2); color: ${statusColor}; border-radius: 4px; font-size: 10px; font-weight: 600;">${statusLabel}</span>
          ${c.status === "completed" ? `<div style="font-size: 10px; color: #22c55e; margin-top: 2px;">+${formatMoney(c.reward_cr)}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// ═══════════════════════════════════════════════════════════
// COMPLETION POPUP
// ═══════════════════════════════════════════════════════════

export function renderContractCompletionHtml(
  contract: ActiveContract,
  reward: number,
  xp: number,
  tr: ContractTranslations
): string {
  const accepted = new Date(contract.accepted_at).getTime();
  const completed = Date.now();
  const timeTakenMin = Math.round((completed - accepted) / 60000);

  return `
    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;">
      <div style="background: #1e1e2e; border: 1px solid #374151; border-radius: 12px; padding: 24px; width: 300px; text-align: center;">
        <svg style="width: 40px; height: 40px; margin-bottom: 12px;" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <path d="M22 4L12 14.01l-3-3"/>
        </svg>
        <div style="font-size: 16px; font-weight: 700; color: white; margin-bottom: 8px;">${tr.delivered}</div>
        <div style="font-size: 13px; color: #9ca3af; margin-bottom: 16px;">${contract.origin_icao} > ${contract.destination_icao}</div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #252532; border-radius: 6px;">
            <span style="color: #9ca3af; font-size: 12px;">${tr.reward}</span>
            <span style="color: #22c55e; font-size: 14px; font-weight: 700;">+${formatMoney(reward)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #252532; border-radius: 6px;">
            <span style="color: #9ca3af; font-size: 12px;">${tr.xpEarned}</span>
            <span style="color: #60a5fa; font-size: 14px; font-weight: 700;">+${xp} XP</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #252532; border-radius: 6px;">
            <span style="color: #9ca3af; font-size: 12px;">${tr.timeTaken}</span>
            <span style="color: white; font-size: 14px;">${timeTakenMin} ${tr.minutes}</span>
          </div>
        </div>
        <button class="contract-completion-close-btn" style="width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">${tr.close}</button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// CANCEL CONFIRMATION
// ═══════════════════════════════════════════════════════════

export function renderCancelConfirmHtml(
  contract: ActiveContract,
  tr: ContractTranslations
): string {
  return `
    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;">
      <div style="background: #1e1e2e; border: 1px solid #374151; border-radius: 12px; padding: 24px; width: 280px; text-align: center;">
        <div style="font-size: 14px; font-weight: 700; color: white; margin-bottom: 8px;">${tr.confirmCancel}</div>
        <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">${contract.origin_icao} > ${contract.destination_icao}</div>
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 20px;">${tr.cancelConfirmMsg}</div>
        <div style="display: flex; gap: 8px;">
          <button class="contract-cancel-dismiss-btn" style="flex: 1; padding: 8px; background: #252532; color: white; border: 1px solid #374151; border-radius: 6px; font-size: 11px; cursor: pointer;">${tr.cancel}</button>
          <button class="contract-cancel-confirm-btn" data-contract-id="${contract.id}" style="flex: 1; padding: 8px; background: #ef4444; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">${tr.confirm}</button>
        </div>
      </div>
    </div>
  `;
}
