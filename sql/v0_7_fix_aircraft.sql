-- =====================================================
-- V0.7 FIX: Create company_aircraft and complete migration
-- =====================================================

-- 1. Create company_aircraft table if not exists
CREATE TABLE IF NOT EXISTS game.company_aircraft (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES game.companies(id) ON DELETE CASCADE,
    aircraft_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'stored'
        CHECK (status IN ('stored', 'parked', 'in_flight', 'maintenance')),
    condition FLOAT NOT NULL DEFAULT 1.0,
    hours FLOAT NOT NULL DEFAULT 0.0,
    current_airport_ident VARCHAR(8) REFERENCES public.airports(ident),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add V0.7 columns to company_aircraft
ALTER TABLE game.company_aircraft
    ADD COLUMN IF NOT EXISTS cargo_capacity_kg INT DEFAULT 500,
    ADD COLUMN IF NOT EXISTS owner_type VARCHAR(20) DEFAULT 'company',
    ADD COLUMN IF NOT EXISTS user_id UUID;

-- 3. Add FK for user_id (ignore if exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_company_aircraft_user'
    ) THEN
        ALTER TABLE game.company_aircraft
            ADD CONSTRAINT fk_company_aircraft_user
            FOREIGN KEY (user_id) REFERENCES game.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Allow company_id to be NULL
ALTER TABLE game.company_aircraft
    ALTER COLUMN company_id DROP NOT NULL;

-- 5. Add owner check constraint (drop first if exists)
ALTER TABLE game.company_aircraft
    DROP CONSTRAINT IF EXISTS check_aircraft_owner;

ALTER TABLE game.company_aircraft
    ADD CONSTRAINT check_aircraft_owner
    CHECK (
        (owner_type = 'company' AND company_id IS NOT NULL AND user_id IS NULL)
        OR
        (owner_type = 'player' AND user_id IS NOT NULL AND company_id IS NULL)
        OR
        (company_id IS NOT NULL AND user_id IS NULL)  -- Legacy rows without owner_type
    );

-- 6. Add indexes
CREATE INDEX IF NOT EXISTS idx_company_aircraft_company ON game.company_aircraft(company_id);
CREATE INDEX IF NOT EXISTS idx_company_aircraft_user ON game.company_aircraft(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_aircraft_location ON game.company_aircraft(current_airport_ident);

-- 7. Fix FK on inventory_locations (drop if broken, recreate)
ALTER TABLE game.inventory_locations
    DROP CONSTRAINT IF EXISTS fk_inventory_locations_aircraft;

ALTER TABLE game.inventory_locations
    ADD CONSTRAINT fk_inventory_locations_aircraft
    FOREIGN KEY (aircraft_id) REFERENCES game.company_aircraft(id) ON DELETE CASCADE;

-- 8. Recreate views
DROP VIEW IF EXISTS game.v_aircraft_cargo;
CREATE VIEW game.v_aircraft_cargo AS
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

-- 9. Create inventory locations for existing aircraft
INSERT INTO game.inventory_locations (company_id, kind, airport_ident, name, owner_type, owner_id, aircraft_id)
SELECT
    ca.company_id,
    'aircraft',
    ca.current_airport_ident,
    ca.aircraft_type || ' Cargo',
    COALESCE(ca.owner_type, 'company'),
    COALESCE(ca.company_id, ca.user_id),
    ca.id
FROM game.company_aircraft ca
WHERE ca.current_airport_ident IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM game.inventory_locations il WHERE il.aircraft_id = ca.id
);

SELECT 'V0.7 aircraft fix complete' AS status;
