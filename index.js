var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var FUEL_PRICE_PER_GALLON = 5.5;
var XP_PER_NM = 2;
var MONEY_PER_NM = 10;
var WEAR_PER_HOUR = 0.5;
var TRUST_PENALTIES = {
  TELEPORT_SUSPECTED: -30,
  SPEED_HACK_SUSPECTED: -25,
  MONEY_MANIPULATION: -40,
  FUEL_CHEAT_SUSPECTED: -15,
  IMPOSSIBLE_DISTANCE: -20,
  IMPOSSIBLE_G_FORCE: -10,
  FLIGHT_TOO_FAST: -10,
  FUEL_ANOMALY: -10
};
async function getJson(bucket, key) {
  const object = await bucket.get(key);
  if (!object)
    return null;
  return object.json();
}
__name(getJson, "getJson");
async function putJson(bucket, key, data) {
  await bucket.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" }
  });
}
__name(putJson, "putJson");
async function deleteKey(bucket, key) {
  await bucket.delete(key);
}
__name(deleteKey, "deleteKey");
var API_KEY = "woa-seed-2024-worldofaircraft";
function validateRequest(request) {
  const apiKey = request.headers.get("X-API-Key");
  const playerId = request.headers.get("X-Player-ID");
  if (!apiKey || apiKey !== API_KEY) {
    return { valid: false, error: "Invalid API Key" };
  }
  return { valid: true, playerId: playerId || void 0 };
}
__name(validateRequest, "validateRequest");
async function getPlayerTrust(bucket, playerId) {
  const trust = await getJson(bucket, `trust/${playerId}.json`);
  if (trust)
    return trust;
  const newTrust = {
    player_id: playerId,
    trust_score: 100,
    events: [],
    last_flag_date: (/* @__PURE__ */ new Date()).toISOString()
  };
  await putJson(bucket, `trust/${playerId}.json`, newTrust);
  return newTrust;
}
__name(getPlayerTrust, "getPlayerTrust");
async function flagSuspiciousActivity(bucket, playerId, reason) {
  const trust = await getPlayerTrust(bucket, playerId);
  const penalty = TRUST_PENALTIES[reason] || -5;
  trust.trust_score = Math.max(0, trust.trust_score + penalty);
  trust.events.push({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    reason,
    penalty
  });
  trust.last_flag_date = (/* @__PURE__ */ new Date()).toISOString();
  if (trust.events.length > 50) {
    trust.events = trust.events.slice(-50);
  }
  await putJson(bucket, `trust/${playerId}.json`, trust);
  console.log(`[ANTI-CHEAT] Player ${playerId} flagged: ${reason}. New score: ${trust.trust_score}`);
}
__name(flagSuspiciousActivity, "flagSuspiciousActivity");
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, X-Player-ID",
    "Content-Type": "application/json"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders()
  });
}
__name(jsonResponse, "jsonResponse");
function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders()
  });
}
__name(errorResponse, "errorResponse");
async function getWorldData(bucket) {
  const world = await getJson(bucket, "world/data.json");
  if (world)
    return world;
  const defaultWorld = {
    market_orders: [
      {
        id: "order_001",
        seller_id: "npc_merchant_1",
        seller_name: "Sky Traders Inc.",
        airport_ident: "LFPG",
        item_id: "fuel_avgas",
        item_name: "Aviation Gasoline",
        item_tier: 1,
        quantity: 500,
        price_per_unit: 5,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: "order_002",
        seller_id: "npc_merchant_2",
        seller_name: "Global Cargo Co.",
        airport_ident: "KJFK",
        item_id: "cargo_electronics",
        item_name: "Electronics",
        item_tier: 3,
        quantity: 100,
        price_per_unit: 150,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ],
    airport_inventories: {},
    factories: [],
    prices: { fuel_avgas: 5, fuel_jetA: 4 },
    version: 1
  };
  await putJson(bucket, "world/data.json", defaultWorld);
  return defaultWorld;
}
__name(getWorldData, "getWorldData");
function validateFlightStats(stats, aircraft, mission) {
  const errors = [];
  const flags = [];
  if (stats.flight_time_minutes > 1440) {
    errors.push("FLIGHT_TOO_LONG");
    flags.push("SPEED_HACK_SUSPECTED");
  }
  const maxDistance = stats.flight_time_minutes / 60 * 300;
  if (stats.distance_nm > maxDistance * 1.2) {
    errors.push("IMPOSSIBLE_DISTANCE");
    flags.push("TELEPORT_SUSPECTED");
  }
  if (aircraft.current_airport_ident !== stats.departure_icao) {
    errors.push("TELEPORTATION_DETECTED");
    flags.push("TELEPORT_SUSPECTED");
  }
  if (stats.max_g_force > 10) {
    errors.push("IMPOSSIBLE_G_FORCE");
    flags.push("IMPOSSIBLE_G_FORCE");
  }
  if (mission) {
    const fuelUsed = mission.fuel_at_start - stats.fuel_remaining;
    const minFuelExpected = mission.distance_nm * 0.05;
    if (fuelUsed < minFuelExpected && stats.flight_time_minutes > 10) {
      errors.push("FUEL_ANOMALY");
      flags.push("FUEL_CHEAT_SUSPECTED");
    }
  }
  if (mission) {
    const estimatedTime = mission.distance_nm / 120 * 60;
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
__name(validateFlightStats, "validateFlightStats");
function calculateMissionScore(stats) {
  let score = 1e3;
  let multiplier = 1;
  const penalties = [];
  const bonuses = [];
  if (stats.landing_fpm > 500) {
    score -= 200;
    multiplier -= 0.1;
    penalties.push("Hard landing (-200)");
  } else if (stats.landing_fpm > 300) {
    score -= 100;
    multiplier -= 0.05;
    penalties.push("Firm landing (-100)");
  }
  if (stats.overspeed_count > 0) {
    const penalty = stats.overspeed_count * 50;
    score -= penalty;
    multiplier -= 0.05 * stats.overspeed_count;
    penalties.push(`Overspeed x${stats.overspeed_count} (-${penalty})`);
  }
  if (stats.max_g_force > 2.5) {
    score -= 100;
    multiplier -= 0.05;
    penalties.push("Excessive G-force (-100)");
  }
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
  let grade = "F";
  if (score >= 1200)
    grade = "S";
  else if (score >= 1e3)
    grade = "A";
  else if (score >= 800)
    grade = "B";
  else if (score >= 600)
    grade = "C";
  else if (score >= 400)
    grade = "D";
  return {
    score: Math.max(0, score),
    multiplier: Math.max(0.5, Math.min(1.5, multiplier)),
    grade,
    penalties,
    bonuses
  };
}
__name(calculateMissionScore, "calculateMissionScore");
async function handlePing(env) {
  const list = await env.BUCKET.list({ prefix: "players/" });
  const playerCount = list.objects.length;
  return jsonResponse({
    status: "ok",
    time: Date.now(),
    version: "2.0.0-anticheat",
    environment: env.ENVIRONMENT,
    players_online: playerCount
  });
}
__name(handlePing, "handlePing");
async function handleGetWorld(env) {
  const world = await getWorldData(env.BUCKET);
  return jsonResponse(world);
}
__name(handleGetWorld, "handleGetWorld");
async function handleGetPlayer(env, playerId) {
  const player = await getJson(env.BUCKET, `players/${playerId}.json`);
  if (!player) {
    return errorResponse("Player not found", 404);
  }
  return jsonResponse(player);
}
__name(handleGetPlayer, "handleGetPlayer");
async function handleCreatePlayer(env, request) {
  const player = await request.json();
  if (!player.id || !player.name) {
    return errorResponse("Missing required fields: id, name");
  }
  const existing = await getJson(env.BUCKET, `players/${player.id}.json`);
  if (existing) {
    return errorResponse("Player already exists", 409);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newPlayer = {
    ...player,
    money: player.money ?? 1e5,
    // Starting money set by server
    xp: player.xp ?? 0,
    home_airport: player.home_airport ?? "LFPG",
    trust_score: 100,
    created_at: now,
    updated_at: now
  };
  await putJson(env.BUCKET, `players/${player.id}.json`, newPlayer);
  console.log(`[SEED] Player created: ${player.name} (${player.id})`);
  return jsonResponse(newPlayer, 201);
}
__name(handleCreatePlayer, "handleCreatePlayer");
async function handleUpdatePlayer(env, playerId, request) {
  const existing = await getJson(env.BUCKET, `players/${playerId}.json`);
  if (!existing) {
    return errorResponse("Player not found", 404);
  }
  const updates = await request.json();
  if (updates.money !== void 0 && updates.money !== existing.money) {
    console.log(`[ANTI-CHEAT] Blocked money manipulation attempt for ${playerId}: ${existing.money} -> ${updates.money}`);
    await flagSuspiciousActivity(env.BUCKET, playerId, "MONEY_MANIPULATION");
    return errorResponse("Cannot modify money directly. Use game actions.", 403);
  }
  if (updates.xp !== void 0 && updates.xp !== existing.xp) {
    console.log(`[ANTI-CHEAT] Blocked XP manipulation attempt for ${playerId}: ${existing.xp} -> ${updates.xp}`);
    await flagSuspiciousActivity(env.BUCKET, playerId, "MONEY_MANIPULATION");
    return errorResponse("Cannot modify XP directly. Use game actions.", 403);
  }
  const updatedPlayer = {
    ...existing,
    name: updates.name ?? existing.name,
    home_airport: updates.home_airport ?? existing.home_airport,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await putJson(env.BUCKET, `players/${playerId}.json`, updatedPlayer);
  console.log(`[SEED] Player updated: ${updatedPlayer.name}`);
  return jsonResponse(updatedPlayer);
}
__name(handleUpdatePlayer, "handleUpdatePlayer");
async function handleGetPlayerAircraft(env, playerId) {
  const list = await env.BUCKET.list({ prefix: `aircraft/${playerId}/` });
  const aircraft = [];
  for (const obj of list.objects) {
    const ac = await getJson(env.BUCKET, obj.key);
    if (ac)
      aircraft.push(ac);
  }
  return jsonResponse(aircraft);
}
__name(handleGetPlayerAircraft, "handleGetPlayerAircraft");
async function handleUpdateAircraft(env, aircraftId, request, authPlayerId) {
  const updates = await request.json();
  if (authPlayerId && updates.owner_id && authPlayerId !== updates.owner_id) {
    return errorResponse("Cannot modify another player's aircraft", 403);
  }
  const existing = await getJson(env.BUCKET, `aircraft/${updates.owner_id}/${aircraftId}.json`);
  if (existing) {
    if (updates.current_airport_ident !== existing.current_airport_ident) {
      console.log(`[SEED] Aircraft ${aircraftId} moved: ${existing.current_airport_ident} -> ${updates.current_airport_ident}`);
    }
  }
  await putJson(env.BUCKET, `aircraft/${updates.owner_id}/${aircraftId}.json`, updates);
  console.log(`[SEED] Aircraft updated: ${updates.registration} (owner: ${updates.owner_id})`);
  return jsonResponse({ success: true });
}
__name(handleUpdateAircraft, "handleUpdateAircraft");
async function handleRefuel(env, aircraftId, playerId, request) {
  const { gallons_to_add } = await request.json();
  const player = await getJson(env.BUCKET, `players/${playerId}.json`);
  if (!player) {
    return errorResponse("Player not found", 404);
  }
  const aircraft = await getJson(env.BUCKET, `aircraft/${playerId}/${aircraftId}.json`);
  if (!aircraft) {
    return errorResponse("Aircraft not found", 404);
  }
  if (aircraft.owner_id !== playerId) {
    return errorResponse("Not your aircraft", 403);
  }
  const totalCost = Math.round(gallons_to_add * FUEL_PRICE_PER_GALLON * 100) / 100;
  if (player.money < totalCost) {
    return errorResponse(`Insufficient funds. Need ${totalCost}, have ${player.money}`, 400);
  }
  const newFuel = aircraft.fuel_gallons + gallons_to_add;
  if (newFuel > aircraft.fuel_capacity_gallons) {
    return errorResponse(`Exceeds capacity. Max: ${aircraft.fuel_capacity_gallons}, would be: ${newFuel}`, 400);
  }
  player.money -= totalCost;
  aircraft.fuel_gallons = newFuel;
  player.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  await putJson(env.BUCKET, `players/${playerId}.json`, player);
  await putJson(env.BUCKET, `aircraft/${playerId}/${aircraftId}.json`, aircraft);
  console.log(`[SEED] Refuel: ${aircraftId} +${gallons_to_add} gal, cost: ${totalCost}, player balance: ${player.money}`);
  return jsonResponse({
    success: true,
    fuel_added: gallons_to_add,
    cost: totalCost,
    new_fuel: aircraft.fuel_gallons,
    new_balance: player.money
  });
}
__name(handleRefuel, "handleRefuel");
async function handleCreateMission(env, playerId, request) {
  const { aircraft_id, destination_icao, cargo } = await request.json();
  const aircraft = await getJson(env.BUCKET, `aircraft/${playerId}/${aircraft_id}.json`);
  if (!aircraft) {
    return errorResponse("Aircraft not found", 404);
  }
  if (aircraft.owner_id !== playerId) {
    return errorResponse("Not your aircraft", 403);
  }
  const existingMission = await getJson(env.BUCKET, `missions/active/${aircraft_id}.json`);
  if (existingMission && existingMission.status === "in_progress") {
    return errorResponse("Aircraft already has an active mission", 400);
  }
  if (aircraft.condition < 20) {
    return errorResponse("Aircraft needs repair before flying", 400);
  }
  const distance_nm = 150 + Math.random() * 350;
  const base_xp = Math.floor(distance_nm * XP_PER_NM);
  const base_reward = Math.floor(distance_nm * MONEY_PER_NM);
  const mission = {
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
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await putJson(env.BUCKET, `missions/active/${aircraft_id}.json`, mission);
  await putJson(env.BUCKET, `missions/history/${mission.id}.json`, mission);
  console.log(`[SEED] Mission created: ${mission.id} - ${mission.departure_icao} -> ${destination_icao} (${Math.round(distance_nm)}nm)`);
  return jsonResponse({
    success: true,
    mission
  }, 201);
}
__name(handleCreateMission, "handleCreateMission");
async function handleCompleteMission(env, missionId, playerId, request) {
  const stats = await request.json();
  const mission = await getJson(env.BUCKET, `missions/history/${missionId}.json`);
  if (!mission) {
    return errorResponse("Mission not found", 404);
  }
  if (mission.player_id !== playerId) {
    return errorResponse("Not your mission", 403);
  }
  if (mission.status !== "in_progress") {
    return errorResponse("Mission not active", 400);
  }
  const aircraft = await getJson(env.BUCKET, `aircraft/${playerId}/${mission.aircraft_id}.json`);
  if (!aircraft) {
    return errorResponse("Aircraft not found", 404);
  }
  const player = await getJson(env.BUCKET, `players/${playerId}.json`);
  if (!player) {
    return errorResponse("Player not found", 404);
  }
  const validation = validateFlightStats(stats, aircraft, mission);
  if (!validation.valid) {
    for (const flag of validation.flags || []) {
      await flagSuspiciousActivity(env.BUCKET, playerId, flag);
    }
    console.log(`[ANTI-CHEAT] Mission ${missionId} completed with flags: ${validation.flags?.join(", ")}`);
  }
  const score = calculateMissionScore(stats);
  const trust = await getPlayerTrust(env.BUCKET, playerId);
  let trustModifier = 1;
  if (trust.trust_score < 30) {
    trustModifier = 0.5;
    console.log(`[ANTI-CHEAT] Reduced rewards for low trust player ${playerId}`);
  }
  const xpEarned = Math.floor(mission.base_xp * score.multiplier * trustModifier);
  const moneyEarned = Math.floor(mission.base_reward * score.multiplier * trustModifier);
  const flightHours = stats.flight_time_minutes / 60;
  let wearPercent = flightHours * WEAR_PER_HOUR;
  if (stats.landing_fpm > 500) {
    wearPercent += 5;
  }
  if (stats.overspeed_count > 0) {
    wearPercent += stats.overspeed_count * 2;
  }
  aircraft.condition = Math.max(0, aircraft.condition - wearPercent);
  aircraft.hours += flightHours;
  aircraft.fuel_gallons = Math.max(0, stats.fuel_remaining);
  aircraft.current_airport_ident = stats.arrival_icao;
  player.xp += xpEarned;
  player.money += moneyEarned;
  player.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  mission.status = "completed";
  mission.completed_at = (/* @__PURE__ */ new Date()).toISOString();
  await putJson(env.BUCKET, `players/${playerId}.json`, player);
  await putJson(env.BUCKET, `aircraft/${playerId}/${mission.aircraft_id}.json`, aircraft);
  await putJson(env.BUCKET, `missions/history/${missionId}.json`, mission);
  await deleteKey(env.BUCKET, `missions/active/${mission.aircraft_id}.json`);
  console.log(`[SEED] Mission completed: ${missionId}, XP: +${xpEarned}, Money: +${moneyEarned}, Grade: ${score.grade}`);
  return jsonResponse({
    success: true,
    score,
    xp_earned: xpEarned,
    money_earned: moneyEarned,
    new_xp: player.xp,
    new_balance: player.money,
    wear_applied: wearPercent,
    new_condition: aircraft.condition,
    trust_modifier: trustModifier
  });
}
__name(handleCompleteMission, "handleCompleteMission");
async function handleGetActiveMission(env, aircraftId) {
  const mission = await getJson(env.BUCKET, `missions/active/${aircraftId}.json`);
  if (!mission) {
    return errorResponse("No active mission", 404);
  }
  return jsonResponse(mission);
}
__name(handleGetActiveMission, "handleGetActiveMission");
async function handleGetPlayerCompany(env, playerId) {
  const company = await getJson(env.BUCKET, `companies/${playerId}.json`);
  if (!company) {
    return errorResponse("Company not found", 404);
  }
  return jsonResponse(company);
}
__name(handleGetPlayerCompany, "handleGetPlayerCompany");
async function handleCreateCompany(env, request) {
  const data = await request.json();
  const company = {
    ...data,
    id: crypto.randomUUID(),
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await putJson(env.BUCKET, `companies/${data.owner_id}.json`, company);
  console.log(`[SEED] Company created: ${company.name}`);
  return jsonResponse(company, 201);
}
__name(handleCreateCompany, "handleCreateCompany");
async function handleUpdateCompany(env, companyId, request) {
  const list = await env.BUCKET.list({ prefix: "companies/" });
  let existingCompany = null;
  let companyKey = null;
  for (const obj of list.objects) {
    const company = await getJson(env.BUCKET, obj.key);
    if (company && company.id === companyId) {
      existingCompany = company;
      companyKey = obj.key;
      break;
    }
  }
  if (!existingCompany || !companyKey) {
    return errorResponse("Company not found", 404);
  }
  const updates = await request.json();
  const updatedCompany = {
    ...existingCompany,
    ...updates,
    id: companyId
  };
  await putJson(env.BUCKET, companyKey, updatedCompany);
  console.log(`[SEED] Company updated: ${updatedCompany.name}`);
  return jsonResponse(updatedCompany);
}
__name(handleUpdateCompany, "handleUpdateCompany");
async function handlePostMarketOrder(env, request) {
  const data = await request.json();
  const order = {
    ...data,
    id: crypto.randomUUID(),
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const world = await getWorldData(env.BUCKET);
  world.market_orders.push(order);
  world.version++;
  await putJson(env.BUCKET, "world/data.json", world);
  console.log(`[SEED] Market order posted: ${order.item_name} x${order.quantity}`);
  return jsonResponse(order, 201);
}
__name(handlePostMarketOrder, "handlePostMarketOrder");
async function handleBuyMarketOrder(env, orderId, request) {
  const world = await getWorldData(env.BUCKET);
  const orderIndex = world.market_orders.findIndex((o) => o.id === orderId);
  if (orderIndex === -1) {
    return errorResponse("Order not found", 404);
  }
  const order = world.market_orders[orderIndex];
  const { buyer_id, quantity } = await request.json();
  if (order.seller_id === buyer_id) {
    return errorResponse("Cannot buy your own order", 400);
  }
  if (quantity > order.quantity) {
    return errorResponse("Not enough quantity available");
  }
  const buyer = await getJson(env.BUCKET, `players/${buyer_id}.json`);
  if (!buyer) {
    return errorResponse("Buyer not found", 404);
  }
  const totalCost = quantity * order.price_per_unit;
  if (buyer.money < totalCost) {
    return errorResponse(`Insufficient funds. Need ${totalCost}, have ${buyer.money}`, 400);
  }
  buyer.money -= totalCost;
  order.quantity -= quantity;
  if (!order.seller_id.startsWith("npc_")) {
    const seller = await getJson(env.BUCKET, `players/${order.seller_id}.json`);
    if (seller) {
      seller.money += totalCost;
      await putJson(env.BUCKET, `players/${order.seller_id}.json`, seller);
    }
  }
  await putJson(env.BUCKET, `players/${buyer_id}.json`, buyer);
  if (order.quantity <= 0) {
    world.market_orders.splice(orderIndex, 1);
    console.log(`[SEED] Market order completed: ${orderId}`);
  }
  world.version++;
  await putJson(env.BUCKET, "world/data.json", world);
  console.log(`[SEED] Market buy: ${buyer_id} bought ${quantity}x ${order.item_name} for ${totalCost}`);
  return jsonResponse({
    success: true,
    remaining: order.quantity,
    total_cost: totalCost,
    new_balance: buyer.money
  });
}
__name(handleBuyMarketOrder, "handleBuyMarketOrder");
async function handleDeleteMarketOrder(env, orderId, request) {
  const world = await getWorldData(env.BUCKET);
  const orderIndex = world.market_orders.findIndex((o) => o.id === orderId);
  if (orderIndex === -1) {
    return errorResponse("Order not found", 404);
  }
  const order = world.market_orders[orderIndex];
  const { seller_id } = await request.json();
  if (order.seller_id !== seller_id) {
    return errorResponse("Not authorized", 403);
  }
  world.market_orders.splice(orderIndex, 1);
  world.version++;
  await putJson(env.BUCKET, "world/data.json", world);
  console.log(`[SEED] Market order cancelled: ${orderId}`);
  return jsonResponse({ success: true });
}
__name(handleDeleteMarketOrder, "handleDeleteMarketOrder");
async function handleGetMarketOrders(env, url) {
  const world = await getWorldData(env.BUCKET);
  let orders = world.market_orders;
  const airportIdent = url.searchParams.get("airport_ident");
  const itemId = url.searchParams.get("item_id");
  const sellerId = url.searchParams.get("seller_id");
  if (airportIdent) {
    orders = orders.filter((o) => o.airport_ident === airportIdent);
  }
  if (itemId) {
    orders = orders.filter((o) => o.item_id === itemId);
  }
  if (sellerId) {
    orders = orders.filter((o) => o.seller_id === sellerId);
  }
  return jsonResponse(orders);
}
__name(handleGetMarketOrders, "handleGetMarketOrders");
async function handleCreatePlayerAircraft(env, playerId, request) {
  const player = await getJson(env.BUCKET, `players/${playerId}.json`);
  if (!player) {
    return errorResponse("Player not found", 404);
  }
  const aircraftData = await request.json();
  const aircraft = {
    ...aircraftData,
    id: crypto.randomUUID(),
    owner_id: playerId
  };
  await putJson(env.BUCKET, `aircraft/${playerId}/${aircraft.id}.json`, aircraft);
  console.log(`[SEED] Aircraft added to player ${playerId}: ${aircraft.registration}`);
  return jsonResponse(aircraft, 201);
}
__name(handleCreatePlayerAircraft, "handleCreatePlayerAircraft");
async function handleGetAirportInventory(env, icao) {
  const world = await getWorldData(env.BUCKET);
  const inventory = world.airport_inventories[icao] || [];
  return jsonResponse(inventory);
}
__name(handleGetAirportInventory, "handleGetAirportInventory");
async function handleUpdateAirportInventory(env, icao, request) {
  const world = await getWorldData(env.BUCKET);
  const inventory = await request.json();
  world.airport_inventories[icao] = inventory;
  world.version++;
  await putJson(env.BUCKET, "world/data.json", world);
  console.log(`[SEED] Airport inventory updated: ${icao}`);
  return jsonResponse({ success: true, icao, items: inventory.length });
}
__name(handleUpdateAirportInventory, "handleUpdateAirportInventory");
async function handleGetPlayerTrust(env, playerId) {
  const trust = await getPlayerTrust(env.BUCKET, playerId);
  return jsonResponse(trust);
}
__name(handleGetPlayerTrust, "handleGetPlayerTrust");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    console.log(`[SEED] ${method} ${path}`);
    try {
      const auth = validateRequest(request);
      if (!auth.valid) {
        console.log(`[SEED] Auth failed: ${auth.error}`);
        return errorResponse(auth.error || "Unauthorized", 401);
      }
      if (path === "/ping" && method === "GET") {
        return handlePing(env);
      }
      if (path === "/world" && method === "GET") {
        return handleGetWorld(env);
      }
      if (path === "/players" && method === "POST") {
        return handleCreatePlayer(env, request);
      }
      const playerMatch = path.match(/^\/players\/([^/]+)$/);
      if (playerMatch) {
        const playerId = playerMatch[1];
        if (method === "GET")
          return handleGetPlayer(env, playerId);
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
        if (method === "GET")
          return handleGetPlayerAircraft(env, targetPlayerId);
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
      if (path === "/missions" && method === "POST") {
        if (!auth.playerId) {
          return errorResponse("Player ID required", 400);
        }
        return handleCreateMission(env, auth.playerId, request);
      }
      const missionCompleteMatch = path.match(/^\/missions\/([^/]+)\/complete$/);
      if (missionCompleteMatch && method === "POST") {
        if (!auth.playerId) {
          return errorResponse("Player ID required", 400);
        }
        return handleCompleteMission(env, missionCompleteMatch[1], auth.playerId, request);
      }
      const missionActiveMatch = path.match(/^\/missions\/active\/([^/]+)$/);
      if (missionActiveMatch && method === "GET") {
        return handleGetActiveMission(env, missionActiveMatch[1]);
      }
      const aircraftMatch = path.match(/^\/aircraft\/([^/]+)$/);
      if (aircraftMatch && method === "PUT") {
        return handleUpdateAircraft(env, aircraftMatch[1], request, auth.playerId);
      }
      const refuelMatch = path.match(/^\/aircraft\/([^/]+)\/refuel$/);
      if (refuelMatch && method === "POST") {
        if (!auth.playerId) {
          return errorResponse("Player ID required", 400);
        }
        return handleRefuel(env, refuelMatch[1], auth.playerId, request);
      }
      if (path === "/companies" && method === "POST") {
        return handleCreateCompany(env, request);
      }
      const companyMatch = path.match(/^\/companies\/([^/]+)$/);
      if (companyMatch && method === "PUT") {
        return handleUpdateCompany(env, companyMatch[1], request);
      }
      if (path === "/market/orders") {
        if (method === "GET")
          return handleGetMarketOrders(env, url);
        if (method === "POST")
          return handlePostMarketOrder(env, request);
      }
      const marketBuyMatch = path.match(/^\/market\/orders\/([^/]+)\/buy$/);
      if (marketBuyMatch && method === "POST") {
        return handleBuyMarketOrder(env, marketBuyMatch[1], request);
      }
      const marketDeleteMatch = path.match(/^\/market\/orders\/([^/]+)$/);
      if (marketDeleteMatch && method === "DELETE") {
        return handleDeleteMarketOrder(env, marketDeleteMatch[1], request);
      }
      const inventoryMatch = path.match(/^\/world\/inventories\/([^/]+)$/);
      if (inventoryMatch) {
        const icao = inventoryMatch[1];
        if (method === "GET")
          return handleGetAirportInventory(env, icao);
        if (method === "PUT")
          return handleUpdateAirportInventory(env, icao, request);
      }
      return errorResponse("Not found", 404);
    } catch (e) {
      console.error("[SEED] Error:", e);
      return errorResponse("Internal server error", 500);
    }
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
