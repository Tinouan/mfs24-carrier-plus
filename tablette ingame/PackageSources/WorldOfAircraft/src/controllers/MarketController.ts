import { NodeReference } from "@microsoft/msfs-sdk";
import { MarketRouter, PlayerRouter } from "../services";
import { popupManager } from "../managers";
import {
  marketState, inventoryState, companyState, authState, settingsState, simVarState,
  openSellItemPopup, closeSellItemPopup,
  openSellAircraftPopup, closeSellAircraftPopup,
  type SellableItem, type SellAircraftData,
} from "../state";
import { isGameReady } from "../state/GameModeState";
import { renderMarketListingsHtml, formatMoney } from "../helpers";

export class MarketController {
  private t: (section: string, key: string) => string;
  private refs: {
    marketListings: NodeReference<HTMLDivElement>;
    marketBuyQtySlider: NodeReference<HTMLInputElement>;
    marketBuyQtyDisplay: NodeReference<HTMLSpanElement>;
    marketIcaoFilter: NodeReference<HTMLInputElement>;
    marketItemFilter: NodeReference<HTMLInputElement>;
    mySellOrders: NodeReference<HTMLDivElement>;
    aircraftCatalog: NodeReference<HTMLDivElement>;
    myAircraftForSale: NodeReference<HTMLDivElement>;
    marketInventoryList: NodeReference<HTMLDivElement>;
    marketInvIcaoFilter: NodeReference<HTMLInputElement>;
    marketInvItemFilter: NodeReference<HTMLInputElement>;
    sellItemPopup: NodeReference<HTMLDivElement>;
    sellAircraftPopup: NodeReference<HTMLDivElement>;
    profileIcaoFilter: NodeReference<HTMLInputElement>;
    profileItemFilter: NodeReference<HTMLInputElement>;
    profileInventoryList: NodeReference<HTMLDivElement>;
  };
  private callbacks: {
    onRefreshCompanyData: () => void;
    onRefreshHangar: () => void;
  };

  constructor(
    refs: {
      marketListings: NodeReference<HTMLDivElement>;
      marketBuyQtySlider: NodeReference<HTMLInputElement>;
      marketBuyQtyDisplay: NodeReference<HTMLSpanElement>;
      marketIcaoFilter: NodeReference<HTMLInputElement>;
      marketItemFilter: NodeReference<HTMLInputElement>;
      mySellOrders: NodeReference<HTMLDivElement>;
      aircraftCatalog: NodeReference<HTMLDivElement>;
      myAircraftForSale: NodeReference<HTMLDivElement>;
      marketInventoryList: NodeReference<HTMLDivElement>;
      marketInvIcaoFilter: NodeReference<HTMLInputElement>;
      marketInvItemFilter: NodeReference<HTMLInputElement>;
      sellItemPopup: NodeReference<HTMLDivElement>;
      sellAircraftPopup: NodeReference<HTMLDivElement>;
      profileIcaoFilter: NodeReference<HTMLInputElement>;
      profileItemFilter: NodeReference<HTMLInputElement>;
      profileInventoryList: NodeReference<HTMLDivElement>;
    },
    translate: (section: string, key: string) => string,
    callbacks: {
      onRefreshCompanyData: () => void;
      onRefreshHangar: () => void;
    }
  ) {
    this.refs = refs;
    this.t = translate;
    this.callbacks = callbacks;
  }

  // ═══════════════════════════════════════════════════════════
  // MARKET (HV) DATA
  // ═══════════════════════════════════════════════════════════

  public async fetchMarketData(): Promise<void> {
    if (!isGameReady()) return;

    marketState.marketLoading.set(true);
    marketState.marketError.set(null);

    try {
      // Fetch data in parallel
      const tierFilter = marketState.marketTierFilter.get();
      const [playerBalance, company, listings] = await Promise.all([
        MarketRouter.getPlayerBalance().catch(() => 0),  // Player personal wallet
        !companyState.companyData.get() ? MarketRouter.getCompanyInfo() : Promise.resolve(companyState.companyData.get()),
        MarketRouter.getMarketListings(tierFilter, 100),
      ]);

      marketState.walletPersonal.set(playerBalance);
      if (company && !companyState.companyData.get()) {
        companyState.companyData.set(company);
      }
      marketState.marketListings.set(listings);
      console.log("[WOA] Market loaded:", listings.length, "listings");

      this.renderMarketTab();

    } catch (error) {
      console.error("[WOA] Error fetching market data:", error);
      marketState.marketError.set(this.t("market", "errorLoadingMarket"));
    } finally {
      marketState.marketLoading.set(false);
    }
  }

  public renderMarketTab(): void {
    const listingsEl = this.refs.marketListings.getOrDefault();
    if (!listingsEl) return;

    // Filter listings by ICAO and/or item name if filters are set
    const icaoFilter = marketState.marketIcaoFilter.get().trim().toUpperCase();
    const itemFilter = marketState.marketItemFilter.get().trim().toLowerCase();
    let listings = marketState.marketListings.get();
    if (icaoFilter.length > 0) {
      listings = listings.filter(l => l.airport_ident && l.airport_ident.toUpperCase().includes(icaoFilter));
    }
    if (itemFilter.length > 0) {
      listings = listings.filter(l => l.item_name && l.item_name.toLowerCase().includes(itemFilter));
    }
    listingsEl.innerHTML = renderMarketListingsHtml(listings, this.t("market", "noOfferAvailable"), this.t("hangar", "availableShort"));

    // Add click handlers for each listing
    listingsEl.querySelectorAll(".market-listing-item").forEach(el => {
      el.addEventListener("click", () => {
        const locationId = el.getAttribute("data-location-id");
        const itemId = el.getAttribute("data-item-id");
        if (locationId && itemId) this.openMarketBuyPopup(locationId, itemId);
      });
    });
  }

  private openMarketBuyPopup(locationId: string, itemId: string): void {
    const listings = marketState.marketListings.get();
    const item = listings.find(l => l.location_id === locationId && l.item_id === itemId);

    if (!item) {
      console.error("[WOA] Market item not found");
      return;
    }

    // Delegate to PopupManager with MarketBuyItem
    popupManager.openMarketBuy({
      location_id: item.location_id,
      airport_ident: item.airport_ident,
      company_name: item.company_name,
      item_id: item.item_id,
      item_code: item.item_code,
      item_name: item.item_name,
      item_tier: item.item_tier,
      sale_price: item.sale_price,
      sale_qty: item.sale_qty,
    });
  }

  public closeMarketBuyPopup(): void {
    popupManager.closeMarketBuy();
  }

  public updateMarketBuyQty(qty: number): void {
    popupManager.updateMarketBuyQty(qty);
  }

  public async confirmMarketBuy(): Promise<void> {
    await popupManager.confirmMarketBuy();
  }

  // V4.1: Refresh wallets (personal + company)
  public async fetchWallets(): Promise<void> {
    try {
      const player = await PlayerRouter.getPlayer();
      if (player) {
        marketState.walletPersonal.set(player.money);
      }
      // Also refresh company data to get company balance
      this.callbacks.onRefreshCompanyData();
    } catch (error) {
      console.error("[WOA] Error fetching wallets:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // V4.1: SELL ORDERS (MES VENTES)
  // ═══════════════════════════════════════════════════════════

  public async fetchMySellOrders(): Promise<void> {
    if (!isGameReady()) return;

    try {
      const { localMarketService } = await import("../services/LocalMarketService");
      const orders = await localMarketService.getMySellOrders();
      this.renderMySellOrders(orders);
    } catch (error) {
      console.error("[WOA] Error fetching sell orders:", error);
    }
  }

  private renderMySellOrders(orders: import("../managers/DatabaseManager").SellOrder[]): void {
    const el = this.refs.mySellOrders.getOrDefault();
    if (!el) return;

    const lang = settingsState.currentLanguage.get();
    const t = (key: string) => this.t("market", key);

    if (orders.length === 0) {
      el.innerHTML = `
        <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
          <svg style="width: 32px; height: 32px; margin-bottom: 8px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
            <path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4"/>
            <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/>
            <path d="M18 12a2 2 0 000 4h4v-4h-4z"/>
          </svg>
          <div style="color: #6b7280; font-size: 11px;">${t("noActiveOrders")}</div>
        </div>
      `;
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    for (const order of orders) {
      const statusColor = order.status === "active" ? "#22c55e" : order.status === "sold" ? "#3b82f6" : "#6b7280";
      const statusLabel = order.status === "active" ? (lang === "fr" ? "Actif" : "Active") :
                          order.status === "sold" ? (lang === "fr" ? "Vendu" : "Sold") :
                          (lang === "fr" ? "Annulé" : "Cancelled");

      html += `
        <div class="sell-order-item" data-order-id="${order.id}" style="background: #252532; border-radius: 8px; padding: 12px; cursor: ${order.status === "active" ? "pointer" : "default"};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 13px; font-weight: 600; color: white;">${order.item_name}</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">
                @ ${order.airport_icao} • ${order.quantity}x ${formatMoney(order.price_per_unit)}
              </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${statusColor}20; color: ${statusColor};">${statusLabel}</span>
              <span style="font-size: 12px; font-weight: 600; color: #f59e0b;">${formatMoney(order.total_price)}</span>
            </div>
          </div>
          ${order.status === "active" ? `<div style="margin-top: 8px; text-align: right;"><span class="cancel-order-btn" style="font-size: 10px; color: #ef4444; cursor: pointer;">${lang === "fr" ? "Annuler" : "Cancel"}</span></div>` : ""}
        </div>
      `;
    }
    html += "</div>";
    el.innerHTML = html;

    // Add click handlers for cancel buttons
    el.querySelectorAll(".sell-order-item").forEach(item => {
      const cancelBtn = item.querySelector(".cancel-order-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const orderId = item.getAttribute("data-order-id");
          if (orderId) void this.cancelSellOrder(orderId);
        });
      }
    });
  }

  public async cancelSellOrder(orderId: string): Promise<void> {
    if (!isGameReady()) return;

    try {
      const { localMarketService } = await import("../services/LocalMarketService");
      await localMarketService.cancelSellOrder(orderId);
      // Refresh the list
      void this.fetchMySellOrders();
    } catch (error) {
      console.error("[WOA] Error cancelling sell order:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // V4.1: MARKET INVENTORY
  // ═══════════════════════════════════════════════════════════

  public async fetchMarketInventory(): Promise<void> {
    if (!isGameReady()) return;

    inventoryState.marketInventoryLoading.set(true);

    try {
      const rawInventory = await MarketRouter.getPlayerInventory();

      const items: Array<{ id: string; item_code: string; item_name: string; quantity: number; airport_icao: string; tier: number; owner_type: "player" | "company"; source?: string }> = rawInventory.map(inv => ({
        id: String(inv.id),
        item_code: inv.item_type,
        item_name: inv.item_name,
        quantity: inv.quantity,
        airport_icao: inv.airport_icao,
        tier: inv.tier || 0,
        owner_type: "player" as const,
        source: inv.source,
      }));

      // Also fetch company inventory
      try {
        const companyInv = await MarketRouter.getCompanyInventory();
        for (const inv of companyInv) {
          items.push({
            id: String(inv.id),
            item_code: inv.item_type,
            item_name: inv.item_name,
            quantity: inv.quantity,
            airport_icao: inv.airport_icao,
            tier: inv.tier || 0,
            owner_type: "company" as const,
            source: inv.source,
          });
        }
      } catch {
        // Company may not exist
      }

      inventoryState.marketInventory.set(items);
      this.renderMarketInventory();
    } catch (error) {
      console.error("[WOA] Error fetching market inventory:", error);
    } finally {
      inventoryState.marketInventoryLoading.set(false);
    }
  }

  public renderMarketInventory(): void {
    const listEl = this.refs.marketInventoryList.getOrDefault();
    if (!listEl) return;

    const items = inventoryState.marketInventory.get();
    const filters = {
      icao: inventoryState.marketInvIcaoFilter.get().trim(),
      item: inventoryState.marketInvItemFilter.get().trim(),
      tier: inventoryState.marketInvTierFilter.get(),
      owner_type: inventoryState.marketInvOwnerFilter.get(),
    };

    const lang = settingsState.currentLanguage.get();
    const sellLabel = lang === "fr" ? "Vendre" : "Sell";

    // Apply filters
    let filtered = items;
    if (filters.icao.length > 0) {
      filtered = filtered.filter(i => i.airport_icao?.toUpperCase().includes(filters.icao.toUpperCase()));
    }
    if (filters.item.length > 0) {
      filtered = filtered.filter(i => i.item_name?.toLowerCase().includes(filters.item.toLowerCase()));
    }
    if (filters.tier !== null) {
      filtered = filtered.filter(i => i.tier === filters.tier);
    }
    if (filters.owner_type && filters.owner_type !== "all") {
      filtered = filtered.filter(i => (i.owner_type || "player") === filters.owner_type);
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
          <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            <path d="M3.27 6.96L12 12.01l8.73-5.05"/>
            <path d="M12 22.08V12"/>
          </svg>
          <div style="color: #6b7280; font-size: 12px;">${this.t("inventory", "emptyInventory")}</div>
        </div>
      `;
      return;
    }

    // Group by airport
    const byAirport: Record<string, typeof filtered> = {};
    for (const item of filtered) {
      const icao = item.airport_icao || "UNKNOWN";
      if (!byAirport[icao]) byAirport[icao] = [];
      byAirport[icao].push(item);
    }

    // Render grouped inventory with sell buttons
    let html = "";
    for (const icao of Object.keys(byAirport)) {
      const airportItems = byAirport[icao];
      html += `<div style="background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-family: monospace; color: #60a5fa; font-size: 12px; font-weight: 600;">${icao}</span>
          <span style="font-size: 10px; color: #6b7280;">(${airportItems.length} items)</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">`;
      for (const item of airportItems) {
        const ownerColor = (item.owner_type || "player") === "player" ? "#3b82f6" : "#f59e0b";
        const tierColor = item.tier === 0 ? "#6b7280" : item.tier === 1 ? "#22c55e" : item.tier === 2 ? "#3b82f6" : "#a855f7";
        const isContract = item.source === "contract";
        const contractBadge = isContract
          ? `<span style="background: rgba(139, 92, 246, 0.25); color: #8b5cf6; font-size: 8px; font-weight: 600; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">CONTRAT</span>`
          : "";
        const sellBtn = isContract
          ? `<span style="font-size: 8px; color: #6b7280; padding: 3px 8px;">--</span>`
          : `<button class="inv-sell-btn" data-item-code="${item.item_code}" data-airport="${item.airport_icao}" style="padding: 3px 8px; background: #f59e0b; color: #1a1a24; border: none; border-radius: 4px; font-size: 9px; font-weight: 600; cursor: pointer;">${sellLabel}</button>`;
        html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #1a1a24; border-radius: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${ownerColor}; display: inline-block;"></span>
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tierColor};"></span>
            <span style="font-size: 11px; color: white;">${item.item_name}${contractBadge}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; color: #9ca3af; font-weight: 600;">x${item.quantity}</span>
            ${sellBtn}
          </div>
        </div>`;
      }
      html += `</div></div>`;
    }
    listEl.innerHTML = html;

    // Wire sell buttons
    listEl.querySelectorAll(".inv-sell-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemCode = (btn as HTMLElement).getAttribute("data-item-code") || "";
        const airport = (btn as HTMLElement).getAttribute("data-airport") || "";
        void this.openSellItemPopupHandler(itemCode, airport);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // V4.1: SELL ITEM POPUP
  // ═══════════════════════════════════════════════════════════

  public async openSellItemPopupHandler(preSelectedItemCode?: string, preSelectedAirport?: string): Promise<void> {
    if (!isGameReady()) return;

    try {
      const { localMarketService } = await import("../services/LocalMarketService");
      const inventory = await localMarketService.getPlayerInventory();

      // Map to SellableItem format (exclude contract items)
      const items: SellableItem[] = inventory
        .filter(inv => inv.quantity > 0 && inv.source !== "contract")
        .map(inv => ({
          item_code: inv.item_type,
          item_name: inv.item_name,
          quantity: inv.quantity,
          airport_icao: inv.airport_icao,
          tier: inv.tier || 0,
        }));

      if (items.length === 0) {
        openSellItemPopup([]);
        this.renderSellItemPopupContent([]);
        return;
      }

      // Find pre-selected item index
      let preSelectedIndex = 0;
      if (preSelectedItemCode) {
        const idx = items.findIndex(i =>
          i.item_code === preSelectedItemCode &&
          (!preSelectedAirport || i.airport_icao === preSelectedAirport)
        );
        if (idx >= 0) preSelectedIndex = idx;
      }

      openSellItemPopup(items);
      marketState.sellItemSelectedIndex.set(preSelectedIndex);
      this.renderSellItemPopupContent(items, preSelectedIndex);
    } catch (error) {
      console.error("[WOA] Error opening sell item popup:", error);
    }
  }

  private renderSellItemPopupContent(items: SellableItem[], preSelectedIndex: number = 0): void {
    const el = this.refs.sellItemPopup.getOrDefault();
    if (!el) return;

    const lang = settingsState.currentLanguage.get();
    const t = (section: string, key: string) => this.t(section, key);

    if (items.length === 0) {
      el.innerHTML = `
        <div style="background: #1a1a24; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="color: #6b7280; font-size: 12px;">${t("market", "noItemsToSell")}</div>
        </div>
        <button class="sell-popup-cancel" style="width: 100%; margin-top: 12px; padding: 10px; background: #374151; color: #9ca3af; border-radius: 8px; text-align: center; font-size: 11px; border: none; cursor: pointer;">
          ${t("common", "cancel")}
        </button>
      `;
      el.querySelector(".sell-popup-cancel")?.addEventListener("click", () => {
        closeSellItemPopup();
      });
      return;
    }

    // Build item options HTML with pre-selection
    let optionsHtml = "";
    items.forEach((item, i) => {
      const selected = i === preSelectedIndex ? " selected" : "";
      optionsHtml += `<option value="${i}"${selected}>${item.item_name} (${item.quantity}x @ ${item.airport_icao})</option>`;
    });

    const selectedItem = items[preSelectedIndex] || items[0];
    el.innerHTML = `
      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">${t("market", "selectItem")}</div>
        <select class="sell-item-select" style="width: 100%; padding: 8px; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; outline: none;">
          ${optionsHtml}
        </select>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">${t("market", "selectOwner")}</div>
        <div style="display: flex; gap: 8px;">
          <button class="sell-owner-btn" data-owner="player" style="flex: 1; padding: 8px; background: #3b82f6; color: white; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; cursor: pointer;">
            ${lang === "fr" ? "Perso" : "Personal"}
          </button>
          <button class="sell-owner-btn" data-owner="company" style="flex: 1; padding: 8px; background: #1a1a24; color: #6b7280; border: 1px solid #374151; border-radius: 6px; font-size: 11px; cursor: pointer;">
            ${lang === "fr" ? "Company" : "Company"}
          </button>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">${t("common", "quantity")}</div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="range" class="sell-qty-slider" min="1" max="${selectedItem.quantity}" value="1" style="flex: 1; accent-color: #3b82f6;" />
          <span class="sell-qty-display" style="font-size: 14px; font-weight: 600; color: white; min-width: 30px; text-align: right;">1</span>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">${t("market", "pricePerUnit")} (CR)</div>
        <input type="number" class="sell-price-input" value="100" min="1" style="width: 100%; padding: 8px; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; outline: none; box-sizing: border-box;" />
      </div>

      <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 12px; color: #9ca3af;">${t("market", "totalPrice")}:</span>
          <span class="sell-total-display" style="font-size: 16px; font-weight: 700; color: #f59e0b;">100 CR</span>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button class="sell-confirm-btn" style="width: 100%; padding: 12px; background: #22c55e; color: white; border-radius: 8px; text-align: center; font-size: 12px; font-weight: 600; border: none; cursor: pointer;">
          ${t("market", "postOrder")}
        </button>
        <button class="sell-popup-cancel" style="width: 100%; padding: 10px; background: #374151; color: #9ca3af; border-radius: 8px; text-align: center; font-size: 11px; border: none; cursor: pointer;">
          ${t("common", "cancel")}
        </button>
      </div>
    `;

    // Wire up event handlers
    const selectEl = el.querySelector(".sell-item-select") as HTMLSelectElement;
    const qtySlider = el.querySelector(".sell-qty-slider") as HTMLInputElement;
    const qtyDisplay = el.querySelector(".sell-qty-display") as HTMLSpanElement;
    const priceInput = el.querySelector(".sell-price-input") as HTMLInputElement;
    const totalDisplay = el.querySelector(".sell-total-display") as HTMLSpanElement;
    const ownerBtns = el.querySelectorAll(".sell-owner-btn");
    let selectedOwner: "player" | "company" = "player";

    const updateTotal = (): void => {
      const qty = parseInt(qtySlider.value) || 1;
      const price = parseInt(priceInput.value) || 0;
      totalDisplay.textContent = `${formatMoney(qty * price)}`;
    };

    // Item selection change
    selectEl?.addEventListener("change", () => {
      const idx = parseInt(selectEl.value);
      const item = items[idx];
      if (item) {
        qtySlider.max = item.quantity.toString();
        qtySlider.value = "1";
        qtyDisplay.textContent = "1";
        marketState.sellItemSelectedIndex.set(idx);
        updateTotal();
      }
    });

    // Quantity slider
    qtySlider?.addEventListener("input", () => {
      qtyDisplay.textContent = qtySlider.value;
      updateTotal();
    });

    // Price input
    priceInput?.addEventListener("input", () => {
      updateTotal();
    });
    // Stop keyboard propagation for inputs
    [priceInput, selectEl].forEach(input => {
      if (!input) return;
      input.addEventListener("keydown", (e: Event) => { e.stopPropagation(); e.stopImmediatePropagation(); });
      input.addEventListener("keyup", (e: Event) => { e.stopPropagation(); e.stopImmediatePropagation(); });
      input.addEventListener("keypress", (e: Event) => { e.stopPropagation(); e.stopImmediatePropagation(); });
    });

    // Owner type buttons
    ownerBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        selectedOwner = (btn.getAttribute("data-owner") as "player" | "company") || "player";
        ownerBtns.forEach(b => {
          if (b.getAttribute("data-owner") === selectedOwner) {
            (b as HTMLElement).style.background = "#3b82f6";
            (b as HTMLElement).style.color = "white";
            (b as HTMLElement).style.borderColor = "#3b82f6";
          } else {
            (b as HTMLElement).style.background = "#1a1a24";
            (b as HTMLElement).style.color = "#6b7280";
            (b as HTMLElement).style.borderColor = "#374151";
          }
        });
        marketState.sellItemOwnerType.set(selectedOwner);
      });
    });

    // Confirm button
    el.querySelector(".sell-confirm-btn")?.addEventListener("click", () => {
      const idx = parseInt(selectEl.value);
      const qty = parseInt(qtySlider.value) || 1;
      const price = parseInt(priceInput.value) || 0;
      if (price <= 0) return;
      void this.confirmSellItem(items[idx], qty, price, selectedOwner);
    });

    // Cancel button
    el.querySelector(".sell-popup-cancel")?.addEventListener("click", () => {
      closeSellItemPopup();
    });
  }

  private async confirmSellItem(item: SellableItem, qty: number, price: number, ownerType: "player" | "company"): Promise<void> {
    if (!isGameReady()) return;

    try {
      const { localMarketService } = await import("../services/LocalMarketService");
      await localMarketService.postSellOrder({
        item_id: item.item_code,
        quantity: qty,
        price_per_unit: price,
        owner_type: ownerType,
        airport_icao: item.airport_icao,
      });

      console.log("[WOA] Sell order posted:", item.item_name, qty, "x", price, "CR");

      closeSellItemPopup();
      void this.fetchMySellOrders();
      void this.fetchWallets();
    } catch (error) {
      console.error("[WOA] Error posting sell order:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // V4.1: AIRCRAFT SELL CHOICE POPUP
  // ═══════════════════════════════════════════════════════════

  private async openSellAircraftPopupHandler(aircraftId: string): Promise<void> {
    if (!isGameReady()) return;

    try {
      const { localMarketService } = await import("../services/LocalMarketService");
      const myAircraft = await localMarketService.getMyAircraftForSale();
      const ac = myAircraft.find(a => a.id === aircraftId);
      if (!ac) {
        console.error("[WOA] Aircraft not found:", aircraftId);
        return;
      }

      if (ac.has_cargo) {
        console.warn("[WOA] Aircraft has cargo, cannot sell");
        return;
      }

      const catalogPrice = ac.catalog?.basePrice || ac.purchase_price || 50000;
      const data: SellAircraftData = {
        id: ac.id,
        registration: ac.registration,
        type_code: ac.type_code,
        name: ac.catalog?.name || ac.type_code,
        condition: ac.condition,
        sell_value: ac.sell_value,
        catalog_price: catalogPrice,
        location_icao: ac.location_icao,
        owner_type: ac.owner_type,
      };

      openSellAircraftPopup(data);
      this.renderSellAircraftPopupContent(data);
    } catch (error) {
      console.error("[WOA] Error opening aircraft sell popup:", error);
    }
  }

  private renderSellAircraftPopupContent(data: SellAircraftData): void {
    const el = this.refs.sellAircraftPopup.getOrDefault();
    if (!el) return;

    const lang = settingsState.currentLanguage.get();
    const t = (section: string, key: string) => this.t(section, key);
    const conditionColor = data.condition >= 80 ? "#22c55e" : data.condition >= 50 ? "#f59e0b" : "#ef4444";

    el.innerHTML = `
      <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 4px;">${data.name}</div>
        <div style="font-size: 11px; color: #6b7280;">${data.registration} @ ${data.location_icao}</div>
        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${conditionColor}20; color: ${conditionColor};">${data.condition}%</span>
          <span style="font-size: 10px; color: #9ca3af;">${t("market", "catalogPrice")}: ${formatMoney(data.catalog_price)}</span>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">
          ${t("market", "quickSale")}
        </div>
        <div style="background: #1a1a24; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">${t("market", "quickSaleDesc")}</div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 16px; font-weight: 700; color: #f59e0b;">${formatMoney(data.sell_value)}</span>
            <button class="quick-sell-btn" style="padding: 8px 16px; background: #ef4444; color: white; border-radius: 6px; font-size: 11px; font-weight: 600; border: none; cursor: pointer;">
              ${t("market", "confirmSell")}
            </button>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">
          ${t("market", "postToMarket")}
        </div>
        <div style="background: #1a1a24; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">${t("market", "marketSaleDesc")}</div>
          <div style="margin-bottom: 8px;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${t("market", "askingPrice")} (CR)</div>
            <input type="number" class="aircraft-price-input" value="${data.catalog_price}" min="1" style="width: 100%; padding: 8px; background: #252532; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; outline: none; box-sizing: border-box;" />
          </div>
          <button class="market-sell-btn" style="width: 100%; padding: 8px; background: #22c55e; color: white; border-radius: 6px; font-size: 11px; font-weight: 600; border: none; cursor: pointer;">
            ${t("market", "postOrder")}
          </button>
        </div>
      </div>

      <button class="sell-aircraft-cancel" style="width: 100%; padding: 10px; background: #374151; color: #9ca3af; border-radius: 8px; text-align: center; font-size: 11px; border: none; cursor: pointer;">
        ${t("common", "cancel")}
      </button>
    `;

    // Stop keyboard propagation for price input
    const priceInput = el.querySelector(".aircraft-price-input") as HTMLInputElement;
    if (priceInput) {
      priceInput.addEventListener("keydown", (e: Event) => { e.stopPropagation(); e.stopImmediatePropagation(); });
      priceInput.addEventListener("keyup", (e: Event) => { e.stopPropagation(); e.stopImmediatePropagation(); });
      priceInput.addEventListener("keypress", (e: Event) => { e.stopPropagation(); e.stopImmediatePropagation(); });
    }

    // Quick sell button
    el.querySelector(".quick-sell-btn")?.addEventListener("click", () => {
      void this.confirmQuickSellAircraft(data.id);
    });

    // Market sell button
    el.querySelector(".market-sell-btn")?.addEventListener("click", () => {
      const price = parseInt(priceInput?.value || "0");
      if (price <= 0) return;
      void this.confirmMarketSellAircraft(data.id, price);
    });

    // Cancel button
    el.querySelector(".sell-aircraft-cancel")?.addEventListener("click", () => {
      closeSellAircraftPopup();
    });
  }

  private async confirmQuickSellAircraft(aircraftId: string): Promise<void> {
    if (!isGameReady()) return;

    try {
      const { localMarketService } = await import("../services/LocalMarketService");
      const saleValue = await localMarketService.sellAircraft(aircraftId);
      console.log("[WOA] Aircraft sold (quick) for:", saleValue, "CR");

      closeSellAircraftPopup();
      void this.fetchWallets();
      void this.fetchAircraftCatalog();
      this.callbacks.onRefreshHangar();
    } catch (error) {
      console.error("[WOA] Error quick-selling aircraft:", error);
    }
  }

  private async confirmMarketSellAircraft(aircraftId: string, askingPrice: number): Promise<void> {
    if (!isGameReady()) return;

    try {
      const { localMarketService } = await import("../services/LocalMarketService");
      await localMarketService.postAircraftSellOrder(aircraftId, askingPrice);
      console.log("[WOA] Aircraft sell order posted at:", askingPrice, "CR");

      closeSellAircraftPopup();
      void this.fetchMySellOrders();
      void this.fetchAircraftCatalog();
      this.callbacks.onRefreshHangar();
    } catch (error) {
      console.error("[WOA] Error posting aircraft sell order:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // V4.1: AIRCRAFT CATALOG (AVIONS)
  // ═══════════════════════════════════════════════════════════

  public async fetchAircraftCatalog(): Promise<void> {
    if (!isGameReady()) return;

    try {
      const { localMarketService } = await import("../services/LocalMarketService");
      const categoryFilter = marketState.aircraftCategoryFilter.get();
      const filters = categoryFilter === "all" ? undefined : { category: categoryFilter };

      const catalog = await localMarketService.getAircraftCatalog(filters);
      const myAircraft = await localMarketService.getMyAircraftForSale();

      this.renderAircraftCatalog(catalog);
      this.renderMyAircraftForSale(myAircraft);
    } catch (error) {
      console.error("[WOA] Error fetching aircraft catalog:", error);
    }
  }

  private renderAircraftCatalog(catalog: import("../managers/DatabaseManager").AircraftCatalog[]): void {
    const el = this.refs.aircraftCatalog.getOrDefault();
    if (!el) return;

    const lang = settingsState.currentLanguage.get();
    const t = (key: string) => this.t("market", key);
    const walletPersonal = marketState.walletPersonal.get();
    const companyBalance = companyState.companyData.get()?.balance || 0;

    if (catalog.length === 0) {
      el.innerHTML = `
        <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="color: #6b7280; font-size: 11px;">${lang === "fr" ? "Aucun avion disponible" : "No aircraft available"}</div>
        </div>
      `;
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    for (const aircraft of catalog) {
      const canBuyPersonal = walletPersonal >= aircraft.basePrice;
      const canBuyCompany = companyBalance >= aircraft.basePrice;
      const licenseColor = aircraft.requiredLicense === "PPL" ? "#22c55e" :
                           aircraft.requiredLicense === "IR" ? "#3b82f6" :
                           aircraft.requiredLicense === "CPL" ? "#f59e0b" :
                           aircraft.requiredLicense === "ATPL" ? "#a855f7" : "#6b7280";

      html += `
        <div class="aircraft-catalog-item" data-catalog-id="${aircraft.id}" style="background: #252532; border-radius: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 13px; font-weight: 600; color: white;">${aircraft.name}</div>
              <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">${aircraft.manufacturer} • ${aircraft.icaoType}</div>
              <div style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;">
                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #22c55e20; color: #22c55e;">${lang === "fr" ? "Neuf - 100%" : "New - 100%"}</span>
                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: ${licenseColor}20; color: ${licenseColor};">${aircraft.requiredLicense}</span>
                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #3b82f620; color: #3b82f6;">${aircraft.passengerSeats} pax</span>
                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #f59e0b20; color: #f59e0b;">${aircraft.cargoCapacityKg} kg</span>
                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #6b728020; color: #9ca3af;">${aircraft.maxRangeNm} nm</span>
                ${aircraft.requiresCopilot ? `<span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #ef444420; color: #ef4444;">${lang === "fr" ? "Copilote" : "Copilot"}</span>` : ""}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 14px; font-weight: 700; color: #22c55e;">${formatMoney(aircraft.basePrice)}</div>
              <div style="display: flex; gap: 4px; margin-top: 6px;">
                <button class="buy-personal-btn" ${!canBuyPersonal ? "disabled" : ""} style="font-size: 9px; padding: 4px 8px; border-radius: 4px; border: none; cursor: ${canBuyPersonal ? "pointer" : "not-allowed"}; background: ${canBuyPersonal ? "#3b82f6" : "#374151"}; color: ${canBuyPersonal ? "white" : "#6b7280"};">
                  ${lang === "fr" ? "Perso" : "Personal"}
                </button>
                <button class="buy-company-btn" ${!canBuyCompany ? "disabled" : ""} style="font-size: 9px; padding: 4px 8px; border-radius: 4px; border: none; cursor: ${canBuyCompany ? "pointer" : "not-allowed"}; background: ${canBuyCompany ? "#f59e0b" : "#374151"}; color: ${canBuyCompany ? "#1a1a24" : "#6b7280"};">
                  ${lang === "fr" ? "Company" : "Company"}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    html += "</div>";
    el.innerHTML = html;

    // Add click handlers for buy buttons
    el.querySelectorAll(".aircraft-catalog-item").forEach(item => {
      const catalogId = item.getAttribute("data-catalog-id");
      if (!catalogId) return;

      const personalBtn = item.querySelector(".buy-personal-btn");
      const companyBtn = item.querySelector(".buy-company-btn");

      if (personalBtn && !personalBtn.hasAttribute("disabled")) {
        personalBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.purchaseAircraft(catalogId, "player");
        });
      }
      if (companyBtn && !companyBtn.hasAttribute("disabled")) {
        companyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.purchaseAircraft(catalogId, "company");
        });
      }
    });
  }

  private renderMyAircraftForSale(aircraft: Array<import("../managers/DatabaseManager").Aircraft & { catalog?: import("../managers/DatabaseManager").AircraftCatalog; sell_value: number; has_cargo: boolean }>): void {
    const el = this.refs.myAircraftForSale.getOrDefault();
    if (!el) return;

    const lang = settingsState.currentLanguage.get();
    const t = (key: string) => this.t("market", key);

    if (aircraft.length === 0) {
      el.innerHTML = `
        <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="color: #6b7280; font-size: 11px;">${lang === "fr" ? "Aucun avion à vendre" : "No aircraft to sell"}</div>
        </div>
      `;
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    for (const ac of aircraft) {
      const conditionColor = ac.condition >= 80 ? "#22c55e" : ac.condition >= 50 ? "#f59e0b" : "#ef4444";

      html += `
        <div class="my-aircraft-item" data-aircraft-id="${ac.id}" style="background: #252532; border-radius: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 13px; font-weight: 600; color: white;">${ac.catalog?.name || ac.type_code}</div>
              <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">${ac.registration} • @ ${ac.location_icao}</div>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: ${conditionColor}20; color: ${conditionColor};">${ac.condition}%</span>
                ${ac.has_cargo ? `<span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #ef444420; color: #ef4444;">${lang === "fr" ? "Cargo" : "Has cargo"}</span>` : ""}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 14px; font-weight: 700; color: #f59e0b;">${formatMoney(ac.sell_value)}</div>
              <button class="sell-aircraft-btn" ${ac.has_cargo ? "disabled" : ""} style="margin-top: 6px; font-size: 9px; padding: 4px 8px; border-radius: 4px; border: none; cursor: ${ac.has_cargo ? "not-allowed" : "pointer"}; background: ${ac.has_cargo ? "#374151" : "#ef4444"}; color: ${ac.has_cargo ? "#6b7280" : "white"};">
                ${lang === "fr" ? "Vendre" : "Sell"}
              </button>
            </div>
          </div>
        </div>
      `;
    }
    html += "</div>";
    el.innerHTML = html;

    // Add click handlers for sell buttons
    el.querySelectorAll(".my-aircraft-item").forEach(item => {
      const aircraftId = item.getAttribute("data-aircraft-id");
      if (!aircraftId) return;

      const sellBtn = item.querySelector(".sell-aircraft-btn");
      if (sellBtn && !sellBtn.hasAttribute("disabled")) {
        sellBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.sellAircraft(aircraftId);
        });
      }
    });
  }

  public async purchaseAircraft(catalogId: string, ownerType: "player" | "company"): Promise<void> {
    if (!isGameReady()) return;

    try {
      const { localMarketService } = await import("../services/LocalMarketService");

      // Get current location - prefer closest airport from SimVar, fallback to user's location
      const closestAirport = simVarState.closestAirport.get();
      const user = authState.currentUser.get();
      const currentIcao = (closestAirport && closestAirport !== "----")
        ? closestAirport
        : (user?.current_airport || user?.preferred_airport || "LFPG");

      const newAircraft = await localMarketService.purchaseAircraft({
        catalog_id: catalogId,
        owner_type: ownerType,
        location_icao: currentIcao,
      });

      console.log("[WOA] Aircraft purchased:", newAircraft.registration);

      // Refresh wallet and catalog
      void this.fetchWallets();
      void this.fetchAircraftCatalog();
      this.callbacks.onRefreshHangar();
    } catch (error) {
      console.error("[WOA] Error purchasing aircraft:", error);
    }
  }

  public async sellAircraft(aircraftId: string): Promise<void> {
    // V4.1: Open sell choice popup instead of instant sale
    void this.openSellAircraftPopupHandler(aircraftId);
  }

  // ═══════════════════════════════════════════════════════════
  // PROFILE INVENTORY
  // ═══════════════════════════════════════════════════════════

  public async fetchProfileInventory(): Promise<void> {
    if (!isGameReady()) return;

    inventoryState.profileInventoryLoading.set(true);

    try {
      // Get all player's inventory from all airport locations
      const rawInventory = await MarketRouter.getPlayerInventory();

      // Map to ProfileInventoryItem format
      const items = rawInventory.map(inv => ({
        id: inv.id,
        item_code: inv.item_type,
        item_name: inv.item_name,
        quantity: inv.quantity,
        airport_icao: inv.airport_icao,
        tier: inv.tier,
      }));

      inventoryState.profileInventory.set(items);
      console.log("[WOA] Profile inventory loaded:", items.length, "items");

      this.renderProfileInventory();

    } catch (error) {
      console.error("[WOA] Error fetching profile inventory:", error);
    } finally {
      inventoryState.profileInventoryLoading.set(false);
    }
  }

  /**
   * Shared grouped inventory renderer - used by both profile and company inventory
   * V4.1: Added owner_type badge and category support for personnel items
   */
  public renderGroupedInventory(
    listEl: HTMLElement | null,
    items: Array<{ id: string | number; item_code: string; item_name: string; quantity: number; airport_icao: string; tier?: number; owner_type?: "player" | "company"; category?: string }>,
    filters: { icao: string; item: string; tier: number | null; owner_type?: "all" | "player" | "company" }
  ): void {
    if (!listEl) return;

    // Apply filters
    let filtered = items;
    if (filters.icao.length > 0) {
      filtered = filtered.filter(i => i.airport_icao?.toUpperCase().includes(filters.icao.toUpperCase()));
    }
    if (filters.item.length > 0) {
      filtered = filtered.filter(i => i.item_name?.toLowerCase().includes(filters.item.toLowerCase()));
    }
    if (filters.tier !== null) {
      filtered = filtered.filter(i => i.tier === filters.tier);
    }
    // V4.1: Filter by owner_type
    if (filters.owner_type && filters.owner_type !== "all") {
      filtered = filtered.filter(i => (i.owner_type || "player") === filters.owner_type);
    }

    // Render empty state
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
          <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            <path d="M3.27 6.96L12 12.01l8.73-5.05"/>
            <path d="M12 22.08V12"/>
          </svg>
          <div style="color: #6b7280; font-size: 12px;">${this.t("inventory", "noItems")}</div>
        </div>
      `;
      return;
    }

    // Group by airport
    const byAirport: Record<string, typeof filtered> = {};
    for (const item of filtered) {
      const icao = item.airport_icao || "UNKNOWN";
      if (!byAirport[icao]) byAirport[icao] = [];
      byAirport[icao].push(item);
    }

    // Render grouped inventory
    let html = "";
    for (const icao of Object.keys(byAirport)) {
      const airportItems = byAirport[icao];
      html += `<div style="background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-family: monospace; color: #60a5fa; font-size: 12px; font-weight: 600;">${icao}</span>
          <span style="font-size: 10px; color: #6b7280;">(${airportItems.length} items)</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">`;
      for (const item of airportItems) {
        // V4.1: Ownership badge color (blue=player, orange=company)
        const ownerColor = (item.owner_type || "player") === "player" ? "#3b82f6" : "#f59e0b";
        // V4.1: Tier/category color (violet for personnel, otherwise tier-based)
        const isPersonnel = item.category === "personnel" || ["worker", "engineer", "pilot", "copilot"].includes(item.item_code);
        const tierColor = isPersonnel ? "#a855f7" : (item.tier === 0 ? "#6b7280" : item.tier === 1 ? "#22c55e" : item.tier === 2 ? "#3b82f6" : "#a855f7");
        html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #1a1a24; border-radius: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${ownerColor}; display: inline-block;"></span>
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tierColor};"></span>
            <span style="font-size: 11px; color: white;">${item.item_name}</span>
          </div>
          <span style="font-size: 11px; color: #9ca3af; font-weight: 600;">x${item.quantity}</span>
        </div>`;
      }
      html += `</div></div>`;
    }
    listEl.innerHTML = html;
  }

  public renderProfileInventory(): void {
    this.renderGroupedInventory(
      this.refs.profileInventoryList.getOrDefault(),
      inventoryState.profileInventory.get(),
      {
        icao: inventoryState.profileIcaoFilter.get().trim(),
        item: inventoryState.profileItemFilter.get().trim(),
        tier: inventoryState.profileTierFilter.get(),
        owner_type: inventoryState.profileOwnerFilter.get()  // V4.1: Ownership filter
      }
    );
  }
}
