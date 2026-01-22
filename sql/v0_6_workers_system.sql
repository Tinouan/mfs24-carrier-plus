-- ============================================
-- V0.6 Workers System - Refonte complète
-- ============================================
-- Ce script remplace les anciennes tables workers/engineers
-- par un nouveau système unifié avec:
-- - Nationalité et stats par pays
-- - Pool de recrutement par aéroport
-- - Système de food et blessures
-- - Capacité usines par tier
-- ============================================

-- Sauvegarder les données existantes (au cas où)
-- Note: Les tables sont vides, mais on garde la sécurité
CREATE TABLE IF NOT EXISTS game._backup_workers_old AS SELECT * FROM game.workers;
CREATE TABLE IF NOT EXISTS game._backup_engineers_old AS SELECT * FROM game.engineers;

-- ============================================
-- 1. Supprimer les anciennes tables
-- ============================================

-- Supprimer les triggers d'abord
DROP TRIGGER IF EXISTS trigger_update_worker_tier ON game.workers;
DROP FUNCTION IF EXISTS game.update_worker_tier();

-- Supprimer les anciennes tables
DROP TABLE IF EXISTS game.engineers CASCADE;
DROP TABLE IF EXISTS game.workers CASCADE;

-- ============================================
-- 2. Table: country_worker_stats
-- Stats de base par nationalité
-- ============================================

CREATE TABLE game.country_worker_stats (
    country_code CHAR(2) PRIMARY KEY,
    country_name VARCHAR(100) NOT NULL,

    -- Stats moyennes (workers auront ±20% de variation)
    base_speed INTEGER NOT NULL DEFAULT 50,
    base_resistance INTEGER NOT NULL DEFAULT 50,

    -- Salaire de base horaire
    base_hourly_salary DECIMAL(10,2) NOT NULL DEFAULT 10.00
);

-- Insérer les pays avec leurs stats
INSERT INTO game.country_worker_stats (country_code, country_name, base_speed, base_resistance, base_hourly_salary) VALUES
-- Europe de l'Ouest
('FR', 'France', 55, 50, 15.00),
('DE', 'Germany', 60, 50, 16.00),
('GB', 'United Kingdom', 53, 50, 17.00),
('IT', 'Italy', 52, 48, 12.00),
('ES', 'Spain', 50, 52, 11.00),
('NL', 'Netherlands', 58, 48, 16.00),
('BE', 'Belgium', 55, 50, 15.00),
('CH', 'Switzerland', 60, 52, 22.00),
('AT', 'Austria', 57, 50, 14.00),
('PT', 'Portugal', 48, 52, 9.00),
-- Europe de l'Est
('PL', 'Poland', 55, 55, 10.00),
('CZ', 'Czech Republic', 56, 54, 11.00),
('RO', 'Romania', 50, 55, 7.00),
('HU', 'Hungary', 52, 53, 8.00),
('UA', 'Ukraine', 48, 58, 5.00),
('RU', 'Russia', 50, 60, 8.00),
-- Amérique du Nord
('US', 'United States', 50, 55, 18.00),
('CA', 'Canada', 52, 54, 17.00),
('MX', 'Mexico', 50, 53, 7.50),
-- Amérique du Sud
('BR', 'Brazil', 52, 55, 7.00),
('AR', 'Argentina', 50, 52, 6.00),
('CL', 'Chile', 51, 53, 8.00),
('CO', 'Colombia', 49, 54, 5.50),
-- Asie
('JP', 'Japan', 65, 45, 14.00),
('CN', 'China', 50, 50, 8.00),
('KR', 'South Korea', 62, 48, 13.00),
('IN', 'India', 48, 52, 6.00),
('TH', 'Thailand', 50, 50, 5.00),
('VN', 'Vietnam', 52, 52, 4.00),
('PH', 'Philippines', 48, 50, 4.50),
('ID', 'Indonesia', 47, 53, 4.00),
('MY', 'Malaysia', 50, 50, 6.00),
('SG', 'Singapore', 58, 48, 15.00),
-- Moyen-Orient
('AE', 'United Arab Emirates', 52, 55, 12.00),
('SA', 'Saudi Arabia', 48, 58, 10.00),
('TR', 'Turkey', 50, 55, 7.00),
-- Afrique
('ZA', 'South Africa', 48, 55, 6.00),
('EG', 'Egypt', 47, 54, 4.00),
('MA', 'Morocco', 48, 53, 5.00),
('NG', 'Nigeria', 46, 56, 3.50),
-- Océanie
('AU', 'Australia', 52, 54, 18.00),
('NZ', 'New Zealand', 53, 52, 16.00);

-- ============================================
-- 3. Table: worker_xp_thresholds
-- Seuils XP pour monter de tier
-- ============================================

CREATE TABLE game.worker_xp_thresholds (
    tier INTEGER PRIMARY KEY,
    xp_required INTEGER NOT NULL,
    tier_name VARCHAR(20) NOT NULL,
    icon_color VARCHAR(20) NOT NULL
);

INSERT INTO game.worker_xp_thresholds (tier, xp_required, tier_name, icon_color) VALUES
(1, 0, 'Novice', 'gray'),
(2, 1000, 'Apprenti', 'green'),
(3, 3000, 'Confirmé', 'blue'),
(4, 7000, 'Expert', 'purple'),
(5, 15000, 'Maître', 'gold');

-- ============================================
-- 4. Table: workers (nouvelle structure)
-- Unifie workers et engineers
-- ============================================

CREATE TABLE game.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identité
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    country_code CHAR(2) NOT NULL REFERENCES game.country_worker_stats(country_code),

    -- Type: 'worker' ou 'engineer'
    worker_type VARCHAR(20) NOT NULL DEFAULT 'worker',

    -- Stats (1-100)
    speed INTEGER NOT NULL DEFAULT 50 CHECK (speed >= 1 AND speed <= 100),
    resistance INTEGER NOT NULL DEFAULT 50 CHECK (resistance >= 1 AND resistance <= 100),

    -- Progression
    tier INTEGER NOT NULL DEFAULT 1 CHECK (tier >= 1 AND tier <= 5),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),

    -- Économie
    hourly_salary DECIMAL(10,2) NOT NULL,

    -- État
    status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'working', 'injured', 'dead')),
    injured_at TIMESTAMPTZ NULL,

    -- Localisation
    location_type VARCHAR(20) NOT NULL DEFAULT 'airport'
        CHECK (location_type IN ('airport', 'factory')),
    airport_ident VARCHAR(10) NULL,
    factory_id UUID NULL REFERENCES game.factories(id) ON DELETE SET NULL,
    company_id UUID NULL REFERENCES game.companies(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Contrainte: worker_type valide
    CONSTRAINT workers_type_check CHECK (worker_type IN ('worker', 'engineer'))
);

-- Index pour les recherches fréquentes
CREATE INDEX idx_workers_airport ON game.workers(airport_ident)
    WHERE location_type = 'airport' AND status = 'available';
CREATE INDEX idx_workers_factory ON game.workers(factory_id)
    WHERE location_type = 'factory';
CREATE INDEX idx_workers_company ON game.workers(company_id);
CREATE INDEX idx_workers_status ON game.workers(status);
CREATE INDEX idx_workers_type ON game.workers(worker_type);

-- ============================================
-- 5. Table: airport_worker_pools
-- Stock de workers par aéroport
-- ============================================

CREATE TABLE game.airport_worker_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    airport_ident VARCHAR(10) NOT NULL UNIQUE,
    max_workers INTEGER NOT NULL DEFAULT 200,
    last_reset_at TIMESTAMPTZ DEFAULT NOW(),
    next_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- ============================================
-- 6. Modifier table factories
-- Ajouter colonnes food
-- ============================================

-- Ajouter colonne food_item_id si n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'game'
        AND table_name = 'factories'
        AND column_name = 'food_item_id'
    ) THEN
        ALTER TABLE game.factories ADD COLUMN food_item_id UUID REFERENCES game.items(id);
    END IF;
END $$;

-- Ajouter colonne food_stock si n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'game'
        AND table_name = 'factories'
        AND column_name = 'food_stock'
    ) THEN
        ALTER TABLE game.factories ADD COLUMN food_stock INTEGER DEFAULT 0 CHECK (food_stock >= 0);
    END IF;
END $$;

-- ============================================
-- 7. Fonction: update_worker_tier
-- Auto-promotion tier basée sur XP
-- ============================================

CREATE OR REPLACE FUNCTION game.update_worker_tier()
RETURNS TRIGGER AS $$
DECLARE
    new_tier INTEGER;
BEGIN
    -- Calculer le nouveau tier basé sur XP
    SELECT tier INTO new_tier
    FROM game.worker_xp_thresholds
    WHERE xp_required <= NEW.xp
    ORDER BY tier DESC
    LIMIT 1;

    -- Mettre à jour si différent
    IF new_tier IS NOT NULL AND new_tier != NEW.tier THEN
        NEW.tier := new_tier;
    END IF;

    -- Mettre à jour updated_at
    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_worker_tier
    BEFORE INSERT OR UPDATE OF xp ON game.workers
    FOR EACH ROW
    EXECUTE FUNCTION game.update_worker_tier();

-- ============================================
-- 8. Fonction: get_factory_capacity
-- Capacité workers/engineers selon tier usine
-- ============================================

CREATE OR REPLACE FUNCTION game.get_factory_capacity(factory_tier INTEGER)
RETURNS TABLE(max_workers INTEGER, max_engineers INTEGER) AS $$
BEGIN
    RETURN QUERY SELECT
        CASE factory_tier
            WHEN 1 THEN 10
            WHEN 2 THEN 20
            WHEN 3 THEN 30
            WHEN 4 THEN 40
            WHEN 5 THEN 50
            ELSE 10
        END AS max_workers,
        CASE factory_tier
            WHEN 1 THEN 2
            WHEN 2 THEN 4
            WHEN 3 THEN 6
            WHEN 4 THEN 8
            WHEN 5 THEN 10
            ELSE 2
        END AS max_engineers;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. Vue: v_airport_worker_stock
-- Stock actuel de workers par aéroport
-- ============================================

CREATE OR REPLACE VIEW game.v_airport_worker_stock AS
SELECT
    awp.airport_ident,
    awp.max_workers,
    awp.next_reset_at,
    COUNT(w.id) FILTER (WHERE w.worker_type = 'worker') as available_workers,
    COUNT(w.id) FILTER (WHERE w.worker_type = 'engineer') as available_engineers
FROM game.airport_worker_pools awp
LEFT JOIN game.workers w ON w.airport_ident = awp.airport_ident
    AND w.company_id IS NULL
    AND w.status = 'available'
    AND w.location_type = 'airport'
GROUP BY awp.airport_ident, awp.max_workers, awp.next_reset_at;

-- ============================================
-- 10. Vue: v_factory_workers
-- Workers/Engineers assignés par usine
-- ============================================

CREATE OR REPLACE VIEW game.v_factory_workers AS
SELECT
    f.id as factory_id,
    f.name as factory_name,
    f.tier as factory_tier,
    fc.max_workers,
    fc.max_engineers,
    COUNT(w.id) FILTER (WHERE w.worker_type = 'worker' AND w.status != 'dead') as current_workers,
    COUNT(w.id) FILTER (WHERE w.worker_type = 'engineer' AND w.status != 'dead') as current_engineers,
    COUNT(w.id) FILTER (WHERE w.status = 'injured') as injured_count,
    AVG(w.speed) FILTER (WHERE w.worker_type = 'worker' AND w.status = 'working') as avg_worker_speed,
    AVG(w.resistance) FILTER (WHERE w.status = 'working') as avg_resistance
FROM game.factories f
CROSS JOIN LATERAL game.get_factory_capacity(COALESCE(f.tier, 1)) fc
LEFT JOIN game.workers w ON w.factory_id = f.id AND w.location_type = 'factory'
WHERE f.is_active = true
GROUP BY f.id, f.name, f.tier, fc.max_workers, fc.max_engineers;

-- ============================================
-- 11. Initialiser les pools pour grands aéroports
-- ============================================

-- Insérer les pools pour les aéroports "large_airport" et "medium_airport"
INSERT INTO game.airport_worker_pools (airport_ident, max_workers)
SELECT ident,
    CASE
        WHEN type = 'large_airport' THEN 200
        WHEN type = 'medium_airport' THEN 100
        ELSE 50
    END
FROM public.airports
WHERE type IN ('large_airport', 'medium_airport')
ON CONFLICT (airport_ident) DO NOTHING;

-- ============================================
-- Terminé !
-- ============================================

-- Vérifier le résultat
SELECT 'Tables créées:' as info;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'game'
AND table_name IN ('workers', 'country_worker_stats', 'worker_xp_thresholds', 'airport_worker_pools')
ORDER BY table_name;

SELECT 'Pools aéroports créés:' as info, COUNT(*) as count FROM game.airport_worker_pools;
SELECT 'Pays configurés:' as info, COUNT(*) as count FROM game.country_worker_stats;
