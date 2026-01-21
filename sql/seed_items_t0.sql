-- =====================================================
-- SEED: ITEMS T0 (RAW MATERIALS)
-- =====================================================
-- Description: 30+ raw materials for factory production
-- Tier: 0 (base materials)
-- =====================================================

-- Clean existing items (optional - comment out in production)
-- TRUNCATE game.items CASCADE;

-- =====================================================
-- FOOD RAW MATERIALS (10 items)
-- =====================================================

INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Raw Fish', 0, ARRAY['food', 'raw', 'animal'], '🐟', 10.00, 2.0, TRUE, 100, 'Fresh fish caught from coastal waters'),
('Raw Meat', 0, ARRAY['food', 'raw', 'animal'], '🥩', 12.00, 2.5, TRUE, 100, 'Raw meat from livestock'),
('Raw Vegetables', 0, ARRAY['food', 'raw', 'plant'], '🥬', 5.00, 1.0, TRUE, 150, 'Fresh vegetables from farms'),
('Raw Wheat', 0, ARRAY['food', 'raw', 'plant', 'grain'], '🌾', 8.00, 1.5, TRUE, 200, 'Wheat grains ready for milling'),
('Raw Fruits', 0, ARRAY['food', 'raw', 'plant'], '🍎', 6.00, 1.2, TRUE, 120, 'Assorted fresh fruits'),
('Raw Salt', 0, ARRAY['food', 'mineral', 'raw'], '🧂', 5.00, 1.0, TRUE, 200, 'Sea salt for preservation and cooking'),
('Raw Sugar', 0, ARRAY['food', 'raw', 'plant'], '🍬', 7.00, 1.0, TRUE, 150, 'Raw cane sugar'),
('Raw Milk', 0, ARRAY['food', 'raw', 'animal'], '🥛', 4.00, 2.0, TRUE, 50, 'Fresh milk from dairy farms'),
('Raw Cocoa', 0, ARRAY['food', 'raw', 'plant'], '🍫', 15.00, 1.0, TRUE, 100, 'Raw cocoa beans'),
('Raw Vanilla', 0, ARRAY['food', 'raw', 'plant'], '🌿', 50.00, 0.5, TRUE, 80, 'Rare vanilla pods from Madagascar')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- CONSTRUCTION RAW MATERIALS (10 items)
-- =====================================================

INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Iron Ore', 0, ARRAY['construction', 'mineral', 'raw'], '⛏️', 15.00, 5.0, TRUE, 100, 'Raw iron ore from mines'),
('Copper Ore', 0, ARRAY['construction', 'mineral', 'raw', 'electronics'], '🪙', 12.00, 4.0, TRUE, 100, 'Copper ore for processing'),
('Raw Wood', 0, ARRAY['construction', 'raw', 'organic'], '🪵', 8.00, 3.0, TRUE, 150, 'Freshly cut timber'),
('Raw Stone', 0, ARRAY['construction', 'mineral', 'raw'], '🪨', 5.00, 10.0, TRUE, 80, 'Quarried stone'),
('Sand', 0, ARRAY['construction', 'mineral', 'raw'], '🏖️', 3.00, 2.0, TRUE, 200, 'Sand for concrete and glass'),
('Clay', 0, ARRAY['construction', 'mineral', 'raw'], '🧱', 4.00, 2.5, TRUE, 150, 'Clay for bricks and ceramics'),
('Limestone', 0, ARRAY['construction', 'mineral', 'raw'], '🪨', 6.00, 8.0, TRUE, 100, 'Limestone for cement production'),
('Aluminum Ore', 0, ARRAY['construction', 'mineral', 'raw'], '⚙️', 18.00, 4.5, TRUE, 100, 'Bauxite ore for aluminum'),
('Titanium Ore', 0, ARRAY['construction', 'mineral', 'raw'], '💎', 45.00, 3.5, TRUE, 80, 'Rare titanium ore'),
('Granite', 0, ARRAY['construction', 'mineral', 'raw'], '🪨', 10.00, 12.0, TRUE, 60, 'Hard granite stone')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- ENERGY RAW MATERIALS (5 items)
-- =====================================================

INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Crude Oil', 0, ARRAY['fuel', 'raw'], '🛢️', 25.00, 5.0, TRUE, 100, 'Unrefined petroleum'),
('Coal', 0, ARRAY['fuel', 'raw', 'mineral'], '⚫', 10.00, 3.0, TRUE, 150, 'Coal for energy and smelting'),
('Natural Gas', 0, ARRAY['fuel', 'raw'], '💨', 20.00, 1.0, TRUE, 80, 'Compressed natural gas'),
('Uranium Ore', 0, ARRAY['fuel', 'raw', 'mineral', 'advanced'], '☢️', 100.00, 8.0, TRUE, 30, 'Radioactive uranium ore'),
('Biomass', 0, ARRAY['fuel', 'raw', 'organic'], '🌱', 5.00, 2.0, TRUE, 120, 'Organic matter for biofuel')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- CHEMICAL/ADVANCED RAW MATERIALS (7 items)
-- =====================================================

INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Raw Rubber', 0, ARRAY['construction', 'raw', 'organic'], '🪴', 12.00, 1.5, TRUE, 100, 'Latex from rubber trees'),
('Cotton', 0, ARRAY['raw', 'organic'], '🧶', 8.00, 1.0, TRUE, 150, 'Raw cotton fibers'),
('Raw Silicon', 0, ARRAY['electronics', 'mineral', 'raw'], '💾', 30.00, 2.0, TRUE, 80, 'Silicon for electronics'),
('Rare Earth Metals', 0, ARRAY['electronics', 'mineral', 'raw', 'advanced'], '✨', 80.00, 3.0, TRUE, 50, 'Rare earth elements'),
('Sulfur', 0, ARRAY['chemical', 'mineral', 'raw'], '🟡', 15.00, 2.5, TRUE, 100, 'Sulfur for chemicals'),
('Phosphate', 0, ARRAY['chemical', 'mineral', 'raw'], '🟤', 10.00, 3.0, TRUE, 120, 'Phosphate for fertilizers'),
('Graphite', 0, ARRAY['construction', 'mineral', 'raw'], '✏️', 20.00, 2.0, TRUE, 100, 'Graphite for batteries and lubricants')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- WATER (Essential ingredient)
-- =====================================================

INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description) VALUES
('Water', 0, ARRAY['food', 'raw'], '💧', 1.00, 1.0, TRUE, 500, 'Clean water for production')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- VERIFY INSERTION
-- =====================================================

-- Count inserted items
SELECT tier, COUNT(*) as count
FROM game.items
WHERE tier = 0
GROUP BY tier;

-- List all T0 items by category
SELECT
    tags[1] as primary_category,
    COUNT(*) as count,
    string_agg(name, ', ') as items
FROM game.items
WHERE tier = 0
GROUP BY tags[1]
ORDER BY count DESC;

-- =====================================================
-- RESULT: 33 raw materials (T0) inserted
-- - 10 Food raw materials
-- - 10 Construction raw materials
-- - 5 Energy raw materials
-- - 7 Chemical/Advanced raw materials
-- - 1 Water (universal)
-- =====================================================
