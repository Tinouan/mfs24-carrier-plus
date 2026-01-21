-- =====================================================
-- SEED: ITEMS T1-T2 (PROCESSED PRODUCTS)
-- =====================================================
-- Description: Processed items from factories
-- T1: Simple processed goods (2 ingredients)
-- T2: Intermediate processed goods (2-3 ingredients)
-- =====================================================

-- =====================================================
-- T1 ITEMS (Simple processed goods)
-- =====================================================

-- Food T1 (10 items)
INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Dried Fish', 1, ARRAY['food', 'preserved'], '🐟', 25.00, 1.5, FALSE, 80, 'Preserved fish for long storage'),
('Bread', 1, ARRAY['food', 'baked'], '🍞', 15.00, 0.5, FALSE, 100, 'Fresh baked bread'),
('Salted Meat', 1, ARRAY['food', 'preserved', 'animal'], '🥓', 30.00, 2.0, FALSE, 70, 'Cured and preserved meat'),
('Vegetable Stew', 1, ARRAY['food', 'cooked'], '🥘', 20.00, 1.0, FALSE, 60, 'Hot vegetable stew'),
('Fruit Jam', 1, ARRAY['food', 'preserved', 'sweet'], '🍯', 22.00, 0.8, FALSE, 80, 'Sweet fruit preserve'),
('Sugar Syrup', 1, ARRAY['food', 'ingredient'], '🍯', 18.00, 0.8, FALSE, 100, 'Refined sugar solution'),
('Butter', 1, ARRAY['food', 'dairy'], '🧈', 28.00, 0.5, FALSE, 60, 'Fresh dairy butter'),
('Flour', 1, ARRAY['food', 'ingredient'], '🌾', 12.00, 1.0, FALSE, 150, 'Milled wheat flour'),
('Cocoa Powder', 1, ARRAY['food', 'ingredient'], '🍫', 35.00, 0.6, FALSE, 80, 'Ground cocoa for chocolate'),
('Vanilla Extract', 1, ARRAY['food', 'ingredient', 'rare'], '🌿', 120.00, 0.3, FALSE, 50, 'Concentrated vanilla essence')
ON CONFLICT (name) DO NOTHING;

-- Construction T1 (10 items)
INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Steel Ingot', 1, ARRAY['construction', 'metal'], '⚙️', 45.00, 8.0, FALSE, 80, 'Refined steel ingots'),
('Copper Ingot', 1, ARRAY['construction', 'metal', 'electronics'], '🟠', 38.00, 6.0, FALSE, 80, 'Pure copper ingots'),
('Planks', 1, ARRAY['construction', 'wood'], '🪵', 22.00, 2.0, FALSE, 100, 'Processed wooden planks'),
('Stone Bricks', 1, ARRAY['construction', 'masonry'], '🧱', 18.00, 8.0, FALSE, 70, 'Cut stone blocks'),
('Glass', 1, ARRAY['construction', 'transparent'], '🪟', 25.00, 4.0, FALSE, 60, 'Clear glass sheets'),
('Bricks', 1, ARRAY['construction', 'masonry'], '🧱', 15.00, 6.0, FALSE, 90, 'Fired clay bricks'),
('Cement', 1, ARRAY['construction', 'binding'], '🪨', 20.00, 10.0, FALSE, 80, 'Building cement'),
('Aluminum Ingot', 1, ARRAY['construction', 'metal', 'light'], '⚙️', 55.00, 4.0, FALSE, 70, 'Lightweight aluminum ingots'),
('Titanium Ingot', 1, ARRAY['construction', 'metal', 'advanced'], '💎', 150.00, 3.0, FALSE, 50, 'High-grade titanium'),
('Marble Slabs', 1, ARRAY['construction', 'masonry', 'luxury'], '🪨', 65.00, 10.0, FALSE, 40, 'Polished marble slabs')
ON CONFLICT (name) DO NOTHING;

-- Energy T1 (5 items)
INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Diesel', 1, ARRAY['fuel', 'liquid'], '⛽', 60.00, 4.0, FALSE, 80, 'Refined diesel fuel'),
('Charcoal', 1, ARRAY['fuel', 'solid'], '⚫', 28.00, 2.5, FALSE, 100, 'Processed charcoal'),
('Compressed Gas', 1, ARRAY['fuel', 'gas'], '💨', 55.00, 2.0, FALSE, 60, 'Liquefied compressed gas'),
('Biofuel', 1, ARRAY['fuel', 'renewable'], '🌱', 48.00, 3.5, FALSE, 70, 'Organic biofuel'),
('Uranium Pellets', 1, ARRAY['fuel', 'nuclear', 'advanced'], '☢️', 300.00, 5.0, FALSE, 30, 'Enriched uranium pellets')
ON CONFLICT (name) DO NOTHING;

-- Chemical/Industrial T1 (5 items)
INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Rubber Sheets', 1, ARRAY['construction', 'industrial'], '⬛', 32.00, 2.0, FALSE, 80, 'Vulcanized rubber sheets'),
('Fabric', 1, ARRAY['construction', 'textile'], '🧵', 24.00, 1.5, FALSE, 90, 'Woven cotton fabric'),
('Silicon Wafers', 1, ARRAY['electronics', 'advanced'], '💾', 90.00, 1.5, FALSE, 50, 'Purified silicon wafers'),
('Sulfuric Acid', 1, ARRAY['chemical', 'industrial'], '⚗️', 40.00, 4.0, FALSE, 60, 'Industrial grade acid'),
('Fertilizer', 1, ARRAY['chemical', 'agriculture'], '🟤', 28.00, 5.0, FALSE, 80, 'Phosphate fertilizer')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- T2 ITEMS (Intermediate processed goods)
-- =====================================================

-- Food T2 (10 items)
INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Quality Bread', 2, ARRAY['food', 'baked', 'quality'], '🥖', 35.00, 0.6, FALSE, 70, 'Artisan quality bread'),
('Smoked Fish', 2, ARRAY['food', 'preserved', 'quality'], '🐟', 55.00, 1.8, FALSE, 60, 'Premium smoked fish'),
('Chocolate Bar', 2, ARRAY['food', 'sweet', 'luxury'], '🍫', 85.00, 0.4, FALSE, 50, 'Rich chocolate bar'),
('Fruit Cake', 2, ARRAY['food', 'baked', 'sweet'], '🍰', 75.00, 1.2, FALSE, 40, 'Dense fruit cake'),
('Cheese', 2, ARRAY['food', 'dairy', 'quality'], '🧀', 65.00, 1.0, FALSE, 50, 'Aged cheese'),
('Sausage', 2, ARRAY['food', 'meat', 'preserved'], '🌭', 48.00, 1.5, FALSE, 70, 'Cured sausage'),
('Vegetable Soup', 2, ARRAY['food', 'cooked', 'quality'], '🥘', 42.00, 1.2, FALSE, 50, 'Rich vegetable soup'),
('Pastry', 2, ARRAY['food', 'baked', 'sweet'], '🥐', 38.00, 0.5, FALSE, 60, 'Buttery pastries'),
('Dried Fruit', 2, ARRAY['food', 'preserved', 'sweet'], '🫐', 45.00, 0.8, FALSE, 70, 'Sun-dried fruits'),
('Honey Bread', 2, ARRAY['food', 'baked', 'sweet', 'quality'], '🍞', 58.00, 0.7, FALSE, 50, 'Sweet honey bread')
ON CONFLICT (name) DO NOTHING;

-- Construction T2 (10 items)
INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Reinforced Steel', 2, ARRAY['construction', 'metal', 'quality'], '⚙️', 95.00, 10.0, FALSE, 60, 'High-strength steel'),
('Wire Cable', 2, ARRAY['construction', 'metal', 'electronics'], '🔌', 68.00, 3.0, FALSE, 80, 'Copper wire cables'),
('Wooden Beams', 2, ARRAY['construction', 'wood'], '🪵', 55.00, 8.0, FALSE, 50, 'Structural wooden beams'),
('Concrete Blocks', 2, ARRAY['construction', 'masonry'], '🧱', 45.00, 15.0, FALSE, 60, 'Heavy concrete blocks'),
('Window Panes', 2, ARRAY['construction', 'transparent'], '🪟', 72.00, 6.0, FALSE, 40, 'Glass window frames'),
('Insulation', 2, ARRAY['construction', 'industrial'], '⬛', 58.00, 3.0, FALSE, 70, 'Rubber insulation'),
('Steel Pipes', 2, ARRAY['construction', 'metal', 'plumbing'], '🔧', 82.00, 9.0, FALSE, 50, 'Steel piping'),
('Aluminum Frame', 2, ARRAY['construction', 'metal', 'light'], '⚙️', 88.00, 5.0, FALSE, 50, 'Aluminum frames'),
('Circuit Board', 2, ARRAY['electronics', 'advanced'], '💾', 185.00, 2.0, FALSE, 40, 'Basic circuit boards'),
('Titanium Plates', 2, ARRAY['construction', 'metal', 'advanced', 'armor'], '💎', 320.00, 4.0, FALSE, 30, 'Armor-grade titanium')
ON CONFLICT (name) DO NOTHING;

-- Energy T2 (5 items)
INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Jet Fuel', 2, ARRAY['fuel', 'liquid', 'aviation'], '✈️', 135.00, 5.0, FALSE, 60, 'Aviation-grade fuel'),
('Heating Oil', 2, ARRAY['fuel', 'liquid'], '⛽', 88.00, 4.5, FALSE, 70, 'Refined heating oil'),
('Premium Biofuel', 2, ARRAY['fuel', 'renewable', 'quality'], '🌱', 115.00, 4.0, FALSE, 50, 'High-efficiency biofuel'),
('Rocket Propellant', 2, ARRAY['fuel', 'liquid', 'advanced'], '🚀', 285.00, 6.0, FALSE, 30, 'Specialized rocket fuel'),
('Nuclear Fuel Rod', 2, ARRAY['fuel', 'nuclear', 'advanced'], '☢️', 850.00, 8.0, FALSE, 20, 'Enriched nuclear fuel rod')
ON CONFLICT (name) DO NOTHING;

-- Chemical/Medical T2 (5 items)
INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Plastic Sheets', 2, ARRAY['construction', 'chemical'], '⬜', 62.00, 2.5, FALSE, 70, 'Industrial plastic sheets'),
('Medical Bandages', 2, ARRAY['medical', 'consumable'], '🩹', 48.00, 0.5, FALSE, 100, 'Sterilized bandages'),
('Cleaning Solution', 2, ARRAY['chemical', 'industrial'], '🧴', 35.00, 3.0, FALSE, 80, 'Industrial cleaner'),
('Paint', 2, ARRAY['chemical', 'construction'], '🎨', 52.00, 3.5, FALSE, 60, 'Colored paint'),
('Adhesive', 2, ARRAY['chemical', 'industrial'], '🧪', 68.00, 2.0, FALSE, 50, 'Strong industrial glue')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- VERIFY INSERTION
-- =====================================================

-- Count items by tier
SELECT tier, COUNT(*) as count
FROM game.items
WHERE tier IN (1, 2)
GROUP BY tier
ORDER BY tier;

-- List all T1-T2 items by category
SELECT
    tier,
    tags[1] as primary_category,
    COUNT(*) as count,
    string_agg(name, ', ' ORDER BY name) as items
FROM game.items
WHERE tier IN (1, 2)
GROUP BY tier, tags[1]
ORDER BY tier, tags[1];

-- Check consistency between items and recipes
SELECT
    r.tier,
    r.name as recipe_name,
    i.name as output_item_name,
    CASE
        WHEN i.id IS NULL THEN '❌ MISSING ITEM'
        ELSE '✅ OK'
    END as status
FROM game.recipes r
LEFT JOIN game.items i ON r.name = i.name
WHERE r.tier IN (1, 2)
ORDER BY r.tier, r.name;

-- =====================================================
-- RESULT:
-- - 30 T1 items (10 food, 10 construction, 5 energy, 5 chemical)
-- - 30 T2 items (10 food, 10 construction, 5 energy, 5 chemical/medical)
-- - All items match recipe outputs
-- - Total processed items: 60
-- - Total all items (T0+T1+T2): 93 items
-- =====================================================
