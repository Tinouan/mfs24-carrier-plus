-- Add tier column to factories table
-- T0 = NPC factories (raw materials, don't count toward airport slots)
-- T1-T5 = Player factories (count toward airport slots)

ALTER TABLE game.factories
ADD COLUMN IF NOT EXISTS tier INTEGER NOT NULL DEFAULT 1;

-- Add check constraint
ALTER TABLE game.factories
ADD CONSTRAINT factories_tier_check CHECK (tier >= 0 AND tier <= 5);

-- Add index for quick filtering
CREATE INDEX IF NOT EXISTS idx_factories_tier ON game.factories(tier);

-- Create NPC company for T0 factories
-- Using a fixed UUID so it's consistent across environments
INSERT INTO game.companies (id, world_id, name, slug, home_airport_ident, is_public, balance, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    1,
    'World Resources',
    'world-resources-npc',
    'LFPG',
    false,
    0,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT 'Migration complete' as status;
SELECT id, name FROM game.companies WHERE name = 'World Resources';
