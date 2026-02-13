/**
 * Item Icon Map — imports all SVGs as raw text (via svgTextPlugin in build.js)
 * Maps icon_path values from items.json to embedded SVG strings.
 * Rendered inline in Coherent GT (no data URLs, no <img> tags).
 */

// ═══════════════════════════════════════════════════════════
// T0 — Raw Materials (37)
// ═══════════════════════════════════════════════════════════

// Minerals
import aluminum_ore from "../Assets/icons/items/t0/aluminum_ore.svg";
import clay from "../Assets/icons/items/t0/clay.svg";
import coal from "../Assets/icons/items/t0/coal.svg";
import copper_ore from "../Assets/icons/items/t0/copper_ore.svg";
import granite from "../Assets/icons/items/t0/granite.svg";
import graphite from "../Assets/icons/items/t0/graphite.svg";
import iron_ore from "../Assets/icons/items/t0/iron_ore.svg";
import limestone from "../Assets/icons/items/t0/limestone.svg";
import phosphate from "../Assets/icons/items/t0/phosphate.svg";
import rare_earth from "../Assets/icons/items/t0/rare_earth.svg";
import salt from "../Assets/icons/items/t0/salt.svg";
import sand from "../Assets/icons/items/t0/sand.svg";
import silicon from "../Assets/icons/items/t0/silicon.svg";
import stone from "../Assets/icons/items/t0/stone.svg";
import sulfur from "../Assets/icons/items/t0/sulfur.svg";
import titanium_ore from "../Assets/icons/items/t0/titanium_ore.svg";
import uranium_ore from "../Assets/icons/items/t0/uranium_ore.svg";

// Food
import cocoa from "../Assets/icons/items/t0/cocoa.svg";
import fish from "../Assets/icons/items/t0/fish.svg";
import fruits from "../Assets/icons/items/t0/fruits.svg";
import meat from "../Assets/icons/items/t0/meat.svg";
import milk from "../Assets/icons/items/t0/milk.svg";
import sugar from "../Assets/icons/items/t0/sugar.svg";
import vanilla from "../Assets/icons/items/t0/vanilla.svg";
import vegetables from "../Assets/icons/items/t0/vegetables.svg";
import wheat from "../Assets/icons/items/t0/wheat.svg";
import water from "../Assets/icons/items/t0/water.svg";
import pepper from "../Assets/icons/items/t0/pepper.svg";
import egg from "../Assets/icons/items/t0/egg.svg";
import salad from "../Assets/icons/items/t0/salad.svg";
import chili from "../Assets/icons/items/t0/chili.svg";

// Organic
import biomass from "../Assets/icons/items/t0/biomass.svg";
import cotton from "../Assets/icons/items/t0/cotton.svg";
import crude_oil from "../Assets/icons/items/t0/crude_oil.svg";
import natural_gas from "../Assets/icons/items/t0/natural_gas.svg";
import rubber from "../Assets/icons/items/t0/rubber.svg";
import wood from "../Assets/icons/items/t0/wood.svg";

// ═══════════════════════════════════════════════════════════
// T1 — Processed Items (39)
// ═══════════════════════════════════════════════════════════

// Metals & Construction
import aluminum_ingot from "../Assets/icons/items/t1/aluminum_ingot.svg";
import bricks from "../Assets/icons/items/t1/bricks.svg";
import cement from "../Assets/icons/items/t1/cement.svg";
import copper_ingot from "../Assets/icons/items/t1/copper_ingot.svg";
import glass from "../Assets/icons/items/t1/glass.svg";
import marble_slabs from "../Assets/icons/items/t1/marble_slabs.svg";
import planks from "../Assets/icons/items/t1/planks.svg";
import rubber_sheets from "../Assets/icons/items/t1/rubber_sheets.svg";
import silicon_wafers from "../Assets/icons/items/t1/silicon_wafers.svg";
import steel_ingot from "../Assets/icons/items/t1/steel_ingot.svg";
import stone_bricks from "../Assets/icons/items/t1/stone_bricks.svg";
import titanium_ingot from "../Assets/icons/items/t1/titanium_ingot.svg";

// Food
import bread from "../Assets/icons/items/t1/bread.svg";
import butter from "../Assets/icons/items/t1/butter.svg";
import cocoa_powder from "../Assets/icons/items/t1/cocoa_powder.svg";
import dried_fish from "../Assets/icons/items/t1/dried_fish.svg";
import flour from "../Assets/icons/items/t1/flour.svg";
import fruit_jam from "../Assets/icons/items/t1/fruit_jam.svg";
import salted_meat from "../Assets/icons/items/t1/salted_meat.svg";
import sugar_syrup from "../Assets/icons/items/t1/sugar_syrup.svg";
import vanilla_extract from "../Assets/icons/items/t1/vanilla_extract.svg";
import vegetable_stew from "../Assets/icons/items/t1/vegetable_stew.svg";

// Culinary (new)
import peppered_meat from "../Assets/icons/items/t1/peppered_meat.svg";
import meat_omelette from "../Assets/icons/items/t1/meat_omelette.svg";
import salted_omelette from "../Assets/icons/items/t1/salted_omelette.svg";
import pepper_omelette from "../Assets/icons/items/t1/pepper_omelette.svg";
import fish_omelette from "../Assets/icons/items/t1/fish_omelette.svg";
import meat_salad from "../Assets/icons/items/t1/meat_salad.svg";
import seafood_salad from "../Assets/icons/items/t1/seafood_salad.svg";
import vanilla_salad from "../Assets/icons/items/t1/vanilla_salad.svg";
import chili_meat from "../Assets/icons/items/t1/chili_meat.svg";

// Fuels & Chemistry
import biofuel from "../Assets/icons/items/t1/biofuel.svg";
import charcoal from "../Assets/icons/items/t1/charcoal.svg";
import compressed_gas from "../Assets/icons/items/t1/compressed_gas.svg";
import diesel from "../Assets/icons/items/t1/diesel.svg";
import fabric from "../Assets/icons/items/t1/fabric.svg";
import fertilizer from "../Assets/icons/items/t1/fertilizer.svg";
import sulfuric_acid from "../Assets/icons/items/t1/sulfuric_acid.svg";
import uranium_pellets from "../Assets/icons/items/t1/uranium_pellets.svg";

// ═══════════════════════════════════════════════════════════
// Personnel (3 default icons)
// ═══════════════════════════════════════════════════════════

import worker_available from "../Assets/icons/personnel/worker_available.svg";
import engineer_available from "../Assets/icons/personnel/engineer_available.svg";
import pilot_available from "../Assets/icons/personnel/pilot_available.svg";

/** Maps icon_path (from items.json) → raw SVG string */
export const ITEM_ICON_MAP: Record<string, string> = {
  // T0 — Raw Materials
  "Assets/icons/items/t0/aluminum_ore.svg": aluminum_ore,
  "Assets/icons/items/t0/clay.svg": clay,
  "Assets/icons/items/t0/coal.svg": coal,
  "Assets/icons/items/t0/copper_ore.svg": copper_ore,
  "Assets/icons/items/t0/granite.svg": granite,
  "Assets/icons/items/t0/graphite.svg": graphite,
  "Assets/icons/items/t0/iron_ore.svg": iron_ore,
  "Assets/icons/items/t0/limestone.svg": limestone,
  "Assets/icons/items/t0/phosphate.svg": phosphate,
  "Assets/icons/items/t0/rare_earth.svg": rare_earth,
  "Assets/icons/items/t0/salt.svg": salt,
  "Assets/icons/items/t0/sand.svg": sand,
  "Assets/icons/items/t0/silicon.svg": silicon,
  "Assets/icons/items/t0/stone.svg": stone,
  "Assets/icons/items/t0/sulfur.svg": sulfur,
  "Assets/icons/items/t0/titanium_ore.svg": titanium_ore,
  "Assets/icons/items/t0/uranium_ore.svg": uranium_ore,
  "Assets/icons/items/t0/cocoa.svg": cocoa,
  "Assets/icons/items/t0/fish.svg": fish,
  "Assets/icons/items/t0/fruits.svg": fruits,
  "Assets/icons/items/t0/meat.svg": meat,
  "Assets/icons/items/t0/milk.svg": milk,
  "Assets/icons/items/t0/sugar.svg": sugar,
  "Assets/icons/items/t0/vanilla.svg": vanilla,
  "Assets/icons/items/t0/vegetables.svg": vegetables,
  "Assets/icons/items/t0/wheat.svg": wheat,
  "Assets/icons/items/t0/water.svg": water,
  "Assets/icons/items/t0/pepper.svg": pepper,
  "Assets/icons/items/t0/egg.svg": egg,
  "Assets/icons/items/t0/salad.svg": salad,
  "Assets/icons/items/t0/chili.svg": chili,
  "Assets/icons/items/t0/biomass.svg": biomass,
  "Assets/icons/items/t0/cotton.svg": cotton,
  "Assets/icons/items/t0/crude_oil.svg": crude_oil,
  "Assets/icons/items/t0/natural_gas.svg": natural_gas,
  "Assets/icons/items/t0/rubber.svg": rubber,
  "Assets/icons/items/t0/wood.svg": wood,

  // T1 — Processed Items
  "Assets/icons/items/t1/aluminum_ingot.svg": aluminum_ingot,
  "Assets/icons/items/t1/bricks.svg": bricks,
  "Assets/icons/items/t1/cement.svg": cement,
  "Assets/icons/items/t1/copper_ingot.svg": copper_ingot,
  "Assets/icons/items/t1/glass.svg": glass,
  "Assets/icons/items/t1/marble_slabs.svg": marble_slabs,
  "Assets/icons/items/t1/planks.svg": planks,
  "Assets/icons/items/t1/rubber_sheets.svg": rubber_sheets,
  "Assets/icons/items/t1/silicon_wafers.svg": silicon_wafers,
  "Assets/icons/items/t1/steel_ingot.svg": steel_ingot,
  "Assets/icons/items/t1/stone_bricks.svg": stone_bricks,
  "Assets/icons/items/t1/titanium_ingot.svg": titanium_ingot,
  "Assets/icons/items/t1/bread.svg": bread,
  "Assets/icons/items/t1/butter.svg": butter,
  "Assets/icons/items/t1/cocoa_powder.svg": cocoa_powder,
  "Assets/icons/items/t1/dried_fish.svg": dried_fish,
  "Assets/icons/items/t1/flour.svg": flour,
  "Assets/icons/items/t1/fruit_jam.svg": fruit_jam,
  "Assets/icons/items/t1/salted_meat.svg": salted_meat,
  "Assets/icons/items/t1/sugar_syrup.svg": sugar_syrup,
  "Assets/icons/items/t1/vanilla_extract.svg": vanilla_extract,
  "Assets/icons/items/t1/vegetable_stew.svg": vegetable_stew,
  "Assets/icons/items/t1/peppered_meat.svg": peppered_meat,
  "Assets/icons/items/t1/meat_omelette.svg": meat_omelette,
  "Assets/icons/items/t1/salted_omelette.svg": salted_omelette,
  "Assets/icons/items/t1/pepper_omelette.svg": pepper_omelette,
  "Assets/icons/items/t1/fish_omelette.svg": fish_omelette,
  "Assets/icons/items/t1/meat_salad.svg": meat_salad,
  "Assets/icons/items/t1/seafood_salad.svg": seafood_salad,
  "Assets/icons/items/t1/vanilla_salad.svg": vanilla_salad,
  "Assets/icons/items/t1/chili_meat.svg": chili_meat,
  "Assets/icons/items/t1/biofuel.svg": biofuel,
  "Assets/icons/items/t1/charcoal.svg": charcoal,
  "Assets/icons/items/t1/compressed_gas.svg": compressed_gas,
  "Assets/icons/items/t1/diesel.svg": diesel,
  "Assets/icons/items/t1/fabric.svg": fabric,
  "Assets/icons/items/t1/fertilizer.svg": fertilizer,
  "Assets/icons/items/t1/sulfuric_acid.svg": sulfuric_acid,
  "Assets/icons/items/t1/uranium_pellets.svg": uranium_pellets,

  // Personnel
  "Assets/icons/personnel/worker_available.svg": worker_available,
  "Assets/icons/personnel/engineer_available.svg": engineer_available,
  "Assets/icons/personnel/pilot_available.svg": pilot_available,
};
