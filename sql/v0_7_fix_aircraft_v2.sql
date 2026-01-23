-- =====================================================
-- V0.7 FIX V2: Create company_aircraft properly
-- =====================================================

-- 1. Ensure airports has unique constraint on ident
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'airports_ident_key' OR conname = 'airports_pkey'
    ) THEN
        -- Add unique constraint if missing
        ALTER TABLE public.airports ADD CONSTRAINT airports_ident_key UNIQUE (ident);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'airports constraint already exists or cannot be added';
END $$;

-- 2. Drop and recreate company_aircraft cleanly
DROP TABLE IF EXISTS game.company_aircraft CASCADE;

CREATE TABLE game.company_aircraft (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES game.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES game.users(id) ON DELETE CASCADE,
    owner_type VARCHAR(20) DEFAULT 'company',
    aircraft_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'stored'
        CHECK (status IN ('stored', 'parked', 'in_flight', 'maintenance')),
    condition FLOAT NOT NULL DEFAULT 1.0,
    hours FLOAT NOT NULL DEFAULT 0.0,
    cargo_capacity_kg INT NOT NULL DEFAULT 500,
    current_airport_ident VARCHAR(8),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT check_aircraft_owner CHECK (
        (owner_type = 'company' AND company_id IS NOT NULL AND user_id IS NULL)
        OR
        (owner_type = 'player' AND user_id IS NOT NULL AND company_id IS NULL)
    )
);

-- 3. Indexes
CREATE INDEX idx_company_aircraft_company ON game.company_aircraft(company_id);
CREATE INDEX idx_company_aircraft_user ON game.company_aircraft(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_company_aircraft_location ON game.company_aircraft(current_airport_ident);
CREATE INDEX idx_company_aircraft_status ON game.company_aircraft(status);

-- 4. Fix FK on inventory_locations
ALTER TABLE game.inventory_locations
    DROP CONSTRAINT IF EXISTS fk_inventory_locations_aircraft;

ALTER TABLE game.inventory_locations
    ADD CONSTRAINT fk_inventory_locations_aircraft
    FOREIGN KEY (aircraft_id) REFERENCES game.company_aircraft(id) ON DELETE CASCADE;

-- 5. Create aircraft cargo view
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
    COALESCE(SUM(ii.qty * i.weight_kg), 0)::numeric as current_cargo_kg,
    (ca.cargo_capacity_kg - COALESCE(SUM(ii.qty * i.weight_kg), 0))::numeric as available_capacity_kg,
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

COMMENT ON TABLE game.company_aircraft IS 'Aircraft owned by companies or players (V0.7)';
COMMENT ON VIEW game.v_aircraft_cargo IS 'Aircraft cargo capacity and current load summary';

SELECT 'V0.7 aircraft fix v2 complete' AS status;
