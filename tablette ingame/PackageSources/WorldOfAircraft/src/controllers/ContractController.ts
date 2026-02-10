import { Subject, NodeReference } from "@microsoft/msfs-sdk";
import { ContractRouter, InitService } from "../services";
import { settingsState, simVarState, marketState } from "../state";
import {
  renderAvailableContractsHtml,
  renderActiveContractsHtml,
  renderCompletedContractsHtml,
  renderContractCompletionHtml,
  renderCancelConfirmHtml,
  type ContractTranslations,
  type ContractFilters,
} from "../helpers";
import type { ContractOffer, ActiveContract } from "../types";

export class ContractController {
  // Refs (passed from WorldOfAircraft)
  private availableContractsRef: NodeReference<HTMLDivElement>;
  private activeContractsRef: NodeReference<HTMLDivElement>;
  private completedContractsRef: NodeReference<HTMLDivElement>;
  private contractPopupRef: NodeReference<HTMLDivElement>;

  // State
  public contractsLoading = Subject.create<boolean>(false);
  private availableContracts: ContractOffer[] = [];
  public activeContracts: ActiveContract[] = [];
  private completedContracts: ActiveContract[] = [];

  // Filters
  private contractDistanceFilter: ContractFilters["distance"] = "all";
  private contractTypeFilter: ContractFilters["type"] = "all";
  private contractSortBy: ContractFilters["sort"] = "reward";

  // Translation
  private t: (section: string, key: string) => string;

  constructor(
    refs: {
      availableContracts: NodeReference<HTMLDivElement>;
      activeContracts: NodeReference<HTMLDivElement>;
      completedContracts: NodeReference<HTMLDivElement>;
      contractPopup: NodeReference<HTMLDivElement>;
    },
    translate: (section: string, key: string) => string
  ) {
    this.availableContractsRef = refs.availableContracts;
    this.activeContractsRef = refs.activeContracts;
    this.completedContractsRef = refs.completedContracts;
    this.contractPopupRef = refs.contractPopup;
    this.t = translate;
  }

  private getContractTranslations(): ContractTranslations {
    const l = settingsState.currentLanguage.get();
    // Build translations from the translate function with fallbacks
    const ct = (key: string): string => {
      const val = this.t("contracts", key);
      return val !== key ? val : "";
    };
    return {
      available: ct("available") || "Available",
      myContracts: ct("myContracts") || "My Contracts",
      active: ct("active") || "Active",
      accept: ct("accept") || "Accept",
      cancel: ct("cancel") || "Cancel",
      complete: ct("complete") || "Deliver",
      reward: ct("reward") || "Reward",
      distance: ct("distance") || "Distance",
      cargo: ct("cargo") || "Cargo",
      passengers: ct("passengers") || "Passengers",
      noContracts: ct("noContracts") || "No contracts available",
      maxReached: ct("maxReached") || "Maximum 3 active contracts",
      completed: ct("completed") || "Completed",
      cancelled: ct("cancelled") || "Cancelled",
      acceptForPlayer: ct("acceptForPlayer") || "Accept (personal)",
      acceptForCompany: ct("acceptForCompany") || "Accept (company)",
      proposedBy: ct("proposedBy") || "Proposed by",
      license: ct("license") || "License",
      weight: ct("weight") || "Weight",
      inProgress: ct("inProgress") || "In progress",
      wallet: ct("wallet") || "Wallet",
      personal: ct("personal") || "Personal",
      company: ct("company") || "Company",
      deliverAt: ct("deliverAt") || "Go to",
      confirmCancel: ct("confirmCancel") || "Confirm cancellation",
      cancelConfirmMsg: ct("cancelConfirmMsg") || "Are you sure you want to cancel this contract?",
      confirm: ct("confirm") || "Confirm",
      delivered: ct("delivered") || "Contract delivered!",
      xpEarned: ct("xpEarned") || "XP earned",
      timeTaken: ct("timeTaken") || "Time",
      close: ct("close") || "Close",
      filterAll: ct("filterAll") || "All",
      filterVeryShort: ct("filterVeryShort") || "Very short (<50nm)",
      filterShort: ct("filterShort") || "Short (50-150nm)",
      filterMedium: ct("filterMedium") || "Medium (150-400nm)",
      filterLong: ct("filterLong") || "Long (>400nm)",
      filterCargo: ct("filterCargo") || "Cargo",
      filterPassengers: ct("filterPassengers") || "Passengers",
      filterMixed: ct("filterMixed") || "Mixed",
      sortReward: ct("sortReward") || "Reward",
      sortDistance: ct("sortDistance") || "Distance",
      noActive: ct("noActive") || "No active contracts",
      noCompleted: ct("noCompleted") || "No completed contracts",
      refresh: ct("refresh") || "Refresh",
      minutes: ct("minutes") || "min",
      acceptedOn: ct("acceptedOn") || "Accepted on",
    };
  }

  public async fetchAvailableContracts(): Promise<void> {
    try {
      this.contractsLoading.set(true);
      this.availableContracts = await ContractRouter.getAvailableContracts();
      this.renderAvailableContracts();
    } catch (e) {
      console.error("[WOA] fetchAvailableContracts error:", e);
    } finally {
      this.contractsLoading.set(false);
    }
  }

  public async fetchActiveContracts(): Promise<void> {
    try {
      this.activeContracts = await ContractRouter.getActiveContracts();
      this.completedContracts = await ContractRouter.getCompletedContracts();
      this.renderActiveContractsDisplay();
      this.renderCompletedContractsDisplay();
    } catch (e) {
      console.error("[WOA] fetchActiveContracts error:", e);
    }
  }

  private renderAvailableContracts(): void {
    const el = this.availableContractsRef.getOrDefault();
    if (!el) return;
    const tr = this.getContractTranslations();
    const filters: ContractFilters = {
      distance: this.contractDistanceFilter,
      type: this.contractTypeFilter,
      sort: this.contractSortBy,
    };
    el.innerHTML = renderAvailableContractsHtml(this.availableContracts, tr, filters);
    // Event delegation: filter buttons
    el.querySelectorAll(".contract-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const filterType = btn.getAttribute("data-filter");
        const value = btn.getAttribute("data-value");
        if (filterType === "distance") this.contractDistanceFilter = value as ContractFilters["distance"];
        else if (filterType === "type") this.contractTypeFilter = value as ContractFilters["type"];
        else if (filterType === "sort") this.contractSortBy = value as ContractFilters["sort"];
        this.renderAvailableContracts();
      });
    });
    // Event delegation: accept buttons
    el.querySelectorAll(".contract-accept-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-contract-id");
        const wallet = btn.getAttribute("data-wallet");
        if (id && wallet) void this.acceptContract(id, wallet as "player" | "company");
      });
    });
  }

  private renderActiveContractsDisplay(): void {
    const el = this.activeContractsRef.getOrDefault();
    if (!el) return;
    const tr = this.getContractTranslations();
    const closestAirport = simVarState.closestAirport.get();
    const onGround = simVarState.onGround.get();
    el.innerHTML = renderActiveContractsHtml(this.activeContracts, tr, closestAirport, onGround);
    // Event delegation: deliver buttons
    el.querySelectorAll(".contract-deliver-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-contract-id");
        if (id) void this.completeContract(id);
      });
    });
    // Event delegation: cancel buttons
    el.querySelectorAll(".contract-cancel-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-contract-id");
        if (id) this.showCancelContractConfirm(id);
      });
    });
  }

  private renderCompletedContractsDisplay(): void {
    const el = this.completedContractsRef.getOrDefault();
    if (!el) return;
    const tr = this.getContractTranslations();
    el.innerHTML = renderCompletedContractsHtml(this.completedContracts, tr);
  }

  private async acceptContract(offerId: string, wallet: "player" | "company"): Promise<void> {
    try {
      await ContractRouter.acceptContract(offerId, wallet);
      // Refresh lists
      void this.fetchAvailableContracts();
    } catch (e) {
      console.error("[WOA] acceptContract error:", e);
    }
  }

  private async completeContract(contractId: string): Promise<void> {
    try {
      const contract = this.activeContracts.find(c => c.id === contractId);
      if (!contract) return;
      const result = await ContractRouter.completeContract(contractId);
      // Show completion popup
      const tr = this.getContractTranslations();
      const popupEl = this.contractPopupRef.getOrDefault();
      if (popupEl) {
        popupEl.style.pointerEvents = "auto";
        popupEl.innerHTML = renderContractCompletionHtml(contract, result.reward, result.xp, tr);
        popupEl.querySelector(".contract-completion-close-btn")?.addEventListener("click", () => {
          popupEl.innerHTML = "";
          popupEl.style.pointerEvents = "none";
        });
      }
      // Refresh wallet
      const player = await InitService.getPlayerInfo();
      if (player) marketState.walletPersonal.set(player.money);
      // Refresh active contracts
      void this.fetchActiveContracts();
    } catch (e) {
      console.error("[WOA] completeContract error:", e);
    }
  }

  private showCancelContractConfirm(contractId: string): void {
    const contract = this.activeContracts.find(c => c.id === contractId);
    if (!contract) return;
    const tr = this.getContractTranslations();
    const popupEl = this.contractPopupRef.getOrDefault();
    if (!popupEl) return;
    popupEl.style.pointerEvents = "auto";
    popupEl.innerHTML = renderCancelConfirmHtml(contract, tr);
    // Dismiss
    popupEl.querySelector(".contract-cancel-dismiss-btn")?.addEventListener("click", () => {
      popupEl.innerHTML = "";
      popupEl.style.pointerEvents = "none";
    });
    // Confirm cancel
    popupEl.querySelector(".contract-cancel-confirm-btn")?.addEventListener("click", () => {
      const id = popupEl.querySelector(".contract-cancel-confirm-btn")?.getAttribute("data-contract-id");
      popupEl.innerHTML = "";
      popupEl.style.pointerEvents = "none";
      if (id) void this.cancelContract(id);
    });
  }

  private async cancelContract(contractId: string): Promise<void> {
    try {
      await ContractRouter.cancelContract(contractId);
      void this.fetchActiveContracts();
    } catch (e) {
      console.error("[WOA] cancelContract error:", e);
    }
  }
}
