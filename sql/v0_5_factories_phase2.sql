-- =====================================================
-- V0.5 FACTORIES SYSTEM - PHASE 2
-- =====================================================
-- Creates 6 additional tables for factory management:
-- - factories (company-owned production facilities)
-- - workers (assigned to factories, XP/tier system)
-- - engineers (provide production bonuses)
-- - factory_storage (inventory per factory)
-- - production_batches (track ongoing production)
-- - factory_transactions (audit trail)
-- =====================================================

-- =====================================================
-- 1. FACTORIES
-- =====================================================

CREATE TABLE IF NOT EXISTS game.factories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES game.companies(id) ON DELETE CASCADE,
    airport_ident VARCHAR(4) NOT NULL, -- Sans FK pour l'instant
    name VARCHAR(100) NOT NULL,
    factory_type VARCHAR(50), -- Auto-detected from recipe tags
    status VARCHAR(20) DEFAULT 'idle' CHECK (status IN ('idle', 'producing', 'maintenance', 'offline')),
    current_recipe_id UUID REFERENCES game.recipes(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_factories_company ON game.factories(company_id);
CREATE INDEX IF NOT EXISTS idx_factories_airport ON game.factories(airport_ident);
CREATE INDEX IF NOT EXISTS idx_factories_status ON game.factories(status) WHERE is_active = TRUE;

COMMENT ON TABLE game.factories IS 'Company-owned production facilities';
COMMENT ON COLUMN game.factories.factory_type IS 'Auto-detected: food_processing, metal_smelting, chemical_refining, construction, electronics, medical, fuel_production, general';
COMMENT ON COLUMN game.factories.status IS 'idle=ready, producing=active batch, maintenance=repairs, offline=disabled';

-- =====================================================
-- 2. WORKERS
-- =====================================================

CREATE TABLE IF NOT EXISTS game.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID REFERENCES game.factories(id) ON DELETE SET NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    tier INT DEFAULT 0 CHECK (tier BETWEEN 0 AND 5),
    health INT DEFAULT 100 CHECK (health BETWEEN 0 AND 100),
    happiness INT DEFAULT 80 CHECK (happiness BETWEEN 0 AND 100),
    xp INT DEFAULT 0 CHECK (xp >= 0),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workers_factory ON game.workers(factory_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_workers_tier ON game.workers(tier) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_workers_health ON game.workers(health) WHERE is_active = TRUE;

COMMENT ON TABLE game.workers IS 'Factory workers with XP/tier progression and health system';
COMMENT ON COLUMN game.workers.tier IS 'Auto-calculated from XP: 0-99=T0, 100-249=T1, 250-499=T2, 500-999=T3, 1000-1999=T4, 2000+=T5';
COMMENT ON COLUMN game.workers.health IS 'Degrades -5/hour during production, recovers +10/hour at rest';
COMMENT ON COLUMN game.workers.xp IS 'Gained after successful batch: recipe.tier * 10 * production_time_hours';

-- =====================================================
-- 3. ENGINEERS
-- =====================================================

CREATE TABLE IF NOT EXISTS game.engineers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES game.companies(id) ON DELETE CASCADE,
    airport_ident VARCHAR(4) NOT NULL, -- Sans FK pour l'instant
    name VARCHAR(100) NOT NULL,
    specialization VARCHAR(50) NOT NULL, -- Matches factory_type
    bonus_percentage INT DEFAULT 10 CHECK (bonus_percentage BETWEEN 0 AND 50),
    experience INT DEFAULT 0 CHECK (experience >= 0),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_engineers_company ON game.engineers(company_id);
CREATE INDEX IF NOT EXISTS idx_engineers_airport ON game.engineers(airport_ident);
CREATE INDEX IF NOT EXISTS idx_engineers_specialization ON game.engineers(specialization) WHERE is_active = TRUE;

COMMENT ON TABLE game.engineers IS 'Specialized engineers providing production bonuses';
COMMENT ON COLUMN game.engineers.specialization IS 'Must match factory_type: food_processing, metal_smelting, etc.';
COMMENT ON COLUMN game.engineers.bonus_percentage IS 'Output bonus: +10-50% if specialization matches factory type';

-- =====================================================
-- 4. FACTORY STORAGE
-- =====================================================

CREATE TABLE IF NOT EXISTS game.factory_storage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES game.factories(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES game.items(id),
    quantity INT DEFAULT 0 CHECK (quantity >= 0),
    max_capacity INT DEFAULT 1000 CHECK (max_capacity > 0),
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(factory_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_factory_storage_factory ON game.factory_storage(factory_id);
CREATE INDEX IF NOT EXISTS idx_factory_storage_item ON game.factory_storage(item_id);

COMMENT ON TABLE game.factory_storage IS 'Per-factory inventory storage';
COMMENT ON COLUMN game.factory_storage.max_capacity IS 'Maximum units of this item that can be stored';

-- =====================================================
-- 5. PRODUCTION BATCHES
-- =====================================================

CREATE TABLE IF NOT EXISTS game.production_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES game.factories(id) ON DELETE CASCADE,
    recipe_id UUID NOT NULL REFERENCES game.recipes(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMPTZ,
    estimated_completion TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result_quantity INT CHECK (result_quantity > 0),
    workers_assigned INT CHECK (workers_assigned > 0),
    engineer_bonus_applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_production_batches_factory ON game.production_batches(factory_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON game.production_batches(status);
CREATE INDEX IF NOT EXISTS idx_production_batches_completion ON game.production_batches(estimated_completion) WHERE status = 'in_progress';

COMMENT ON TABLE game.production_batches IS 'Tracks ongoing and completed production runs';
COMMENT ON COLUMN game.production_batches.status IS 'pending=queued, in_progress=active, completed=success, failed=error, cancelled=aborted';
COMMENT ON COLUMN game.production_batches.engineer_bonus_applied IS 'TRUE if engineer bonus was applied to result_quantity';

-- =====================================================
-- 6. FACTORY TRANSACTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS game.factory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES game.factories(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('input', 'output', 'waste', 'transfer_in', 'transfer_out')),
    item_id UUID NOT NULL REFERENCES game.items(id),
    quantity INT NOT NULL CHECK (quantity != 0),
    batch_id UUID REFERENCES game.production_batches(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_factory_transactions_factory ON game.factory_transactions(factory_id);
CREATE INDEX IF NOT EXISTS idx_factory_transactions_batch ON game.factory_transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_factory_transactions_created ON game.factory_transactions(created_at DESC);

COMMENT ON TABLE game.factory_transactions IS 'Audit trail for all factory inventory movements';
COMMENT ON COLUMN game.factory_transactions.transaction_type IS 'input=consumed in production, output=produced, waste=spoiled, transfer_in/out=moved to/from factory';

-- =====================================================
-- TRIGGER: Update factory_type based on recipe tags
-- =====================================================

CREATE OR REPLACE FUNCTION game.update_factory_type()
RETURNS TRIGGER AS $$
DECLARE
    recipe_tags TEXT[];
BEGIN
    -- Get tags from the current recipe
    IF NEW.current_recipe_id IS NOT NULL THEN
        SELECT i.tags INTO recipe_tags
        FROM game.recipes r
        JOIN game.items i ON r.result_item_id = i.id
        WHERE r.id = NEW.current_recipe_id;

        -- Detect factory type from recipe item tags
        IF 'food' = ANY(recipe_tags) THEN
            NEW.factory_type := 'food_processing';
        ELSIF 'metal' = ANY(recipe_tags) OR 'ore' = ANY(recipe_tags) THEN
            NEW.factory_type := 'metal_smelting';
        ELSIF 'chemical' = ANY(recipe_tags) OR 'fuel' = ANY(recipe_tags) THEN
            NEW.factory_type := 'chemical_refining';
        ELSIF 'construction' = ANY(recipe_tags) THEN
            NEW.factory_type := 'construction';
        ELSIF 'electronics' = ANY(recipe_tags) THEN
            NEW.factory_type := 'electronics';
        ELSIF 'medical' = ANY(recipe_tags) THEN
            NEW.factory_type := 'medical';
        ELSE
            NEW.factory_type := 'general';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_factory_type
    BEFORE INSERT OR UPDATE OF current_recipe_id ON game.factories
    FOR EACH ROW
    EXECUTE FUNCTION game.update_factory_type();

COMMENT ON FUNCTION game.update_factory_type() IS 'Auto-detects factory type from recipe item tags';

-- =====================================================
-- TRIGGER: Update worker tier based on XP
-- =====================================================

CREATE OR REPLACE FUNCTION game.update_worker_tier()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate tier from XP thresholds
    NEW.tier := CASE
        WHEN NEW.xp >= 2000 THEN 5
        WHEN NEW.xp >= 1000 THEN 4
        WHEN NEW.xp >= 500 THEN 3
        WHEN NEW.xp >= 250 THEN 2
        WHEN NEW.xp >= 100 THEN 1
        ELSE 0
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_worker_tier
    BEFORE INSERT OR UPDATE OF xp ON game.workers
    FOR EACH ROW
    EXECUTE FUNCTION game.update_worker_tier();

COMMENT ON FUNCTION game.update_worker_tier() IS 'Auto-calculates worker tier from XP: 0-99=T0, 100-249=T1, 250-499=T2, 500-999=T3, 1000-1999=T4, 2000+=T5';

-- =====================================================
-- TRIGGER: Update factories.updated_at timestamp
-- =====================================================

CREATE OR REPLACE FUNCTION game.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_factories_updated_at
    BEFORE UPDATE ON game.factories
    FOR EACH ROW
    EXECUTE FUNCTION game.update_updated_at_column();

-- =====================================================
-- TRIGGER: Update factory_storage.updated_at timestamp
-- =====================================================

CREATE TRIGGER trigger_factory_storage_updated_at
    BEFORE UPDATE ON game.factory_storage
    FOR EACH ROW
    EXECUTE FUNCTION game.update_updated_at_column();

-- =====================================================
-- DONE - Phase 2 Schema Complete
-- =====================================================

SELECT 'Phase 2 schema created successfully - 6 tables + 4 triggers' AS status;
