-- =====================================================
-- Add factory slot columns to airports table
-- This migration adds max_factory_slots and occupied_slots
-- to track factory capacity at each airport
-- =====================================================

-- Note: This assumes the airports table exists in Directus
-- If airports table doesn't exist yet, you need to import it first

-- Add factory-related columns to existing airports table
ALTER TABLE public.airports ADD COLUMN IF NOT EXISTS max_factory_slots INT DEFAULT 0;
ALTER TABLE public.airports ADD COLUMN IF NOT EXISTS occupied_slots INT DEFAULT 0;

-- Create function to calculate max_slots based on airport type
CREATE OR REPLACE FUNCTION public.calculate_max_slots()
RETURNS TRIGGER AS $$
BEGIN
    -- Based on type + scheduled_service
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

-- Add helpful comments
COMMENT ON COLUMN public.airports.max_factory_slots IS 'Maximum player factory slots (12=large, 6=medium, 3=small, 1=heliport/seaplane). T0 NPC factories do NOT count.';
COMMENT ON COLUMN public.airports.occupied_slots IS 'Current number of occupied player factory slots (T1+ only)';

-- Update existing airports to calculate their max_factory_slots
-- This will trigger the calculation for all existing records
UPDATE public.airports SET type = type WHERE id IS NOT NULL;

-- Verify the results
SELECT
    type,
    scheduled_service,
    max_factory_slots,
    COUNT(*) as airport_count
FROM public.airports
GROUP BY type, scheduled_service, max_factory_slots
ORDER BY max_factory_slots DESC;
