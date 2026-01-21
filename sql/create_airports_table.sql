-- =====================================================
-- Create airports table with factory slots support
-- This creates the table that Directus will manage
-- =====================================================

-- Create airports table (basic structure from OurAirports CSV)
CREATE TABLE IF NOT EXISTS public.airports (
    id SERIAL PRIMARY KEY,
    ident VARCHAR(10) UNIQUE NOT NULL,
    type VARCHAR(50),
    name TEXT,
    latitude_deg DECIMAL(10, 8),
    longitude_deg DECIMAL(11, 8),
    elevation_ft INTEGER,
    continent VARCHAR(2),
    iso_country VARCHAR(2),
    iso_region VARCHAR(10),
    municipality TEXT,
    scheduled_service VARCHAR(3),
    gps_code VARCHAR(10),
    iata_code VARCHAR(3),
    local_code VARCHAR(10),
    home_link TEXT,
    wikipedia_link TEXT,
    keywords TEXT,

    -- Factory system columns
    max_factory_slots INTEGER DEFAULT 0,
    occupied_slots INTEGER DEFAULT 0,

    -- Directus management columns
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ DEFAULT NOW(),
    user_created UUID,
    user_updated UUID
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_airports_ident ON public.airports(ident);
CREATE INDEX IF NOT EXISTS idx_airports_type ON public.airports(type);
CREATE INDEX IF NOT EXISTS idx_airports_iso_country ON public.airports(iso_country);
CREATE INDEX IF NOT EXISTS idx_airports_scheduled_service ON public.airports(scheduled_service);

-- Create function to calculate max_slots based on airport type
CREATE OR REPLACE FUNCTION public.calculate_max_slots()
RETURNS TRIGGER AS $$
BEGIN
    -- T0 factories (NPC) do NOT count toward these limits
    -- Only player T1+ factories count
    IF NEW.type = 'large_airport' AND NEW.scheduled_service = 'yes' THEN
        NEW.max_factory_slots := 12;
    ELSIF NEW.type = 'medium_airport' THEN
        NEW.max_factory_slots := 6;
    ELSIF NEW.type = 'small_airport' THEN
        NEW.max_factory_slots := 3;
    ELSIF NEW.type IN ('heliport', 'seaplane_base') THEN
        NEW.max_factory_slots := 1;
    ELSE
        NEW.max_factory_slots := 0;  -- Other types = no factories
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate max_slots on insert/update
DROP TRIGGER IF EXISTS trigger_calculate_max_slots ON public.airports;
CREATE TRIGGER trigger_calculate_max_slots
BEFORE INSERT OR UPDATE ON public.airports
FOR EACH ROW EXECUTE FUNCTION public.calculate_max_slots();

-- Add comments
COMMENT ON TABLE public.airports IS 'Airport data from OurAirports, managed by Directus';
COMMENT ON COLUMN public.airports.max_factory_slots IS 'Maximum player factory slots (12=large, 6=medium, 3=small, 1=heliport/seaplane). T0 NPC factories do NOT count.';
COMMENT ON COLUMN public.airports.occupied_slots IS 'Current number of occupied player factory slots (T1+ only)';
