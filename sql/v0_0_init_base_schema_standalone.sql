-- =====================================================
-- V0.0 BASE SCHEMA INITIALIZATION (STANDALONE)
-- =====================================================
-- Version sans dépendance à public.airports
-- Les foreign keys vers airports seront ajoutées plus tard
-- =====================================================

-- Ensure game schema exists
CREATE SCHEMA IF NOT EXISTS game;

-- =====================================================
-- 1. USERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS game.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_superuser BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON game.users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON game.users(is_active);

COMMENT ON TABLE game.users IS 'Game users with authentication';

-- =====================================================
-- 2. COMPANIES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS game.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    world_id INT DEFAULT 1 NOT NULL,
    name VARCHAR(80) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    owner_user_id UUID REFERENCES game.users(id) ON DELETE SET NULL,
    home_airport_ident VARCHAR(8) NOT NULL, -- Sans FK pour l'instant
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- V0.3 Company Profile
    display_name VARCHAR(48),
    description VARCHAR(400),
    logo_url VARCHAR(300),
    is_public BOOLEAN DEFAULT FALSE NOT NULL,
    settings JSONB DEFAULT '{}' NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- V0.4 Wallet
    balance NUMERIC(14, 2) DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_world ON game.companies(world_id);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON game.companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_owner ON game.companies(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_companies_airport ON game.companies(home_airport_ident);
CREATE INDEX IF NOT EXISTS idx_companies_is_public ON game.companies(is_public);

COMMENT ON TABLE game.companies IS 'Player companies';
COMMENT ON COLUMN game.companies.world_id IS 'World/server ID (default 1)';
COMMENT ON COLUMN game.companies.slug IS 'Unique URL-friendly identifier';
COMMENT ON COLUMN game.companies.balance IS 'Company wallet balance';

-- =====================================================
-- 3. COMPANY_MEMBERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS game.company_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES game.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES game.users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_company ON game.company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user ON game.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_role ON game.company_members(role);

COMMENT ON TABLE game.company_members IS 'Users membership in companies';
COMMENT ON COLUMN game.company_members.role IS 'owner=founder, admin=manager, member=regular';

-- =====================================================
-- 4. INVENTORY_LOCATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS game.inventory_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES game.companies(id) ON DELETE CASCADE,
    kind VARCHAR(20) DEFAULT 'vault' CHECK (kind IN ('vault', 'aircraft', 'airport')),
    airport_ident VARCHAR(8), -- Sans FK pour l'instant
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_company ON game.inventory_locations(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_locations_kind ON game.inventory_locations(kind);
CREATE INDEX IF NOT EXISTS idx_inventory_locations_airport ON game.inventory_locations(airport_ident);

COMMENT ON TABLE game.inventory_locations IS 'Storage locations: vault (global), aircraft, or airport';
COMMENT ON COLUMN game.inventory_locations.kind IS 'vault=company global, aircraft=specific plane, airport=warehouse';

-- =====================================================
-- 5. INVENTORY_ITEMS TABLE (depends on game.items from Phase 1)
-- =====================================================

-- Note: Cette table nécessite game.items qui est créée dans un autre script
-- On la crée sans la foreign key pour l'instant

CREATE TABLE IF NOT EXISTS game.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES game.inventory_locations(id) ON DELETE CASCADE,
    item_id UUID NOT NULL, -- Sans FK pour l'instant (nécessite game.items)
    quantity INT DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(location_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_location ON game.inventory_items(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_item ON game.inventory_items(item_id);

COMMENT ON TABLE game.inventory_items IS 'Items stored in inventory locations';
COMMENT ON COLUMN game.inventory_items.quantity IS 'Number of units stored';

-- =====================================================
-- 6. INVENTORY_AUDITS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS game.inventory_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES game.inventory_locations(id) ON DELETE CASCADE,
    item_id UUID NOT NULL, -- Sans FK pour l'instant
    quantity_delta INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES game.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_audits_location ON game.inventory_audits(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audits_item ON game.inventory_audits(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audits_created ON game.inventory_audits(created_at DESC);

COMMENT ON TABLE game.inventory_audits IS 'Audit trail for all inventory changes';
COMMENT ON COLUMN game.inventory_audits.quantity_delta IS 'Positive=added, negative=removed';
COMMENT ON COLUMN game.inventory_audits.action IS 'Description of the action (e.g. "purchase", "production", "transfer")';

-- =====================================================
-- TRIGGERS: Update updated_at timestamps
-- =====================================================

CREATE OR REPLACE FUNCTION game.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON game.users
    FOR EACH ROW
    EXECUTE FUNCTION game.update_updated_at_column();

CREATE TRIGGER trigger_companies_updated_at
    BEFORE UPDATE ON game.companies
    FOR EACH ROW
    EXECUTE FUNCTION game.update_updated_at_column();

CREATE TRIGGER trigger_inventory_items_updated_at
    BEFORE UPDATE ON game.inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION game.update_updated_at_column();

-- =====================================================
-- DONE - Base Schema Complete (Standalone Version)
-- =====================================================

SELECT 'Base schema created successfully - 6 tables + 3 triggers (standalone)' AS status;
