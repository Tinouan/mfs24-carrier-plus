import { NodeReference } from "@microsoft/msfs-sdk";
import { FleetRouter, MarketRouter, InitService } from "../services";
import { PersistenceManager, DatabaseManager } from "../managers";
import { companyState, marketState, inventoryState, authState, settingsState } from "../state";
import { isGameReady } from "../state/GameModeState";
import {
  renderCompanyMembersHtml,
  renderCompanyFleetHtml,
  renderCompanyMessagesHtml,
  hasCompanyPermission,
  formatMoney,
  renderTransactionsHistoryHtml,
  type UnifiedTimelineEntry,
  type UnifiedHistoryTranslations,
} from "../helpers";

export class CompanyController {
  // Refs (passed from AeroCorpOnline)
  private companyMembersRef: NodeReference<HTMLDivElement>;
  private companyFleetRef: NodeReference<HTMLDivElement>;
  private companyMembersFullRef: NodeReference<HTMLDivElement>;
  private companyHistoryRef: NodeReference<HTMLDivElement>;
  private companyMessagesRef: NodeReference<HTMLDivElement>;
  private companyMessageInputRef: NodeReference<HTMLInputElement>;
  private transferAmountInputRef: NodeReference<HTMLInputElement>;
  private companyInventoryListRef: NodeReference<HTMLDivElement>;
  private companyIcaoFilterRef: NodeReference<HTMLInputElement>;
  private companyItemFilterRef: NodeReference<HTMLInputElement>;

  // Translation
  private t: (section: string, key: string) => string;

  // Callbacks to shared WOA methods
  private callbacks: {
    setupInputEventBlocker: (el: HTMLInputElement | null) => void;
    renderGroupedInventory: (el: HTMLElement | null, items: any[], filters: any) => void;
  };

  constructor(
    refs: {
      companyMembers: NodeReference<HTMLDivElement>;
      companyFleet: NodeReference<HTMLDivElement>;
      companyMembersFull: NodeReference<HTMLDivElement>;
      companyHistory: NodeReference<HTMLDivElement>;
      companyMessages: NodeReference<HTMLDivElement>;
      companyMessageInput: NodeReference<HTMLInputElement>;
      transferAmount: NodeReference<HTMLInputElement>;
      companyInventoryList: NodeReference<HTMLDivElement>;
      companyIcaoFilter: NodeReference<HTMLInputElement>;
      companyItemFilter: NodeReference<HTMLInputElement>;
    },
    translate: (section: string, key: string) => string,
    callbacks: {
      setupInputEventBlocker: (el: HTMLInputElement | null) => void;
      renderGroupedInventory: (el: HTMLElement | null, items: any[], filters: any) => void;
    }
  ) {
    this.companyMembersRef = refs.companyMembers;
    this.companyFleetRef = refs.companyFleet;
    this.companyMembersFullRef = refs.companyMembersFull;
    this.companyHistoryRef = refs.companyHistory;
    this.companyMessagesRef = refs.companyMessages;
    this.companyMessageInputRef = refs.companyMessageInput;
    this.transferAmountInputRef = refs.transferAmount;
    this.companyInventoryListRef = refs.companyInventoryList;
    this.companyIcaoFilterRef = refs.companyIcaoFilter;
    this.companyItemFilterRef = refs.companyItemFilter;
    this.t = translate;
    this.callbacks = callbacks;
  }

  public async fetchCompanyData(): Promise<void> {
    if (!isGameReady()) return;

    companyState.companyLoading.set(true);

    try {
      // Always load player balance first (needed for buy company form)
      const playerBalance = await MarketRouter.getPlayerBalance().catch(() => 0);
      marketState.walletPersonal.set(playerBalance);
      console.log("[ACO] Player balance loaded:", playerBalance);

      // Fetch company info
      const company = await MarketRouter.getCompanyInfo();
      if (!company) {
        companyState.companyData.set(null);
        companyState.companyLoading.set(false);
        return;
      }
      companyState.companyData.set(company);
      console.log("[ACO] Company loaded:", company);

      // Fetch members and fleet in parallel
      const [members, fleet] = await Promise.all([
        MarketRouter.getCompanyMembers().catch(() => []),
        FleetRouter.getFleet().catch(() => []),
      ]);
      companyState.companyMembers.set(members);
      companyState.companyFleet.set(fleet);
      console.log("[ACO] Members loaded:", members.length, "Fleet loaded:", fleet.length);

      // Determine player role from members list
      const playerId = PersistenceManager.getCurrentPlayerId() || "";
      const selfMember = members.find((m: any) => m.user_id === playerId);
      if (selfMember) {
        const role = selfMember.role === "owner" ? "ceo" : (selfMember.role as any);
        companyState.playerRole.set(role);
      } else {
        companyState.playerRole.set("ceo");
      }

      this.renderCompanyMembers();

      // Setup transfer input after render
      setTimeout(() => {
        const transferInput = this.transferAmountInputRef.getOrDefault();
        if (transferInput) {
          this.callbacks.setupInputEventBlocker(transferInput);
        }
      }, 150);

    } catch (error) {
      console.error("[ACO] Error fetching company data:", error);
      companyState.companyData.set(null);
    } finally {
      companyState.companyLoading.set(false);
    }
  }

  public renderCompanyMembers(): void {
    const playerId = PersistenceManager.getCurrentPlayerId() || "";
    const isSolo = authState.isP2PMode.get();
    const members = companyState.companyMembers.get();
    const membersForRender = members.map((m: any) => ({ user_id: m.user_id || "", username: m.username || m.email || "", role: m.role || "recruit" }));

    // Overview members (compact)
    const membersEl = this.companyMembersRef.getOrDefault();
    if (membersEl) {
      membersEl.innerHTML = renderCompanyMembersHtml(membersForRender, this.t("company", "noMember"), playerId, isSolo);
    }
    // Full Membres tab
    const membersFullEl = this.companyMembersFullRef.getOrDefault();
    if (membersFullEl) {
      membersFullEl.innerHTML = renderCompanyMembersHtml(membersForRender, this.t("company", "noMember"), playerId, isSolo);
    }
    const fleetEl = this.companyFleetRef.getOrDefault();
    if (fleetEl) {
      fleetEl.innerHTML = renderCompanyFleetHtml(companyState.companyFleet.get(), this.t("company", "noAircraft"));
    }
  }

  /**
   * Handle player <-> company money transfer
   */
  public async handleTransfer(direction: "to" | "from"): Promise<void> {
    const role = companyState.playerRole.get();
    const action = direction === "to" ? "transfer_in" : "transfer_out";
    if (!hasCompanyPermission(role, action)) {
      companyState.transferError.set(this.t("company", "permissionDenied"));
      return;
    }

    const inputEl = this.transferAmountInputRef.getOrDefault();
    const amount = inputEl ? parseFloat(inputEl.value) : 0;
    if (!amount || amount <= 0) return;

    companyState.transferLoading.set(true);
    companyState.transferError.set(null);

    try {
      if (direction === "to") {
        await MarketRouter.transferToCompany(amount);
      } else {
        await MarketRouter.transferFromCompany(amount);
      }
      // Refresh balances
      const playerBalance = await MarketRouter.getPlayerBalance().catch(() => 0);
      marketState.walletPersonal.set(playerBalance);
      const company = await MarketRouter.getCompanyInfo();
      if (company) companyState.companyData.set(company);

      // Clear input
      if (inputEl) inputEl.value = "";

      // Generate system message
      const desc = direction === "to"
        ? `${this.t("company", "transferToCompany")}: ${formatMoney(amount)}`
        : `${this.t("company", "transferFromCompany")}: ${formatMoney(amount)}`;
      void this.addCompanySystemMessage("transfer", desc);

      console.log(`[ACO] Transfer ${direction} company: ${amount} CR`);
    } catch (error: any) {
      const msg = error?.message || (direction === "to" ? this.t("company", "insufficientPlayerFunds") : this.t("company", "insufficientCompanyFunds"));
      companyState.transferError.set(msg);
      console.error("[ACO] Transfer error:", error);
    } finally {
      companyState.transferLoading.set(false);
    }
  }

  /**
   * Fetch company wallet transaction history
   */
  public async fetchCompanyHistory(): Promise<void> {
    companyState.companyHistoryLoading.set(true);
    try {
      const transactions = await DatabaseManager.getTransactionLog(100, 0, "company");
      const timeline: UnifiedTimelineEntry[] = transactions.map(tx => ({
        id: tx.id,
        date: tx.timestamp,
        type: "transaction" as const,
        transactionType: tx.type,
        amount: tx.amount,
        description: tx.description,
        airport_icao: tx.airport_icao,
      }));
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Build history translations using translate function
      const ht = (key: string, fallback: string): string => {
        const val = this.t("history", key);
        return val !== key ? val : fallback;
      };
      const historyTr: UnifiedHistoryTranslations = {
        filterAll: "", filterFlights: "", filterTransactions: "", filterContracts: "",
        mission: ht("mission", "Mission"),
        freeflight: ht("freeflight", "Free flight"),
        marketBuy: ht("marketBuy", "Purchase"),
        marketSell: ht("marketSell", "Sale"),
        marketList: ht("marketList", "Listed for sale"),
        aircraftBuy: ht("aircraftBuy", "Aircraft purchase"),
        aircraftSell: ht("aircraftSell", "Aircraft sale"),
        refuel: ht("refuel", "Refuel"),
        repair: ht("repair", "Repair"),
        companyCreate: ht("companyCreate", "Company created"),
        missionReward: ht("missionReward", "Mission reward"),
        transferToCompany: ht("transferToCompany", "Transfer to company"),
        transferFromCompany: ht("transferFromCompany", "Withdraw from company"),
        contractReward: ht("contractReward", "Contract reward"),
        loadMore: ht("loadMore", "Load more"),
        noHistory: ht("noHistory", "No history"),
      };

      const el = this.companyHistoryRef.getOrDefault();
      if (el) {
        el.innerHTML = renderTransactionsHistoryHtml(timeline, historyTr);
      }
      console.log(`[ACO] Company history loaded: ${transactions.length} transactions`);
    } catch (error) {
      console.error("[ACO] Error fetching company history:", error);
    } finally {
      companyState.companyHistoryLoading.set(false);
    }
  }

  /**
   * Fetch company messages from local DB
   */
  public async fetchCompanyMessages(): Promise<void> {
    companyState.companyMessagesLoading.set(true);
    try {
      const companyId = companyState.companyData.get()?.id || "";
      if (!companyId) {
        companyState.companyMessagesLoading.set(false);
        return;
      }
      const messages = await DatabaseManager.getCompanyMessages(companyId);
      companyState.companyMessages.set(messages);

      const role = companyState.playerRole.get();
      const canPin = hasCompanyPermission(role, "message_pin");

      const el = this.companyMessagesRef.getOrDefault();
      if (el) {
        el.innerHTML = renderCompanyMessagesHtml(
          messages,
          canPin,
          { pinned: this.t("company", "pinned"), noMessages: this.t("company", "noMessages") }
        );
        // Attach pin button listeners
        el.querySelectorAll(".pin-message-btn").forEach((btn: Element) => {
          btn.addEventListener("click", () => {
            const msgId = btn.getAttribute("data-message-id");
            if (msgId) void this.handlePinMessage(msgId);
          });
        });
      }
    } catch (error) {
      console.error("[ACO] Error fetching company messages:", error);
    } finally {
      companyState.companyMessagesLoading.set(false);
    }
  }

  /**
   * Send a company message
   */
  public async handleSendCompanyMessage(): Promise<void> {
    const inputEl = this.companyMessageInputRef.getOrDefault();
    const content = inputEl?.value?.trim() || "";
    if (!content) return;

    companyState.companyMessageSending.set(true);
    try {
      const companyId = companyState.companyData.get()?.id || "";
      const playerId = PersistenceManager.getCurrentPlayerId() || "";
      const player = await DatabaseManager.getPlayer();
      const playerName = player?.name || "Player";

      await DatabaseManager.saveCompanyMessage({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        company_id: companyId,
        sender_id: playerId,
        sender_name: playerName,
        content,
        is_system: false,
        is_pinned: false,
        created_at: new Date().toISOString(),
      });

      if (inputEl) inputEl.value = "";
      void this.fetchCompanyMessages();
    } catch (error) {
      console.error("[ACO] Error sending message:", error);
    } finally {
      companyState.companyMessageSending.set(false);
    }
  }

  /**
   * Pin/unpin a company message
   */
  private async handlePinMessage(messageId: string): Promise<void> {
    try {
      const companyId = companyState.companyData.get()?.id || "";
      await DatabaseManager.pinCompanyMessage(messageId, companyId);
      void this.fetchCompanyMessages();
    } catch (error) {
      console.error("[ACO] Error pinning message:", error);
    }
  }

  /**
   * Add a system message to company messages
   */
  private async addCompanySystemMessage(type: string, description: string): Promise<void> {
    try {
      const companyId = companyState.companyData.get()?.id || "";
      if (!companyId) return;

      await DatabaseManager.saveCompanyMessage({
        id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        company_id: companyId,
        sender_id: "system",
        sender_name: "System",
        content: description,
        is_system: true,
        is_pinned: false,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[ACO] Error adding system message:", error);
    }
  }

  /**
   * Handle buying a company (P2P mode only)
   * Cost: 50,000 credits
   */
  public async handleBuyCompany(): Promise<void> {
    // Only available in P2P mode
    if (!authState.isP2PMode.get()) {
      console.log("[ACO] Buy company only available in P2P mode");
      return;
    }

    const companyName = companyState.buyCompanyName.get().trim();
    if (!companyName) {
      companyState.buyCompanyError.set(this.t("company", "enterCompanyName") || "Please enter a company name");
      return;
    }

    const companyAirport = companyState.buyCompanyAirport.get().trim().toUpperCase();
    if (!companyAirport || companyAirport.length !== 4) {
      companyState.buyCompanyError.set(this.t("company", "enterAirportCode") || "Please enter a valid 4-letter ICAO code");
      return;
    }

    companyState.buyCompanyLoading.set(true);
    companyState.buyCompanyError.set(null);

    try {
      // Use InitService to purchase company with chosen headquarters
      const company = await InitService.purchaseCompany(companyName, companyAirport);
      console.log("[ACO] Company purchased:", company.name, "at", company.headquarters_icao);

      // Update state
      companyState.companyData.set({
        id: company.id,
        name: company.name,
        balance: company.balance,
        created_at: company.created_at,
        home_airport_ident: company.headquarters_icao || companyAirport,
      });

      // Update wallet balance (deduct 50,000)
      const player = await InitService.getPlayerInfo();
      if (player) {
        marketState.walletPersonal.set(player.money);
      }

      // Clear form
      companyState.buyCompanyName.set("");
      companyState.buyCompanyAirport.set("");

      // Refresh company tab
      void this.fetchCompanyData();

    } catch (error) {
      console.error("[ACO] Error buying company:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to purchase company";
      companyState.buyCompanyError.set(errorMsg);
    } finally {
      companyState.buyCompanyLoading.set(false);
    }
  }

  public async fetchCompanyInventory(): Promise<void> {
    if (!isGameReady()) return;

    inventoryState.companyInventoryLoading.set(true);

    try {
      // Get all company's inventory from all airport locations
      const rawInventory = await MarketRouter.getCompanyInventory();

      // Map to ProfileInventoryItem format
      const items = rawInventory.map(inv => ({
        id: inv.id,
        item_code: inv.item_type,
        item_name: inv.item_name,
        quantity: inv.quantity,
        airport_icao: inv.airport_icao,
        tier: inv.tier,
      }));

      inventoryState.companyInventory.set(items);
      console.log("[ACO] Company inventory loaded:", items.length, "items");

      this.renderCompanyInventory();

    } catch (error) {
      console.error("[ACO] Error fetching company inventory:", error);
    } finally {
      inventoryState.companyInventoryLoading.set(false);
    }
  }

  public renderCompanyInventory(): void {
    this.callbacks.renderGroupedInventory(
      this.companyInventoryListRef.getOrDefault(),
      inventoryState.companyInventory.get(),
      {
        icao: inventoryState.companyIcaoFilter.get().trim(),
        item: inventoryState.companyItemFilter.get().trim(),
        tier: inventoryState.companyTierFilter.get(),
        owner_type: inventoryState.companyOwnerFilter.get()
      }
    );
  }
}
