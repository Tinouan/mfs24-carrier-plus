-- =====================================================
-- Migrate engineers from airport-based to factory-based
-- Engineers are now assigned to specific factories (1 per factory max)
-- =====================================================

-- Drop existing engineers data (if any) since structure is changing
TRUNCATE TABLE game.engineers CASCADE;

-- Drop airport_ident column
ALTER TABLE game.engineers DROP COLUMN IF EXISTS airport_ident;

-- Add factory_id column
ALTER TABLE game.engineers ADD COLUMN IF NOT EXISTS factory_id UUID;

-- Add foreign key constraint
ALTER TABLE game.engineers
    ADD CONSTRAINT fk_engineer_factory
    FOREIGN KEY (factory_id)
    REFERENCES game.factories(id)
    ON DELETE SET NULL;

-- Create index on factory_id
CREATE INDEX IF NOT EXISTS idx_engineers_factory_id ON game.engineers(factory_id);

-- Update comments
COMMENT ON COLUMN game.engineers.factory_id IS 'Factory where engineer is assigned (1 per factory max, SET NULL on factory delete)';
COMMENT ON TABLE game.engineers IS 'Engineers - Enhanced workers assigned to specific factories (1 per factory)';

-- Verify structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'game'
AND table_name = 'engineers'
ORDER BY ordinal_position;
