-- ═══════════════════════════════════════════════════════════
-- SEED TEST: 100x chaque item T0 dans company_inventory LFPG
-- Pour le joueur T1
-- ═══════════════════════════════════════════════════════════

-- Trouver la company du joueur T1 et insérer les items
DO $$
DECLARE
    v_company_id UUID;
    v_item RECORD;
BEGIN
    -- Trouver la company du joueur Tinoua
    SELECT c.id INTO v_company_id
    FROM game.companies c
    JOIN game.users u ON c.owner_user_id = u.id
    WHERE u.username = 'Tinoua';

    IF v_company_id IS NULL THEN
        RAISE NOTICE 'Company pour T1 non trouvée!';
        RETURN;
    END IF;

    RAISE NOTICE 'Company trouvée: %', v_company_id;

    -- Insérer 100 de chaque item T0
    FOR v_item IN
        SELECT id, name FROM game.items WHERE tier = 0
    LOOP
        INSERT INTO game.company_inventory (company_id, item_id, qty, airport_ident)
        VALUES (v_company_id, v_item.id, 100, 'LFPG')
        ON CONFLICT (company_id, item_id, airport_ident)
        DO UPDATE SET qty = game.company_inventory.qty + 100;

        RAISE NOTICE 'Ajouté 100x % à LFPG', v_item.name;
    END LOOP;
END $$;

-- Vérification
SELECT
    i.name,
    i.tier,
    i.icon,
    ci.qty,
    ci.airport_ident
FROM game.company_inventory ci
JOIN game.items i ON ci.item_id = i.id
JOIN game.companies c ON ci.company_id = c.id
JOIN game.users u ON c.owner_user_id = u.id
WHERE u.username = 'Tinoua'
AND ci.airport_ident = 'LFPG'
AND i.tier = 0
ORDER BY i.name;
