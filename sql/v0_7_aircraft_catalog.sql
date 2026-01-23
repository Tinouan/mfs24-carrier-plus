-- =====================================================
-- V0.7.1 Aircraft Catalog System
-- =====================================================

-- Table: Catalogue d'avions disponibles
CREATE TABLE IF NOT EXISTS game.aircraft_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    icao_type VARCHAR(10) NOT NULL,
    manufacturer VARCHAR(50) NOT NULL,
    category VARCHAR(30) NOT NULL,
    cargo_capacity_kg INT NOT NULL,
    cargo_capacity_m3 FLOAT,
    max_range_nm INT,
    cruise_speed_kts INT,
    base_price NUMERIC(14,2) NOT NULL,
    operating_cost_per_hour NUMERIC(10,2),
    min_runway_length_m INT,
    required_license VARCHAR(20),
    msfs_aircraft_id VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE
);

-- Add missing columns to company_aircraft if they don't exist
DO $$
BEGIN
    -- Add registration column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'game' AND table_name = 'company_aircraft' AND column_name = 'registration') THEN
        ALTER TABLE game.company_aircraft ADD COLUMN registration VARCHAR(10) UNIQUE;
    END IF;

    -- Add name column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'game' AND table_name = 'company_aircraft' AND column_name = 'name') THEN
        ALTER TABLE game.company_aircraft ADD COLUMN name VARCHAR(100);
    END IF;

    -- Add icao_type column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'game' AND table_name = 'company_aircraft' AND column_name = 'icao_type') THEN
        ALTER TABLE game.company_aircraft ADD COLUMN icao_type VARCHAR(10);
    END IF;

    -- Add purchase_price column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'game' AND table_name = 'company_aircraft' AND column_name = 'purchase_price') THEN
        ALTER TABLE game.company_aircraft ADD COLUMN purchase_price NUMERIC(14,2);
    END IF;

    -- Add is_active column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'game' AND table_name = 'company_aircraft' AND column_name = 'is_active') THEN
        ALTER TABLE game.company_aircraft ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;

    -- Add updated_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'game' AND table_name = 'company_aircraft' AND column_name = 'updated_at') THEN
        ALTER TABLE game.company_aircraft ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Index pour recherches rapides
CREATE INDEX IF NOT EXISTS idx_aircraft_catalog_category ON game.aircraft_catalog(category);
CREATE INDEX IF NOT EXISTS idx_aircraft_catalog_price ON game.aircraft_catalog(base_price);

-- Seed: Catalogue d'avions de base
INSERT INTO game.aircraft_catalog (name, icao_type, manufacturer, category, cargo_capacity_kg, max_range_nm, cruise_speed_kts, base_price, operating_cost_per_hour, min_runway_length_m, required_license) VALUES
-- Turboprops (starter aircraft)
('Cessna 208 Caravan', 'C208', 'Cessna', 'turboprop', 1360, 900, 175, 250000, 150, 600, 'CPL'),
('Pilatus PC-12', 'PC12', 'Pilatus', 'turboprop', 1200, 1800, 280, 450000, 200, 800, 'CPL'),
('Beechcraft King Air 350', 'BE35', 'Beechcraft', 'turboprop', 1800, 1500, 300, 700000, 350, 1000, 'CPL'),
('de Havilland DHC-6 Twin Otter', 'DHC6', 'de Havilland', 'turboprop', 1800, 800, 160, 350000, 250, 400, 'CPL'),

-- Cargo Turboprops
('ATR 72-600F', 'AT76', 'ATR', 'turboprop', 8500, 900, 275, 2500000, 800, 1200, 'ATPL'),
('Cessna 408 SkyCourier', 'C408', 'Cessna', 'turboprop', 2700, 900, 200, 600000, 300, 900, 'CPL'),

-- Small Jets
('Embraer Phenom 300', 'E55P', 'Embraer', 'jet_small', 800, 2000, 450, 1200000, 500, 1200, 'ATPL'),
('Cessna Citation CJ4', 'C25C', 'Cessna', 'jet_small', 700, 2000, 450, 1100000, 450, 1000, 'ATPL'),

-- Medium Cargo
('Boeing 737-800BCF', 'B738', 'Boeing', 'jet_medium', 23000, 2500, 450, 15000000, 3000, 2500, 'ATPL'),
('Airbus A320P2F', 'A320', 'Airbus', 'jet_medium', 21000, 2500, 450, 14000000, 2800, 2200, 'ATPL'),

-- Large Cargo
('Boeing 747-8F', 'B748', 'Boeing', 'jet_large', 137000, 4500, 490, 80000000, 15000, 3000, 'ATPL'),
('Boeing 777F', 'B77F', 'Boeing', 'jet_large', 102000, 5000, 490, 65000000, 12000, 3000, 'ATPL'),

-- Helicopters
('Airbus H125', 'EC30', 'Airbus', 'helicopter', 600, 350, 130, 350000, 400, 0, 'CPL'),
('Sikorsky S-76', 'S76', 'Sikorsky', 'helicopter', 1200, 400, 155, 800000, 600, 0, 'CPL')

ON CONFLICT DO NOTHING;
