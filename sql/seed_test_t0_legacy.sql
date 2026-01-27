-- ═══════════════════════════════════════════════════════════
-- SEED TEST: 100x chaque item T0 dans inventory_items (LEGACY)
-- Pour la company Test 1 du joueur Tinoua à LFPG
-- ═══════════════════════════════════════════════════════════

-- Location ID du company_warehouse LFPG pour Test 1
-- 7b96c7fd-79ab-49c2-a662-d2cdfc63297a

DO $$
DECLARE
    v_location_id UUID := '7b96c7fd-79ab-49c2-a662-d2cdfc63297a';
    v_item RECORD;
BEGIN
    RAISE NOTICE 'Adding T0 items to location: %', v_location_id;

    -- Insérer 100 de chaque item T0
    FOR v_item IN
        SELECT id, name FROM game.items WHERE tier = 0
    LOOP
        INSERT INTO game.inventory_items (location_id, item_id, qty)
        VALUES (v_location_id, v_item.id, 100)
        ON CONFLICT (location_id, item_id)
        DO UPDATE SET qty = game.inventory_items.qty + 100;

        RAISE NOTICE 'Added 100x %', v_item.name;
    END LOOP;
END $$;

-- Vérification
SELECT
    i.name,
    i.tier,
    i.icon,
    ii.qty,
    il.airport_ident,
    il.kind
FROM game.inventory_items ii
JOIN game.items i ON ii.item_id = i.id
JOIN game.inventory_locations il ON ii.location_id = il.id
WHERE il.id = '7b96c7fd-79ab-49c2-a662-d2cdfc63297a'
AND i.tier = 0
ORDER BY i.name;
