-- =====================================================
-- Calculate airport factory slots and create trigger
-- Run this AFTER adding max_factory_slots and occupied_slots fields in Directus
-- =====================================================

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
DROP TRIGGER IF EXISTS trigger_calculate_max_slots ON airports;
CREATE TRIGGER trigger_calculate_max_slots
BEFORE INSERT OR UPDATE ON airports
FOR EACH ROW EXECUTE FUNCTION public.calculate_max_slots();

-- Update existing airports to calculate their max_factory_slots
-- This will trigger the calculation for all existing records
UPDATE airports SET type = type WHERE id IS NOT NULL;

-- Show results
SELECT
    type,
    scheduled_service,
    max_factory_slots,
    COUNT(*) as airport_count
FROM airports
GROUP BY type, scheduled_service, max_factory_slots
ORDER BY max_factory_slots DESC;
