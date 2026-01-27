-- V0.8 Mission System - Schema Migration
-- Creates the missions table for cargo transport tracking

-- =====================================================
-- MISSIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS game.missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    company_id UUID NOT NULL REFERENCES game.companies(id) ON DELETE CASCADE,
    pilot_user_id UUID NOT NULL REFERENCES game.users(id) ON DELETE CASCADE,
    aircraft_id UUID REFERENCES game.company_aircraft(id) ON DELETE SET NULL,

    -- Route
    origin_icao VARCHAR(4) NOT NULL,
    destination_icao VARCHAR(4) NOT NULL,
    distance_nm FLOAT,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Cargo snapshot (JSON copy at mission start)
    cargo_snapshot JSONB,
    pax_count INTEGER NOT NULL DEFAULT 0,
    cargo_weight_kg FLOAT NOT NULL DEFAULT 0,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Flight data (captured on completion)
    landing_fpm INTEGER,
    max_gforce FLOAT,
    final_icao VARCHAR(4),
    flight_time_minutes INTEGER,
    fuel_used_percent FLOAT,

    -- Scoring (/100 total)
    score_landing INTEGER,      -- /40
    score_gforce INTEGER,       -- /20
    score_destination INTEGER,  -- /20
    score_time INTEGER,         -- /10
    score_fuel INTEGER,         -- /10
    score_total INTEGER,        -- /100
    grade VARCHAR(1),           -- S, A, B, C, D, E, F

    -- Rewards
    xp_earned INTEGER NOT NULL DEFAULT 0,

    -- Failure info
    failure_reason VARCHAR(50),

    -- Anti-cheat payload verification
    payload_start_lbs FLOAT,
    payload_verified_lbs FLOAT,
    cheated BOOLEAN NOT NULL DEFAULT false,
    cheat_penalty_percent INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT mission_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    CONSTRAINT mission_grade_check CHECK (grade IS NULL OR grade IN ('S', 'A', 'B', 'C', 'D', 'E', 'F'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_missions_company_id ON game.missions(company_id);
CREATE INDEX IF NOT EXISTS idx_missions_pilot_user_id ON game.missions(pilot_user_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON game.missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_origin_icao ON game.missions(origin_icao);
CREATE INDEX IF NOT EXISTS idx_missions_destination_icao ON game.missions(destination_icao);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION game.update_missions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_missions_updated_at ON game.missions;
CREATE TRIGGER trigger_missions_updated_at
    BEFORE UPDATE ON game.missions
    FOR EACH ROW
    EXECUTE FUNCTION game.update_missions_timestamp();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE game.missions IS 'V0.8 Mission System - Cargo transport missions with scoring';
COMMENT ON COLUMN game.missions.cargo_snapshot IS 'JSON snapshot of cargo items at mission start for audit';
COMMENT ON COLUMN game.missions.score_landing IS 'Landing score /40 based on FPM';
COMMENT ON COLUMN game.missions.score_gforce IS 'G-force score /20 based on max G during flight';
COMMENT ON COLUMN game.missions.score_destination IS 'Destination score /20 (correct airport = 20, wrong = 0)';
COMMENT ON COLUMN game.missions.score_time IS 'Time efficiency score /10';
COMMENT ON COLUMN game.missions.score_fuel IS 'Fuel efficiency score /10';
COMMENT ON COLUMN game.missions.grade IS 'Mission grade: S (95+), A (85+), B (70+), C (55+), D (40+), E (25+), F (<25)';
