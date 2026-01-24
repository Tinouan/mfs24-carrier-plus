-- ═══════════════════════════════════════════════════════════
-- SEED TEST: Workers V2 pour Test 1 (Tinoua) à LFPG
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
    v_company_id UUID;
    v_worker_id UUID;
    v_countries TEXT[] := ARRAY['FR', 'FR', 'FR', 'DE', 'CN'];
    v_country TEXT;
BEGIN
    -- Trouver la company du joueur Tinoua
    SELECT c.id INTO v_company_id
    FROM game.companies c
    JOIN game.users u ON c.owner_user_id = u.id
    WHERE u.username = 'Tinoua';

    IF v_company_id IS NULL THEN
        RAISE NOTICE 'Company pour Tinoua non trouvée!';
        RETURN;
    END IF;

    RAISE NOTICE 'Company trouvée: %', v_company_id;

    -- Créer 5 workers de test à LFPG
    FOREACH v_country IN ARRAY v_countries
    LOOP
        SELECT game.create_worker_instance(
            v_country,      -- country_code
            'LFPG',         -- airport_ident
            v_company_id,   -- owner_company_id
            NULL,           -- owner_player_id
            FALSE,          -- for_sale
            NULL            -- sale_price
        ) INTO v_worker_id;

        RAISE NOTICE 'Created Worker-%: %', v_country, v_worker_id;
    END LOOP;

    RAISE NOTICE 'Done! Created 5 test workers at LFPG';
END $$;

-- Vérification
SELECT
    wi.id,
    i.name as item_name,
    wi.country_code,
    wi.speed,
    wi.resistance,
    wi.hourly_salary,
    wi.status,
    wi.airport_ident,
    wi.factory_id
FROM game.worker_instances wi
JOIN game.items i ON wi.item_id = i.id
WHERE wi.owner_company_id IN (
    SELECT c.id FROM game.companies c
    JOIN game.users u ON c.owner_user_id = u.id
    WHERE u.username = 'Tinoua'
)
ORDER BY wi.created_at DESC;
