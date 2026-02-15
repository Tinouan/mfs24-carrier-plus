/**
 * FactoryController — UI logic for Company > Usines tab
 * Phase 9.7: Factory list, detail, workers, production, food
 */

import { NodeReference } from "@microsoft/msfs-sdk";
import { factoryState } from "../state/FactoryState";
import type { FactoryData, WorkerData, ProductionBatchData } from "../state/FactoryState";
import { Services } from "../services/ServiceAdapter";
import { RecipeService } from "../services/RecipeService";
import { ItemService } from "../services/ItemService";
import { WorkerService } from "../services/WorkerService";
import { DatabaseManager, type Recipe } from "../managers/DatabaseManager";
import { renderItemIcon } from "../helpers";
import {
  getFactoryTierConfig,
  FACTORY_CREATION_COST,
  AIRPORT_FACTORY_SLOTS,
  FOOD_TIER_BONUS,
  calculateEngineerBonus,
  WORKER_XP_TIERS,
  NO_FOOD_EFFICIENCY,
  UPGRADE_COSTS,
  UPGRADE_CANCEL_REFUND_RATE,
} from "../constants/factory";

export class FactoryController {
  private factoryListRef: NodeReference<HTMLDivElement>;
  private factoryDetailRef: NodeReference<HTMLDivElement>;
  private selectedFactoryId: string | null = null;
  private t: (section: string, key: string) => string;

  // Craft slots state (dynamic N slots based on factory tier)
  private slotItems: (string | null)[] = [];
  private selectedBatchQty: number = 1;

  constructor(
    refs: {
      factoryList: NodeReference<HTMLDivElement>;
      factoryDetail: NodeReference<HTMLDivElement>;
    },
    translate: (section: string, key: string) => string
  ) {
    this.factoryListRef = refs.factoryList;
    this.factoryDetailRef = refs.factoryDetail;
    this.t = translate;
  }

  // ─────────────────────────────────────────────────────────
  // RENDER: Factory List
  // ─────────────────────────────────────────────────────────

  async renderFactoryList(): Promise<void> {
    const el = this.factoryListRef.getOrDefault();
    if (!el) return;

    const factories = factoryState.factories.get();
    const workers = factoryState.workers.get();
    const batches = factoryState.productionBatches.get();

    const player = await DatabaseManager.getPlayer();
    const company = player ? await DatabaseManager.getCompanyByOwner(player.id) : null;
    const myFactories = company
      ? factories.filter(f => f.company_id === company.id)
      : [];

    if (myFactories.length === 0 && !company) {
      el.innerHTML = `<div style="color: #6b7280; font-size: 12px; text-align: center; padding: 24px;">
        Vous avez besoin d'une compagnie pour creer des usines.
      </div>`;
      return;
    }

    let html = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <span style="font-size: 14px; font-weight: 600; color: white;">Mes Usines (${myFactories.length})</span>
      <button class="factory-create-btn" style="padding: 6px 12px; background: #3b82f6; border: none; border-radius: 6px; color: white; font-size: 11px; cursor: pointer;">+ Nouvelle Usine</button>
    </div>`;

    if (myFactories.length === 0) {
      html += `<div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">Aucune usine. Creez-en une !</div>`;
    }

    for (const factory of myFactories) {
      const assignedWorkers = workers.filter(w => w.factory_id === factory.id && w.status === "working");
      const activeBatch = batches.find(b => b.factory_id === factory.id && b.status === "in_progress");
      const recipe = activeBatch ? RecipeService.getRecipeById(activeBatch.recipe_id) : null;

      // Food bar
      const foodPct = factory.food_capacity > 0 ? (factory.food_stock / factory.food_capacity) * 100 : 0;
      const foodColor = foodPct > 50 ? "#22c55e" : foodPct > 10 ? "#f59e0b" : "#ef4444";

      // Product icon + production info for the card
      let productIcon = "";
      let productInfo = "";

      if (factory.status === "upgrading" && factory.upgrade_completion) {
        const remaining = Math.max(0, new Date(factory.upgrade_completion).getTime() - Date.now());
        const started = factory.upgrade_started_at ? new Date(factory.upgrade_started_at).getTime() : Date.now();
        const total = new Date(factory.upgrade_completion).getTime() - started;
        const progressPct = total > 0 ? Math.min(100, ((total - remaining) / total) * 100) : 0;
        const mins = Math.floor(remaining / 60000);
        const hrs = Math.floor(mins / 60);
        const timeStr = hrs > 0 ? `${hrs}h${String(mins % 60).padStart(2, "0")}m` : `${mins}m`;
        productIcon = `<div style="width:48px;height:48px;border:2px solid #8b5cf6;border-radius:10px;background:#1a1a2e;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="color:#8b5cf6;font-size:14px;font-weight:bold;">T${factory.upgrade_target_tier || "?"}</span>
        </div>`;
        productInfo = `<div style="background:#1e293b;border-radius:4px;height:7px;overflow:hidden;margin:5px 0 4px;">
            <div style="background:#8b5cf6;height:100%;width:${progressPct}%;border-radius:4px;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#8b5cf6;font-size:11px;font-weight:600;">Amelioration T${factory.upgrade_target_tier}</span>
            <span style="color:#94a3b8;font-size:10px;">~${timeStr}</span>
          </div>`;
      } else if (factory.status === "producing" && activeBatch && recipe) {
        const resultItem = ItemService.getItemById(recipe.resultItemId);
        productIcon = `<div style="width:48px;height:48px;border:2px solid #22c55e;border-radius:10px;background:#1a2e1a;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${renderItemIcon(resultItem?.icon_path, resultItem?.icon || "??", resultItem?.tier || 0, 32)}
        </div>`;
        const remaining = Math.max(0, new Date(activeBatch.estimated_completion).getTime() - Date.now());
        const total = new Date(activeBatch.estimated_completion).getTime() - new Date(activeBatch.started_at).getTime();
        const progressPct = total > 0 ? Math.min(100, ((total - remaining) / total) * 100) : 0;
        const mins = Math.floor(remaining / 60000);
        const hrs = Math.floor(mins / 60);
        const timeStr = hrs > 0 ? `${hrs}h${String(mins % 60).padStart(2, "0")}m` : `${mins}m`;
        productInfo = `<div style="background:#1e293b;border-radius:4px;height:7px;overflow:hidden;margin:5px 0 4px;">
            <div style="background:#22c55e;height:100%;width:${progressPct}%;border-radius:4px;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#22c55e;font-size:11px;font-weight:600;">${recipe.name} x${activeBatch.result_quantity}</span>
            <span style="color:#94a3b8;font-size:10px;">~${timeStr}</span>
          </div>`;
      } else if (factory.last_result_item_id) {
        const lastItem = ItemService.getItemById(factory.last_result_item_id);
        productIcon = `<div style="width:48px;height:48px;border:2px solid #4a5568;border-radius:10px;background:#1a1a2e;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:0.4;">
          ${renderItemIcon(lastItem?.icon_path, lastItem?.icon || "??", lastItem?.tier || 0, 32)}
        </div>`;
        productInfo = `<span style="color:#64748b;font-size:11px;">Idle -- derniere : ${lastItem?.name || "?"}</span>`;
      } else {
        productIcon = `<div style="width:48px;height:48px;border:2px dashed #4a5568;border-radius:10px;background:#1a1a2e;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="color:#4a5568;font-size:18px;font-weight:bold;">?</span>
        </div>`;
        productInfo = `<span style="color:#64748b;font-size:11px;">Idle -- aucune production</span>`;
      }

      html += `<div class="factory-item" data-factory-id="${factory.id}" style="display:flex;align-items:center;gap:12px;background:#111827;border:1px solid #1e293b;border-radius:12px;padding:12px;cursor:pointer;margin-bottom:8px;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#1e293b'">
        ${productIcon}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:#e2e8f0;font-size:13px;font-weight:700;">${factory.name}</span>
            <span style="color:#94a3b8;font-size:10px;">T${factory.tier} · ${factory.airport_ident}</span>
          </div>
          ${productInfo}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
            <span style="font-size:10px;color:#9ca3af;">${assignedWorkers.length}/${factory.max_workers} workers</span>
            <div style="display:flex;align-items:center;gap:4px;">
              <span style="font-size:9px;color:#9ca3af;">Food</span>
              <div style="width:50px;height:5px;background:#374151;border-radius:3px;overflow:hidden;">
                <div style="width:${foodPct}%;height:100%;background:${foodColor};border-radius:3px;"></div>
              </div>
              <span style="font-size:9px;color:${foodColor};">${Math.round(foodPct)}%</span>
            </div>
          </div>
        </div>
      </div>`;
    }

    // My workers summary
    const myWorkers = company ? workers.filter(w => w.owner_company_id === company.id) : [];
    const available = myWorkers.filter(w => w.status === "available");
    const working = myWorkers.filter(w => w.status === "working");
    const injured = myWorkers.filter(w => w.status === "injured");

    html += `<div style="margin-top: 16px; padding: 10px; background: #1a1a24; border-radius: 8px;">
      <span style="font-size: 12px; font-weight: 600; color: white;">Workers (${myWorkers.length})</span>
      <div style="display: flex; gap: 12px; margin-top: 6px; font-size: 10px;">
        <span style="color: #22c55e;">${available.length} disponibles</span>
        <span style="color: #f59e0b;">${working.length} en poste</span>
        ${injured.length > 0 ? `<span style="color: #ef4444;">${injured.length} blesses</span>` : ""}
      </div>
    </div>`;

    el.innerHTML = html;

    // Attach event listeners
    el.querySelectorAll(".factory-item").forEach((item: Element) => {
      item.addEventListener("click", () => {
        const id = item.getAttribute("data-factory-id");
        if (id) this.showFactoryDetail(id);
      });
    });

    const createBtn = el.querySelector(".factory-create-btn");
    if (createBtn) {
      createBtn.addEventListener("click", () => this.showCreateFactoryForm());
    }
  }

  // ─────────────────────────────────────────────────────────
  // RENDER: Factory Detail
  // ─────────────────────────────────────────────────────────

  /** Find all recipes matching the current slot items (supports N slots) */
  private findRecipes(factoryTier: number): Recipe[] {
    const allRecipes = RecipeService.getAllRecipes().filter(r => r.tier <= factoryTier);
    const results: Recipe[] = [];
    const filledSlots = this.slotItems.filter(id => id !== null) as string[];

    if (filledSlots.length === 0) return results;

    for (const recipe of allRecipes) {
      const uniqueIds = [...new Set(recipe.ingredients.map(i => i.itemId))];

      // Single-ingredient recipe: match if any filled slot has it
      if (uniqueIds.length === 1) {
        if (filledSlots.includes(uniqueIds[0])) {
          results.push(recipe);
        }
        continue;
      }

      // Multi-ingredient recipe: all unique ingredients must be present in filled slots
      if (filledSlots.length >= uniqueIds.length) {
        const slotSet = new Set(filledSlots);
        if (uniqueIds.every(id => slotSet.has(id))) {
          results.push(recipe);
        }
      }
    }

    return results;
  }

  /** Render matched recipe results with quantity selector + launch button */
  private renderRecipeResults(recipes: Recipe[], factory: FactoryData, eff: { percent: number; color: string }): string {
    let html = "";
    const headerText = recipes.length > 1 ? `${recipes.length} recettes trouvees !` : "Recette decouverte !";
    const headerColor = "#22c55e";

    for (let ri = 0; ri < recipes.length; ri++) {
      const recipe = recipes[ri];
      const resultItem = ItemService.getItemById(recipe.resultItemId);
      const timeBase = recipe.productionTimeHours * this.selectedBatchQty;
      const effPct = Math.max(eff.percent, 1) / 100;
      const timeEstimated = (timeBase / effPct).toFixed(1);

      // Check ingredient availability
      const ingChecks = recipe.ingredients.map(ing => {
        const item = ItemService.getItemById(ing.itemId);
        const needed = ing.quantity * this.selectedBatchQty;
        return { item, itemId: ing.itemId, needed, name: item?.name || ing.itemId };
      });

      html += `<div style="padding:10px;background:#0d0d14;border-radius:8px;border:1px solid rgba(34,197,94,0.3);margin-top:8px;">`;
      if (ri === 0) {
        html += `<div style="color:${headerColor};font-size:11px;font-weight:600;margin-bottom:8px;">${headerText}</div>`;
      }

      // Recipe info
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="color:#6b7280;font-size:10px;">-></span>
        ${renderItemIcon(resultItem?.icon_path, resultItem?.icon || "??", resultItem?.tier || 0, 28)}
        <div>
          <span style="color:white;font-size:12px;font-weight:600;">${recipe.name}</span>
          <span style="color:#60a5fa;font-size:10px;margin-left:4px;">T${recipe.tier}</span>
        </div>
      </div>`;

      html += `<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:10px;color:#9ca3af;margin-bottom:8px;">
        <span>Produit : ${recipe.resultQuantity * this.selectedBatchQty} unites</span>
        <span>Temps base : ${timeBase}h</span>
        <span>Temps estime : ${timeEstimated}h (a ${eff.percent}%)</span>
      </div>`;

      // Quantity selector
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:10px;color:#9ca3af;">Quantite :</span>
        <button class="batch-qty-minus" data-recipe-idx="${ri}" style="width:24px;height:24px;background:#374151;border:none;border-radius:4px;color:white;font-size:12px;cursor:pointer;">-</button>
        <span style="font-size:12px;color:white;font-weight:600;min-width:20px;text-align:center;">${this.selectedBatchQty}</span>
        <button class="batch-qty-plus" data-recipe-idx="${ri}" style="width:24px;height:24px;background:#374151;border:none;border-radius:4px;color:white;font-size:12px;cursor:pointer;">+</button>
        <span style="font-size:9px;color:#6b7280;">batches</span>
      </div>`;

      // Ingredients needed
      html += `<div style="font-size:10px;color:#9ca3af;margin-bottom:8px;">Ingredients requis : ${ingChecks.map(c => `${c.needed}x ${c.name}`).join(" + ")}</div>`;

      // Launch button
      html += `<button class="factory-start-prod-btn" data-recipe-id="${recipe.id}" style="padding:8px 16px;background:#22c55e;border:none;border-radius:6px;color:white;font-size:11px;font-weight:600;cursor:pointer;width:100%;">Lancer la production</button>`;

      html += `</div>`;
    }

    return html;
  }

  /** Calculate efficiency for display */
  private getEfficiency(factory: FactoryData, assignedWorkers: WorkerData[], engineers: WorkerData[]): { percent: number; color: string; description: string } {
    const hasWorkers = assignedWorkers.length > 0;
    const baseEff = hasWorkers ? 1.0 : NO_FOOD_EFFICIENCY;

    // Food bonus
    let foodBonus: number;
    if (factory.food_stock > 0) {
      foodBonus = FOOD_TIER_BONUS[factory.food_tier_min ?? 0] ?? 1.0;
    } else if (hasWorkers) {
      foodBonus = NO_FOOD_EFFICIENCY; // 30% penalty with workers but no food
    } else {
      foodBonus = 1.0; // No workers, no food: base already at 30%
    }

    // Engineer bonus
    const engBonus = 1 + calculateEngineerBonus(engineers.length, factory.tier);

    // Worker tier bonus
    let workerTierBonus = 1.0;
    if (hasWorkers) {
      const avgTier = assignedWorkers.reduce((sum, w) => sum + w.tier, 0) / assignedWorkers.length;
      const tierIdx = Math.min(Math.max(Math.floor(avgTier) - 1, 0), WORKER_XP_TIERS.length - 1);
      workerTierBonus = WORKER_XP_TIERS[tierIdx].speed_bonus;
    }

    const totalEff = baseEff * foodBonus * engBonus * workerTierBonus;
    const percent = Math.round(totalEff * 100);

    let color = "#ef4444"; // red < 50%
    if (percent >= 100) color = "#22c55e"; // green
    else if (percent >= 70) color = "#f59e0b"; // orange
    else if (percent >= 50) color = "#eab308"; // yellow

    let desc = "";
    if (!hasWorkers && factory.food_stock === 0) desc = "Sans workers ni food";
    else if (!hasWorkers) desc = "Sans workers -- production au minimum";
    else if (factory.food_stock === 0) desc = "Sans food -- efficacite reduite";
    else {
      const parts: string[] = [];
      parts.push("Workers");
      if (factory.food_stock > 0) parts.push(`Food T${factory.food_tier_min ?? 0}`);
      if (engineers.length > 0) parts.push(`${engineers.length} ingenieur(s)`);
      desc = parts.join(" + ");
    }

    return { percent, color, description: desc };
  }

  async showFactoryDetail(factoryId: string): Promise<void> {
    // Reset slots if switching to a different factory
    if (this.selectedFactoryId !== factoryId) {
      this.slotItems = [];
      this.selectedBatchQty = 1;
    }
    this.selectedFactoryId = factoryId;
    const el = this.factoryDetailRef.getOrDefault();
    if (!el) return;

    // Reset parent styles (may have been changed by popup views)
    el.style.display = "";
    el.style.flexDirection = "";
    el.style.overflow = "";

    const factories = factoryState.factories.get();
    const factory = factories.find(f => f.id === factoryId);
    if (!factory) {
      el.innerHTML = `<div style="color: #ef4444; padding: 16px;">Usine introuvable</div>`;
      return;
    }

    const workers = factoryState.workers.get();
    const allAssigned = workers.filter(w => w.factory_id === factoryId && w.status === "working");
    const assignedWorkers = allAssigned.filter(w => w.item_id !== "engineer");
    const assignedEngineers = allAssigned.filter(w => w.item_id === "engineer");
    const batches = factoryState.productionBatches.get();
    const activeBatch = batches.find(b => b.factory_id === factoryId && b.status === "in_progress");

    // Tier config
    const tierConfig = getFactoryTierConfig(factory.tier);
    const nextTierConfig = factory.tier < 10 ? getFactoryTierConfig(factory.tier + 1) : null;

    // Efficiency
    const eff = this.getEfficiency(factory, assignedWorkers, assignedEngineers);

    let html = `<div style="margin-bottom: 8px;">
      <button class="factory-back-btn" style="padding: 4px 8px; background: #374151; border: none; border-radius: 4px; color: white; font-size: 10px; cursor: pointer;">< Retour</button>
    </div>`;

    // === 1. HEADER (with inline rename) ===
    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="factory-name-display" style="font-size: 16px; font-weight: 700; color: white; cursor: pointer;">${factory.name}</span>
        <span class="factory-name-edit-hint" style="display:inline-block;width:16px;height:16px;border:1px solid #64748b;border-radius:4px;color:#64748b;font-size:10px;text-align:center;line-height:16px;cursor:pointer;">A</span>
        <input class="factory-name-input" type="text" value="${factory.name}" maxlength="30" style="display:none;background:#1e293b;border:2px solid #3b82f6;border-radius:6px;color:#e2e8f0;font-size:16px;font-weight:700;padding:2px 8px;width:180px;outline:none;" />
        <span style="font-size: 12px; color: #60a5fa;">Tier ${factory.tier}</span>
      </div>
      <span style="font-size: 11px; color: #9ca3af;">${factory.airport_ident}</span>
    </div>`;

    // === ACTIONS ===
    html += `<div style="display: flex; gap: 8px; margin-bottom: 10px;">`;
    if (factory.status === "idle" && nextTierConfig) {
      const upgCost = UPGRADE_COSTS[factory.tier + 1];
      const upgLabel = upgCost ? `${upgCost.credits.toLocaleString()} CR` : `${nextTierConfig.upgrade_cost.toLocaleString()} CR`;
      html += `<button class="factory-upgrade-btn" style="padding: 6px 10px; background: #8b5cf6; border: none; border-radius: 6px; color: white; font-size: 10px; cursor: pointer;">Ameliorer T${factory.tier}->T${factory.tier + 1} (${upgLabel})</button>`;
    }
    if (factory.status === "idle" && allAssigned.length === 0) {
      html += `<button class="factory-delete-btn" style="padding: 6px 10px; background: #ef4444; border: none; border-radius: 6px; color: white; font-size: 10px; cursor: pointer;">Supprimer</button>`;
    }
    html += `</div>`;

    // === UPGRADING STATE ===
    if (factory.status === "upgrading" && factory.upgrade_completion && factory.upgrade_started_at) {
      const upgTotal = new Date(factory.upgrade_completion).getTime() - new Date(factory.upgrade_started_at).getTime();
      const upgElapsed = Date.now() - new Date(factory.upgrade_started_at).getTime();
      const upgProgressPct = Math.min(100, (upgElapsed / upgTotal) * 100);
      const upgRemaining = Math.max(0, new Date(factory.upgrade_completion).getTime() - Date.now());
      const upgMins = Math.floor(upgRemaining / 60000);
      const upgHrs = Math.floor(upgMins / 60);
      const upgTimeStr = upgHrs > 0 ? `${upgHrs}h${String(upgMins % 60).padStart(2, "0")}m` : `${upgMins}m`;
      const upgCost = UPGRADE_COSTS[factory.upgrade_target_tier || 0];
      const refund = upgCost ? Math.floor(upgCost.credits * UPGRADE_CANCEL_REFUND_RATE) : 0;

      html += `<div style="background:#1a1a24;border:1px solid rgba(139,92,246,0.3);border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="color:#8b5cf6;font-size:13px;font-weight:700;">AMELIORATION EN COURS</span>
          <span style="font-size:10px;padding:2px 6px;background:rgba(139,92,246,0.15);color:#8b5cf6;border-radius:4px;">T${factory.tier} -> T${factory.upgrade_target_tier}</span>
        </div>
        <div style="width:100%;height:10px;background:#374151;border-radius:5px;overflow:hidden;margin-bottom:6px;">
          <div style="width:${upgProgressPct}%;height:100%;background:linear-gradient(90deg,#8b5cf6,#a78bfa);border-radius:5px;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:11px;color:#e2e8f0;font-weight:600;">~${upgTimeStr} restant</span>
          <span style="font-size:11px;color:#8b5cf6;">${Math.round(upgProgressPct)}%</span>
        </div>
        <button class="factory-cancel-upgrade-btn" style="padding:8px;background:transparent;border:1px solid #ef4444;border-radius:6px;color:#ef4444;font-size:11px;font-weight:600;cursor:pointer;width:100%;">Annuler l'amelioration (remboursement ${refund.toLocaleString()} CR -- items perdus)</button>
      </div>`;
    }

    // === 2. EFFICIENCY BAR ===
    html += `<div style="margin-bottom: 10px; padding: 10px; background: #1a1a2e; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="color: #94a3b8; font-size: 11px;">Efficacite actuelle</span>
        <span style="color: ${eff.color}; font-size: 15px; font-weight: bold;">${eff.percent}%</span>
      </div>
      <div style="background: #1e293b; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: ${eff.color}; height: 100%; width: ${Math.min(eff.percent, 200)}%; max-width: 100%; transition: width 0.3s;"></div>
      </div>
      <div style="color: #64748b; font-size: 10px; margin-top: 4px;">${eff.description}</div>
    </div>`;

    // === 3. PRODUCTION — CRAFT SLOTS (hidden during upgrade) ===
    if (factory.status !== "upgrading") {
    html += `<div style="background: #1a1a24; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
      <span style="font-size: 12px; font-weight: 600; color: white;">Production</span>`;

    if (factory.status === "producing" && activeBatch) {
      // --- PRODUCTION IN PROGRESS ---
      const recipe = RecipeService.getRecipeById(activeBatch.recipe_id);
      const resultItem = recipe ? ItemService.getItemById(recipe.resultItemId) : null;
      const total = new Date(activeBatch.estimated_completion).getTime() - new Date(activeBatch.started_at).getTime();
      const elapsed = Date.now() - new Date(activeBatch.started_at).getTime();
      const progressPct = Math.min(100, (elapsed / total) * 100);
      const remaining = Math.max(0, new Date(activeBatch.estimated_completion).getTime() - Date.now());
      const mins = Math.floor(remaining / 60000);
      const hrs = Math.floor(mins / 60);
      const timeStr = hrs > 0 ? `${hrs}h${mins % 60}m` : `${mins}m`;

      // Show locked slots (dynamic count based on tier)
      if (recipe) {
        const uniqueIngs = [...new Map(recipe.ingredients.map(i => [i.itemId, i])).values()];
        const slotCount = tierConfig.max_ingredients;
        html += `<div style="display:flex;justify-content:center;align-items:center;gap:8px;margin:12px 0;flex-wrap:wrap;">`;
        for (let s = 0; s < slotCount; s++) {
          if (s > 0) html += `<span style="color:#4a5568;font-size:16px;font-weight:bold;">+</span>`;
          const ing = uniqueIngs[s];
          if (ing) {
            const item = ItemService.getItemById(ing.itemId);
            html += `<div style="width:80px;height:80px;border:2px solid #4a5568;border-radius:12px;background:#1a1a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0.7;">
              ${renderItemIcon(item?.icon_path, item?.icon || "??", item?.tier || 0, 32)}
              <span style="color:#e2e8f0;font-size:9px;margin-top:2px;">${item?.name || ing.itemId}</span>
              <span style="color:#94a3b8;font-size:8px;">x${ing.quantity}</span>
            </div>`;
          } else {
            html += `<div style="width:80px;height:80px;border:2px dashed #374151;border-radius:12px;background:#1a1a2e;display:flex;align-items:center;justify-content:center;opacity:0.5;">
              <span style="color:#4a5568;font-size:10px;">--</span>
            </div>`;
          }
        }
        html += `</div>`;
        html += `<div style="color:#64748b;font-size:9px;text-align:center;margin-bottom:8px;">Slots verrouilles pendant la production</div>`;
      }

      html += `<div style="padding:10px;background:#0d0d14;border-radius:8px;border:1px solid rgba(245,158,11,0.3);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:44px;height:44px;border:2px solid #22c55e;border-radius:10px;background:#1a2e1a;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            ${resultItem ? renderItemIcon(resultItem.icon_path, resultItem.icon || "??", resultItem.tier || 0, 32) : `<span style="color:#4a5568;font-size:16px;">?</span>`}
          </div>
          <div style="flex:1;">
            <div style="color:#e2e8f0;font-size:13px;font-weight:700;">${recipe?.name || "?"} x${activeBatch.quantity}</div>
            <div style="color:#94a3b8;font-size:10px;">T${recipe?.tier || 0}</div>
          </div>
          <span style="font-size:10px;padding:2px 6px;background:rgba(245,158,11,0.15);color:#f59e0b;border-radius:4px;">EN COURS</span>
        </div>
        <div style="background:#1a2e3e;border:1px solid rgba(59,130,246,0.25);border-radius:8px;padding:10px;text-align:center;margin-bottom:8px;">
          <span style="color:#94a3b8;font-size:11px;">Production totale</span>
          <div style="color:#22c55e;font-size:20px;font-weight:700;margin-top:2px;">${activeBatch.result_quantity} ${recipe?.name || "?"}</div>
        </div>
        <div style="width:100%;height:10px;background:#374151;border-radius:5px;overflow:hidden;margin-bottom:6px;">
          <div style="width:${progressPct}%;height:100%;background:linear-gradient(90deg,#3b82f6,#22c55e);border-radius:5px;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:11px;color:#e2e8f0;font-weight:600;">~${timeStr} restant</span>
          <span style="font-size:11px;color:${eff.color};">Efficacite: ${eff.percent}%</span>
        </div>
        <button class="factory-cancel-prod-btn" style="padding:8px;background:transparent;border:1px solid #ef4444;border-radius:6px;color:#ef4444;font-size:11px;font-weight:600;cursor:pointer;width:100%;">Annuler la production</button>
      </div>`;

    } else if (factory.status === "idle") {
      // --- IDLE: CRAFT SLOTS ---
      if (allAssigned.length === 0) {
        html += `<div style="display:flex;align-items:center;gap:4px;margin-top:6px;padding:6px 8px;background:rgba(59,130,246,0.1);border-radius:4px;">
          <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#3b82f6;color:#fff;text-align:center;font-size:10px;line-height:14px;">i</span>
          <span style="font-size:10px;color:#94a3b8;">L'usine peut produire sans workers mais a 30% de sa vitesse.</span>
        </div>`;
      }

      const slotCount = tierConfig.max_ingredients;
      // Ensure slotItems array has the right size
      while (this.slotItems.length < slotCount) this.slotItems.push(null);
      if (this.slotItems.length > slotCount) this.slotItems.length = slotCount;

      // Render slot helper (dynamic N slots)
      const renderSlot = (slotIdx: number, itemId: string | null): string => {
        if (itemId) {
          const item = ItemService.getItemById(itemId);
          return `<div style="width:80px;height:80px;border:2px solid #22c55e;border-radius:12px;background:#1a2e1a;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;">
            ${renderItemIcon(item?.icon_path, item?.icon || "??", item?.tier || 0, 32)}
            <span style="color:#e2e8f0;font-size:9px;margin-top:2px;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;">${item?.name || itemId}</span>
            <div class="slot-clear-btn" data-slot="${slotIdx}" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;background:#ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;color:white;font-weight:bold;">x</div>
          </div>`;
        }
        return `<div class="slot-choose-btn" data-slot="${slotIdx}" style="width:80px;height:80px;border:2px dashed #4a5568;border-radius:12px;background:#1a1a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='#60a5fa'" onmouseout="this.style.borderColor='#4a5568'">
          <span style="color:#64748b;font-size:10px;">Slot ${slotIdx + 1}</span>
          <span style="color:#94a3b8;font-size:9px;">(vide)</span>
          <span style="color:#3b82f6;font-size:9px;margin-top:2px;">Choisir</span>
        </div>`;
      };

      html += `<div style="display:flex;justify-content:center;align-items:center;gap:8px;margin:12px 0;flex-wrap:wrap;">`;
      for (let i = 0; i < slotCount; i++) {
        if (i > 0) html += `<span style="color:#4a5568;font-size:16px;font-weight:bold;">+</span>`;
        html += renderSlot(i, this.slotItems[i]);
      }
      html += `</div>`;

      // Recipe matching (supports N slots)
      const filledCount = this.slotItems.filter(id => id !== null).length;
      const matchedRecipes = filledCount > 0 ? this.findRecipes(factory.tier) : [];

      if (filledCount === 0) {
        html += `<div style="color:#64748b;font-size:10px;text-align:center;">Selectionnez des ingredients pour decouvrir une recette</div>`;
      } else if (matchedRecipes.length > 0) {
        html += this.renderRecipeResults(matchedRecipes, factory, eff);
      } else if (filledCount < slotCount) {
        html += `<div style="color:#94a3b8;font-size:10px;text-align:center;">Ajoutez d'autres ingredients...</div>`;
      } else {
        html += `<div style="padding:10px;background:#0d0d14;border-radius:8px;border:1px solid #374151;text-align:center;">
            <div style="color:#ef4444;font-size:11px;font-weight:600;margin-bottom:4px;">Aucune recette</div>
            <div style="color:#6b7280;font-size:10px;">Ces ingredients ne forment aucune recette connue.</div>
            <div style="color:#64748b;font-size:9px;margin-top:4px;">Essayez une autre combinaison.</div>
          </div>`;
      }
    }
    html += `</div>`;
    } // end if not upgrading

    // === 4. WORKERS (compact summary) ===
    const workerTierAvg = assignedWorkers.length > 0
      ? (assignedWorkers.reduce((s, w) => s + w.tier, 0) / assignedWorkers.length).toFixed(1)
      : "0";
    const workerTierBonusPct = assignedWorkers.length > 0
      ? Math.round((WORKER_XP_TIERS[Math.min(Math.max(Math.floor(parseFloat(workerTierAvg)) - 1, 0), WORKER_XP_TIERS.length - 1)].speed_bonus - 1) * 100)
      : 0;
    const workerSalaryCost = assignedWorkers.reduce((s, w) => s + w.hourly_salary, 0);

    html += `<div style="background: #1a1a24; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 12px; font-weight: 600; color: white;">Workers (${assignedWorkers.length}/${factory.max_workers})</span>
        <div style="display: flex; gap: 4px;">
          ${assignedWorkers.length > 0 ? `<button class="factory-manage-workers-btn" style="padding: 4px 8px; background: #374151; border: none; border-radius: 4px; color: #d1d5db; font-size: 10px; cursor: pointer;">Gerer</button>` : ""}
          <button class="factory-assign-btn" style="padding: 4px 8px; background: #3b82f6; border: none; border-radius: 4px; color: white; font-size: 10px; cursor: pointer;">+ Assigner</button>
        </div>
      </div>`;

    if (assignedWorkers.length === 0) {
      html += `<div style="color: #6b7280; font-size: 10px; padding: 4px; text-align: center;">Aucun worker assigne</div>
        <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px; padding: 4px 6px; background: rgba(59,130,246,0.1); border-radius: 4px;">
          <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#3b82f6;color:#fff;text-align:center;font-size:10px;line-height:14px;">i</span>
          <span style="font-size: 9px; color: #94a3b8;">Assigner des workers pour passer de 30% a 100%+ efficacite</span>
        </div>`;
    } else {
      html += `<div style="display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af;">
        <span>Bonus : +${workerTierBonusPct}% (tier moy. ${workerTierAvg})</span>
        <span>Cout : ${Math.round(workerSalaryCost)} CR/h</span>
      </div>`;
    }
    html += `</div>`;

    // === 5. ENGINEERS (compact summary) ===
    const engBonusPct = Math.round(calculateEngineerBonus(assignedEngineers.length, factory.tier) * 100);
    const engSalaryCost = assignedEngineers.reduce((s, w) => s + w.hourly_salary, 0);

    html += `<div style="background: #1a1a24; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 12px; font-weight: 600; color: white;">Ingenieurs (${assignedEngineers.length}/${factory.max_engineers})</span>
        <div style="display: flex; gap: 4px;">
          ${assignedEngineers.length > 0 ? `<button class="factory-manage-eng-btn" style="padding: 4px 8px; background: #374151; border: none; border-radius: 4px; color: #d1d5db; font-size: 10px; cursor: pointer;">Gerer</button>` : ""}
          ${factory.max_engineers > 0
            ? `<button class="factory-assign-eng-btn" style="padding: 4px 8px; background: #8b5cf6; border: none; border-radius: 4px; color: white; font-size: 10px; cursor: pointer;">+ Assigner</button>`
            : `<span style="font-size: 10px; color: #6b7280;">Dispo a T2+</span>`
          }
        </div>
      </div>`;

    if (assignedEngineers.length === 0) {
      if (factory.max_engineers > 0) {
        html += `<div style="color: #6b7280; font-size: 10px; padding: 4px; text-align: center;">Aucun ingenieur assigne</div>
          <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px; padding: 4px 6px; background: rgba(139,92,246,0.1); border-radius: 4px;">
            <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#8b5cf6;color:#fff;text-align:center;font-size:10px;line-height:14px;">i</span>
            <span style="font-size: 9px; color: #94a3b8;">Optionnel -- accelere la production (+10% le premier)</span>
          </div>`;
      } else {
        html += `<div style="color: #6b7280; font-size: 10px; padding: 4px; text-align: center;">Non disponible a ce tier</div>`;
      }
    } else {
      html += `<div style="display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af;">
        <span>Bonus : +${engBonusPct}%</span>
        <span>Cout : ${Math.round(engSalaryCost)} CR/h</span>
      </div>`;
    }
    html += `</div>`;

    // === 6. FOOD (UPDATED) ===
    const foodPct = factory.food_capacity > 0 ? (factory.food_stock / factory.food_capacity) * 100 : 0;
    const foodColor = foodPct > 50 ? "#22c55e" : foodPct > 10 ? "#f59e0b" : "#ef4444";
    const foodTierBonus = factory.food_stock > 0 ? Math.round(((FOOD_TIER_BONUS[factory.food_tier_min ?? 0] ?? 1.0) - 1) * 100) : 0;
    const totalPersonnel = allAssigned.length;
    const foodConsumption = totalPersonnel; // 1 food/person/h
    const foodAutonomy = foodConsumption > 0 && factory.food_stock > 0
      ? `~${Math.floor(factory.food_stock / foodConsumption)}h`
      : "--";

    html += `<div style="background: #1a1a24; border-radius: 8px; padding: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 12px; font-weight: 600; color: white;">Food</span>
        <button class="factory-deposit-food-btn" style="padding: 4px 8px; background: #22c55e; border: none; border-radius: 4px; color: white; font-size: 10px; cursor: pointer;">Deposer Food</button>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="flex: 1; height: 8px; background: #374151; border-radius: 4px; overflow: hidden;">
          <div style="width: ${foodPct}%; height: 100%; background: ${foodColor}; border-radius: 4px;"></div>
        </div>
        <span style="font-size: 10px; color: ${foodColor};">${factory.food_stock}/${factory.food_capacity}</span>
      </div>`;

    if (factory.food_stock > 0) {
      html += `<div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; color: #9ca3af;">
        <span>Tier actif : T${factory.food_tier_min ?? 0} (+${foodTierBonus}% vitesse)</span>
        <span>Consommation : ${foodConsumption} food/h</span>
        <span>Autonomie : ${foodAutonomy}</span>
      </div>`;
    } else {
      html += `<div style="color: #6b7280; font-size: 10px; padding: 4px 0;">Aucune food deposee</div>`;
      if (totalPersonnel > 0) {
        html += `<div style="display: flex; align-items: center; gap: 4px; margin-top: 4px; padding: 4px 6px; background: rgba(245,158,11,0.1); border-radius: 4px;">
          <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#f59e0b;color:#000;text-align:center;font-size:10px;line-height:14px;">!</span>
          <span style="font-size: 9px; color: #f59e0b;">Sans food + avec workers = efficacite reduite</span>
        </div>`;
      }
    }
    html += `</div>`;

    el.innerHTML = html;

    // === ATTACH EVENT LISTENERS ===
    el.querySelector(".factory-back-btn")?.addEventListener("click", () => {
      this.selectedFactoryId = null;
      this.slotItems = [];
      this.selectedBatchQty = 1;
      void this.renderFactoryList();
      el.innerHTML = "";
    });

    el.querySelector(".factory-upgrade-btn")?.addEventListener("click", () => void this.showUpgradeConfirmPopup(factoryId));
    el.querySelector(".factory-delete-btn")?.addEventListener("click", () => void this.handleDelete(factoryId));
    el.querySelector(".factory-cancel-prod-btn")?.addEventListener("click", () => void this.handleCancelProduction(factoryId));
    el.querySelector(".factory-cancel-upgrade-btn")?.addEventListener("click", () => void this.handleCancelUpgrade(factoryId));
    el.querySelector(".factory-assign-btn")?.addEventListener("click", () => void this.showAssignWorkerPopup(factoryId));
    el.querySelector(".factory-assign-eng-btn")?.addEventListener("click", () => void this.showAssignEngineerPopup(factoryId));
    el.querySelector(".factory-deposit-food-btn")?.addEventListener("click", () => void this.showDepositFoodPopup(factoryId));

    el.querySelector(".factory-manage-workers-btn")?.addEventListener("click", () => void this.showManagePersonnelPopup(factoryId, "worker"));
    el.querySelector(".factory-manage-eng-btn")?.addEventListener("click", () => void this.showManagePersonnelPopup(factoryId, "engineer"));

    // Craft slot: choose ingredient
    el.querySelectorAll(".slot-choose-btn").forEach((btn: Element) => {
      btn.addEventListener("click", () => {
        const slotIdx = parseInt(btn.getAttribute("data-slot") || "0", 10);
        void this.showIngredientPicker(factoryId, slotIdx);
      });
    });

    // Craft slot: clear ingredient
    el.querySelectorAll(".slot-clear-btn").forEach((btn: Element) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const slotIdx = parseInt(btn.getAttribute("data-slot") || "0", 10);
        if (slotIdx >= 0 && slotIdx < this.slotItems.length) this.slotItems[slotIdx] = null;
        void this.showFactoryDetail(factoryId);
      });
    });

    // Batch quantity +/-
    el.querySelectorAll(".batch-qty-minus").forEach((btn: Element) => {
      btn.addEventListener("click", () => {
        if (this.selectedBatchQty > 1) {
          this.selectedBatchQty--;
          void this.showFactoryDetail(factoryId);
        }
      });
    });
    el.querySelectorAll(".batch-qty-plus").forEach((btn: Element) => {
      btn.addEventListener("click", () => {
        this.selectedBatchQty++;
        void this.showFactoryDetail(factoryId);
      });
    });

    // Start production
    el.querySelectorAll(".factory-start-prod-btn").forEach((btn: Element) => {
      btn.addEventListener("click", () => {
        const recipeId = btn.getAttribute("data-recipe-id");
        if (recipeId) void this.handleStartProduction(factoryId, recipeId, this.selectedBatchQty);
      });
    });

    // Rename factory (inline editing)
    const renameDisplay = el.querySelector(".factory-name-display");
    const renameHint = el.querySelector(".factory-name-edit-hint");
    const renameInput = el.querySelector(".factory-name-input") as HTMLInputElement;

    const startRename = () => {
      if (!renameDisplay || !renameInput) return;
      (renameDisplay as HTMLElement).style.display = "none";
      if (renameHint) (renameHint as HTMLElement).style.display = "none";
      renameInput.style.display = "inline-block";
      renameInput.value = factory.name;
      renameInput.focus();
      renameInput.select();
    };

    const confirmRename = async () => {
      if (!renameInput || !renameDisplay) return;
      const trimmed = renameInput.value.trim();
      if (trimmed.length === 0 || trimmed.length > 30 || trimmed === factory.name) {
        cancelRename();
        return;
      }
      factory.name = trimmed;
      await DatabaseManager.put("factories", factory, false);
      factoryState.factories.set(factoryState.factories.get().map(f => f.id === factory.id ? factory : f));
      await DatabaseManager.forceSave();
      (renameDisplay as HTMLElement).textContent = trimmed;
      (renameDisplay as HTMLElement).style.display = "inline";
      if (renameHint) (renameHint as HTMLElement).style.display = "inline-block";
      renameInput.style.display = "none";
      void this.renderFactoryList();
    };

    const cancelRename = () => {
      if (!renameDisplay || !renameInput) return;
      (renameDisplay as HTMLElement).style.display = "inline";
      if (renameHint) (renameHint as HTMLElement).style.display = "inline-block";
      renameInput.style.display = "none";
    };

    renameDisplay?.addEventListener("click", startRename);
    renameHint?.addEventListener("click", startRename);
    renameInput?.addEventListener("keydown", (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter") void confirmRename();
      if (ke.key === "Escape") cancelRename();
    });
    renameInput?.addEventListener("blur", () => void confirmRename());
  }

  // ─────────────────────────────────────────────────────────
  // CREATE FACTORY FORM
  // ─────────────────────────────────────────────────────────

  private showCreateFactoryForm(): void {
    const el = this.factoryDetailRef.getOrDefault();
    if (!el) return;

    const html = `<div style="background: #1a1a24; border-radius: 8px; padding: 16px;">
      <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 12px;">Nouvelle Usine</div>
      <div style="margin-bottom: 8px;">
        <label style="font-size: 10px; color: #9ca3af; display: block; margin-bottom: 4px;">Nom de l'usine</label>
        <input class="factory-name-input" type="text" value="Mon Usine" style="width: 100%; padding: 6px 8px; background: #0d0d14; border: 1px solid #374151; border-radius: 4px; color: white; font-size: 11px; box-sizing: border-box;" />
      </div>
      <div style="margin-bottom: 8px;">
        <label style="font-size: 10px; color: #9ca3af; display: block; margin-bottom: 4px;">Code ICAO de l'aeroport</label>
        <input class="factory-icao-input" type="text" placeholder="LFPG" maxlength="4" style="width: 100%; padding: 6px 8px; background: #0d0d14; border: 1px solid #374151; border-radius: 4px; color: white; font-size: 11px; text-transform: uppercase; box-sizing: border-box;" />
      </div>
      <div style="font-size: 10px; color: #9ca3af; margin-bottom: 12px;">Cout: ${FACTORY_CREATION_COST.toLocaleString()} CR</div>
      <div style="display: flex; gap: 8px;">
        <button class="factory-create-confirm" style="padding: 8px 16px; background: #22c55e; border: none; border-radius: 6px; color: white; font-size: 11px; cursor: pointer;">Creer</button>
        <button class="factory-create-cancel" style="padding: 8px 16px; background: #374151; border: none; border-radius: 6px; color: white; font-size: 11px; cursor: pointer;">Annuler</button>
      </div>
      <div class="factory-create-error" style="color: #ef4444; font-size: 10px; margin-top: 8px; display: none;"></div>
    </div>`;

    el.innerHTML = html;

    el.querySelector(".factory-create-confirm")?.addEventListener("click", async () => {
      const nameInput = el.querySelector(".factory-name-input") as HTMLInputElement;
      const icaoInput = el.querySelector(".factory-icao-input") as HTMLInputElement;
      const errorEl = el.querySelector(".factory-create-error") as HTMLElement;

      const name = nameInput?.value?.trim() || "Mon Usine";
      const icao = icaoInput?.value?.trim().toUpperCase() || "";

      if (icao.length !== 4) {
        if (errorEl) { errorEl.textContent = "Code ICAO invalide (4 lettres)"; errorEl.style.display = "block"; }
        return;
      }

      try {
        await Services.factories.createFactory(icao, name);
        el.innerHTML = "";
        void this.renderFactoryList();
      } catch (error: any) {
        if (errorEl) { errorEl.textContent = error.message || "Erreur"; errorEl.style.display = "block"; }
      }
    });

    el.querySelector(".factory-create-cancel")?.addEventListener("click", () => {
      el.innerHTML = "";
    });
  }

  // ─────────────────────────────────────────────────────────
  // INGREDIENT PICKER POPUP (for craft slots)
  // ─────────────────────────────────────────────────────────

  private async showIngredientPicker(factoryId: string, slotIdx: number): Promise<void> {
    const el = this.factoryDetailRef.getOrDefault();
    if (!el) return;

    const factory = factoryState.factories.get().find(f => f.id === factoryId);
    if (!factory) return;

    // Get company inventory at this airport
    const inventory = await DatabaseManager.getInventoryAt("airport", factory.airport_ident);

    // Build item list with stock, sorted: in-stock first, then alphabetical
    const PERSONNEL = new Set(["worker", "engineer", "pilot", "copilot", "passenger"]);
    const itemEntries = inventory
      .filter(inv => !PERSONNEL.has(inv.item_code))
      .map(inv => {
        const item = ItemService.getItemById(inv.item_code);
        return { itemId: inv.item_code, name: item?.name || inv.item_code, item, qty: inv.quantity, tier: item?.tier ?? -1 };
      })
      .sort((a, b) => {
        if (a.qty > 0 && b.qty <= 0) return -1;
        if (a.qty <= 0 && b.qty > 0) return 1;
        return a.name.localeCompare(b.name);
      });

    // Collect unique tiers present in inventory
    const tiers = [...new Set(itemEntries.map(e => e.tier))].filter(t => t >= 0).sort((a, b) => a - b);

    const tierColors: Record<number, string> = { 0: "#d1d5db", 1: "#22c55e", 2: "#22c55e", 3: "#3b82f6", 4: "#a855f7", 5: "#f59e0b" };

    let html = `<div style="background:#1a1a24;border-radius:8px;padding:16px;display:flex;flex-direction:column;height:100%;">
      <div style="font-size:14px;font-weight:600;color:white;margin-bottom:8px;flex-shrink:0;">Choisir un ingredient (Slot ${slotIdx + 1})</div>`;

    // Search bar + tier filter
    html += `<div style="flex-shrink:0;margin-bottom:8px;">
      <input class="ing-search" type="text" placeholder="Rechercher..." style="width:100%;padding:6px 10px;background:#0d0d14;border:1px solid #334155;border-radius:6px;color:white;font-size:11px;outline:none;margin-bottom:6px;" />
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button class="ing-tier-btn" data-tier="all" style="padding:3px 8px;background:#3b82f6;border:none;border-radius:4px;color:white;font-size:9px;font-weight:600;cursor:pointer;">Tous</button>`;
    for (const t of tiers) {
      const c = tierColors[t] || "#94a3b8";
      html += `<button class="ing-tier-btn" data-tier="${t}" style="padding:3px 8px;background:transparent;border:1px solid ${c};border-radius:4px;color:${c};font-size:9px;font-weight:600;cursor:pointer;">T${t}</button>`;
    }
    html += `</div></div>`;

    if (itemEntries.length === 0) {
      html += `<div style="color:#6b7280;font-size:11px;padding:12px;text-align:center;">
        Aucun item en inventaire a ${factory.airport_ident}.<br/>
        Achetez des matieres premieres sur le marche.
      </div>`;
    } else {
      html += `<div class="ing-list" style="flex:1;overflow-y:auto;min-height:0;">`;
      for (const entry of itemEntries) {
        const isGrayed = entry.qty <= 0;
        const tierLabel = entry.item ? `T${entry.item.tier}` : "";
        html += `<div class="ing-pick-btn" data-item-id="${entry.itemId}" data-tier="${entry.tier}" data-name="${entry.name.toLowerCase()}" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#0d0d14;border-radius:4px;margin-bottom:4px;cursor:${isGrayed ? "default" : "pointer"};border:1px solid transparent;opacity:${isGrayed ? "0.4" : "1"};" ${!isGrayed ? `onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='transparent'"` : ""}>
          <div style="display:flex;align-items:center;gap:8px;">
            ${renderItemIcon(entry.item?.icon_path, entry.item?.icon || "??", entry.item?.tier || 0, 24)}
            <span style="font-size:11px;color:white;">${entry.name}</span>
            <span style="font-size:9px;color:${tierColors[entry.tier] || "#60a5fa"};">${tierLabel}</span>
          </div>
          <span style="font-size:10px;color:${entry.qty > 0 ? "#22c55e" : "#ef4444"};">x${entry.qty}</span>
        </div>`;
      }
      html += `</div>`;
    }

    html += `<button class="ing-pick-back-btn" style="flex-shrink:0;margin-top:8px;padding:6px 12px;background:#374151;border:none;border-radius:6px;color:white;font-size:10px;cursor:pointer;">Annuler</button>`;
    html += `</div>`;

    el.innerHTML = html;

    // --- Search & filter logic ---
    let activeTier = "all";
    let searchQuery = "";

    const applyFilters = () => {
      el.querySelectorAll<HTMLElement>(".ing-pick-btn").forEach(row => {
        const rowTier = row.getAttribute("data-tier") || "";
        const rowName = row.getAttribute("data-name") || "";
        const matchTier = activeTier === "all" || rowTier === activeTier;
        const matchSearch = !searchQuery || rowName.includes(searchQuery);
        row.style.display = matchTier && matchSearch ? "flex" : "none";
      });
    };

    const searchInput = el.querySelector<HTMLInputElement>(".ing-search");
    searchInput?.addEventListener("input", () => {
      searchQuery = (searchInput.value || "").toLowerCase();
      applyFilters();
    });

    el.querySelectorAll(".ing-tier-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        activeTier = btn.getAttribute("data-tier") || "all";
        // Update button styles
        el.querySelectorAll<HTMLElement>(".ing-tier-btn").forEach(b => {
          const t = b.getAttribute("data-tier") || "all";
          if (t === activeTier) {
            b.style.background = t === "all" ? "#3b82f6" : (tierColors[parseInt(t)] || "#94a3b8");
            b.style.color = "#fff";
            b.style.borderColor = "transparent";
          } else {
            const c = t === "all" ? "#3b82f6" : (tierColors[parseInt(t)] || "#94a3b8");
            b.style.background = "transparent";
            b.style.color = c;
            b.style.borderColor = c;
          }
        });
        applyFilters();
      });
    });

    // --- Item click handlers ---
    el.querySelectorAll(".ing-pick-btn").forEach((btn: Element) => {
      btn.addEventListener("click", () => {
        const itemId = btn.getAttribute("data-item-id");
        if (!itemId) return;
        const entry = itemEntries.find(e => e.itemId === itemId);
        if (!entry || entry.qty <= 0) return;
        this.slotItems[slotIdx] = itemId;
        void this.showFactoryDetail(factoryId);
      });
    });

    el.querySelector(".ing-pick-back-btn")?.addEventListener("click", () => {
      void this.showFactoryDetail(factoryId);
    });
  }

  // ─────────────────────────────────────────────────────────
  // MANAGE PERSONNEL POPUP (unassign workers / engineers)
  // ─────────────────────────────────────────────────────────

  private async showManagePersonnelPopup(factoryId: string, type: "worker" | "engineer"): Promise<void> {
    const el = this.factoryDetailRef.getOrDefault();
    if (!el) return;

    const factory = factoryState.factories.get().find(f => f.id === factoryId);
    if (!factory) return;

    const isEng = type === "engineer";
    const label = isEng ? "Ingenieurs" : "Workers";
    const color = isEng ? "#8b5cf6" : "#3b82f6";

    const assigned = factoryState.workers.get().filter(
      w => w.factory_id === factoryId && w.status === "working" &&
           (isEng ? w.item_id === "engineer" : w.item_id !== "engineer")
    );

    // Lock parent into flex-column so inner list scrolls (not the parent)
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.overflow = "hidden";

    let html = `<div style="background: #1a1a24; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
      <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 4px; flex-shrink: 0;">Gestion ${label} (${assigned.length})</div>
      <div style="font-size: 10px; color: #9ca3af; margin-bottom: 10px; flex-shrink: 0;">${factory.name} - ${factory.airport_ident}</div>`;

    if (assigned.length > 0) {
      html += `<button class="manage-unassign-all-btn" style="margin-bottom: 10px; padding: 5px 10px; background: #7f1d1d; border: 1px solid #dc2626; border-radius: 4px; color: #fca5a5; font-size: 10px; cursor: pointer; align-self: flex-start; flex-shrink: 0;">Retirer tous (${assigned.length})</button>`;
    }

    html += `<div style="flex: 1; overflow-y: auto; min-height: 0;">`;
    for (const w of assigned) {
      html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #0d0d14; border-radius: 4px; margin-bottom: 3px;">
        <div style="display: flex; gap: 6px; align-items: center;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
          <span style="font-size: 10px; color: ${isEng ? "#a78bfa" : "#60a5fa"}; font-weight: 600;">${w.country_code}</span>
          <span style="font-size: 10px; color: #9ca3af;">T${w.tier} | ${w.hourly_salary} CR/h</span>
        </div>
        <button class="manage-unassign-btn" data-worker-id="${w.id}" style="padding: 2px 8px; background: #374151; border: none; border-radius: 4px; color: #f87171; font-size: 9px; cursor: pointer;">Retirer</button>
      </div>`;
    }
    html += `</div>`;

    html += `<button class="manage-back-btn" style="margin-top: 10px; padding: 6px 12px; background: #374151; border: none; border-radius: 6px; color: white; font-size: 10px; cursor: pointer; flex-shrink: 0;">Retour</button>`;
    html += `</div>`;

    el.innerHTML = html;

    // Unassign individual
    el.querySelectorAll(".manage-unassign-btn").forEach((btn: Element) => {
      btn.addEventListener("click", async () => {
        const wId = btn.getAttribute("data-worker-id");
        if (wId) {
          try {
            await Services.factories.unassignWorker(wId);
            void this.showManagePersonnelPopup(factoryId, type);
          } catch (error: any) {
            console.error("[FactoryController] Unassign failed:", error.message);
          }
        }
      });
    });

    // Unassign all
    el.querySelector(".manage-unassign-all-btn")?.addEventListener("click", async () => {
      try {
        for (const w of assigned) {
          await Services.factories.unassignWorker(w.id);
        }
        void this.showFactoryDetail(factoryId);
      } catch (error: any) {
        console.error("[FactoryController] Unassign all failed:", error.message);
      }
    });

    el.querySelector(".manage-back-btn")?.addEventListener("click", () => {
      void this.showFactoryDetail(factoryId);
    });
  }

  // ─────────────────────────────────────────────────────────
  // ASSIGN WORKER POPUP
  // ─────────────────────────────────────────────────────────

  private async showAssignWorkerPopup(factoryId: string): Promise<void> {
    const el = this.factoryDetailRef.getOrDefault();
    if (!el) return;

    const factory = factoryState.factories.get().find(f => f.id === factoryId);
    if (!factory) return;

    const availableWorkers = factoryState.workers.get().filter(
      w => w.owner_company_id === factory.company_id &&
           w.airport_ident === factory.airport_ident &&
           w.status === "available" &&
           w.item_id !== "engineer"
    );

    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.overflow = "hidden";

    let html = `<div style="background: #1a1a24; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
      <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 12px; flex-shrink: 0;">Assigner un Worker (${availableWorkers.length} dispo)</div>`;

    if (availableWorkers.length === 0) {
      html += `<div style="color: #6b7280; font-size: 11px; padding: 12px; text-align: center;">
        Aucun worker disponible a ${factory.airport_ident}.<br/>
        Achetez des workers sur le marche dans un grand aeroport.
      </div>`;
    } else {
      html += `<div style="flex: 1; overflow-y: auto; min-height: 0;">`;
      for (const w of availableWorkers) {
        html += `<div class="assign-worker-btn" data-worker-id="${w.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #0d0d14; border-radius: 4px; margin-bottom: 4px; cursor: pointer; border: 1px solid transparent;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='transparent'">
          <div>
            <span style="font-size: 11px; color: #60a5fa; font-weight: 600;">${w.country_code}</span>
            <span style="font-size: 10px; color: #9ca3af; margin-left: 6px;">SPD:${w.speed} RES:${w.resistance} T${w.tier}</span>
          </div>
          <span style="font-size: 10px; color: #22c55e;">Assigner</span>
        </div>`;
      }
      html += `</div>`;
    }

    html += `<button class="assign-back-btn" style="margin-top: 8px; padding: 6px 12px; background: #374151; border: none; border-radius: 6px; color: white; font-size: 10px; cursor: pointer; flex-shrink: 0;">Retour</button>`;
    html += `</div>`;

    el.innerHTML = html;

    el.querySelectorAll(".assign-worker-btn").forEach((btn: Element) => {
      btn.addEventListener("click", async () => {
        const wId = btn.getAttribute("data-worker-id");
        if (wId) {
          try {
            await Services.factories.assignWorker(wId, factoryId);
            void this.showFactoryDetail(factoryId);
          } catch (error: any) {
            console.error("[FactoryController] Assign failed:", error.message);
          }
        }
      });
    });

    el.querySelector(".assign-back-btn")?.addEventListener("click", () => {
      void this.showFactoryDetail(factoryId);
    });
  }

  // ─────────────────────────────────────────────────────────
  // ASSIGN ENGINEER POPUP
  // ─────────────────────────────────────────────────────────

  private async showAssignEngineerPopup(factoryId: string): Promise<void> {
    const el = this.factoryDetailRef.getOrDefault();
    if (!el) return;

    const factory = factoryState.factories.get().find(f => f.id === factoryId);
    if (!factory) return;

    const availableEngineers = factoryState.workers.get().filter(
      w => w.owner_company_id === factory.company_id &&
           w.airport_ident === factory.airport_ident &&
           w.status === "available" &&
           w.item_id === "engineer"
    );

    const currentCount = factoryState.workers.get().filter(
      w => w.factory_id === factoryId && w.status === "working" && w.item_id === "engineer"
    ).length;

    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.overflow = "hidden";

    let html = `<div style="background: #1a1a24; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
      <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 4px; flex-shrink: 0;">Assigner un Ingenieur</div>
      <div style="font-size: 10px; color: #9ca3af; margin-bottom: 12px; flex-shrink: 0;">${currentCount}/${factory.max_engineers} postes occupes</div>`;

    if (currentCount >= factory.max_engineers) {
      html += `<div style="color: #f59e0b; font-size: 11px; padding: 12px; text-align: center;">
        Tous les postes d'ingenieur sont occupes.
      </div>`;
    } else if (availableEngineers.length === 0) {
      html += `<div style="color: #6b7280; font-size: 11px; padding: 12px; text-align: center;">
        Aucun ingenieur disponible a ${factory.airport_ident}.<br/>
        Achetez des ingenieurs sur le marche.
      </div>`;
    } else {
      html += `<div style="flex: 1; overflow-y: auto; min-height: 0;">`;
      for (const w of availableEngineers) {
        html += `<div class="assign-eng-btn" data-worker-id="${w.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #0d0d14; border-radius: 4px; margin-bottom: 4px; cursor: pointer; border: 1px solid transparent;" onmouseover="this.style.borderColor='#8b5cf6'" onmouseout="this.style.borderColor='transparent'">
          <div>
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#8b5cf6;margin-right:6px;"></span>
            <span style="font-size: 11px; color: #a78bfa; font-weight: 600;">${w.country_code}</span>
            <span style="font-size: 10px; color: #9ca3af; margin-left: 6px;">${w.hourly_salary} CR/h</span>
          </div>
          <span style="font-size: 10px; color: #8b5cf6;">Assigner</span>
        </div>`;
      }
      html += `</div>`;
    }

    html += `<button class="assign-back-btn" style="margin-top: 8px; padding: 6px 12px; background: #374151; border: none; border-radius: 6px; color: white; font-size: 10px; cursor: pointer; flex-shrink: 0;">Retour</button>`;
    html += `</div>`;

    el.innerHTML = html;

    el.querySelectorAll(".assign-eng-btn").forEach((btn: Element) => {
      btn.addEventListener("click", async () => {
        const wId = btn.getAttribute("data-worker-id");
        if (wId) {
          try {
            await Services.factories.assignWorker(wId, factoryId);
            void this.showFactoryDetail(factoryId);
          } catch (error: any) {
            console.error("[FactoryController] Assign engineer failed:", error.message);
          }
        }
      });
    });

    el.querySelector(".assign-back-btn")?.addEventListener("click", () => {
      void this.showFactoryDetail(factoryId);
    });
  }

  // ─────────────────────────────────────────────────────────
  // DEPOSIT FOOD POPUP
  // ─────────────────────────────────────────────────────────

  private async showDepositFoodPopup(factoryId: string): Promise<void> {
    const el = this.factoryDetailRef.getOrDefault();
    if (!el) return;

    const factory = factoryState.factories.get().find(f => f.id === factoryId);
    if (!factory) return;

    // Get food items at the factory's airport
    const inventory = await DatabaseManager.getInventoryAt("airport", factory.airport_ident);
    const foodItems = inventory.filter(inv => ItemService.hasTag(inv.item_code, "food"));
    const spaceAvailable = factory.food_capacity - factory.food_stock;

    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.overflow = "hidden";

    let html = `<div style="background: #1a1a24; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
      <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 4px; flex-shrink: 0;">Gestion de la nourriture</div>
      <div style="font-size: 10px; color: #9ca3af; margin-bottom: 12px; flex-shrink: 0;">Stock: ${factory.food_stock}/${factory.food_capacity} | Tier min: T${factory.food_tier_min ?? 0}</div>`;

    // Scrollable content area
    html += `<div style="flex: 1; overflow-y: auto; min-height: 0;">`;

    // ── Current stock section (withdraw per item) ──
    const storedFoodItems = (factory.food_items ?? []).filter(fi => fi.quantity > 0);
    if (storedFoodItems.length > 0) {
      html += `<div style="background: #1e1a2e; border: 1px solid #7c3aed44; border-radius: 6px; padding: 10px; margin-bottom: 12px;">
        <div style="font-size: 11px; font-weight: 600; color: #a78bfa; margin-bottom: 8px;">Stock actuel (${factory.food_stock} unites)</div>`;
      for (const fi of storedFoodItems) {
        const item = ItemService.getItemById(fi.item_code);
        html += `<div class="withdraw-food-row" data-item-id="${fi.item_code}" style="display: flex; align-items: center; gap: 6px; padding: 5px 6px; background: #0d0d14; border-radius: 4px; margin-bottom: 3px;">
          ${renderItemIcon(item?.icon_path, item?.icon || "??", item?.tier || 0, 24)}
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 10px; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item?.name || fi.item_code}</div>
            <div style="font-size: 9px; color: #6b7280;">T${fi.tier} | x${fi.quantity}</div>
          </div>
          <input class="withdraw-qty-input" type="number" min="1" max="${fi.quantity}" value="${fi.quantity}"
            style="width: 48px; padding: 2px 4px; background: #1a1a24; border: 1px solid #4b5563; border-radius: 4px; color: white; font-size: 10px; text-align: center;" />
          <button class="withdraw-food-btn" style="padding: 3px 8px; background: #dc2626; border: none; border-radius: 4px; color: white; font-size: 9px; cursor: pointer;">Retirer</button>
        </div>`;
      }
      html += `</div>`;
    } else if (factory.food_stock > 0) {
      // Legacy: food_stock > 0 but no food_items tracked (old data)
      html += `<div style="background: #1e1a2e; border: 1px solid #7c3aed44; border-radius: 6px; padding: 10px; margin-bottom: 12px;">
        <div style="font-size: 11px; font-weight: 600; color: #a78bfa; margin-bottom: 6px;">Stock actuel (ancien format)</div>
        <div style="font-size: 10px; color: #d1d5db; margin-bottom: 6px;">${factory.food_stock} unites (non trackees)</div>
        <button class="withdraw-legacy-btn" style="padding: 4px 10px; background: #dc2626; border: none; border-radius: 4px; color: white; font-size: 10px; cursor: pointer;">Vider le stock</button>
        <div style="font-size: 9px; color: #6b7280; margin-top: 4px;">Ancien stock non tracke — sera perdu</div>
      </div>`;
    }

    // ── Deposit section ──
    html += `<div style="font-size: 11px; font-weight: 600; color: #22c55e; margin-bottom: 8px;">Deposer de la nourriture</div>`;

    if (spaceAvailable <= 0) {
      html += `<div style="color: #f59e0b; font-size: 11px; padding: 8px; text-align: center; background: #1a1408; border-radius: 4px;">
        Stockage plein ! Retirez de la nourriture pour en ajouter.
      </div>`;
    } else if (foodItems.length === 0) {
      html += `<div style="color: #6b7280; font-size: 11px; padding: 12px; text-align: center;">
        Aucun aliment a ${factory.airport_ident}.<br/>
        Achetez des matieres premieres (tag "food") sur le marche.
      </div>`;
    } else {
      html += `<div style="font-size: 9px; color: #6b7280; margin-bottom: 6px;">Place disponible: ${spaceAvailable}</div>`;
      for (const inv of foodItems) {
        const item = ItemService.getItemById(inv.item_code);
        const maxDeposit = Math.min(inv.quantity, spaceAvailable);
        html += `<div class="deposit-food-row" data-item-id="${inv.item_code}" style="display: flex; align-items: center; gap: 6px; padding: 6px 8px; background: #0d0d14; border-radius: 4px; margin-bottom: 4px; border: 1px solid transparent;" onmouseover="this.style.borderColor='#22c55e44'" onmouseout="this.style.borderColor='transparent'">
          ${renderItemIcon(item?.icon_path, item?.icon || "??", item?.tier || 0, 26)}
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 10px; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item?.name || inv.item_code}</div>
            <div style="font-size: 9px; color: #6b7280;">T${item?.tier ?? 0} | Dispo: ${inv.quantity}</div>
          </div>
          <input class="deposit-qty-input" type="number" min="1" max="${maxDeposit}" value="${maxDeposit}"
            style="width: 52px; padding: 3px 4px; background: #1a1a24; border: 1px solid #4b5563; border-radius: 4px; color: white; font-size: 10px; text-align: center;" />
          <button class="deposit-food-btn" style="padding: 4px 8px; background: #166534; border: none; border-radius: 4px; color: white; font-size: 10px; cursor: pointer; white-space: nowrap;">Deposer</button>
        </div>`;
      }
    }

    html += `</div>`; // close scrollable content area

    html += `<button class="deposit-back-btn" style="margin-top: 10px; padding: 6px 12px; background: #374151; border: none; border-radius: 6px; color: white; font-size: 10px; cursor: pointer; flex-shrink: 0;">Retour</button>`;
    html += `</div>`;

    el.innerHTML = html;

    // ── Withdraw handlers (per item) ──
    el.querySelectorAll(".withdraw-food-row").forEach((row: Element) => {
      const btn = row.querySelector(".withdraw-food-btn") as HTMLElement | null;
      if (!btn) return;
      btn.addEventListener("click", async () => {
        const itemCode = row.getAttribute("data-item-id");
        const input = row.querySelector(".withdraw-qty-input") as HTMLInputElement | null;
        const qty = parseInt(input?.value || "0", 10);
        if (itemCode && qty > 0) {
          try {
            await Services.factories.withdrawFood(factoryId, itemCode, qty);
            void this.showDepositFoodPopup(factoryId);
          } catch (error: any) {
            console.error("[FactoryController] Withdraw food failed:", error.message);
          }
        }
      });
    });

    // ── Legacy withdraw (old data without food_items) ──
    el.querySelector(".withdraw-legacy-btn")?.addEventListener("click", async () => {
      try {
        const factory2 = factoryState.factories.get().find(f => f.id === factoryId);
        if (factory2) {
          factory2.food_stock = 0;
          factory2.food_tier_min = 0;
          factory2.food_items = [];
          await DatabaseManager.put("factories", factory2, false);
          factoryState.factories.set(factoryState.factories.get().map(f => f.id === factoryId ? factory2 : f));
          await DatabaseManager.forceSave();
          void this.showDepositFoodPopup(factoryId);
        }
      } catch (error: any) {
        console.error("[FactoryController] Legacy withdraw failed:", error.message);
      }
    });

    // ── Deposit handlers ──
    el.querySelectorAll(".deposit-food-row").forEach((row: Element) => {
      const btn = row.querySelector(".deposit-food-btn") as HTMLElement | null;
      if (!btn) return;
      btn.addEventListener("click", async () => {
        const itemId = row.getAttribute("data-item-id");
        const input = row.querySelector(".deposit-qty-input") as HTMLInputElement | null;
        const qty = parseInt(input?.value || "0", 10);
        if (itemId && qty > 0) {
          try {
            await Services.factories.depositFood(factoryId, itemId, qty);
            void this.showDepositFoodPopup(factoryId);
          } catch (error: any) {
            console.error("[FactoryController] Deposit food failed:", error.message);
          }
        }
      });
    });

    el.querySelector(".deposit-back-btn")?.addEventListener("click", () => {
      void this.showFactoryDetail(factoryId);
    });
  }

  // ─────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  // UPGRADE CONFIRMATION POPUP
  // ─────────────────────────────────────────────────────────

  private async showUpgradeConfirmPopup(factoryId: string): Promise<void> {
    const el = this.factoryDetailRef.getOrDefault();
    if (!el) return;

    const factory = factoryState.factories.get().find(f => f.id === factoryId);
    if (!factory || factory.tier >= 10) return;

    const targetTier = factory.tier + 1;
    const upgCost = UPGRADE_COSTS[targetTier];
    if (!upgCost) return;

    const nextConfig = getFactoryTierConfig(targetTier);
    const currentConfig = getFactoryTierConfig(factory.tier);

    // Check company balance
    const player = await DatabaseManager.getPlayer();
    const company = player ? await DatabaseManager.getCompanyByOwner(player.id) : null;
    const companyBalance = company?.balance || 0;
    const hasCR = companyBalance >= upgCost.credits;

    // Check items at airport
    const inventory = await DatabaseManager.getInventoryAt("airport", factory.airport_ident);
    const itemChecks = upgCost.items.map(req => {
      const inv = inventory.find(i => i.item_code === req.item_id);
      const stock = inv?.quantity || 0;
      const hasEnough = stock >= req.quantity;
      const item = ItemService.getItemById(req.item_id);
      return { ...req, stock, hasEnough, icon_path: item?.icon_path, icon: item?.icon || "??", tier: item?.tier || 0 };
    });

    const allItemsOk = itemChecks.every(c => c.hasEnough);
    const canUpgrade = hasCR && allItemsOk;

    let html = `<div style="background:#1a1a24;border-radius:8px;padding:16px;">
      <div style="font-size:14px;font-weight:600;color:white;margin-bottom:4px;">Amelioration T${factory.tier} -> T${targetTier}</div>
      <div style="font-size:10px;color:#9ca3af;margin-bottom:12px;">${factory.name} - ${factory.airport_ident}</div>`;

    // Cost: Credits
    html += `<div style="margin-bottom:10px;">
      <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">Cout en credits</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#0d0d14;border-radius:4px;">
        <span style="font-size:11px;color:white;">${upgCost.credits.toLocaleString()} CR</span>
        <span style="font-size:10px;color:${hasCR ? "#22c55e" : "#ef4444"};">${hasCR ? "OK" : `Manque ${(upgCost.credits - companyBalance).toLocaleString()} CR`}</span>
      </div>
    </div>`;

    // Cost: Items
    html += `<div style="margin-bottom:10px;">
      <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">Materiaux requis (a ${factory.airport_ident})</div>`;
    for (const check of itemChecks) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#0d0d14;border-radius:4px;margin-bottom:3px;">
        <div style="display:flex;align-items:center;gap:6px;">
          ${renderItemIcon(check.icon_path, check.icon, check.tier, 22)}
          <span style="font-size:11px;color:white;">${check.name} x${check.quantity}</span>
        </div>
        <span style="font-size:10px;color:${check.hasEnough ? "#22c55e" : "#ef4444"};">${check.hasEnough ? `OK (${check.stock})` : `${check.stock}/${check.quantity}`}</span>
      </div>`;
    }
    html += `</div>`;

    // What's new at next tier
    html += `<div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">Nouveautes T${targetTier}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">`;
    if (nextConfig.max_workers > currentConfig.max_workers) {
      html += `<span style="font-size:10px;padding:3px 6px;background:rgba(59,130,246,0.15);color:#60a5fa;border-radius:4px;">Workers: ${currentConfig.max_workers}->${nextConfig.max_workers}</span>`;
    }
    if (nextConfig.max_engineers > currentConfig.max_engineers) {
      html += `<span style="font-size:10px;padding:3px 6px;background:rgba(139,92,246,0.15);color:#a78bfa;border-radius:4px;">Ingenieurs: ${currentConfig.max_engineers}->${nextConfig.max_engineers}</span>`;
    }
    if (nextConfig.max_ingredients > currentConfig.max_ingredients) {
      html += `<span style="font-size:10px;padding:3px 6px;background:rgba(34,197,94,0.15);color:#22c55e;border-radius:4px;">Slots: ${currentConfig.max_ingredients}->${nextConfig.max_ingredients}</span>`;
    }
    if (nextConfig.food_capacity > currentConfig.food_capacity) {
      html += `<span style="font-size:10px;padding:3px 6px;background:rgba(245,158,11,0.15);color:#f59e0b;border-radius:4px;">Food: ${currentConfig.food_capacity}->${nextConfig.food_capacity}</span>`;
    }
    html += `</div></div>`;

    // Buttons
    html += `<div style="display:flex;gap:8px;">
      <button class="upgrade-confirm-btn" style="flex:1;padding:10px;background:${canUpgrade ? "#8b5cf6" : "#374151"};border:none;border-radius:6px;color:${canUpgrade ? "white" : "#6b7280"};font-size:11px;font-weight:600;cursor:${canUpgrade ? "pointer" : "default"};${canUpgrade ? "" : "opacity:0.6;"}"${canUpgrade ? "" : " disabled"}>Confirmer l'amelioration</button>
      <button class="upgrade-cancel-btn" style="padding:10px 16px;background:#374151;border:none;border-radius:6px;color:white;font-size:11px;cursor:pointer;">Annuler</button>
    </div>`;

    if (!canUpgrade) {
      html += `<div style="color:#ef4444;font-size:10px;margin-top:6px;text-align:center;">Ressources insuffisantes</div>`;
    }

    html += `<div class="upgrade-error" style="color:#ef4444;font-size:10px;margin-top:6px;display:none;"></div>`;
    html += `</div>`;

    el.innerHTML = html;

    el.querySelector(".upgrade-confirm-btn")?.addEventListener("click", async () => {
      if (!canUpgrade) return;
      try {
        await Services.factories.upgradeFactory(factoryId);
        void this.showFactoryDetail(factoryId);
        void this.renderFactoryList();
      } catch (error: any) {
        const errEl = el.querySelector(".upgrade-error") as HTMLElement;
        if (errEl) {
          errEl.textContent = error.message || "Erreur";
          errEl.style.display = "block";
        }
      }
    });

    el.querySelector(".upgrade-cancel-btn")?.addEventListener("click", () => {
      void this.showFactoryDetail(factoryId);
    });
  }

  private async handleCancelUpgrade(factoryId: string): Promise<void> {
    try {
      await Services.factories.cancelUpgrade(factoryId);
      void this.showFactoryDetail(factoryId);
      void this.renderFactoryList();
    } catch (error: any) {
      console.error("[FactoryController] Cancel upgrade failed:", error.message);
    }
  }

  private async handleDelete(factoryId: string): Promise<void> {
    try {
      await Services.factories.deleteFactory(factoryId);
      this.selectedFactoryId = null;
      const el = this.factoryDetailRef.getOrDefault();
      if (el) el.innerHTML = "";
      void this.renderFactoryList();
    } catch (error: any) {
      console.error("[FactoryController] Delete failed:", error.message);
    }
  }

  private async handleUnassignWorker(workerId: string): Promise<void> {
    try {
      await Services.factories.unassignWorker(workerId);
      if (this.selectedFactoryId) void this.showFactoryDetail(this.selectedFactoryId);
    } catch (error: any) {
      console.error("[FactoryController] Unassign failed:", error.message);
    }
  }

  private async handleStartProduction(factoryId: string, recipeId: string, quantity: number): Promise<void> {
    try {
      await Services.factories.startProduction(factoryId, recipeId, quantity);
      this.slotItems = [];
      this.selectedBatchQty = 1;
      void this.showFactoryDetail(factoryId);
      void this.renderFactoryList();
    } catch (error: any) {
      console.error("[FactoryController] Start production failed:", error.message);
      // Show error inline
      const el = this.factoryDetailRef.getOrDefault();
      if (el) {
        const errorDiv = document.createElement("div");
        errorDiv.style.cssText = "color: #ef4444; font-size: 10px; padding: 6px; margin-top: 4px;";
        errorDiv.textContent = error.message || "Erreur de production";
        el.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
      }
    }
  }

  private async handleCancelProduction(factoryId: string): Promise<void> {
    try {
      await Services.factories.cancelProduction(factoryId);
      void this.showFactoryDetail(factoryId);
      void this.renderFactoryList();
    } catch (error: any) {
      console.error("[FactoryController] Cancel production failed:", error.message);
    }
  }

  // ─────────────────────────────────────────────────────────
  // REFRESH
  // ─────────────────────────────────────────────────────────

  /** Refresh the current view (call when sub-tab becomes active) */
  refresh(): void {
    void this.renderFactoryList();
    if (this.selectedFactoryId) {
      void this.showFactoryDetail(this.selectedFactoryId);
    }
  }
}
