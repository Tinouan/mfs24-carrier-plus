/**
 * AEROCORP-SEED - AeroCorp Online SEED Server
 * Cloudflare Worker with R2 storage
 *
 * Features:
 * - Player management with anti-cheat
 * - Aircraft management
 * - Mission system with server-side rewards
 * - Market with player inventory
 * - Company support
 */

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface Env {
  BUCKET: R2Bucket;
  ENVIRONMENT: string;
}

interface InventoryItem {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  airport_icao: string;
  weight_kg?: number;
  tier?: number;
}

interface Player {
  id: string;
  name: string;
  money: number;
  xp: number;
  home_airport: string;
  trust_score?: number;
  inventory?: InventoryItem[];
  created_at: string;
  updated_at: string;
}

interface Company {
  id: string;
  name: string;
  owner_id: string;
  home_airport_ident: string;
  balance: number;
  inventory?: InventoryItem[];
  created_at: string;
}

interface Aircraft {
  id: string;
  owner_id: string;
  registration: string;
  aircraft_type: string;
  icao_type: string;
  current_airport_ident: string;
  status: string;
  fuel_gallons: number;
  fuel_capacity_gallons: number;
  cargo_kg: number;
  cargo_capacity_kg: number;
  condition: number;
  hours: number;
}

interface Mission {
  id: string;
  player_id: string;
  aircraft_id: string;
  departure_icao: string;
  destination_icao: string;
  distance_nm: number;
  base_xp: number;
  base_reward: number;
  cargo?: { item_id: string; quantity: number }[];
  fuel_at_start: number;
  status: "in_progress" | "completed" | "failed" | "cancelled";
  created_at: string;
  completed_at?: string;
}

interface MarketOrder {
  id: string;
  seller_id: string;
  seller_name: string;
  airport_ident: string;
  item_id: string;
  item_code?: string;
  item_name: string;
  item_tier: number;
  quantity: number;
  price_per_unit: number;
  created_at: string;
}

interface WorldData {
  market_orders: MarketOrder[];
  airport_inventories: Record<string, AirportInventoryItem[]>;
  factories: unknown[];
  prices: Record<string, number>;
  version: number;
}

interface AirportInventoryItem {
  item_id: string;
  item_name: string;
  quantity: number;
  price: number;
}

interface PlayerTrust {
  player_id: string;
  trust_score: number;
  events: { timestamp: string; reason: string; penalty: number }[];
  last_flag_date: string;
}

interface FlightStats {
  flight_time_minutes: number;
  distance_nm: number;
  landing_fpm: number;
  max_g_force: number;
  overspeed_count: number;
  fuel_remaining: number;
  departure_icao: string;
  arrival_icao: string;
}

interface FreeFlightStats {
  flight_time_minutes: number;
  distance_nm: number;
  landing_fpm: number;
  max_g_force: number;
  overspeed_count: number;
  departure_icao: string;
  arrival_icao: string;
  landings: number;
}

interface MissionScore {
  score: number;
  multiplier: number;
  grade: string;
  penalties: string[];
  bonuses: string[];
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const FUEL_PRICE_PER_GALLON = 5.5;
const XP_PER_NM = 2;
const MONEY_PER_NM = 10;
const WEAR_PER_HOUR = 0.5;
const API_KEY = "8d90c0a2f60ff15017f3040c061030ce0cf4356795e5925e419ed2f73fa060a3";

// Free Flight (reduced rewards compared to missions)
const FREE_FLIGHT_XP_PER_NM = 0.5;
const FREE_FLIGHT_LANDING_BONUS_XP = 25;

const TRUST_PENALTIES: Record<string, number> = {
  TELEPORT_SUSPECTED: -30,
  SPEED_HACK_SUSPECTED: -25,
  MONEY_MANIPULATION: -40,
  FUEL_CHEAT_SUSPECTED: -15,
  IMPOSSIBLE_DISTANCE: -20,
  IMPOSSIBLE_G_FORCE: -10,
  FLIGHT_TOO_FAST: -10,
  FUEL_ANOMALY: -10,
};

// ═══════════════════════════════════════════════════════════
// R2 HELPERS
// ═══════════════════════════════════════════════════════════

async function getJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json() as Promise<T>;
}

async function putJson(bucket: R2Bucket, key: string, data: unknown): Promise<void> {
  await bucket.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function deleteKey(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

// ═══════════════════════════════════════════════════════════
// AUTH & CORS
// ═══════════════════════════════════════════════════════════

interface AuthResult {
  valid: boolean;
  playerId?: string;
  error?: string;
}

function validateRequest(request: Request): AuthResult {
  const apiKey = request.headers.get("X-API-Key");
  const playerId = request.headers.get("X-Player-ID");

  if (!apiKey || apiKey !== API_KEY) {
    return { valid: false, error: "Invalid API Key" };
  }

  return { valid: true, playerId: playerId || undefined };
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, X-Player-ID",
    "Content-Type": "application/json",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders(),
  });
}

// ═══════════════════════════════════════════════════════════
// ANTI-CHEAT
// ═══════════════════════════════════════════════════════════

async function getPlayerTrust(bucket: R2Bucket, playerId: string): Promise<PlayerTrust> {
  const trust = await getJson<PlayerTrust>(bucket, `trust/${playerId}.json`);
  if (trust) return trust;

  const newTrust: PlayerTrust = {
    player_id: playerId,
    trust_score: 100,
    events: [],
    last_flag_date: new Date().toISOString(),
  };
  await putJson(bucket, `trust/${playerId}.json`, newTrust);
  return newTrust;
}

async function flagSuspiciousActivity(
  bucket: R2Bucket,
  playerId: string,
  reason: string
): Promise<void> {
  const trust = await getPlayerTrust(bucket, playerId);
  const penalty = TRUST_PENALTIES[reason] || -5;

  trust.trust_score = Math.max(0, trust.trust_score + penalty);
  trust.events.push({
    timestamp: new Date().toISOString(),
    reason,
    penalty,
  });
  trust.last_flag_date = new Date().toISOString();

  // Keep last 50 events only
  if (trust.events.length > 50) {
    trust.events = trust.events.slice(-50);
  }

  await putJson(bucket, `trust/${playerId}.json`, trust);
  console.log(`[ANTI-CHEAT] Player ${playerId} flagged: ${reason}. New score: ${trust.trust_score}`);
}

// ═══════════════════════════════════════════════════════════
// WORLD DATA
// ═══════════════════════════════════════════════════════════

async function getWorldData(bucket: R2Bucket): Promise<WorldData> {
  const world = await getJson<WorldData>(bucket, "world/data.json");
  if (world) return world;

  // Create default world with some NPC market orders
  const defaultWorld: WorldData = {
    market_orders: [
      {
        id: "order_001",
        seller_id: "npc_merchant_1",
        seller_name: "Sky Traders Inc.",
        airport_ident: "LFPG",
        item_id: "fuel_avgas",
        item_code: "fuel_avgas",
        item_name: "Aviation Gasoline",
        item_tier: 1,
        quantity: 500,
        price_per_unit: 5,
        created_at: new Date().toISOString(),
      },
      {
        id: "order_002",
        seller_id: "npc_merchant_2",
        seller_name: "Global Cargo Co.",
        airport_ident: "KJFK",
        item_id: "cargo_electronics",
        item_code: "cargo_electronics",
        item_name: "Electronics",
        item_tier: 3,
        quantity: 100,
        price_per_unit: 150,
        created_at: new Date().toISOString(),
      },
    ],
    airport_inventories: {},
    factories: [],
    prices: { fuel_avgas: 5, fuel_jetA: 4 },
    version: 1,
  };

  await putJson(bucket, "world/data.json", defaultWorld);
  return defaultWorld;
}

// ═══════════════════════════════════════════════════════════
// FLIGHT VALIDATION & SCORING
// ═══════════════════════════════════════════════════════════

interface ValidationResult {
  valid: boolean;
  reason?: string;
  flags?: string[];
}

function validateFlightStats(
  stats: FlightStats,
  aircraft: Aircraft,
  mission: Mission | null
): ValidationResult {
  const errors: string[] = [];
  const flags: string[] = [];

  // Check flight duration
  if (stats.flight_time_minutes > 1440) {
    errors.push("FLIGHT_TOO_LONG");
    flags.push("SPEED_HACK_SUSPECTED");
  }

  // Check distance vs time (max ~300 knots average)
  const maxDistance = (stats.flight_time_minutes / 60) * 300;
  if (stats.distance_nm > maxDistance * 1.2) {
    errors.push("IMPOSSIBLE_DISTANCE");
    flags.push("TELEPORT_SUSPECTED");
  }

  // Check departure matches aircraft position
  if (aircraft.current_airport_ident !== stats.departure_icao) {
    errors.push("TELEPORTATION_DETECTED");
    flags.push("TELEPORT_SUSPECTED");
  }

  // Check G-force
  if (stats.max_g_force > 10) {
    errors.push("IMPOSSIBLE_G_FORCE");
    flags.push("IMPOSSIBLE_G_FORCE");
  }

  // Check fuel usage
  if (mission) {
    const fuelUsed = mission.fuel_at_start - stats.fuel_remaining;
    const minFuelExpected = mission.distance_nm * 0.05;
    if (fuelUsed < minFuelExpected && stats.flight_time_minutes > 10) {
      errors.push("FUEL_ANOMALY");
      flags.push("FUEL_CHEAT_SUSPECTED");
    }
  }

  // Check minimum flight time
  if (mission) {
    const estimatedTime = (mission.distance_nm / 120) * 60;
    const minTime = estimatedTime * 0.3;
    if (stats.flight_time_minutes < minTime) {
      errors.push("FLIGHT_TOO_FAST");
      flags.push("SPEED_HACK_SUSPECTED");
    }
  }

  if (errors.length > 0) {
    return { valid: false, reason: errors.join(", "), flags };
  }

  return { valid: true };
}

function calculateMissionScore(stats: FlightStats): MissionScore {
  let score = 1000;
  let multiplier = 1.0;
  const penalties: string[] = [];
  const bonuses: string[] = [];

  // Landing quality
  if (stats.landing_fpm > 500) {
    score -= 200;
    multiplier -= 0.1;
    penalties.push("Hard landing (-200)");
  } else if (stats.landing_fpm > 300) {
    score -= 100;
    multiplier -= 0.05;
    penalties.push("Firm landing (-100)");
  }

  // Overspeed penalties
  if (stats.overspeed_count > 0) {
    const penalty = stats.overspeed_count * 50;
    score -= penalty;
    multiplier -= 0.05 * stats.overspeed_count;
    penalties.push(`Overspeed x${stats.overspeed_count} (-${penalty})`);
  }

  // G-force penalty
  if (stats.max_g_force > 2.5) {
    score -= 100;
    multiplier -= 0.05;
    penalties.push("Excessive G-force (-100)");
  }

  // Landing bonuses
  if (stats.landing_fpm < 100) {
    score += 150;
    multiplier += 0.1;
    bonuses.push("Smooth landing (+150)");
  }
  if (stats.landing_fpm < 50) {
    score += 100;
    multiplier += 0.05;
    bonuses.push("Butter landing (+100)");
  }

  // Calculate grade
  let grade = "F";
  if (score >= 1200) grade = "S";
  else if (score >= 1000) grade = "A";
  else if (score >= 800) grade = "B";
  else if (score >= 600) grade = "C";
  else if (score >= 400) grade = "D";

  return {
    score: Math.max(0, score),
    multiplier: Math.max(0.5, Math.min(1.5, multiplier)),
    grade,
    penalties,
    bonuses,
  };
}

// ═══════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════

async function handlePing(env: Env): Promise<Response> {
  const list = await env.BUCKET.list({ prefix: "players/" });
  const playerCount = list.objects.length;

  return jsonResponse({
    status: "ok",
    time: Date.now(),
    version: "2.1.0-inventory",
    environment: env.ENVIRONMENT,
    players_online: playerCount,
  });
}

async function handleGetWorld(env: Env): Promise<Response> {
  const world = await getWorldData(env.BUCKET);
  return jsonResponse(world);
}

// ─────────────────────────────────────────────────────────
// PLAYER HANDLERS
// ─────────────────────────────────────────────────────────

async function handleGetPlayer(env: Env, playerId: string): Promise<Response> {
  const player = await getJson<Player>(env.BUCKET, `players/${playerId}.json`);
  if (!player) {
    return errorResponse("Player not found", 404);
  }
  return jsonResponse(player);
}

async function handleCreatePlayer(env: Env, request: Request): Promise<Response> {
  const data = await request.json() as Partial<Player>;

  if (!data.id || !data.name) {
    return errorResponse("Missing required fields: id, name");
  }

  const existing = await getJson<Player>(env.BUCKET, `players/${data.id}.json`);
  if (existing) {
    return errorResponse("Player already exists", 409);
  }

  const now = new Date().toISOString();
  const newPlayer: Player = {
    id: data.id,
    name: data.name,
    money: data.money ?? 100000,
    xp: data.xp ?? 0,
    home_airport: data.home_airport ?? "LFPG",
    trust_score: 100,
    inventory: [], // Initialize empty inventory
    created_at: now,
    updated_at: now,
  };

  await putJson(env.BUCKET, `players/${data.id}.json`, newPlayer);
  console.log(`[SEED] Player created: ${data.name} (${data.id})`);

  return jsonResponse(newPlayer, 201);
}

async function handleUpdatePlayer(
  env: Env,
  playerId: string,
  request: Request
): Promise<Response> {
  const existing = await getJson<Player>(env.BUCKET, `players/${playerId}.json`);
  if (!existing) {
    return errorResponse("Player not found", 404);
  }

  const updates = await request.json() as Partial<Player>;

  // ANTI-CHEAT: Block direct money/XP modification
  if (updates.money !== undefined && updates.money !== existing.money) {
    console.log(`[ANTI-CHEAT] Blocked money manipulation for ${playerId}`);
    await flagSuspiciousActivity(env.BUCKET, playerId, "MONEY_MANIPULATION");
    return errorResponse("Cannot modify money directly. Use game actions.", 403);
  }

  if (updates.xp !== undefined && updates.xp !== existing.xp) {
    console.log(`[ANTI-CHEAT] Blocked XP manipulation for ${playerId}`);
    await flagSuspiciousActivity(env.BUCKET, playerId, "MONEY_MANIPULATION");
    return errorResponse("Cannot modify XP directly. Use game actions.", 403);
  }

  const updatedPlayer: Player = {
    ...existing,
    name: updates.name ?? existing.name,
    home_airport: updates.home_airport ?? existing.home_airport,
    updated_at: new Date().toISOString(),
  };

  await putJson(env.BUCKET, `players/${playerId}.json`, updatedPlayer);
  console.log(`[SEED] Player updated: ${updatedPlayer.name}`);

  return jsonResponse(updatedPlayer);
}

async function handleGetPlayerTrust(env: Env, playerId: string): Promise<Response> {
  const trust = await getPlayerTrust(env.BUCKET, playerId);
  return jsonResponse(trust);
}

// ─────────────────────────────────────────────────────────
// AIRCRAFT HANDLERS
// ─────────────────────────────────────────────────────────

async function handleGetPlayerAircraft(env: Env, playerId: string): Promise<Response> {
  const list = await env.BUCKET.list({ prefix: `aircraft/${playerId}/` });
  const aircraft: Aircraft[] = [];

  for (const obj of list.objects) {
    const ac = await getJson<Aircraft>(env.BUCKET, obj.key);
    if (ac) aircraft.push(ac);
  }

  return jsonResponse(aircraft);
}

async function handleCreatePlayerAircraft(
  env: Env,
  playerId: string,
  request: Request
): Promise<Response> {
  const player = await getJson<Player>(env.BUCKET, `players/${playerId}.json`);
  if (!player) {
    return errorResponse("Player not found", 404);
  }

  const data = await request.json() as Partial<Aircraft>;
  const aircraft: Aircraft = {
    id: crypto.randomUUID(),
    owner_id: playerId,
    registration: data.registration ?? "N-XXXX",
    aircraft_type: data.aircraft_type ?? "Unknown",
    icao_type: data.icao_type ?? "UNKN",
    current_airport_ident: data.current_airport_ident ?? player.home_airport,
    status: data.status ?? "parked",
    fuel_gallons: data.fuel_gallons ?? 50,
    fuel_capacity_gallons: data.fuel_capacity_gallons ?? 100,
    cargo_kg: data.cargo_kg ?? 0,
    cargo_capacity_kg: data.cargo_capacity_kg ?? 500,
    condition: data.condition ?? 100,
    hours: data.hours ?? 0,
  };

  await putJson(env.BUCKET, `aircraft/${playerId}/${aircraft.id}.json`, aircraft);
  console.log(`[SEED] Aircraft created: ${aircraft.registration} for ${playerId}`);

  return jsonResponse(aircraft, 201);
}

async function handleUpdateAircraft(
  env: Env,
  aircraftId: string,
  request: Request,
  authPlayerId?: string
): Promise<Response> {
  const updates = await request.json() as Aircraft;

  if (authPlayerId && updates.owner_id && authPlayerId !== updates.owner_id) {
    return errorResponse("Cannot modify another player's aircraft", 403);
  }

  const existing = await getJson<Aircraft>(
    env.BUCKET,
    `aircraft/${updates.owner_id}/${aircraftId}.json`
  );

  if (existing && updates.current_airport_ident !== existing.current_airport_ident) {
    console.log(
      `[SEED] Aircraft ${aircraftId} moved: ${existing.current_airport_ident} -> ${updates.current_airport_ident}`
    );
  }

  await putJson(env.BUCKET, `aircraft/${updates.owner_id}/${aircraftId}.json`, updates);
  console.log(`[SEED] Aircraft updated: ${updates.registration}`);

  return jsonResponse({ success: true });
}

async function handleRefuel(
  env: Env,
  aircraftId: string,
  playerId: string,
  request: Request
): Promise<Response> {
  const { gallons_to_add } = await request.json() as { gallons_to_add: number };

  const player = await getJson<Player>(env.BUCKET, `players/${playerId}.json`);
  if (!player) return errorResponse("Player not found", 404);

  const aircraft = await getJson<Aircraft>(env.BUCKET, `aircraft/${playerId}/${aircraftId}.json`);
  if (!aircraft) return errorResponse("Aircraft not found", 404);

  if (aircraft.owner_id !== playerId) {
    return errorResponse("Not your aircraft", 403);
  }

  const totalCost = Math.round(gallons_to_add * FUEL_PRICE_PER_GALLON * 100) / 100;

  if (player.money < totalCost) {
    return errorResponse(`Insufficient funds. Need ${totalCost}, have ${player.money}`, 400);
  }

  const newFuel = aircraft.fuel_gallons + gallons_to_add;
  if (newFuel > aircraft.fuel_capacity_gallons) {
    return errorResponse(`Exceeds capacity. Max: ${aircraft.fuel_capacity_gallons}`, 400);
  }

  player.money -= totalCost;
  aircraft.fuel_gallons = newFuel;
  player.updated_at = new Date().toISOString();

  await putJson(env.BUCKET, `players/${playerId}.json`, player);
  await putJson(env.BUCKET, `aircraft/${playerId}/${aircraftId}.json`, aircraft);

  console.log(`[SEED] Refuel: ${aircraftId} +${gallons_to_add} gal, cost: ${totalCost}`);

  return jsonResponse({
    success: true,
    fuel_added: gallons_to_add,
    cost: totalCost,
    new_fuel: aircraft.fuel_gallons,
    new_balance: player.money,
  });
}

// ─────────────────────────────────────────────────────────
// MISSION HANDLERS
// ─────────────────────────────────────────────────────────

async function handleCreateMission(
  env: Env,
  playerId: string,
  request: Request
): Promise<Response> {
  const { aircraft_id, destination_icao, cargo } = await request.json() as {
    aircraft_id: string;
    destination_icao: string;
    cargo?: { item_id: string; quantity: number }[];
  };

  const aircraft = await getJson<Aircraft>(env.BUCKET, `aircraft/${playerId}/${aircraft_id}.json`);
  if (!aircraft) return errorResponse("Aircraft not found", 404);

  if (aircraft.owner_id !== playerId) {
    return errorResponse("Not your aircraft", 403);
  }

  const existingMission = await getJson<Mission>(
    env.BUCKET,
    `missions/active/${aircraft_id}.json`
  );
  if (existingMission && existingMission.status === "in_progress") {
    return errorResponse("Aircraft already has an active mission", 400);
  }

  if (aircraft.condition < 20) {
    return errorResponse("Aircraft needs repair before flying", 400);
  }

  // Server calculates distance and rewards
  const distance_nm = 150 + Math.random() * 350;
  const base_xp = Math.floor(distance_nm * XP_PER_NM);
  const base_reward = Math.floor(distance_nm * MONEY_PER_NM);

  const mission: Mission = {
    id: crypto.randomUUID(),
    player_id: playerId,
    aircraft_id,
    departure_icao: aircraft.current_airport_ident,
    destination_icao,
    distance_nm: Math.round(distance_nm),
    base_xp,
    base_reward,
    cargo,
    fuel_at_start: aircraft.fuel_gallons,
    status: "in_progress",
    created_at: new Date().toISOString(),
  };

  await putJson(env.BUCKET, `missions/active/${aircraft_id}.json`, mission);
  await putJson(env.BUCKET, `missions/history/${mission.id}.json`, mission);

  console.log(
    `[SEED] Mission created: ${mission.id} - ${mission.departure_icao} -> ${destination_icao}`
  );

  return jsonResponse({ success: true, mission }, 201);
}

async function handleCompleteMission(
  env: Env,
  missionId: string,
  playerId: string,
  request: Request
): Promise<Response> {
  const stats = await request.json() as FlightStats;

  const mission = await getJson<Mission>(env.BUCKET, `missions/history/${missionId}.json`);
  if (!mission) return errorResponse("Mission not found", 404);

  if (mission.player_id !== playerId) {
    return errorResponse("Not your mission", 403);
  }

  if (mission.status !== "in_progress") {
    return errorResponse("Mission not active", 400);
  }

  const aircraft = await getJson<Aircraft>(
    env.BUCKET,
    `aircraft/${playerId}/${mission.aircraft_id}.json`
  );
  if (!aircraft) return errorResponse("Aircraft not found", 404);

  const player = await getJson<Player>(env.BUCKET, `players/${playerId}.json`);
  if (!player) return errorResponse("Player not found", 404);

  // Validate flight stats
  const validation = validateFlightStats(stats, aircraft, mission);
  if (!validation.valid) {
    for (const flag of validation.flags || []) {
      await flagSuspiciousActivity(env.BUCKET, playerId, flag);
    }
    console.log(`[ANTI-CHEAT] Mission ${missionId} flags: ${validation.flags?.join(", ")}`);
  }

  // Calculate score and rewards
  const score = calculateMissionScore(stats);
  const trust = await getPlayerTrust(env.BUCKET, playerId);

  let trustModifier = 1;
  if (trust.trust_score < 30) {
    trustModifier = 0.5;
    console.log(`[ANTI-CHEAT] Reduced rewards for low trust player ${playerId}`);
  }

  const xpEarned = Math.floor(mission.base_xp * score.multiplier * trustModifier);
  const moneyEarned = Math.floor(mission.base_reward * score.multiplier * trustModifier);

  // Apply aircraft wear
  const flightHours = stats.flight_time_minutes / 60;
  let wearPercent = flightHours * WEAR_PER_HOUR;
  if (stats.landing_fpm > 500) wearPercent += 5;
  if (stats.overspeed_count > 0) wearPercent += stats.overspeed_count * 2;

  // Update aircraft
  aircraft.condition = Math.max(0, aircraft.condition - wearPercent);
  aircraft.hours += flightHours;
  aircraft.fuel_gallons = Math.max(0, stats.fuel_remaining);
  aircraft.current_airport_ident = stats.arrival_icao;

  // Update player
  player.xp += xpEarned;
  player.money += moneyEarned;
  player.updated_at = new Date().toISOString();

  // Update mission
  mission.status = "completed";
  mission.completed_at = new Date().toISOString();

  // Save all
  await putJson(env.BUCKET, `players/${playerId}.json`, player);
  await putJson(env.BUCKET, `aircraft/${playerId}/${mission.aircraft_id}.json`, aircraft);
  await putJson(env.BUCKET, `missions/history/${missionId}.json`, mission);
  await deleteKey(env.BUCKET, `missions/active/${mission.aircraft_id}.json`);

  console.log(
    `[SEED] Mission completed: ${missionId}, XP: +${xpEarned}, Money: +${moneyEarned}, Grade: ${score.grade}`
  );

  return jsonResponse({
    success: true,
    score,
    xp_earned: xpEarned,
    money_earned: moneyEarned,
    new_xp: player.xp,
    new_balance: player.money,
    wear_applied: wearPercent,
    new_condition: aircraft.condition,
    trust_modifier: trustModifier,
  });
}

async function handleGetActiveMission(env: Env, aircraftId: string): Promise<Response> {
  const mission = await getJson<Mission>(env.BUCKET, `missions/active/${aircraftId}.json`);
  if (!mission) return errorResponse("No active mission", 404);
  return jsonResponse(mission);
}

// ─────────────────────────────────────────────────────────
// FREE FLIGHT HANDLER
// ─────────────────────────────────────────────────────────

async function handleFreeFlightEnd(
  env: Env,
  aircraftId: string,
  playerId: string,
  request: Request
): Promise<Response> {
  const stats = await request.json() as FreeFlightStats;

  // Get aircraft
  const aircraft = await getJson<Aircraft>(env.BUCKET, `aircraft/${playerId}/${aircraftId}.json`);
  if (!aircraft) return errorResponse("Aircraft not found", 404);

  if (aircraft.owner_id !== playerId) {
    return errorResponse("Not your aircraft", 403);
  }

  // Get player
  const player = await getJson<Player>(env.BUCKET, `players/${playerId}.json`);
  if (!player) return errorResponse("Player not found", 404);

  // Basic validation (more permissive than missions - no departure check)
  const flags: string[] = [];

  if (stats.flight_time_minutes > 1440) {
    flags.push("FLIGHT_TOO_LONG");
  }

  // Check distance vs time (max ~300 knots average)
  const maxDistance = (stats.flight_time_minutes / 60) * 300;
  if (stats.distance_nm > maxDistance * 1.5) {
    flags.push("TELEPORT_SUSPECTED");
  }

  if (stats.max_g_force > 10) {
    flags.push("IMPOSSIBLE_G_FORCE");
  }

  // Flag suspicious activity
  for (const flag of flags) {
    await flagSuspiciousActivity(env.BUCKET, playerId, flag);
  }

  if (flags.length > 0) {
    console.log(`[ANTI-CHEAT] Free flight ${aircraftId} flags: ${flags.join(", ")}`);
  }

  // Get trust score for modifier
  const trust = await getPlayerTrust(env.BUCKET, playerId);
  let trustModifier = 1;
  if (trust.trust_score < 30) {
    trustModifier = 0.5;
    console.log(`[ANTI-CHEAT] Reduced XP for low trust player ${playerId}`);
  }

  // Calculate XP (reduced compared to missions, no money)
  const baseXp = Math.floor(stats.distance_nm * FREE_FLIGHT_XP_PER_NM);
  const landingBonus = stats.landings * FREE_FLIGHT_LANDING_BONUS_XP;
  const xpEarned = Math.floor((baseXp + landingBonus) * trustModifier);

  // Calculate aircraft wear
  const flightHours = stats.flight_time_minutes / 60;
  let wearPercent = flightHours * WEAR_PER_HOUR;
  if (stats.landing_fpm > 500) wearPercent += 5;
  if (stats.overspeed_count > 0) wearPercent += stats.overspeed_count * 2;

  // Update aircraft
  aircraft.current_airport_ident = stats.arrival_icao;
  aircraft.hours += flightHours;
  aircraft.condition = Math.max(0, aircraft.condition - wearPercent);

  // Update player XP (no money for free flight)
  player.xp += xpEarned;
  player.updated_at = new Date().toISOString();

  // Save
  await putJson(env.BUCKET, `aircraft/${playerId}/${aircraftId}.json`, aircraft);
  await putJson(env.BUCKET, `players/${playerId}.json`, player);

  console.log(
    `[SEED] Free flight end: ${playerId} +${xpEarned}XP, ${Math.round(stats.distance_nm)}nm, ${stats.landings} landings`
  );

  return jsonResponse({
    success: true,
    xp_earned: xpEarned,
    wear_applied: wearPercent,
    new_condition: aircraft.condition,
    new_xp: player.xp,
    trust_modifier: trustModifier,
  });
}

// ─────────────────────────────────────────────────────────
// COMPANY HANDLERS
// ─────────────────────────────────────────────────────────

async function handleGetPlayerCompany(env: Env, playerId: string): Promise<Response> {
  const company = await getJson<Company>(env.BUCKET, `companies/${playerId}.json`);
  if (!company) return errorResponse("Company not found", 404);
  return jsonResponse(company);
}

async function handleCreateCompany(env: Env, request: Request): Promise<Response> {
  const data = await request.json() as Partial<Company>;

  const company: Company = {
    id: crypto.randomUUID(),
    name: data.name ?? "New Company",
    owner_id: data.owner_id ?? "",
    home_airport_ident: data.home_airport_ident ?? "LFPG",
    balance: data.balance ?? 0,
    inventory: [], // Initialize empty inventory
    created_at: new Date().toISOString(),
  };

  await putJson(env.BUCKET, `companies/${data.owner_id}.json`, company);
  console.log(`[SEED] Company created: ${company.name}`);

  return jsonResponse(company, 201);
}

async function handleUpdateCompany(
  env: Env,
  companyId: string,
  request: Request
): Promise<Response> {
  const list = await env.BUCKET.list({ prefix: "companies/" });
  let existingCompany: Company | null = null;
  let companyKey: string | null = null;

  for (const obj of list.objects) {
    const company = await getJson<Company>(env.BUCKET, obj.key);
    if (company && company.id === companyId) {
      existingCompany = company;
      companyKey = obj.key;
      break;
    }
  }

  if (!existingCompany || !companyKey) {
    return errorResponse("Company not found", 404);
  }

  const updates = await request.json() as Partial<Company>;
  const updatedCompany: Company = {
    ...existingCompany,
    ...updates,
    id: companyId,
  };

  await putJson(env.BUCKET, companyKey, updatedCompany);
  console.log(`[SEED] Company updated: ${updatedCompany.name}`);

  return jsonResponse(updatedCompany);
}

// ─────────────────────────────────────────────────────────
// MARKET HANDLERS
// ─────────────────────────────────────────────────────────

async function handleGetMarketOrders(env: Env, url: URL): Promise<Response> {
  const world = await getWorldData(env.BUCKET);
  let orders = world.market_orders;

  // Apply filters
  const airportIdent = url.searchParams.get("airport_ident");
  const itemId = url.searchParams.get("item_id");
  const sellerId = url.searchParams.get("seller_id");

  if (airportIdent) orders = orders.filter((o) => o.airport_ident === airportIdent);
  if (itemId) orders = orders.filter((o) => o.item_id === itemId);
  if (sellerId) orders = orders.filter((o) => o.seller_id === sellerId);

  return jsonResponse(orders);
}

async function handlePostMarketOrder(env: Env, request: Request): Promise<Response> {
  const data = await request.json() as Partial<MarketOrder>;

  const order: MarketOrder = {
    id: crypto.randomUUID(),
    seller_id: data.seller_id ?? "",
    seller_name: data.seller_name ?? "Unknown",
    airport_ident: data.airport_ident ?? "",
    item_id: data.item_id ?? "",
    item_code: data.item_code ?? data.item_id ?? "",
    item_name: data.item_name ?? "",
    item_tier: data.item_tier ?? 1,
    quantity: data.quantity ?? 0,
    price_per_unit: data.price_per_unit ?? 0,
    created_at: new Date().toISOString(),
  };

  const world = await getWorldData(env.BUCKET);
  world.market_orders.push(order);
  world.version++;

  await putJson(env.BUCKET, "world/data.json", world);
  console.log(`[SEED] Market order posted: ${order.item_name} x${order.quantity}`);

  return jsonResponse(order, 201);
}

async function handleBuyMarketOrder(
  env: Env,
  orderId: string,
  request: Request
): Promise<Response> {
  const world = await getWorldData(env.BUCKET);
  const orderIndex = world.market_orders.findIndex((o) => o.id === orderId);

  if (orderIndex === -1) {
    return errorResponse("Order not found", 404);
  }

  const order = world.market_orders[orderIndex];
  const { buyer_id, quantity } = await request.json() as { buyer_id: string; quantity: number };

  if (order.seller_id === buyer_id) {
    return errorResponse("Cannot buy your own order", 400);
  }

  if (quantity > order.quantity) {
    return errorResponse("Not enough quantity available", 400);
  }

  const buyer = await getJson<Player>(env.BUCKET, `players/${buyer_id}.json`);
  if (!buyer) return errorResponse("Buyer not found", 404);

  const totalCost = quantity * order.price_per_unit;

  if (buyer.money < totalCost) {
    return errorResponse(`Insufficient funds. Need ${totalCost}, have ${buyer.money}`, 400);
  }

  // Deduct money from buyer
  buyer.money -= totalCost;

  // ADD ITEMS TO BUYER'S INVENTORY
  if (!buyer.inventory) buyer.inventory = [];

  // Check if item already exists in inventory at this airport
  const existingItem = buyer.inventory.find(
    (inv) => inv.item_code === (order.item_code || order.item_id) && inv.airport_icao === order.airport_ident
  );

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
      item_id: order.item_id,
      item_code: order.item_code || order.item_id,
      item_name: order.item_name,
      quantity: quantity,
      airport_icao: order.airport_ident,
      tier: order.item_tier,
    };
    buyer.inventory.push(newItem);
  }

  buyer.updated_at = new Date().toISOString();

  // Update order quantity
  order.quantity -= quantity;

  // Pay seller if not NPC
  if (!order.seller_id.startsWith("npc_")) {
    const seller = await getJson<Player>(env.BUCKET, `players/${order.seller_id}.json`);
    if (seller) {
      seller.money += totalCost;
      await putJson(env.BUCKET, `players/${order.seller_id}.json`, seller);
    }
  }

  // Save buyer
  await putJson(env.BUCKET, `players/${buyer_id}.json`, buyer);

  // Remove order if depleted
  if (order.quantity <= 0) {
    world.market_orders.splice(orderIndex, 1);
    console.log(`[SEED] Market order completed: ${orderId}`);
  }

  world.version++;
  await putJson(env.BUCKET, "world/data.json", world);

  console.log(
    `[SEED] Market buy: ${buyer_id} bought ${quantity}x ${order.item_name} for ${totalCost} - added to inventory`
  );

  return jsonResponse({
    success: true,
    remaining: order.quantity,
    total_cost: totalCost,
    new_balance: buyer.money,
    inventory_updated: true,
  });
}

async function handleDeleteMarketOrder(
  env: Env,
  orderId: string,
  request: Request
): Promise<Response> {
  const world = await getWorldData(env.BUCKET);
  const orderIndex = world.market_orders.findIndex((o) => o.id === orderId);

  if (orderIndex === -1) {
    return errorResponse("Order not found", 404);
  }

  const order = world.market_orders[orderIndex];
  const { seller_id } = await request.json() as { seller_id: string };

  if (order.seller_id !== seller_id) {
    return errorResponse("Not authorized", 403);
  }

  world.market_orders.splice(orderIndex, 1);
  world.version++;

  await putJson(env.BUCKET, "world/data.json", world);
  console.log(`[SEED] Market order cancelled: ${orderId}`);

  return jsonResponse({ success: true });
}

// Seed test market data
async function handleSeedMarketData(env: Env): Promise<Response> {
  const world = await getWorldData(env.BUCKET);

  const testOrders: MarketOrder[] = [
    {
      id: crypto.randomUUID(),
      seller_id: "npc_global_trader",
      seller_name: "Global Traders Ltd.",
      airport_ident: "LFPG",
      item_id: "cargo_mail",
      item_code: "cargo_mail",
      item_name: "Mail Packages",
      item_tier: 1,
      quantity: 200,
      price_per_unit: 25,
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      seller_id: "npc_global_trader",
      seller_name: "Global Traders Ltd.",
      airport_ident: "EGLL",
      item_id: "cargo_electronics",
      item_code: "cargo_electronics",
      item_name: "Electronics",
      item_tier: 3,
      quantity: 50,
      price_per_unit: 150,
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      seller_id: "npc_med_supplies",
      seller_name: "MedSupply International",
      airport_ident: "KJFK",
      item_id: "cargo_medicine",
      item_code: "cargo_medicine",
      item_name: "Medical Supplies",
      item_tier: 2,
      quantity: 100,
      price_per_unit: 80,
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      seller_id: "npc_food_export",
      seller_name: "Fresh Foods Export",
      airport_ident: "LFPG",
      item_id: "cargo_food",
      item_code: "cargo_food",
      item_name: "Fresh Food",
      item_tier: 1,
      quantity: 300,
      price_per_unit: 15,
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      seller_id: "npc_luxury_goods",
      seller_name: "Luxury Goods Co.",
      airport_ident: "OMDB",
      item_id: "cargo_luxury",
      item_code: "cargo_luxury",
      item_name: "Luxury Items",
      item_tier: 4,
      quantity: 20,
      price_per_unit: 500,
      created_at: new Date().toISOString(),
    },
  ];

  // Add test orders (don't duplicate)
  for (const order of testOrders) {
    const exists = world.market_orders.some(
      (o) => o.item_id === order.item_id && o.airport_ident === order.airport_ident
    );
    if (!exists) {
      world.market_orders.push(order);
    }
  }

  world.version++;
  await putJson(env.BUCKET, "world/data.json", world);

  console.log(`[SEED] Market seeded with ${testOrders.length} test orders`);

  return jsonResponse({
    success: true,
    orders_added: testOrders.length,
    total_orders: world.market_orders.length,
  });
}

// ─────────────────────────────────────────────────────────
// INVENTORY HANDLERS
// ─────────────────────────────────────────────────────────

async function handleGetAirportInventory(env: Env, icao: string): Promise<Response> {
  const world = await getWorldData(env.BUCKET);
  const inventory = world.airport_inventories[icao] || [];
  return jsonResponse(inventory);
}

async function handleUpdateAirportInventory(
  env: Env,
  icao: string,
  request: Request
): Promise<Response> {
  const world = await getWorldData(env.BUCKET);
  const inventory = await request.json() as AirportInventoryItem[];

  world.airport_inventories[icao] = inventory;
  world.version++;

  await putJson(env.BUCKET, "world/data.json", world);
  console.log(`[SEED] Airport inventory updated: ${icao}`);

  return jsonResponse({ success: true, icao, items: inventory.length });
}

// ═══════════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    console.log(`[SEED] ${method} ${path}`);

    try {
      // Validate API key
      const auth = validateRequest(request);
      if (!auth.valid) {
        console.log(`[SEED] Auth failed: ${auth.error}`);
        return errorResponse(auth.error || "Unauthorized", 401);
      }

      // ─────────────────────────────────────────────────────────
      // PUBLIC ENDPOINTS
      // ─────────────────────────────────────────────────────────

      if (path === "/ping" && method === "GET") {
        return handlePing(env);
      }

      if (path === "/world" && method === "GET") {
        return handleGetWorld(env);
      }

      // ─────────────────────────────────────────────────────────
      // PLAYER ENDPOINTS
      // ─────────────────────────────────────────────────────────

      if (path === "/players" && method === "POST") {
        return handleCreatePlayer(env, request);
      }

      const playerMatch = path.match(/^\/players\/([^/]+)$/);
      if (playerMatch) {
        const playerId = playerMatch[1];
        if (method === "GET") return handleGetPlayer(env, playerId);
        if (method === "PUT") {
          if (auth.playerId && auth.playerId !== playerId) {
            return errorResponse("Cannot modify another player", 403);
          }
          return handleUpdatePlayer(env, playerId, request);
        }
      }

      const playerTrustMatch = path.match(/^\/players\/([^/]+)\/trust$/);
      if (playerTrustMatch && method === "GET") {
        return handleGetPlayerTrust(env, playerTrustMatch[1]);
      }

      const playerAircraftMatch = path.match(/^\/players\/([^/]+)\/aircraft$/);
      if (playerAircraftMatch) {
        const targetPlayerId = playerAircraftMatch[1];
        if (method === "GET") return handleGetPlayerAircraft(env, targetPlayerId);
        if (method === "POST") {
          if (auth.playerId && auth.playerId !== targetPlayerId) {
            return errorResponse("Cannot add aircraft to another player", 403);
          }
          return handleCreatePlayerAircraft(env, targetPlayerId, request);
        }
      }

      const playerCompanyMatch = path.match(/^\/players\/([^/]+)\/company$/);
      if (playerCompanyMatch && method === "GET") {
        return handleGetPlayerCompany(env, playerCompanyMatch[1]);
      }

      // ─────────────────────────────────────────────────────────
      // MISSION ENDPOINTS
      // ─────────────────────────────────────────────────────────

      if (path === "/missions" && method === "POST") {
        if (!auth.playerId) return errorResponse("Player ID required", 400);
        return handleCreateMission(env, auth.playerId, request);
      }

      const missionCompleteMatch = path.match(/^\/missions\/([^/]+)\/complete$/);
      if (missionCompleteMatch && method === "POST") {
        if (!auth.playerId) return errorResponse("Player ID required", 400);
        return handleCompleteMission(env, missionCompleteMatch[1], auth.playerId, request);
      }

      const missionActiveMatch = path.match(/^\/missions\/active\/([^/]+)$/);
      if (missionActiveMatch && method === "GET") {
        return handleGetActiveMission(env, missionActiveMatch[1]);
      }

      // ─────────────────────────────────────────────────────────
      // AIRCRAFT ENDPOINTS
      // ─────────────────────────────────────────────────────────

      const aircraftMatch = path.match(/^\/aircraft\/([^/]+)$/);
      if (aircraftMatch && method === "PUT") {
        return handleUpdateAircraft(env, aircraftMatch[1], request, auth.playerId);
      }

      const refuelMatch = path.match(/^\/aircraft\/([^/]+)\/refuel$/);
      if (refuelMatch && method === "POST") {
        if (!auth.playerId) return errorResponse("Player ID required", 400);
        return handleRefuel(env, refuelMatch[1], auth.playerId, request);
      }

      const freeFlightEndMatch = path.match(/^\/aircraft\/([^/]+)\/free-flight-end$/);
      if (freeFlightEndMatch && method === "POST") {
        if (!auth.playerId) return errorResponse("Player ID required", 400);
        return handleFreeFlightEnd(env, freeFlightEndMatch[1], auth.playerId, request);
      }

      // ─────────────────────────────────────────────────────────
      // COMPANY ENDPOINTS
      // ─────────────────────────────────────────────────────────

      if (path === "/companies" && method === "POST") {
        return handleCreateCompany(env, request);
      }

      const companyMatch = path.match(/^\/companies\/([^/]+)$/);
      if (companyMatch && method === "PUT") {
        return handleUpdateCompany(env, companyMatch[1], request);
      }

      // ─────────────────────────────────────────────────────────
      // MARKET ENDPOINTS
      // ─────────────────────────────────────────────────────────

      if (path === "/market/orders") {
        if (method === "GET") return handleGetMarketOrders(env, url);
        if (method === "POST") return handlePostMarketOrder(env, request);
      }

      // Seed test market data
      if (path === "/market/seed-data" && method === "POST") {
        return handleSeedMarketData(env);
      }

      const marketBuyMatch = path.match(/^\/market\/orders\/([^/]+)\/buy$/);
      if (marketBuyMatch && method === "POST") {
        return handleBuyMarketOrder(env, marketBuyMatch[1], request);
      }

      const marketDeleteMatch = path.match(/^\/market\/orders\/([^/]+)$/);
      if (marketDeleteMatch && method === "DELETE") {
        return handleDeleteMarketOrder(env, marketDeleteMatch[1], request);
      }

      // ─────────────────────────────────────────────────────────
      // INVENTORY ENDPOINTS
      // ─────────────────────────────────────────────────────────

      const inventoryMatch = path.match(/^\/world\/inventories\/([^/]+)$/);
      if (inventoryMatch) {
        const icao = inventoryMatch[1];
        if (method === "GET") return handleGetAirportInventory(env, icao);
        if (method === "PUT") return handleUpdateAirportInventory(env, icao, request);
      }

      // ─────────────────────────────────────────────────────────
      // 404
      // ─────────────────────────────────────────────────────────

      return errorResponse("Not found", 404);
    } catch (e) {
      console.error("[SEED] Error:", e);
      return errorResponse("Internal server error", 500);
    }
  },
};
