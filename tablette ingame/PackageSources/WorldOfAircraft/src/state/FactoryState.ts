/**
 * FactoryState - Reactive state for factories, workers, and production
 * Phase 9: Factories, Workers & Economy
 */

import { Subject } from "@microsoft/msfs-sdk";

// ═══════════════════════════════════════════════════════════
// TYPES (local to state — full interfaces in types/index.ts)
// ═══════════════════════════════════════════════════════════

export type FactoryStatus = "idle" | "producing" | "maintenance" | "offline";
export type WorkerStatus = "available" | "working" | "injured" | "dead";

export interface FactoryData {
  id: string;
  company_id: string;
  airport_ident: string;
  name: string;
  tier: number;
  factory_type: string;
  status: FactoryStatus;
  current_recipe_id: string | null;
  is_active: boolean;
  max_workers: number;
  max_engineers: number;
  max_ingredients: number;
  food_stock: number;
  food_capacity: number;
  food_tier_min: number;
  food_consumption_per_hour: number;
  created_at: string;
}

export interface WorkerData {
  id: string;
  owner_company_id: string | null;
  owner_player_id: string | null;
  owner_type: "company" | "personal";
  item_id: string;
  airport_ident: string;
  country_code: string;
  speed: number;
  resistance: number;
  xp: number;
  tier: number;
  hourly_salary: number;
  status: WorkerStatus;
  factory_id: string | null;
  for_sale: boolean;
  sale_price: number | null;
  injured_at: string | null;
  injury_duration_days: number;
  created_at: string;
}

export interface ProductionBatchData {
  id: string;
  factory_id: string;
  recipe_id: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  quantity: number;
  started_at: string;
  estimated_completion: string;
  completed_at: string | null;
  result_quantity: number;
  workers_assigned: number;
}

// ═══════════════════════════════════════════════════════════
// STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface FactoryStateType {
  factories: Subject<FactoryData[]>;
  workers: Subject<WorkerData[]>;
  productionBatches: Subject<ProductionBatchData[]>;
  isLoading: Subject<boolean>;
  selectedFactoryId: Subject<string | null>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const factoryState: FactoryStateType = {
  factories: Subject.create<FactoryData[]>([]),
  workers: Subject.create<WorkerData[]>([]),
  productionBatches: Subject.create<ProductionBatchData[]>([]),
  isLoading: Subject.create(false),
  selectedFactoryId: Subject.create<string | null>(null),
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

export const getFactories = (): FactoryData[] => factoryState.factories.get();
export const getWorkers = (): WorkerData[] => factoryState.workers.get();
export const getBatches = (): ProductionBatchData[] => factoryState.productionBatches.get();

export const getFactoryById = (id: string): FactoryData | undefined =>
  factoryState.factories.get().find(f => f.id === id);

export const getWorkersForFactory = (factoryId: string): WorkerData[] =>
  factoryState.workers.get().filter(w => w.factory_id === factoryId && w.status === "working");

export const getAvailableWorkersAtAirport = (airportIdent: string, companyId: string): WorkerData[] =>
  factoryState.workers.get().filter(
    w => w.airport_ident === airportIdent &&
      w.owner_company_id === companyId &&
      w.status === "available"
  );

export const getActiveBatchForFactory = (factoryId: string): ProductionBatchData | undefined =>
  factoryState.productionBatches.get().find(
    b => b.factory_id === factoryId && b.status === "in_progress"
  );

export const clearFactoryState = (): void => {
  factoryState.factories.set([]);
  factoryState.workers.set([]);
  factoryState.productionBatches.set([]);
  factoryState.selectedFactoryId.set(null);
};
