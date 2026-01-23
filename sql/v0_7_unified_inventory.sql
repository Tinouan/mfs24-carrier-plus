-- =====================================================
-- V0.7 UNIFIED INVENTORY SYSTEM
-- =====================================================
-- Implements unified inventory with physical localization:
-- - Items are physically located at airports (anti-cheat)
-- - Players AND Companies have warehouses
-- - Local transfers only (same airport)
-- - Inter-airport transport = flight required
-- =====================================================

-- =====================================================
-- 1. MODIFY game.inventory_locations
-- =====================================================
-- Add polymorphic ownership: owner_type + owner_id
-- Support: player_warehouse, company_warehouse, aircraft cargo

-- Step 1a: Add new columns
ALTER TABLE game.inventory_locations
    ADD COLUMN IF NOT EXISTS owner_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS owner_id UUID,
    ADD COLUMN IF NOT EXISTS aircraft_id UUID;

-- Step 1b: Migrate existing data (company_id → owner_id with owner_type='company')
UPDATE game.inventory_locations
SET owner_type = 'company',
    owner_id = company_id
WHERE owner_id IS NULL AND company_id IS NOT NULL;

-- Step 1c: Set default for owner_type after migration
ALTER TABLE game.inventory_locations
    ALTER COLUMN owner_type SET DEFAULT 'company';

-- Step 1d: Drop old CHECK constraint on kind
ALTER TABLE game.inventory_locations
    DROP CONSTRAINT IF EXISTS inventory_locations_kind_check;

-- Step 1e: Add new CHECK constraint for kind
-- Values: player_warehouse, company_warehouse, factory_storage, aircraft
ALTER TABLE game.inventory_locations
    ADD CONSTRAINT inventory_locations_kind_check
    CHECK (kind IN ('vault', 'player_warehouse', 'company_warehouse', 'factory_storage', 'aircraft', 'warehouse', 'in_transit'));
-- Note: 'vault', 'warehouse', 'in_transit' kept for backward compatibility during migration

-- Step 1f: Add owner_type CHECK constraint
ALTER TABLE game.inventory_locations
    ADD CONSTRAINT check_owner_type
    CHECK (owner_type IN ('company', 'player'));

-- Step 1g: Drop NOT NULL constraint on company_id to allow player warehouses
ALTER TABLE game.inventory_locations
    ALTER COLUMN company_id DROP NOT NULL;

-- Step 1h: Add foreign key for aircraft_id
ALTER TABLE game.inventory_locations
    ADD CONSTRAINT fk_inventory_locations_aircraft
    FOREIGN KEY (aircraft_id) REFERENCES game.company_aircraft(id) ON DELETE CASCADE;

-- Step 1i: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_locations_owner
ON game.inventory_locations(owner_type, owner_id);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_aircraft
ON game.inventory_locations(aircraft_id) WHERE aircraft_id IS NOT NULL;

-- Step 1j: Add NOT NULL constraint for owner_id (after migration)
-- Note: Run this after verifying all data is migrated
-- ALTER TABLE game.inventory_locations
--     ADD CONSTRAINT check_owner_id_not_null CHECK (owner_id IS NOT NULL);

COMMENT ON COLUMN game.inventory_locations.owner_type IS 'company or player';
COMMENT ON COLUMN game.inventory_locations.owner_id IS 'UUID of owner (company_id or user_id)';
COMMENT ON COLUMN game.inventory_locations.aircraft_id IS 'Reference to aircraft for kind=aircraft';

-- =====================================================
-- 2. MODIFY game.company_aircraft
-- =====================================================
-- Add cargo capacity and flexible ownership (company OR player)

-- Step 2a: Add new columns
ALTER TABLE game.company_aircraft
    ADD COLUMN IF NOT EXISTS cargo_capacity_kg INT DEFAULT 500,
    ADD COLUMN IF NOT EXISTS owner_type VARCHAR(20) DEFAULT 'company',
    ADD COLUMN IF NOT EXISTS user_id UUID;

-- Step 2b: Add foreign key for user_id
ALTER TABLE game.company_aircraft
    ADD CONSTRAINT fk_company_aircraft_user
    FOREIGN KEY (user_id) REFERENCES game.users(id) ON DELETE CASCADE;

-- Step 2c: Drop NOT NULL constraint on company_id to allow player-owned aircraft
ALTER TABLE game.company_aircraft
    ALTER COLUMN company_id DROP NOT NULL;

-- Step 2d: Add CHECK constraint for owner logic
-- Either (company_id NOT NULL AND user_id IS NULL) OR (user_id NOT NULL AND company_id IS NULL)
ALTER TABLE game.company_aircraft
    ADD CONSTRAINT check_aircraft_owner
    CHECK (
        (owner_type = 'company' AND company_id IS NOT NULL AND user_id IS NULL)
        OR
        (owner_type = 'player' AND user_id IS NOT NULL AND company_id IS NULL)
    );

-- Step 2e: Add index on user_id
CREATE INDEX IF NOT EXISTS idx_company_aircraft_user
ON game.company_aircraft(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_aircraft_location
ON game.company_aircraft(current_airport_ident);

COMMENT ON COLUMN game.company_aircraft.cargo_capacity_kg IS 'Maximum cargo weight in kg';
COMMENT ON COLUMN game.company_aircraft.owner_type IS 'company or player';
COMMENT ON COLUMN game.company_aircraft.user_id IS 'Owner user_id if player-owned aircraft';

-- =====================================================
-- 3. CREATE game.company_permissions
-- =====================================================
-- Granular permissions per member (replaces simple role system)

CREATE TABLE IF NOT EXISTS game.company_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES game.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES game.users(id) ON DELETE CASCADE,

    -- Warehouse permissions
    can_withdraw_warehouse BOOLEAN DEFAULT false NOT NULL,
    can_deposit_warehouse BOOLEAN DEFAULT true NOT NULL,

    -- Factory permissions
    can_withdraw_factory BOOLEAN DEFAULT false NOT NULL,
    can_deposit_factory BOOLEAN DEFAULT true NOT NULL,

    -- Aircraft permissions
    can_manage_aircraft BOOLEAN DEFAULT false NOT NULL,
    can_use_aircraft BOOLEAN DEFAULT true NOT NULL,

    -- Market permissions
    can_sell_market BOOLEAN DEFAULT false NOT NULL,
    can_buy_market BOOLEAN DEFAULT true NOT NULL,

    -- Management permissions
    can_manage_workers BOOLEAN DEFAULT false NOT NULL,
    can_manage_members BOOLEAN DEFAULT false NOT NULL,
    can_manage_factories BOOLEAN DEFAULT false NOT NULL,

    -- Special flags
    is_founder BOOLEAN DEFAULT false NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_permissions_company
ON game.company_permissions(company_id);

CREATE INDEX IF NOT EXISTS idx_company_permissions_user
ON game.company_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_company_permissions_founder
ON game.company_permissions(company_id) WHERE is_founder = true;

COMMENT ON TABLE game.company_permissions IS 'Granular permissions per company member (V0.7)';
COMMENT ON COLUMN game.company_permissions.is_founder IS 'Founder has all permissions regardless of other flags';
COMMENT ON COLUMN game.company_permissions.can_withdraw_warehouse IS 'Can take items from company warehouse';
COMMENT ON COLUMN game.company_permissions.can_manage_members IS 'Can invite/kick members and modify permissions';

-- Trigger for updated_at
CREATE TRIGGER trigger_company_permissions_updated_at
    BEFORE UPDATE ON game.company_permissions
    FOR EACH ROW
    EXECUTE FUNCTION game.update_updated_at_column();

-- =====================================================
-- 4. MIGRATE EXISTING DATA
-- =====================================================

-- 4a: Create permissions for existing company members
-- Founders (company owners) get full permissions
INSERT INTO game.company_permissions (
    company_id, user_id,
    can_withdraw_warehouse, can_deposit_warehouse,
    can_withdraw_factory, can_deposit_factory,
    can_manage_aircraft, can_use_aircraft,
    can_sell_market, can_buy_market,
    can_manage_workers, can_manage_members, can_manage_factories,
    is_founder
)
SELECT
    cm.company_id,
    cm.user_id,
    true, true,  -- warehouse
    true, true,  -- factory
    true, true,  -- aircraft
    true, true,  -- market
    true, true, true,  -- management
    true  -- is_founder
FROM game.company_members cm
WHERE cm.role = 'owner'
ON CONFLICT (company_id, user_id) DO NOTHING;

-- Admins get most permissions except member management
INSERT INTO game.company_permissions (
    company_id, user_id,
    can_withdraw_warehouse, can_deposit_warehouse,
    can_withdraw_factory, can_deposit_factory,
    can_manage_aircraft, can_use_aircraft,
    can_sell_market, can_buy_market,
    can_manage_workers, can_manage_members, can_manage_factories,
    is_founder
)
SELECT
    cm.company_id,
    cm.user_id,
    true, true,  -- warehouse
    true, true,  -- factory
    true, true,  -- aircraft
    true, true,  -- market
    true, false, true,  -- management (no member management)
    false
FROM game.company_members cm
WHERE cm.role = 'admin'
ON CONFLICT (company_id, user_id) DO NOTHING;

-- Regular members get basic permissions
INSERT INTO game.company_permissions (
    company_id, user_id,
    can_withdraw_warehouse, can_deposit_warehouse,
    can_withdraw_factory, can_deposit_factory,
    can_manage_aircraft, can_use_aircraft,
    can_sell_market, can_buy_market,
    can_manage_workers, can_manage_members, can_manage_factories,
    is_founder
)
SELECT
    cm.company_id,
    cm.user_id,
    false, true,  -- warehouse (deposit only)
    false, true,  -- factory (deposit only)
    false, true,  -- aircraft (use only)
    false, true,  -- market (buy only)
    false, false, false,  -- no management
    false
FROM game.company_members cm
WHERE cm.role = 'member'
ON CONFLICT (company_id, user_id) DO NOTHING;

-- 4b: Update warehouse kind values for clarity
-- Convert 'warehouse' to 'company_warehouse' for existing company warehouses
UPDATE game.inventory_locations
SET kind = 'company_warehouse'
WHERE kind = 'warehouse' AND owner_type = 'company';

-- 4c: Migrate vault items to company_warehouse at home airport
-- Create warehouses at home airport for companies that have vaults
INSERT INTO game.inventory_locations (company_id, kind, airport_ident, name, owner_type, owner_id)
SELECT
    il.company_id,
    'company_warehouse',
    c.home_airport_ident,
    'Main Warehouse (migrated from vault)',
    'company',
    il.company_id
FROM game.inventory_locations il
JOIN game.companies c ON c.id = il.company_id
WHERE il.kind = 'vault'
AND NOT EXISTS (
    SELECT 1 FROM game.inventory_locations il2
    WHERE il2.company_id = il.company_id
    AND il2.airport_ident = c.home_airport_ident
    AND il2.kind = 'company_warehouse'
);

-- Move items from vault to the new warehouse
WITH vault_to_warehouse AS (
    SELECT
        v.id as vault_id,
        w.id as warehouse_id
    FROM game.inventory_locations v
    JOIN game.companies c ON c.id = v.company_id
    JOIN game.inventory_locations w ON w.company_id = v.company_id
        AND w.airport_ident = c.home_airport_ident
        AND w.kind = 'company_warehouse'
    WHERE v.kind = 'vault'
)
UPDATE game.inventory_items ii
SET location_id = vtw.warehouse_id
FROM vault_to_warehouse vtw
WHERE ii.location_id = vtw.vault_id;

-- Delete empty vaults (items already moved)
DELETE FROM game.inventory_locations
WHERE kind = 'vault'
AND NOT EXISTS (
    SELECT 1 FROM game.inventory_items ii WHERE ii.location_id = game.inventory_locations.id
);

-- =====================================================
-- 5. CREATE HELPER VIEWS
-- =====================================================

-- View: User's inventory overview across all locations
CREATE OR REPLACE VIEW game.v_user_inventory_overview AS
SELECT
    u.id as user_id,
    il.id as location_id,
    il.kind,
    il.airport_ident,
    a.name as airport_name,
    CASE
        WHEN il.owner_type = 'player' THEN 'personal'
        WHEN il.owner_type = 'company' THEN c.name
    END as owner_name,
    il.owner_type,
    il.owner_id,
    ii.item_id,
    i.name as item_name,
    i.tier,
    ii.qty,
    i.base_value * ii.qty as total_value
FROM game.users u
-- Player's own warehouses
LEFT JOIN game.inventory_locations il ON (
    (il.owner_type = 'player' AND il.owner_id = u.id)
    OR
    (il.owner_type = 'company' AND il.owner_id IN (
        SELECT company_id FROM game.company_members WHERE user_id = u.id
    ))
)
LEFT JOIN game.inventory_items ii ON ii.location_id = il.id
LEFT JOIN game.items i ON i.id = ii.item_id
LEFT JOIN public.airports a ON a.ident = il.airport_ident
LEFT JOIN game.companies c ON c.id = il.owner_id AND il.owner_type = 'company'
WHERE ii.qty > 0;

COMMENT ON VIEW game.v_user_inventory_overview IS 'All inventory items visible to a user (personal + company)';

-- View: Aircraft cargo summary
CREATE OR REPLACE VIEW game.v_aircraft_cargo AS
SELECT
    ca.id as aircraft_id,
    ca.aircraft_type,
    ca.current_airport_ident,
    a.name as airport_name,
    ca.owner_type,
    CASE
        WHEN ca.owner_type = 'player' THEN ca.user_id
        ELSE ca.company_id
    END as owner_id,
    COALESCE(c.name, u.email) as owner_name,
    ca.cargo_capacity_kg,
    COALESCE(SUM(ii.qty * i.weight_kg), 0) as current_cargo_kg,
    ca.cargo_capacity_kg - COALESCE(SUM(ii.qty * i.weight_kg), 0) as available_capacity_kg,
    ca.status
FROM game.company_aircraft ca
LEFT JOIN game.inventory_locations il ON il.aircraft_id = ca.id AND il.kind = 'aircraft'
LEFT JOIN game.inventory_items ii ON ii.location_id = il.id
LEFT JOIN game.items i ON i.id = ii.item_id
LEFT JOIN public.airports a ON a.ident = ca.current_airport_ident
LEFT JOIN game.companies c ON c.id = ca.company_id
LEFT JOIN game.users u ON u.id = ca.user_id
GROUP BY ca.id, ca.aircraft_type, ca.current_airport_ident, a.name,
         ca.owner_type, ca.company_id, ca.user_id, c.name, u.email,
         ca.cargo_capacity_kg, ca.status;

COMMENT ON VIEW game.v_aircraft_cargo IS 'Aircraft cargo capacity and current load summary';

-- =====================================================
-- 6. CREATE INVENTORY LOCATION FOR EACH AIRCRAFT
-- =====================================================
-- Auto-create inventory_location of kind='aircraft' for existing aircraft

INSERT INTO game.inventory_locations (company_id, kind, airport_ident, name, owner_type, owner_id, aircraft_id)
SELECT
    ca.company_id,
    'aircraft',
    ca.current_airport_ident,
    ca.aircraft_type || ' Cargo',
    ca.owner_type,
    COALESCE(ca.company_id, ca.user_id),
    ca.id
FROM game.company_aircraft ca
WHERE NOT EXISTS (
    SELECT 1 FROM game.inventory_locations il
    WHERE il.aircraft_id = ca.id
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 7. CREATE FUNCTION FOR TRANSFER VALIDATION
-- =====================================================

CREATE OR REPLACE FUNCTION game.validate_inventory_transfer(
    p_from_location_id UUID,
    p_to_location_id UUID,
    p_item_id UUID,
    p_quantity INT,
    p_user_id UUID
) RETURNS TABLE (
    is_valid BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_from_airport VARCHAR(8);
    v_to_airport VARCHAR(8);
    v_from_owner_type VARCHAR(20);
    v_from_owner_id UUID;
    v_to_owner_type VARCHAR(20);
    v_to_owner_id UUID;
    v_to_kind VARCHAR(20);
    v_to_aircraft_id UUID;
    v_current_stock INT;
    v_cargo_capacity INT;
    v_current_cargo_weight NUMERIC;
    v_item_weight NUMERIC;
BEGIN
    -- Get source location info
    SELECT airport_ident, owner_type, owner_id
    INTO v_from_airport, v_from_owner_type, v_from_owner_id
    FROM game.inventory_locations WHERE id = p_from_location_id;

    IF v_from_airport IS NULL THEN
        RETURN QUERY SELECT false, 'Source location not found';
        RETURN;
    END IF;

    -- Get destination location info
    SELECT airport_ident, owner_type, owner_id, kind, aircraft_id
    INTO v_to_airport, v_to_owner_type, v_to_owner_id, v_to_kind, v_to_aircraft_id
    FROM game.inventory_locations WHERE id = p_to_location_id;

    IF v_to_airport IS NULL THEN
        RETURN QUERY SELECT false, 'Destination location not found';
        RETURN;
    END IF;

    -- Check same airport
    IF v_from_airport != v_to_airport THEN
        RETURN QUERY SELECT false, 'Transfer between airports not allowed. Use aircraft for transport.';
        RETURN;
    END IF;

    -- Check stock
    SELECT COALESCE(qty, 0) INTO v_current_stock
    FROM game.inventory_items
    WHERE location_id = p_from_location_id AND item_id = p_item_id;

    IF v_current_stock < p_quantity THEN
        RETURN QUERY SELECT false, format('Insufficient stock (%s available, %s requested)', v_current_stock, p_quantity);
        RETURN;
    END IF;

    -- If destination is aircraft, check cargo capacity
    IF v_to_kind = 'aircraft' AND v_to_aircraft_id IS NOT NULL THEN
        SELECT cargo_capacity_kg INTO v_cargo_capacity
        FROM game.company_aircraft WHERE id = v_to_aircraft_id;

        SELECT COALESCE(SUM(ii.qty * i.weight_kg), 0) INTO v_current_cargo_weight
        FROM game.inventory_items ii
        JOIN game.items i ON i.id = ii.item_id
        WHERE ii.location_id = p_to_location_id;

        SELECT weight_kg INTO v_item_weight
        FROM game.items WHERE id = p_item_id;

        IF v_current_cargo_weight + (p_quantity * v_item_weight) > v_cargo_capacity THEN
            RETURN QUERY SELECT false, format('Cargo capacity exceeded (%s kg max, %s kg current, %s kg to add)',
                v_cargo_capacity, v_current_cargo_weight, p_quantity * v_item_weight);
            RETURN;
        END IF;
    END IF;

    -- All checks passed
    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION game.validate_inventory_transfer IS 'Validates inventory transfer: same airport, sufficient stock, cargo capacity';

-- =====================================================
-- 8. CREATE FUNCTION FOR EXECUTING TRANSFER
-- =====================================================

CREATE OR REPLACE FUNCTION game.execute_inventory_transfer(
    p_from_location_id UUID,
    p_to_location_id UUID,
    p_item_id UUID,
    p_quantity INT,
    p_user_id UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_validation RECORD;
BEGIN
    -- Validate first
    SELECT * INTO v_validation
    FROM game.validate_inventory_transfer(p_from_location_id, p_to_location_id, p_item_id, p_quantity, p_user_id);

    IF NOT v_validation.is_valid THEN
        RAISE EXCEPTION '%', v_validation.error_message;
    END IF;

    -- Decrease from source
    UPDATE game.inventory_items
    SET qty = qty - p_quantity, updated_at = NOW()
    WHERE location_id = p_from_location_id AND item_id = p_item_id;

    -- Increase at destination (insert or update)
    INSERT INTO game.inventory_items (location_id, item_id, qty)
    VALUES (p_to_location_id, p_item_id, p_quantity)
    ON CONFLICT (location_id, item_id)
    DO UPDATE SET qty = game.inventory_items.qty + p_quantity, updated_at = NOW();

    -- Audit log for source
    INSERT INTO game.inventory_audits (location_id, item_id, quantity_delta, action, user_id, notes)
    VALUES (p_from_location_id, p_item_id, -p_quantity, 'transfer_out', p_user_id,
            COALESCE(p_notes, 'Transfer to ' || p_to_location_id::TEXT));

    -- Audit log for destination
    INSERT INTO game.inventory_audits (location_id, item_id, quantity_delta, action, user_id, notes)
    VALUES (p_to_location_id, p_item_id, p_quantity, 'transfer_in', p_user_id,
            COALESCE(p_notes, 'Transfer from ' || p_from_location_id::TEXT));

    -- Clean up zero quantity rows
    DELETE FROM game.inventory_items
    WHERE location_id = p_from_location_id AND item_id = p_item_id AND qty = 0;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION game.execute_inventory_transfer IS 'Executes validated inventory transfer with audit trail';

-- =====================================================
-- DONE - V0.7 Unified Inventory System
-- =====================================================

SELECT 'V0.7 Unified Inventory System migration complete' AS status;
SELECT '- Modified: inventory_locations (owner_type, owner_id, aircraft_id)' AS changes_1;
SELECT '- Modified: company_aircraft (cargo_capacity_kg, owner_type, user_id)' AS changes_2;
SELECT '- Created: company_permissions table' AS changes_3;
SELECT '- Created: v_user_inventory_overview view' AS changes_4;
SELECT '- Created: v_aircraft_cargo view' AS changes_5;
SELECT '- Created: validate_inventory_transfer function' AS changes_6;
SELECT '- Created: execute_inventory_transfer function' AS changes_7;
