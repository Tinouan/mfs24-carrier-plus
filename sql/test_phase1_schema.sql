-- =====================================================
-- TEST: PHASE 1 SCHEMA + SEEDS
-- =====================================================
-- This file tests if all tables were created correctly
-- and data was inserted properly.
-- =====================================================

\echo '========================================='
\echo 'PHASE 1 SCHEMA TEST'
\echo '========================================='

-- =====================================================
-- 1. TEST TABLE EXISTENCE
-- =====================================================

\echo '\n1. Checking if all tables exist...'

SELECT
    schemaname,
    tablename
FROM pg_tables
WHERE schemaname = 'game'
    AND tablename IN (
        'items',
        'recipes',
        'recipe_ingredients',
        'factories',
        'workers',
        'engineers',
        'factory_storage',
        'production_batches',
        'factory_transactions'
    )
ORDER BY tablename;

\echo '\nExpected: 9 tables in game schema'

-- =====================================================
-- 2. TEST ITEMS (T0, T1, T2)
-- =====================================================

\echo '\n2. Checking items by tier...'

SELECT
    tier,
    COUNT(*) as count,
    BOOL_AND(is_raw) as all_raw_in_t0,
    ARRAY_AGG(DISTINCT tags[1]) as primary_categories
FROM game.items
GROUP BY tier
ORDER BY tier;

\echo '\nExpected: T0=33 (all raw), T1=30, T2=30'

-- =====================================================
-- 3. TEST RECIPES (T1, T2)
-- =====================================================

\echo '\n3. Checking recipes by tier...'

SELECT
    tier,
    COUNT(*) as count,
    MIN(production_time_hours) as min_duration,
    MAX(production_time_hours) as max_duration,
    AVG(result_quantity)::INT as avg_output
FROM game.recipes
GROUP BY tier
ORDER BY tier;

\echo '\nExpected: T1=30, T2=30'

-- =====================================================
-- 4. TEST RECIPE INGREDIENTS
-- =====================================================

\echo '\n4. Checking recipe ingredients...'

SELECT
    r.tier,
    COUNT(DISTINCT r.id) as recipe_count,
    COUNT(ri.id) as ingredient_count,
    ROUND(AVG(COUNT(ri.id)) OVER (PARTITION BY r.tier), 2) as avg_ingredients_per_recipe
FROM game.recipes r
LEFT JOIN game.recipe_ingredients ri ON r.id = ri.recipe_id
GROUP BY r.tier, r.id
ORDER BY r.tier
LIMIT 10;

\echo '\nExpected: T1 recipes avg 2 ingredients, T2 recipes avg 2-3'

-- =====================================================
-- 5. TEST RECIPE INTEGRITY
-- =====================================================

\echo '\n5. Checking recipe-item consistency...'

SELECT
    r.name as recipe_name,
    i.name as output_item_name,
    CASE
        WHEN i.id IS NULL THEN '❌ MISSING OUTPUT ITEM'
        WHEN r.tier != i.tier THEN '⚠️ TIER MISMATCH'
        ELSE '✅ OK'
    END as status
FROM game.recipes r
LEFT JOIN game.items i ON r.name = i.name
WHERE r.tier IN (1, 2)
ORDER BY r.tier, r.name;

\echo '\nExpected: All OK (60 recipes matched to 60 items)'

-- =====================================================
-- 6. TEST TRIGGER FUNCTIONS
-- =====================================================

\echo '\n6. Checking trigger functions...'

SELECT
    routine_schema,
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'game'
    AND routine_name IN (
        'update_factory_type',
        'update_worker_tier',
        'calculate_max_slots'
    )
ORDER BY routine_name;

\echo '\nExpected: 3 trigger functions'

-- =====================================================
-- 7. TEST AIRPORT ENHANCEMENTS
-- =====================================================

\echo '\n7. Checking airport columns...'

SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'airports'
    AND column_name IN ('max_factory_slots', 'occupied_slots')
ORDER BY column_name;

\echo '\nExpected: 2 new columns (max_factory_slots, occupied_slots)'

-- =====================================================
-- 8. SAMPLE DATA VERIFICATION
-- =====================================================

\echo '\n8. Sample items (first 5 of each tier)...'

SELECT
    tier,
    name,
    icon,
    base_value,
    weight_kg,
    is_raw,
    tags[1:2] as main_tags
FROM game.items
WHERE tier IN (0, 1, 2)
ORDER BY tier, name
LIMIT 15;

-- =====================================================
-- 9. SAMPLE RECIPES
-- =====================================================

\echo '\n9. Sample recipes with ingredients...'

SELECT
    r.tier,
    r.name as recipe,
    r.production_time_hours as hours,
    r.result_quantity as output_qty,
    STRING_AGG(i.name || ' (x' || ri.quantity || ')', ', ' ORDER BY ri.position) as ingredients
FROM game.recipes r
JOIN game.recipe_ingredients ri ON r.id = ri.recipe_id
JOIN game.items i ON ri.item_id = i.id
WHERE r.tier = 1
GROUP BY r.id, r.tier, r.name, r.production_time_hours, r.result_quantity
ORDER BY r.name
LIMIT 10;

-- =====================================================
-- 10. SUMMARY
-- =====================================================

\echo '\n========================================='
\echo 'SUMMARY'
\echo '========================================='

SELECT
    'Items (T0)' as category,
    COUNT(*) as count
FROM game.items
WHERE tier = 0
UNION ALL
SELECT
    'Items (T1)',
    COUNT(*)
FROM game.items
WHERE tier = 1
UNION ALL
SELECT
    'Items (T2)',
    COUNT(*)
FROM game.items
WHERE tier = 2
UNION ALL
SELECT
    'Recipes (T1)',
    COUNT(*)
FROM game.recipes
WHERE tier = 1
UNION ALL
SELECT
    'Recipes (T2)',
    COUNT(*)
FROM game.recipes
WHERE tier = 2
UNION ALL
SELECT
    'Recipe Ingredients',
    COUNT(*)
FROM game.recipe_ingredients;

\echo '\n========================================='
\echo 'TEST COMPLETE'
\echo '========================================='

-- If you see:
-- ✅ 9 tables created
-- ✅ 93 items total (33 T0 + 30 T1 + 30 T2)
-- ✅ 60 recipes total (30 T1 + 30 T2)
-- ✅ ~150 recipe ingredients
-- ✅ 3 trigger functions
-- ✅ 2 airport columns added
--
-- Then Phase 1 is SUCCESSFUL! 🎉
