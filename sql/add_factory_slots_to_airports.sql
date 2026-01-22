-- Setup factory slots trigger for Airports table (Directus)
-- Note: Directus created columns with typos:
--   schedule_service (not scheduled_service)
--   max_factories_slots (not max_factory_slots)

-- Create trigger function to auto-calculate slots based on airport type
CREATE OR REPLACE FUNCTION public.calculate_max_slots()
RETURNS TRIGGER AS $$
BEGIN
    -- T0 factories (NPC) do NOT count toward these limits
    -- Only player T1+ factories count
    IF NEW.type = 'large_airport' AND NEW.schedule_service = 'yes' THEN
        NEW.max_factories_slots := 12;
    ELSIF NEW.type = 'medium_airport' THEN
        NEW.max_factories_slots := 6;
    ELSIF NEW.type = 'small_airport' THEN
        NEW.max_factories_slots := 3;
    ELSIF NEW.type IN ('heliport', 'seaplane_base') THEN
        NEW.max_factories_slots := 1;
    ELSE
        NEW.max_factories_slots := 0;  -- closed, balloonport, etc.
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_calculate_max_slots ON public.airports;

CREATE TRIGGER trigger_calculate_max_slots
BEFORE INSERT OR UPDATE ON public.airports
FOR EACH ROW EXECUTE FUNCTION public.calculate_max_slots();

-- Apply to all existing airports (force trigger execution)
UPDATE public.airports SET type = type;

-- Verify results
SELECT
    type,
    max_factories_slots,
    COUNT(*) as count
FROM public.airports
GROUP BY type, max_factories_slots
ORDER BY max_factories_slots DESC;
