-- =====================================================
-- SIMPLE TEST RECIPES (just a few to verify it works)
-- =====================================================

-- Insert 3 simple T1 recipes for testing

-- Recipe 1: Dried Fish (Raw Fish + Salt → Dried Fish)
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Dried Fish',
    1,
    (SELECT id FROM game.items WHERE name = 'Dried Fish'),
    10,
    2.0,
    10,
    'Preserve fish with salt for long storage'
)
ON CONFLICT DO NOTHING;

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Dried Fish'), (SELECT id FROM game.items WHERE name = 'Raw Fish'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Dried Fish'), (SELECT id FROM game.items WHERE name = 'Raw Salt'), 1, 1);

-- Recipe 2: Steel Ingot (Iron Ore + Coal → Steel Ingot)
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Steel Ingot',
    1,
    (SELECT id FROM game.items WHERE name = 'Steel Ingot'),
    5,
    4.0,
    15,
    'Refined steel from iron ore and coal'
)
ON CONFLICT DO NOTHING;

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Steel Ingot'), (SELECT id FROM game.items WHERE name = 'Iron Ore'), 2, 0),
    ((SELECT id FROM game.recipes WHERE name = 'Steel Ingot'), (SELECT id FROM game.items WHERE name = 'Coal'), 1, 1);

-- Recipe 3: Diesel (Crude Oil → Diesel)
INSERT INTO game.recipes (name, tier, result_item_id, result_quantity, production_time_hours, base_workers_required, description)
VALUES (
    'Diesel',
    1,
    (SELECT id FROM game.items WHERE name = 'Diesel'),
    8,
    3.0,
    12,
    'Refined diesel fuel from crude oil'
)
ON CONFLICT DO NOTHING;

INSERT INTO game.recipe_ingredients (recipe_id, item_id, quantity, position)
VALUES
    ((SELECT id FROM game.recipes WHERE name = 'Diesel'), (SELECT id FROM game.items WHERE name = 'Crude Oil'), 2, 0);

SELECT 'Test recipes inserted successfully!' AS status;
