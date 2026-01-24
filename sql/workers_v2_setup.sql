-- ═══════════════════════════════════════════════════════════
-- WORKERS V2: Table worker_instances + Items Worker-XX
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- 1. CREATE TABLE game.worker_instances
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS game.worker_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership (company OR player, one must be set)
    owner_company_id UUID REFERENCES game.companies(id) ON DELETE CASCADE,
    owner_player_id UUID REFERENCES game.users(id) ON DELETE CASCADE,

    -- Item type (Worker-FR, Worker-CN, etc.)
    item_id UUID NOT NULL REFERENCES game.items(id),

    -- Location (airport where worker is stored/available)
    airport_ident VARCHAR(8) NOT NULL,

    -- Worker stats (generated from country base ±20%)
    country_code CHAR(2) NOT NULL,
    speed INT NOT NULL CHECK (speed >= 1 AND speed <= 100),
    resistance INT NOT NULL CHECK (resistance >= 1 AND resistance <= 100),
    xp INT NOT NULL DEFAULT 0 CHECK (xp >= 0),
    tier INT NOT NULL DEFAULT 1 CHECK (tier >= 1 AND tier <= 5),
    hourly_salary DECIMAL(10,2) NOT NULL CHECK (hourly_salary > 0),

    -- Status and assignment
    status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'working', 'injured', 'dead')),
    factory_id UUID REFERENCES game.factories(id) ON DELETE SET NULL,

    -- HV (Hôtel des Ventes) - for selling on market
    for_sale BOOLEAN NOT NULL DEFAULT FALSE,
    sale_price DECIMAL(12,2),

    -- Timestamps
    injured_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_worker_owner CHECK (
        (owner_company_id IS NOT NULL AND owner_player_id IS NULL) OR
        (owner_company_id IS NULL AND owner_player_id IS NOT NULL) OR
        (owner_company_id IS NULL AND owner_player_id IS NULL)  -- NPC/market workers
    ),
    CONSTRAINT chk_worker_sale_price CHECK (
        (for_sale = FALSE) OR (for_sale = TRUE AND sale_price IS NOT NULL AND sale_price > 0)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_worker_instances_company ON game.worker_instances(owner_company_id) WHERE owner_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_worker_instances_player ON game.worker_instances(owner_player_id) WHERE owner_player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_worker_instances_airport ON game.worker_instances(airport_ident);
CREATE INDEX IF NOT EXISTS idx_worker_instances_factory ON game.worker_instances(factory_id) WHERE factory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_worker_instances_status ON game.worker_instances(status);
CREATE INDEX IF NOT EXISTS idx_worker_instances_for_sale ON game.worker_instances(for_sale) WHERE for_sale = TRUE;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION game.update_worker_instance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_worker_instance_updated ON game.worker_instances;
CREATE TRIGGER trg_worker_instance_updated
    BEFORE UPDATE ON game.worker_instances
    FOR EACH ROW
    EXECUTE FUNCTION game.update_worker_instance_timestamp();

COMMENT ON TABLE game.worker_instances IS 'Workers V2: Individual worker instances with unique stats';
COMMENT ON COLUMN game.worker_instances.item_id IS 'References Worker-XX item type (e.g., Worker-FR)';
COMMENT ON COLUMN game.worker_instances.status IS 'available=in inventory, working=assigned to factory, injured=recovering, dead=to be deleted';

-- ═══════════════════════════════════════════════════════════
-- 2. CREATE WORKER ITEMS (one per country from country_worker_stats)
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
    v_country RECORD;
    v_item_name VARCHAR(100);
    v_base_value DECIMAL(10,2);
BEGIN
    RAISE NOTICE 'Creating Worker items for each country...';

    FOR v_country IN
        SELECT country_code, country_name, base_hourly_salary
        FROM game.country_worker_stats
        ORDER BY country_code
    LOOP
        v_item_name := 'Worker-' || v_country.country_code;
        -- Base value = salary × 100 (as per spec)
        v_base_value := v_country.base_hourly_salary * 100;

        INSERT INTO game.items (name, tier, tags, icon, base_value, weight_kg, is_raw, stack_size, description)
        VALUES (
            v_item_name,
            0,  -- Tier 0 (special item)
            ARRAY['worker', 'human']::text[],
            '👷',
            v_base_value,
            75.0,  -- Average human weight
            false,
            1,  -- Workers don't stack
            'Worker from ' || v_country.country_name
        )
        ON CONFLICT (name) DO UPDATE SET
            base_value = EXCLUDED.base_value,
            description = EXCLUDED.description;

        RAISE NOTICE 'Created/Updated: % (base_value: %)', v_item_name, v_base_value;
    END LOOP;

    RAISE NOTICE 'Done! Created % worker items.', (SELECT COUNT(*) FROM game.items WHERE tags @> ARRAY['worker']);
END $$;

-- ═══════════════════════════════════════════════════════════
-- 3. HELPER FUNCTION: Create worker instance with random stats
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION game.create_worker_instance(
    p_country_code CHAR(2),
    p_airport_ident VARCHAR(8),
    p_owner_company_id UUID DEFAULT NULL,
    p_owner_player_id UUID DEFAULT NULL,
    p_for_sale BOOLEAN DEFAULT FALSE,
    p_sale_price DECIMAL(12,2) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_item_id UUID;
    v_base_speed INT;
    v_base_resistance INT;
    v_base_salary DECIMAL(10,2);
    v_speed INT;
    v_resistance INT;
    v_salary DECIMAL(10,2);
    v_worker_id UUID;
BEGIN
    -- Get item_id for this country's worker
    SELECT id INTO v_item_id
    FROM game.items
    WHERE name = 'Worker-' || p_country_code;

    IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'Worker item not found for country: %', p_country_code;
    END IF;

    -- Get base stats from country_worker_stats
    SELECT base_speed, base_resistance, base_hourly_salary
    INTO v_base_speed, v_base_resistance, v_base_salary
    FROM game.country_worker_stats
    WHERE country_code = p_country_code;

    IF v_base_speed IS NULL THEN
        RAISE EXCEPTION 'Country not found: %', p_country_code;
    END IF;

    -- Generate stats with ±20% variation
    v_speed := GREATEST(1, LEAST(100, v_base_speed + (random() * 0.4 - 0.2) * v_base_speed)::INT);
    v_resistance := GREATEST(1, LEAST(100, v_base_resistance + (random() * 0.4 - 0.2) * v_base_resistance)::INT);
    v_salary := GREATEST(1, v_base_salary * (0.8 + random() * 0.4));

    -- Create worker instance
    INSERT INTO game.worker_instances (
        item_id, airport_ident, country_code,
        speed, resistance, hourly_salary,
        owner_company_id, owner_player_id,
        for_sale, sale_price
    )
    VALUES (
        v_item_id, p_airport_ident, p_country_code,
        v_speed, v_resistance, v_salary,
        p_owner_company_id, p_owner_player_id,
        p_for_sale, p_sale_price
    )
    RETURNING id INTO v_worker_id;

    RETURN v_worker_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION game.create_worker_instance IS 'Create a new worker instance with randomized stats based on country';

-- ═══════════════════════════════════════════════════════════
-- 4. VERIFICATION
-- ═══════════════════════════════════════════════════════════

-- Show created worker items
SELECT name, tier, tags, icon, base_value, description
FROM game.items
WHERE tags @> ARRAY['worker']
ORDER BY name;
