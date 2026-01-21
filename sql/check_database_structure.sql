-- =====================================================
-- VERIFICATION DE LA STRUCTURE DE LA BASE
-- =====================================================
-- Execute ce script dans Directus ou pgAdmin pour voir
-- où se trouve vraiment la table companies
-- =====================================================

-- 1. Rechercher la table companies dans tous les schémas
SELECT schemaname, tablename
FROM pg_tables
WHERE tablename = 'companies'
ORDER BY schemaname;

-- 2. Lister tous les schémas
SELECT schema_name
FROM information_schema.schemata
ORDER BY schema_name;

-- 3. Toutes les tables dans le schéma 'public'
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 4. Toutes les tables dans le schéma 'game'
SELECT tablename
FROM pg_tables
WHERE schemaname = 'game'
ORDER BY tablename;

-- 5. Vérifier si companies existe dans game
SELECT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'game' AND tablename = 'companies'
) AS companies_exists_in_game;

-- 6. Vérifier si companies existe dans public
SELECT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'companies'
) AS companies_exists_in_public;
