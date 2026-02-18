/**
 * FactoryScheduler — Solo mode production timer
 * Phase 9.5-9.6: Batch completion, food, salaries, injuries
 *
 * Only runs in Solo mode. In Online mode, SEED handles production.
 */

import { DatabaseManager } from "./DatabaseManager";
import { factoryState } from "../state/FactoryState";
import type { FactoryData, WorkerData } from "../state/FactoryState";
import { LocalFactoryService } from "../services/LocalFactoryService";
import {
  FOOD_PER_WORKER_PER_HOUR,
  WORKER_BASE_INJURY_RISK,
  WORKER_NO_FOOD_INJURY_MULTIPLIER,
  WORKER_DEATH_PENALTY,
  WORKER_MAX_INJURY_DAYS,
} from "../constants/factory";

class FactorySchedulerClass {
  private batchInterval: ReturnType<typeof setInterval> | null = null;
  private hourlyInterval: ReturnType<typeof setInterval> | null = null;
  private npcInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  /** Start the scheduler (Solo mode only) */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Check batch completions + upgrade completions every 60 seconds
    this.batchInterval = setInterval(() => {
      this.checkBatches();
      this.checkUpgrades();
    }, 60000);

    // Hourly tick for food/salaries/injuries
    this.hourlyInterval = setInterval(() => this.hourlyTick(), 3600000);

    // NPC production tick every 5 minutes
    this.npcInterval = setInterval(() => this.npcProductionTick(), 300000);

    // Run immediate checks for anything that completed while offline
    this.checkBatches();
    this.checkUpgrades();

    // Run immediate NPC production tick
    this.npcProductionTick();

    console.log("[FactoryScheduler] Started (batch+upgrades: 60s, hourly: 3600s, npc: 300s)");
  }

  /** Stop the scheduler */
  stop(): void {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    if (this.hourlyInterval) {
      clearInterval(this.hourlyInterval);
      this.hourlyInterval = null;
    }
    if (this.npcInterval) {
      clearInterval(this.npcInterval);
      this.npcInterval = null;
    }
    this.isRunning = false;
    console.log("[FactoryScheduler] Stopped");
  }

  /** Check if running */
  isActive(): boolean {
    return this.isRunning;
  }

  // ─────────────────────────────────────────────────────────
  // BATCH COMPLETION CHECK (every 60 seconds)
  // ─────────────────────────────────────────────────────────

  private async checkBatches(): Promise<void> {
    const now = new Date().toISOString();
    const batches = factoryState.productionBatches.get();
    const activeBatches = batches.filter(
      b => b.status === "in_progress" && b.estimated_completion <= now
    );

    for (const batch of activeBatches) {
      try {
        await LocalFactoryService.completeBatch(batch.id);
      } catch (error) {
        console.error(`[FactoryScheduler] Failed to complete batch ${batch.id}:`, error);
      }
    }

    if (activeBatches.length > 0) {
      console.log(`[FactoryScheduler] Completed ${activeBatches.length} batch(es)`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // UPGRADE COMPLETION CHECK (every 60 seconds)
  // ─────────────────────────────────────────────────────────

  private async checkUpgrades(): Promise<void> {
    const now = new Date().toISOString();
    const factories = factoryState.factories.get();
    const upgrading = factories.filter(
      f => f.status === "upgrading" && f.upgrade_completion && f.upgrade_completion <= now
    );

    for (const factory of upgrading) {
      try {
        await LocalFactoryService.completeUpgrade(factory.id);
      } catch (error) {
        console.error(`[FactoryScheduler] Failed to complete upgrade for factory ${factory.id}:`, error);
      }
    }

    if (upgrading.length > 0) {
      console.log(`[FactoryScheduler] Completed ${upgrading.length} upgrade(s)`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // HOURLY TICK (Phase 9.6)
  // ─────────────────────────────────────────────────────────

  private async hourlyTick(): Promise<void> {
    const factories = factoryState.factories.get();
    const workers = factoryState.workers.get();
    let totalSalaries = 0;
    let anyChanges = false;

    // Track which factories have no food
    const noFoodFactories = new Set<string>();

    // === 1. Food consumption ===
    for (const factory of factories) {
      const factoryWorkers = workers.filter(
        w => w.factory_id === factory.id && w.status === "working"
      );
      if (factoryWorkers.length === 0) continue;

      const foodNeeded = factoryWorkers.length * FOOD_PER_WORKER_PER_HOUR;
      if (factory.food_stock >= foodNeeded) {
        factory.food_stock -= foodNeeded;
      } else {
        factory.food_stock = 0;
        noFoodFactories.add(factory.id);
      }
      await DatabaseManager.put("factories", factory as any, false);
      anyChanges = true;
    }

    // === 2. Salary payments ===
    const companyBalances = new Map<string, number>();
    for (const worker of workers) {
      if (worker.status !== "working") continue;

      const companyId = worker.owner_company_id;
      if (!companyId) continue;

      // Accumulate salary per company
      const currentBalance = companyBalances.get(companyId);
      if (currentBalance === undefined) {
        const company = await DatabaseManager.get<import("./DatabaseManager").Company>("company", companyId);
        if (company) {
          companyBalances.set(companyId, company.balance);
        }
      }

      const balance = companyBalances.get(companyId) || 0;
      companyBalances.set(companyId, balance - worker.hourly_salary);
      totalSalaries += worker.hourly_salary;
    }

    // Apply salary deductions to companies
    for (const [companyId, newBalance] of companyBalances) {
      const company = await DatabaseManager.get<import("./DatabaseManager").Company>("company", companyId);
      if (company) {
        company.balance = Math.round(newBalance);
        await DatabaseManager.put("company", company, false);

        if (company.balance < 0) {
          console.warn(`[FactoryScheduler] Company ${company.name} has negative balance: ${company.balance} CR`);
        }
        anyChanges = true;
      }
    }

    // === 3. Injury checks (working workers only) ===
    const updatedWorkers = [...workers];
    for (let i = 0; i < updatedWorkers.length; i++) {
      const worker = updatedWorkers[i];
      if (worker.status !== "working") continue;

      const factoryId = worker.factory_id;
      const hasNoFood = factoryId ? noFoodFactories.has(factoryId) : false;

      // Calculate injury risk
      let baseRisk = WORKER_BASE_INJURY_RISK;
      if (hasNoFood) baseRisk *= WORKER_NO_FOOD_INJURY_MULTIPLIER;

      // Resistance reduces injury risk (higher resistance = less risk)
      const resistanceModifier = 1 - (worker.resistance / 200);
      const finalRisk = baseRisk * Math.max(0.1, resistanceModifier);

      if (Math.random() < finalRisk) {
        // Worker injured!
        worker.status = "injured";
        worker.injured_at = new Date().toISOString();
        worker.injury_duration_days = 1 + Math.floor(Math.random() * WORKER_MAX_INJURY_DAYS);
        worker.factory_id = null; // Removed from factory
        await DatabaseManager.put("workers", worker as any, false);
        updatedWorkers[i] = worker;
        anyChanges = true;
        console.log(`[FactoryScheduler] Worker injured (${worker.injury_duration_days} days recovery)`);
      }
    }

    // === 4. Recovery / Death (injured workers) ===
    for (let i = 0; i < updatedWorkers.length; i++) {
      const worker = updatedWorkers[i];
      if (worker.status !== "injured" || !worker.injured_at) continue;

      const daysSinceInjury = (Date.now() - new Date(worker.injured_at).getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceInjury >= worker.injury_duration_days) {
        // Worker recovers
        worker.status = "available";
        worker.injured_at = null;
        worker.injury_duration_days = 0;
        await DatabaseManager.put("workers", worker as any, false);
        updatedWorkers[i] = worker;
        anyChanges = true;
        console.log(`[FactoryScheduler] Worker recovered from injury`);
      } else if (daysSinceInjury > WORKER_MAX_INJURY_DAYS) {
        // Worker dies
        worker.status = "dead";
        await DatabaseManager.put("workers", worker as any, false);
        updatedWorkers[i] = worker;
        anyChanges = true;

        // Deduct death penalty from company
        const companyId = worker.owner_company_id;
        if (companyId) {
          const company = await DatabaseManager.get<import("./DatabaseManager").Company>("company", companyId);
          if (company) {
            company.balance -= WORKER_DEATH_PENALTY;
            company.balance = Math.round(company.balance);
            await DatabaseManager.put("company", company, false);

            await DatabaseManager.saveTransaction({
              timestamp: new Date().toISOString(),
              type: "worker_salary",
              amount: -WORKER_DEATH_PENALTY,
              balance_after: company.balance,
              wallet: "company",
              description: `Worker deceased - penalty`,
            });
          }
        }
        console.log(`[FactoryScheduler] Worker died! -${WORKER_DEATH_PENALTY} CR penalty`);
      }
    }

    // === 5. Update state ===
    if (anyChanges) {
      factoryState.factories.set([...factories]);
      factoryState.workers.set(updatedWorkers);
      await DatabaseManager.forceSave();
    }

    if (totalSalaries > 0) {
      console.log(`[FactoryScheduler] Hourly tick: ${totalSalaries} CR in salaries paid`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // NPC PRODUCTION TICK (every 5 minutes)
  // ─────────────────────────────────────────────────────────

  private async npcProductionTick(): Promise<void> {
    const factories = factoryState.factories.get();
    const npcFactories = factories.filter(
      f => f.tier === 0 && f.status === "producing" && f.item_id
    );

    if (npcFactories.length === 0) return;

    let updated = 0;
    for (const factory of npcFactories) {
      const stockMax = factory.stock_max || 1000;
      const current = factory.stock_current || 0;
      const rate = factory.production_rate || 50;

      if (current >= stockMax) continue;

      factory.stock_current = Math.min(current + rate, stockMax);
      await DatabaseManager.put("factories", factory as any, false);
      updated++;
    }

    if (updated > 0) {
      factoryState.factories.set([...factories]);
    }
  }
}

export const FactoryScheduler = new FactorySchedulerClass();
