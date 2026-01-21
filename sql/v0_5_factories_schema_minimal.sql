-- =====================================================
-- V0.5 FACTORIES SYSTEM - MINIMAL SCHEMA (Phase 1 only)
-- =====================================================
-- Only creates items, recipes, and recipe_ingredients tables
-- No dependencies on companies or other tables
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
    name VARCHAR(150) NOT NULL UNIQUE,
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
-- DONE - Minimal schema for Phase 1 testing
-- =====================================================

SELECT 'Minimal schema created successfully - 3 tables: items, recipes, recipe_ingredients' AS status;
