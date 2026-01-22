-- ═══════════════════════════════════════════════════════════
-- Migration: Ajout du système de vente à l'inventaire
-- Version: 0.5
-- Date: 2026-01-22
-- ═══════════════════════════════════════════════════════════

-- Ajout des colonnes pour la mise en vente
ALTER TABLE game.inventory_items
ADD COLUMN IF NOT EXISTS for_sale BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sale_qty BIGINT NOT NULL DEFAULT 0;

-- Index pour les recherches de marché (items en vente par aéroport)
CREATE INDEX IF NOT EXISTS idx_inventory_items_for_sale
ON game.inventory_items(for_sale)
WHERE for_sale = TRUE;

-- Commentaires
COMMENT ON COLUMN game.inventory_items.for_sale IS 'Indique si cet item est mis en vente';
COMMENT ON COLUMN game.inventory_items.sale_price IS 'Prix unitaire de vente';
COMMENT ON COLUMN game.inventory_items.sale_qty IS 'Quantité mise en vente (peut être inférieure à qty)';

-- Vérification
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'game'
AND table_name = 'inventory_items'
ORDER BY ordinal_position;
