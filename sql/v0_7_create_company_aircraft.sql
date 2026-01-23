-- =====================================================
-- V0.7 PRE-REQUISITE: CREATE company_aircraft TABLE
-- =====================================================
-- Run this BEFORE v0_7_unified_inventory.sql if the table doesn't exist

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

CREATE INDEX IF NOT EXISTS idx_company_aircraft_company
ON game.company_aircraft(company_id);

CREATE INDEX IF NOT EXISTS idx_company_aircraft_status
ON game.company_aircraft(status);

COMMENT ON TABLE game.company_aircraft IS 'Aircraft owned by companies or players';
COMMENT ON COLUMN game.company_aircraft.status IS 'stored=hangar, parked=ready, in_flight=flying, maintenance=repair';

SELECT 'company_aircraft table created' AS status;
