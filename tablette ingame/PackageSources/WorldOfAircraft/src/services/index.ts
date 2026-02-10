/**
 * Services barrel export
 * Centralized export of all service modules
 */

// ═══════════════════════════════════════════════════════════
// P2P LOCAL MODE (PRIMARY - use this for all local operations)
// ═══════════════════════════════════════════════════════════

// Main unified service adapter - USE THIS for P2P local mode
export { Services } from "./ServiceAdapter";

// Service Routers - Auto-switch between local and network based on P2P mode
// USE THESE instead of directly using fleetService/missionService/etc
export {
  FleetRouter,
  MissionRouter,
  MarketRouter,
  WorldRouter,
  PlayerRouter,
  CompanyRouter,
  FreeFlightRouter,
  ContractRouter,
  SocialRouter,
  TransferRouter,
} from "./ServiceRouter";

// Individual local services (for advanced use cases)
export { localFleetService } from "./LocalFleetService";
export { localMissionService } from "./LocalMissionService";
export { localMarketService } from "./LocalMarketService";
export { localContractService } from "./LocalContractService";

// DataLayer (P2P local/network abstraction)
export { DataLayer } from "./DataLayer";
export type { DataMode, NetworkConfig, DataLayerCallbacks } from "./DataLayer";

// Init Service (P2P first launch setup)
export { InitService } from "./InitService";

// AI Economy Service (solo mode dynamic economy)
export { AIEconomyService } from "./AIEconomyService";

// Sync Service (SEED server communication for Online mode)
export { SyncService } from "./SyncService";

// ═══════════════════════════════════════════════════════════
// TYPE RE-EXPORTS (from local services)
// ═══════════════════════════════════════════════════════════

// Mission types (from LocalMissionService)
export type {
  CreateMissionRequest,
  CreateMissionV1Request,
  MissionResponse,
  CheckpointValidateRequest,
  CompleteMissionRequest,
  CompleteMissionV1Request,
} from "./LocalMissionService";
