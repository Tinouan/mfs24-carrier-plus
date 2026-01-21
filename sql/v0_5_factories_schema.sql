-- =====================================================
-- V0.5 FACTORIES SYSTEM - FULL SCHEMA
-- =====================================================
-- Description: Complete factory production system
-- Author: Claude (with user specs)
-- Date: 2026-01-21
-- =====================================================

-- =====================================================
-- 1. ITEMS (Matières premières et produits finis)
-- =====================================================

CREATE TABLE IF NOT EXISTS game.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    tier INT NOT NULL CHECK (tier BETWEEN 0 AND 5),
    tags TEXT[] NOT NULL,  -- Array: {'food', 'raw', 'animal'}
    icon VARCHAR(10),      -- Emoji: "🐟", "🧂"
    base_value DECIMAL(10, 2) NOT NULL,
    weight_kg DECIMAL(8, 3) NOT NULL,
    is_raw BOOLEAN DEFAULT FALSE,
    stack_size INT DEFAULT 100,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_tier ON game.items(tier);
CREATE INDEX IF NOT EXISTS idx_items_tags ON game.items USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_items_is_raw ON game.items(is_raw);

COMMENT ON TABLE game.items IS 'Catalogue complet des items (T0 raw materials → T5 advanced products)';
COMMENT ON COLUMN game.items.tier IS '0=raw materials, 1-5=processed goods';
COMMENT ON COLUMN game.items.tags IS 'Categories: food, construction, electronics, medical, fuel, etc.';

-- =====================================================
-- 2. RECIPES (Recettes de production)
-- =====================================================

CREATE TABLE IF NOT EXISTS game.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    tier INT NOT NULL CHECK (tier BETWEEN 1 AND 5),
    result_item_id UUID NOT NULL REFERENCES game.items(id),
    result_quantity INT NOT NULL CHECK (result_quantity > 0),
    production_time_hours DECIMAL(5, 2) NOT NULL CHECK (production_time_hours > 0),
    base_workers_required INT DEFAULT 10 CHECK (base_workers_required > 0),
    description TEXT,
    unlock_requirements JSONB,  -- For future tech tree
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipes_tier ON game.recipes(tier);
CREATE INDEX IF NOT EXISTS idx_recipes_result_item ON game.recipes(result_item_id);

COMMENT ON TABLE game.recipes IS 'Production recipes (inputs → output)';
COMMENT ON COLUMN game.recipes.unlock_requirements IS 'Future: tech tree requirements as JSON';

-- =====================================================
-- 3. RECIPE INGREDIENTS (Ingrédients des recettes)
-- =====================================================

CREATE TABLE IF NOT EXISTS game.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES game.recipes(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES game.items(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    position INT NOT NULL CHECK (position BETWEEN 0 AND 3),
    UNIQUE(recipe_id, position),
    UNIQUE(recipe_id, item_id)  -- Can't use same ingredient twice in one recipe
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON game.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_item ON game.recipe_ingredients(item_id);

COMMENT ON TABLE game.recipe_ingredients IS 'Ingredients needed for each recipe (2-4 ingredients per recipe)';

-- =====================================================
-- 4. AIRPORTS ENHANCEMENTS
-- =====================================================

-- Add factory-related columns to existing airports table
ALTER TABLE public.airports ADD COLUMN IF NOT EXISTS max_factory_slots INT DEFAULT 0;
ALTER TABLE public.airports ADD COLUMN IF NOT EXISTS occupied_slots INT DEFAULT 0;

-- Trigger to calculate max_slots based on airport type
CREATE OR REPLACE FUNCTION public.calculate_max_slots()
RETURNS TRIGGER AS $$
BEGIN
    -- Based on type + scheduled_service
    IF NEW.type = 'large_airport' AND NEW.scheduled_service = 'yes' THEN
        NEW.max_factory_slots := 12;
    ELSIF NEW.type = 'medium_airport' THEN
        NEW.max_factory_slots := 6;
    ELSIF NEW.type = 'small_airport' THEN
        NEW.max_factory_slots := 3;
    ELSE
        NEW.max_factory_slots := 0;  -- Heliports, seaplane bases = no factories
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_max_slots ON public.airports;
CREATE TRIGGER trigger_calculate_max_slots
BEFORE INSERT OR UPDATE ON public.airports
FOR EACH ROW EXECUTE FUNCTION public.calculate_max_slots();

COMMENT ON COLUMN public.airports.max_factory_slots IS 'Maximum factory slots (12=large, 6=medium, 3=small, 0=heliport)';
COMMENT ON COLUMN public.airports.occupied_slots IS 'Current number of occupied slots';

-- =====================================================
-- 5. FACTORIES (Usines joueurs et PNJ)
-- =====================================================

CREATE TABLE IF NOT EXISTS game.factories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    airport_id INT NOT NULL REFERENCES public.airports(id),  -- From airports.csv
    company_id UUID REFERENCES game.companies(id) ON DELETE CASCADE,

    -- NPC vs Player factory
    is_npc BOOLEAN DEFAULT FALSE,

    -- Tier and type (dynamic based on recipe)
    tier INT NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 5),
    factory_type VARCHAR(50),  -- Detected: "food", "construction", "electronics", "medical", "fuel"
    factory_icon VARCHAR(10),  -- Auto-assigned emoji

    -- Production state
    active_recipe_id UUID REFERENCES game.recipes(id),
    is_active BOOLEAN DEFAULT FALSE,

    -- Capacities (tier-based)
    max_workers INT NOT NULL,
    max_engineers INT NOT NULL,
    max_storage INT NOT NULL,

    -- NPC-specific fields
    produced_item_id UUID REFERENCES game.items(id),  -- For NPC factories only
    stock_max INT,  -- For NPC factories
    respawn_rate INT,  -- Units per hour for NPC factories

    -- Position (for map display)
    position_lat DECIMAL(10, 8),
    position_lng DECIMAL(11, 8),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    upgraded_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_npc_factory CHECK (
        (is_npc = TRUE AND company_id IS NULL AND produced_item_id IS NOT NULL) OR
        (is_npc = FALSE AND company_id IS NOT NULL AND produced_item_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_factories_airport ON game.factories(airport_id);
CREATE INDEX IF NOT EXISTS idx_factories_company ON game.factories(company_id);
CREATE INDEX IF NOT EXISTS idx_factories_type ON game.factories(factory_type);
CREATE INDEX IF NOT EXISTS idx_factories_is_npc ON game.factories(is_npc);
CREATE INDEX IF NOT EXISTS idx_factories_active ON game.factories(is_active);

COMMENT ON TABLE game.factories IS 'Both player and NPC factories';
COMMENT ON COLUMN game.factories.is_npc IS 'TRUE=NPC factory (unlimited stock), FALSE=player factory';
COMMENT ON COLUMN game.factories.factory_type IS 'Auto-detected from active recipe tags (food, construction, etc.)';

-- =====================================================
-- 6. AUTO-UPDATE FACTORY TYPE ON RECIPE CHANGE
-- =====================================================

CREATE OR REPLACE FUNCTION game.update_factory_type()
RETURNS TRIGGER AS $$
DECLARE
    recipe_tags TEXT[];
    tag_counts JSONB;
    dominant_type TEXT;
    max_count INT := 0;
BEGIN
    -- Only for player factories with a recipe
    IF NEW.active_recipe_id IS NOT NULL AND NEW.is_npc = FALSE THEN
        -- Get all tags from recipe (ingredients + result)
        SELECT array_agg(DISTINCT unnested_tag)
        INTO recipe_tags
        FROM (
            -- Tags from ingredients
            SELECT unnest(i.tags) AS unnested_tag
            FROM game.recipe_ingredients ri
            JOIN game.items i ON ri.item_id = i.id
            WHERE ri.recipe_id = NEW.active_recipe_id
            UNION
            -- Tags from result
            SELECT unnest(i.tags)
            FROM game.recipes r
            JOIN game.items i ON r.result_item_id = i.id
            WHERE r.id = NEW.active_recipe_id
        ) AS all_tags;

        -- Count occurrences per category
        tag_counts := jsonb_build_object(
            'food', (SELECT COUNT(*) FROM unnest(recipe_tags) t WHERE t = 'food'),
            'construction', (SELECT COUNT(*) FROM unnest(recipe_tags) t WHERE t = 'construction'),
            'electronics', (SELECT COUNT(*) FROM unnest(recipe_tags) t WHERE t = 'electronics'),
            'medical', (SELECT COUNT(*) FROM unnest(recipe_tags) t WHERE t = 'medical'),
            'fuel', (SELECT COUNT(*) FROM unnest(recipe_tags) t WHERE t = 'fuel')
        );

        -- Find dominant type (category with most tags)
        SELECT key INTO dominant_type
        FROM jsonb_each(tag_counts)
        ORDER BY (value)::int DESC
        LIMIT 1;

        NEW.factory_type := dominant_type;

        -- Assign icon based on type
        NEW.factory_icon := CASE dominant_type
            WHEN 'food' THEN '🍽️'
            WHEN 'construction' THEN '🏗️'
            WHEN 'electronics' THEN '⚡'
            WHEN 'medical' THEN '⚕️'
            WHEN 'fuel' THEN '⛽'
            ELSE '🏭'
        END;
    ELSIF NEW.is_npc = TRUE THEN
        -- NPC factories: type based on produced item
        SELECT CASE
            WHEN 'food' = ANY(tags) THEN 'food'
            WHEN 'construction' = ANY(tags) THEN 'construction'
            WHEN 'fuel' = ANY(tags) THEN 'fuel'
            ELSE 'raw'
        END,
        CASE
            WHEN 'food' = ANY(tags) THEN '🎣'
            WHEN 'construction' = ANY(tags) THEN '⛏️'
            WHEN 'fuel' = ANY(tags) THEN '🛢️'
            ELSE '🏭'
        END
        INTO NEW.factory_type, NEW.factory_icon
        FROM game.items
        WHERE id = NEW.produced_item_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_factory_type ON game.factories;
CREATE TRIGGER trigger_update_factory_type
BEFORE INSERT OR UPDATE OF active_recipe_id, produced_item_id ON game.factories
FOR EACH ROW EXECUTE FUNCTION game.update_factory_type();

-- =====================================================
-- 7. WORKERS
-- =====================================================

CREATE TABLE IF NOT EXISTS game.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    origin_airport_id INT NOT NULL REFERENCES public.airports(id),
    current_factory_id UUID REFERENCES game.factories(id) ON DELETE SET NULL,
    company_id UUID NOT NULL REFERENCES game.companies(id) ON DELETE CASCADE,

    -- Progression
    xp INT DEFAULT 0 CHECK (xp BETWEEN 0 AND 1000),
    tier INT DEFAULT 1 CHECK (tier BETWEEN 1 AND 5),

    -- Economy
    hourly_wage DECIMAL(8, 2) NOT NULL DEFAULT 10.00,

    -- Health
    health_status VARCHAR(20) DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'injured', 'dead')),
    hunger_level DECIMAL(5, 2) DEFAULT 100.0 CHECK (hunger_level BETWEEN 0 AND 100),
    injury_date TIMESTAMPTZ,

    -- Stats
    hired_date TIMESTAMPTZ DEFAULT NOW(),
    total_work_hours INT DEFAULT 0,

    CONSTRAINT chk_injury_date CHECK (
        (health_status = 'injured' AND injury_date IS NOT NULL) OR
        (health_status != 'injured')
    )
);

CREATE INDEX IF NOT EXISTS idx_workers_factory ON game.workers(current_factory_id);
CREATE INDEX IF NOT EXISTS idx_workers_company ON game.workers(company_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON game.workers(health_status);
CREATE INDEX IF NOT EXISTS idx_workers_tier ON game.workers(tier);

COMMENT ON TABLE game.workers IS 'Factory workers with XP progression system';
COMMENT ON COLUMN game.workers.tier IS 'Auto-calculated from XP: 1-5';
COMMENT ON COLUMN game.workers.hunger_level IS 'Decreases 5/hour during production, affects injury risk';

-- Auto-update tier based on XP
CREATE OR REPLACE FUNCTION game.update_worker_tier()
RETURNS TRIGGER AS $$
BEGIN
    NEW.tier := CASE
        WHEN NEW.xp <= 200 THEN 1
        WHEN NEW.xp <= 400 THEN 2
        WHEN NEW.xp <= 600 THEN 3
        WHEN NEW.xp <= 800 THEN 4
        ELSE 5
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_worker_tier ON game.workers;
CREATE TRIGGER trigger_update_worker_tier
BEFORE INSERT OR UPDATE OF xp ON game.workers
FOR EACH ROW EXECUTE FUNCTION game.update_worker_tier();

-- =====================================================
-- 8. ENGINEERS
-- =====================================================

CREATE TABLE IF NOT EXISTS game.engineers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    origin_airport_id INT NOT NULL REFERENCES public.airports(id),
    current_factory_id UUID REFERENCES game.factories(id) ON DELETE SET NULL,
    company_id UUID NOT NULL REFERENCES game.companies(id) ON DELETE CASCADE,

    hourly_wage DECIMAL(8, 2) NOT NULL DEFAULT 100.00,

    hired_date TIMESTAMPTZ DEFAULT NOW(),
    total_work_hours INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_engineers_factory ON game.engineers(current_factory_id);
CREATE INDEX IF NOT EXISTS idx_engineers_company ON game.engineers(company_id);

COMMENT ON TABLE game.engineers IS 'Engineers provide bonuses: +15-50% production speed, +10-30% quality';

-- =====================================================
-- 9. FACTORY STORAGE (Inventaire propre aux usines)
-- =====================================================

CREATE TABLE IF NOT EXISTS game.factory_storage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES game.factories(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES game.items(id),
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(factory_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_factory_storage_factory ON game.factory_storage(factory_id);
CREATE INDEX IF NOT EXISTS idx_factory_storage_item ON game.factory_storage(item_id);

COMMENT ON TABLE game.factory_storage IS 'Independent inventory system for factories (not shared with main inventory)';

-- =====================================================
-- 10. PRODUCTION BATCHES (Historique production)
-- =====================================================

CREATE TABLE IF NOT EXISTS game.production_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES game.factories(id) ON DELETE CASCADE,
    recipe_id UUID NOT NULL REFERENCES game.recipes(id),

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    estimated_completion TIMESTAMPTZ NOT NULL,
    actual_completion TIMESTAMPTZ,

    -- Items (stored as JSON for flexibility)
    input_items JSONB NOT NULL,   -- {"item_id": quantity, ...}
    output_items JSONB NOT NULL,  -- {"item_id": quantity}

    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),

    -- Snapshot of conditions at batch start
    workers_count INT NOT NULL,
    engineers_count INT NOT NULL,
    avg_worker_tier DECIMAL(3, 2),
    production_rate_snapshot DECIMAL(8, 4)
);

CREATE INDEX IF NOT EXISTS idx_production_batches_factory ON game.production_batches(factory_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON game.production_batches(status);
CREATE INDEX IF NOT EXISTS idx_production_batches_started ON game.production_batches(started_at);

COMMENT ON TABLE game.production_batches IS 'Track production batches for analytics and completion';

-- =====================================================
-- 11. TRANSACTIONS LOG (Pour analytics)
-- =====================================================

CREATE TABLE IF NOT EXISTS game.factory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES game.companies(id),
    transaction_type VARCHAR(50) NOT NULL,  -- "slot_purchase", "factory_build", "factory_upgrade", "worker_salary", "engineer_salary", "item_purchase", "item_transfer"
    amount DECIMAL(15, 2) NOT NULL,
    related_factory_id UUID REFERENCES game.factories(id),
    related_item_id UUID REFERENCES game.items(id),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factory_transactions_company ON game.factory_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_factory_transactions_type ON game.factory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_factory_transactions_date ON game.factory_transactions(created_at);

COMMENT ON TABLE game.factory_transactions IS 'Complete transaction log for analytics';

-- =====================================================
-- SCHEMA COMPLETE ✅
-- =====================================================

-- Update occupied_slots when factory is created/deleted
CREATE OR REPLACE FUNCTION game.update_airport_occupied_slots()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.airports
        SET occupied_slots = occupied_slots + 1
        WHERE id = NEW.airport_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.airports
        SET occupied_slots = GREATEST(0, occupied_slots - 1)
        WHERE id = OLD.airport_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_occupied_slots_insert ON game.factories;
CREATE TRIGGER trigger_update_occupied_slots_insert
AFTER INSERT ON game.factories
FOR EACH ROW EXECUTE FUNCTION game.update_airport_occupied_slots();

DROP TRIGGER IF EXISTS trigger_update_occupied_slots_delete ON game.factories;
CREATE TRIGGER trigger_update_occupied_slots_delete
AFTER DELETE ON game.factories
FOR EACH ROW EXECUTE FUNCTION game.update_airport_occupied_slots();

-- =====================================================
-- NOTES:
-- - All game logic tables are in 'game' schema
-- - Airports table is in 'public' schema (managed by Directus)
-- - Triggers handle: tier calculation, factory type detection, slot counting
-- - Next step: Seed items and recipes
-- =====================================================
