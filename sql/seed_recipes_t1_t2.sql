-- =====================================================
-- SEED: RECIPES T1-T2
-- =====================================================
-- Description: Basic and intermediate recipes
-- T1: 2 ingredients (simple production)
-- T2: 2-3 ingredients (intermediate production)
-- =====================================================

-- =====================================================
-- T1 RECIPES (2 ingredients, simple production)
-- =====================================================

-- Food Recipes T1 (10 recipes)
-- Recipe: Dried Fish
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Dried Fish',
    1,
    (SELECT id FROM game.items WHERE name = 'Dried Fish'),
    10,
    2.0,
    10,
    'Preserve fish with salt for long storage'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Bread
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Bread',
    1,
    (SELECT id FROM game.items WHERE name = 'Bread'),
    20,
    1.5,
    10,
    'Simple bread from wheat flour'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Salted Meat
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Salted Meat',
    1,
    (SELECT id FROM game.items WHERE name = 'Salted Meat'),
    8,
    3.0,
    10,
    'Preserved meat with salt'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Vegetable Stew
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Vegetable Stew',
    1,
    (SELECT id FROM game.items WHERE name = 'Vegetable Stew'),
    15,
    2.0,
    10,
    'Basic vegetable stew'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Fruit Jam
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Fruit Jam',
    1,
    (SELECT id FROM game.items WHERE name = 'Fruit Jam'),
    12,
    3.0,
    10,
    'Sweet fruit preserve'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Sugar Syrup
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Sugar Syrup',
    1,
    (SELECT id FROM game.items WHERE name = 'Sugar Syrup'),
    10,
    1.0,
    10,
    'Refined sugar solution'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Butter
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Butter',
    1,
    (SELECT id FROM game.items WHERE name = 'Butter'),
    5,
    2.0,
    10,
    'Churned butter from milk'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Flour
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Flour',
    1,
    (SELECT id FROM game.items WHERE name = 'Flour'),
    25,
    1.0,
    10,
    'Milled wheat flour'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Cocoa Powder
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Cocoa Powder',
    1,
    (SELECT id FROM game.items WHERE name = 'Cocoa Powder'),
    8,
    2.0,
    10,
    'Ground cocoa beans'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Vanilla Extract
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Vanilla Extract',
    1,
    (SELECT id FROM game.items WHERE name = 'Vanilla Extract'),
    3,
    4.0,
    10,
    'Concentrated vanilla essence'
) ON CONFLICT (name) DO NOTHING;

-- Construction Recipes T1 (10 recipes)
-- Recipe: Steel Ingot
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Steel Ingot',
    1,
    (SELECT id FROM game.items WHERE name = 'Steel Ingot'),
    5,
    4.0,
    10,
    'Refined steel from iron ore'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Copper Ingot
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Copper Ingot',
    1,
    (SELECT id FROM game.items WHERE name = 'Copper Ingot'),
    5,
    3.0,
    10,
    'Pure copper ingots'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Planks
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Planks',
    1,
    (SELECT id FROM game.items WHERE name = 'Planks'),
    10,
    1.0,
    10,
    'Processed wooden planks'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Stone Bricks
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Stone Bricks',
    1,
    (SELECT id FROM game.items WHERE name = 'Stone Bricks'),
    8,
    2.0,
    10,
    'Cut stone blocks'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Glass
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Glass',
    1,
    (SELECT id FROM game.items WHERE name = 'Glass'),
    6,
    3.0,
    10,
    'Melted sand into glass'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Bricks
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Bricks',
    1,
    (SELECT id FROM game.items WHERE name = 'Bricks'),
    12,
    2.0,
    10,
    'Fired clay bricks'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Cement
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Cement',
    1,
    (SELECT id FROM game.items WHERE name = 'Cement'),
    10,
    2.5,
    10,
    'Processed limestone cement'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Aluminum Ingot
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Aluminum Ingot',
    1,
    (SELECT id FROM game.items WHERE name = 'Aluminum Ingot'),
    4,
    5.0,
    10,
    'Refined aluminum from ore'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Titanium Ingot
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Titanium Ingot',
    1,
    (SELECT id FROM game.items WHERE name = 'Titanium Ingot'),
    2,
    8.0,
    10,
    'High-grade titanium ingots'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Marble Slabs
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Marble Slabs',
    1,
    (SELECT id FROM game.items WHERE name = 'Marble Slabs'),
    4,
    3.0,
    10,
    'Polished marble slabs'
) ON CONFLICT (name) DO NOTHING;

-- Energy Recipes T1 (5 recipes)
-- Recipe: Diesel
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Diesel',
    1,
    (SELECT id FROM game.items WHERE name = 'Diesel'),
    8,
    3.0,
    10,
    'Refined diesel fuel'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Charcoal
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Charcoal',
    1,
    (SELECT id FROM game.items WHERE name = 'Charcoal'),
    6,
    4.0,
    10,
    'Processed coal for heating'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Compressed Gas
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Compressed Gas',
    1,
    (SELECT id FROM game.items WHERE name = 'Compressed Gas'),
    5,
    2.0,
    10,
    'Liquefied natural gas'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Biofuel
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Biofuel',
    1,
    (SELECT id FROM game.items WHERE name = 'Biofuel'),
    7,
    6.0,
    10,
    'Organic fuel from biomass'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Uranium Pellets
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Uranium Pellets',
    1,
    (SELECT id FROM game.items WHERE name = 'Uranium Pellets'),
    1,
    12.0,
    10,
    'Enriched uranium for reactors'
) ON CONFLICT (name) DO NOTHING;

-- Chemical/Industrial Recipes T1 (5 recipes)
-- Recipe: Rubber Sheets
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Rubber Sheets',
    1,
    (SELECT id FROM game.items WHERE name = 'Rubber Sheets'),
    8,
    2.0,
    10,
    'Vulcanized rubber sheets'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Fabric
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Fabric',
    1,
    (SELECT id FROM game.items WHERE name = 'Fabric'),
    12,
    1.5,
    10,
    'Woven cotton fabric'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Silicon Wafers
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Silicon Wafers',
    1,
    (SELECT id FROM game.items WHERE name = 'Silicon Wafers'),
    4,
    6.0,
    10,
    'Purified silicon for electronics'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Sulfuric Acid
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Sulfuric Acid',
    1,
    (SELECT id FROM game.items WHERE name = 'Sulfuric Acid'),
    6,
    3.0,
    10,
    'Industrial grade acid'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Fertilizer
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Fertilizer',
    1,
    (SELECT id FROM game.items WHERE name = 'Fertilizer'),
    10,
    2.0,
    10,
    'Phosphate-based fertilizer'
) ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- T1 RECIPE INGREDIENTS
-- =====================================================

-- Food T1 ingredients
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Dried Fish'), (SELECT id FROM game.items WHERE name = 'Raw Fish'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Dried Fish'), (SELECT id FROM game.items WHERE name = 'Raw Salt'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Bread'), (SELECT id FROM game.items WHERE name = 'Raw Wheat'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Bread'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Salted Meat'), (SELECT id FROM game.items WHERE name = 'Raw Meat'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Salted Meat'), (SELECT id FROM game.items WHERE name = 'Raw Salt'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Vegetable Stew'), (SELECT id FROM game.items WHERE name = 'Raw Vegetables'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Vegetable Stew'), (SELECT id FROM game.items WHERE name = 'Water'), 2, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Fruit Jam'), (SELECT id FROM game.items WHERE name = 'Raw Fruits'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Fruit Jam'), (SELECT id FROM game.items WHERE name = 'Raw Sugar'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Sugar Syrup'), (SELECT id FROM game.items WHERE name = 'Raw Sugar'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Sugar Syrup'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Butter'), (SELECT id FROM game.items WHERE name = 'Raw Milk'), 4, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Butter'), (SELECT id FROM game.items WHERE name = 'Raw Salt'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Flour'), (SELECT id FROM game.items WHERE name = 'Raw Wheat'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Flour'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Cocoa Powder'), (SELECT id FROM game.items WHERE name = 'Raw Cocoa'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Cocoa Powder'), (SELECT id FROM game.items WHERE name = 'Raw Sugar'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Vanilla Extract'), (SELECT id FROM game.items WHERE name = 'Raw Vanilla'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Vanilla Extract'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

-- Construction T1 ingredients
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Steel Ingot'), (SELECT id FROM game.items WHERE name = 'Iron Ore'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Steel Ingot'), (SELECT id FROM game.items WHERE name = 'Coal'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Copper Ingot'), (SELECT id FROM game.items WHERE name = 'Copper Ore'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Copper Ingot'), (SELECT id FROM game.items WHERE name = 'Coal'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Planks'), (SELECT id FROM game.items WHERE name = 'Raw Wood'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Planks'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Stone Bricks'), (SELECT id FROM game.items WHERE name = 'Raw Stone'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Stone Bricks'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Glass'), (SELECT id FROM game.items WHERE name = 'Sand'), 4, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Glass'), (SELECT id FROM game.items WHERE name = 'Coal'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Bricks'), (SELECT id FROM game.items WHERE name = 'Clay'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Bricks'), (SELECT id FROM game.items WHERE name = 'Coal'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Cement'), (SELECT id FROM game.items WHERE name = 'Limestone'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Cement'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Aluminum Ingot'), (SELECT id FROM game.items WHERE name = 'Aluminum Ore'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Aluminum Ingot'), (SELECT id FROM game.items WHERE name = 'Coal'), 2, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Titanium Ingot'), (SELECT id FROM game.items WHERE name = 'Titanium Ore'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Titanium Ingot'), (SELECT id FROM game.items WHERE name = 'Coal'), 2, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Marble Slabs'), (SELECT id FROM game.items WHERE name = 'Granite'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Marble Slabs'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

-- Energy T1 ingredients
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Diesel'), (SELECT id FROM game.items WHERE name = 'Crude Oil'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Diesel'), (SELECT id FROM game.items WHERE name = 'Coal'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Charcoal'), (SELECT id FROM game.items WHERE name = 'Coal'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Charcoal'), (SELECT id FROM game.items WHERE name = 'Raw Wood'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Compressed Gas'), (SELECT id FROM game.items WHERE name = 'Natural Gas'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Compressed Gas'), (SELECT id FROM game.items WHERE name = 'Coal'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Biofuel'), (SELECT id FROM game.items WHERE name = 'Biomass'), 4, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Biofuel'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Uranium Pellets'), (SELECT id FROM game.items WHERE name = 'Uranium Ore'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Uranium Pellets'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

-- Chemical/Industrial T1 ingredients
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Rubber Sheets'), (SELECT id FROM game.items WHERE name = 'Raw Rubber'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Rubber Sheets'), (SELECT id FROM game.items WHERE name = 'Sulfur'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Fabric'), (SELECT id FROM game.items WHERE name = 'Cotton'), 4, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Fabric'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Silicon Wafers'), (SELECT id FROM game.items WHERE name = 'Raw Silicon'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Silicon Wafers'), (SELECT id FROM game.items WHERE name = 'Coal'), 2, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Sulfuric Acid'), (SELECT id FROM game.items WHERE name = 'Sulfur'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Sulfuric Acid'), (SELECT id FROM game.items WHERE name = 'Water'), 2, 1);

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Fertilizer'), (SELECT id FROM game.items WHERE name = 'Phosphate'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Fertilizer'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

-- =====================================================
-- T2 RECIPES (2-3 ingredients, intermediate production)
-- =====================================================

-- Food T2 (10 recipes)
-- Recipe: Quality Bread
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Quality Bread',
    2,
    (SELECT id FROM game.items WHERE name = 'Quality Bread'),
    15,
    2.5,
    10,
    'High-quality artisan bread'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Smoked Fish
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Smoked Fish',
    2,
    (SELECT id FROM game.items WHERE name = 'Smoked Fish'),
    8,
    4.0,
    10,
    'Premium smoked fish'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Chocolate Bar
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Chocolate Bar',
    2,
    (SELECT id FROM game.items WHERE name = 'Chocolate Bar'),
    6,
    3.0,
    10,
    'Rich chocolate bar'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Fruit Cake
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Fruit Cake',
    2,
    (SELECT id FROM game.items WHERE name = 'Fruit Cake'),
    5,
    4.0,
    10,
    'Dense fruit cake'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Cheese
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Cheese',
    2,
    (SELECT id FROM game.items WHERE name = 'Cheese'),
    4,
    8.0,
    10,
    'Aged cheese'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Sausage
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Sausage',
    2,
    (SELECT id FROM game.items WHERE name = 'Sausage'),
    10,
    3.0,
    10,
    'Cured meat sausage'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Vegetable Soup
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Vegetable Soup',
    2,
    (SELECT id FROM game.items WHERE name = 'Vegetable Soup'),
    12,
    2.0,
    10,
    'Rich vegetable soup with bread'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Pastry
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Pastry',
    2,
    (SELECT id FROM game.items WHERE name = 'Pastry'),
    8,
    2.0,
    10,
    'Buttery pastries'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Dried Fruit
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Dried Fruit',
    2,
    (SELECT id FROM game.items WHERE name = 'Dried Fruit'),
    10,
    6.0,
    10,
    'Sun-dried fruits'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Honey Bread
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Honey Bread',
    2,
    (SELECT id FROM game.items WHERE name = 'Honey Bread'),
    8,
    3.0,
    10,
    'Sweet honey bread'
) ON CONFLICT (name) DO NOTHING;

-- Construction T2 (10 recipes)
-- Recipe: Reinforced Steel
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Reinforced Steel',
    2,
    (SELECT id FROM game.items WHERE name = 'Reinforced Steel'),
    4,
    6.0,
    10,
    'High-strength steel beams'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Wire Cable
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Wire Cable',
    2,
    (SELECT id FROM game.items WHERE name = 'Wire Cable'),
    12,
    2.0,
    10,
    'Copper wire cables'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Wooden Beams
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Wooden Beams',
    2,
    (SELECT id FROM game.items WHERE name = 'Wooden Beams'),
    6,
    3.0,
    10,
    'Large structural beams'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Concrete Blocks
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Concrete Blocks',
    2,
    (SELECT id FROM game.items WHERE name = 'Concrete Blocks'),
    8,
    4.0,
    10,
    'Heavy concrete blocks'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Window Panes
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Window Panes',
    2,
    (SELECT id FROM game.items WHERE name = 'Window Panes'),
    5,
    3.0,
    10,
    'Glass window frames'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Insulation
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Insulation',
    2,
    (SELECT id FROM game.items WHERE name = 'Insulation'),
    10,
    2.0,
    10,
    'Rubber insulation material'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Steel Pipes
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Steel Pipes',
    2,
    (SELECT id FROM game.items WHERE name = 'Steel Pipes'),
    6,
    4.0,
    10,
    'Steel piping'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Aluminum Frame
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Aluminum Frame',
    2,
    (SELECT id FROM game.items WHERE name = 'Aluminum Frame'),
    4,
    5.0,
    10,
    'Lightweight aluminum frames'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Circuit Board
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Circuit Board',
    2,
    (SELECT id FROM game.items WHERE name = 'Circuit Board'),
    3,
    8.0,
    10,
    'Basic circuit boards'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Titanium Plates
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Titanium Plates',
    2,
    (SELECT id FROM game.items WHERE name = 'Titanium Plates'),
    2,
    10.0,
    10,
    'Armor-grade titanium'
) ON CONFLICT (name) DO NOTHING;

-- Energy T2 (5 recipes)
-- Recipe: Jet Fuel
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Jet Fuel',
    2,
    (SELECT id FROM game.items WHERE name = 'Jet Fuel'),
    6,
    4.0,
    10,
    'High-grade aviation fuel'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Heating Oil
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Heating Oil',
    2,
    (SELECT id FROM game.items WHERE name = 'Heating Oil'),
    8,
    3.0,
    10,
    'Refined heating oil'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Premium Biofuel
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Premium Biofuel',
    2,
    (SELECT id FROM game.items WHERE name = 'Premium Biofuel'),
    5,
    8.0,
    10,
    'High-efficiency biofuel'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Rocket Propellant
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Rocket Propellant',
    2,
    (SELECT id FROM game.items WHERE name = 'Rocket Propellant'),
    2,
    10.0,
    10,
    'Specialized rocket fuel'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Nuclear Fuel Rod
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Nuclear Fuel Rod',
    2,
    (SELECT id FROM game.items WHERE name = 'Nuclear Fuel Rod'),
    1,
    24.0,
    10,
    'Enriched nuclear fuel'
) ON CONFLICT (name) DO NOTHING;

-- Chemical/Medical T2 (5 recipes)
-- Recipe: Plastic Sheets
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Plastic Sheets',
    2,
    (SELECT id FROM game.items WHERE name = 'Plastic Sheets'),
    8,
    3.0,
    10,
    'Industrial plastic sheets'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Medical Bandages
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Medical Bandages',
    2,
    (SELECT id FROM game.items WHERE name = 'Medical Bandages'),
    15,
    2.0,
    10,
    'Sterilized fabric bandages'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Cleaning Solution
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Cleaning Solution',
    2,
    (SELECT id FROM game.items WHERE name = 'Cleaning Solution'),
    10,
    2.0,
    10,
    'Industrial cleaner'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Paint
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Paint',
    2,
    (SELECT id FROM game.items WHERE name = 'Paint'),
    8,
    2.5,
    10,
    'Colored paint'
) ON CONFLICT (name) DO NOTHING;

-- Recipe: Adhesive
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Adhesive',
    2,
    (SELECT id FROM game.items WHERE name = 'Adhesive'),
    6,
    3.0,
    10,
    'Strong industrial glue'
) ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- T2 RECIPE INGREDIENTS
-- =====================================================

-- Food T2 ingredients
-- Quality Bread: Flour + Butter + Water
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Quality Bread'), (SELECT id FROM game.items WHERE name = 'Flour'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Quality Bread'), (SELECT id FROM game.items WHERE name = 'Butter'), 1, 1),
    ((SELECT id FROM game.recipes WHERE name = 'Quality Bread'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 2);

-- Smoked Fish: Dried Fish + Raw Wood (smoke) + Raw Salt
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Smoked Fish'), (SELECT id FROM game.items WHERE name = 'Dried Fish'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Smoked Fish'), (SELECT id FROM game.items WHERE name = 'Raw Wood'), 1, 1),
    ((SELECT id FROM game.recipes WHERE name = 'Smoked Fish'), (SELECT id FROM game.items WHERE name = 'Raw Salt'), 1, 2);

-- Chocolate Bar: Cocoa Powder + Sugar Syrup + Butter
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Chocolate Bar'), (SELECT id FROM game.items WHERE name = 'Cocoa Powder'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Chocolate Bar'), (SELECT id FROM game.items WHERE name = 'Sugar Syrup'), 1, 1),
    ((SELECT id FROM game.recipes WHERE name = 'Chocolate Bar'), (SELECT id FROM game.items WHERE name = 'Butter'), 1, 2);

-- Fruit Cake: Flour + Fruit Jam + Sugar Syrup
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Fruit Cake'), (SELECT id FROM game.items WHERE name = 'Flour'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Fruit Cake'), (SELECT id FROM game.items WHERE name = 'Fruit Jam'), 2, 1),
    ((SELECT id FROM game.recipes WHERE name = 'Fruit Cake'), (SELECT id FROM game.items WHERE name = 'Sugar Syrup'), 1, 2);

-- Cheese: Raw Milk + Raw Salt
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Cheese'), (SELECT id FROM game.items WHERE name = 'Raw Milk'), 5, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Cheese'), (SELECT id FROM game.items WHERE name = 'Raw Salt'), 1, 1);

-- Sausage: Salted Meat + Raw Salt
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Sausage'), (SELECT id FROM game.items WHERE name = 'Salted Meat'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Sausage'), (SELECT id FROM game.items WHERE name = 'Raw Salt'), 1, 1);

-- Vegetable Soup: Vegetable Stew + Bread
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Vegetable Soup'), (SELECT id FROM game.items WHERE name = 'Vegetable Stew'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Vegetable Soup'), (SELECT id FROM game.items WHERE name = 'Bread'), 1, 1);

-- Pastry: Flour + Butter + Sugar Syrup
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Pastry'), (SELECT id FROM game.items WHERE name = 'Flour'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Pastry'), (SELECT id FROM game.items WHERE name = 'Butter'), 2, 1),
    ((SELECT id FROM game.recipes WHERE name = 'Pastry'), (SELECT id FROM game.items WHERE name = 'Sugar Syrup'), 1, 2);

-- Dried Fruit: Raw Fruits + Raw Sugar
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Dried Fruit'), (SELECT id FROM game.items WHERE name = 'Raw Fruits'), 4, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Dried Fruit'), (SELECT id FROM game.items WHERE name = 'Raw Sugar'), 1, 1);

-- Honey Bread: Bread + Sugar Syrup + Vanilla Extract
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Honey Bread'), (SELECT id FROM game.items WHERE name = 'Bread'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Honey Bread'), (SELECT id FROM game.items WHERE name = 'Sugar Syrup'), 2, 1),
    ((SELECT id FROM game.recipes WHERE name = 'Honey Bread'), (SELECT id FROM game.items WHERE name = 'Vanilla Extract'), 1, 2);

-- Construction T2 ingredients
-- Reinforced Steel: Steel Ingot + Aluminum Ingot
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Reinforced Steel'), (SELECT id FROM game.items WHERE name = 'Steel Ingot'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Reinforced Steel'), (SELECT id FROM game.items WHERE name = 'Aluminum Ingot'), 1, 1);

-- Wire Cable: Copper Ingot + Rubber Sheets
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Wire Cable'), (SELECT id FROM game.items WHERE name = 'Copper Ingot'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Wire Cable'), (SELECT id FROM game.items WHERE name = 'Rubber Sheets'), 1, 1);

-- Wooden Beams: Planks
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Wooden Beams'), (SELECT id FROM game.items WHERE name = 'Planks'), 4, 0);

-- Concrete Blocks: Cement + Stone Bricks + Water
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Concrete Blocks'), (SELECT id FROM game.items WHERE name = 'Cement'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Concrete Blocks'), (SELECT id FROM game.items WHERE name = 'Stone Bricks'), 2, 1),
    ((SELECT id FROM game.recipes WHERE name = 'Concrete Blocks'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 2);

-- Window Panes: Glass + Aluminum Ingot
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Window Panes'), (SELECT id FROM game.items WHERE name = 'Glass'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Window Panes'), (SELECT id FROM game.items WHERE name = 'Aluminum Ingot'), 1, 1);

-- Insulation: Rubber Sheets + Fabric
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Insulation'), (SELECT id FROM game.items WHERE name = 'Rubber Sheets'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Insulation'), (SELECT id FROM game.items WHERE name = 'Fabric'), 1, 1);

-- Steel Pipes: Steel Ingot
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Steel Pipes'), (SELECT id FROM game.items WHERE name = 'Steel Ingot'), 3, 0);

-- Aluminum Frame: Aluminum Ingot
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Aluminum Frame'), (SELECT id FROM game.items WHERE name = 'Aluminum Ingot'), 3, 0);

-- Circuit Board: Silicon Wafers + Copper Ingot
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Circuit Board'), (SELECT id FROM game.items WHERE name = 'Silicon Wafers'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Circuit Board'), (SELECT id FROM game.items WHERE name = 'Copper Ingot'), 1, 1);

-- Titanium Plates: Titanium Ingot
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Titanium Plates'), (SELECT id FROM game.items WHERE name = 'Titanium Ingot'), 2, 0);

-- Energy T2 ingredients
-- Jet Fuel: Diesel + Crude Oil
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Jet Fuel'), (SELECT id FROM game.items WHERE name = 'Diesel'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Jet Fuel'), (SELECT id FROM game.items WHERE name = 'Crude Oil'), 1, 1);

-- Heating Oil: Diesel + Coal
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Heating Oil'), (SELECT id FROM game.items WHERE name = 'Diesel'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Heating Oil'), (SELECT id FROM game.items WHERE name = 'Coal'), 1, 1);

-- Premium Biofuel: Biofuel + Sulfuric Acid
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Premium Biofuel'), (SELECT id FROM game.items WHERE name = 'Biofuel'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Premium Biofuel'), (SELECT id FROM game.items WHERE name = 'Sulfuric Acid'), 1, 1);

-- Rocket Propellant: Jet Fuel + Sulfuric Acid
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Rocket Propellant'), (SELECT id FROM game.items WHERE name = 'Jet Fuel'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Rocket Propellant'), (SELECT id FROM game.items WHERE name = 'Sulfuric Acid'), 2, 1);

-- Nuclear Fuel Rod: Uranium Pellets + Steel Ingot
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Nuclear Fuel Rod'), (SELECT id FROM game.items WHERE name = 'Uranium Pellets'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Nuclear Fuel Rod'), (SELECT id FROM game.items WHERE name = 'Steel Ingot'), 2, 1);

-- Chemical/Medical T2 ingredients
-- Plastic Sheets: Crude Oil + Sulfuric Acid
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Plastic Sheets'), (SELECT id FROM game.items WHERE name = 'Crude Oil'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Plastic Sheets'), (SELECT id FROM game.items WHERE name = 'Sulfuric Acid'), 1, 1);

-- Medical Bandages: Fabric + Water
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Medical Bandages'), (SELECT id FROM game.items WHERE name = 'Fabric'), 3, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Medical Bandages'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 1);

-- Cleaning Solution: Sulfuric Acid + Water
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Cleaning Solution'), (SELECT id FROM game.items WHERE name = 'Sulfuric Acid'), 1, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Cleaning Solution'), (SELECT id FROM game.items WHERE name = 'Water'), 3, 1);

-- Paint: Crude Oil + Sulfuric Acid + Water
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Paint'), (SELECT id FROM game.items WHERE name = 'Crude Oil'), 1, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Paint'), (SELECT id FROM game.items WHERE name = 'Sulfuric Acid'), 1, 1),
    ((SELECT id FROM game.recipes WHERE name = 'Paint'), (SELECT id FROM game.items WHERE name = 'Water'), 1, 2);

-- Adhesive: Raw Rubber + Sulfuric Acid
INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Adhesive'), (SELECT id FROM game.items WHERE name = 'Raw Rubber'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Adhesive'), (SELECT id FROM game.items WHERE name = 'Sulfuric Acid'), 1, 1);

-- =====================================================
-- VERIFY INSERTION
-- =====================================================

-- Count recipes by tier
SELECT tier, COUNT(*) as count
FROM game.recipes
WHERE tier IN (1, 2)
GROUP BY tier
ORDER BY tier;

-- List all T1-T2 recipes
SELECT
    r.tier,
    r.name,
    r.production_time_hours,
    r.result_quantity,
    r.base_workers_required,
    COUNT(ri.id) as ingredient_count
FROM game.recipes r
LEFT JOIN game.recipe_ingredients ri ON r.id = ri.recipe_id
WHERE r.tier IN (1, 2)
GROUP BY r.id, r.tier, r.name, r.production_time_hours, r.result_quantity, r.base_workers_required
ORDER BY r.tier, r.name;

-- =====================================================
-- RESULT:
-- - 30 T1 recipes (10 food, 10 construction, 5 energy, 5 chemical)
-- - 30 T2 recipes (10 food, 10 construction, 5 energy, 5 chemical/medical)
-- - All ingredients linked to T0 raw materials or T1 products
-- =====================================================
