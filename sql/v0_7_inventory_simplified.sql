-- ═══════════════════════════════════════════════════════════
-- MFS CARRIER+ - INVENTAIRE SIMPLIFIÉ V0.7
-- ═══════════════════════════════════════════════════════════

-- ⚠️ ON NE SUPPRIME PAS les anciennes tables!
-- inventory_locations et inventory_items sont utilisés par:
-- - Factories T0 (NPC)
-- - Système HV actuel
-- On les migrera plus tard quand on refera le HV

-- ───────────────────────────────────────────────────────────
-- INVENTAIRE JOUEUR (NOUVEAU)
-- Un joueur voit TOUS ses items, localisés par aéroport
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game.player_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES game.users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES game.items(id) ON DELETE CASCADE,
    qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
    airport_ident VARCHAR(8) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Un joueur ne peut avoir qu'une seule ligne par item par aéroport
    UNIQUE(player_id, item_id, airport_ident)
);

CREATE INDEX IF NOT EXISTS idx_player_inventory_player ON game.player_inventory(player_id);
CREATE INDEX IF NOT EXISTS idx_player_inventory_airport ON game.player_inventory(airport_ident);

-- ───────────────────────────────────────────────────────────
-- INVENTAIRE COMPANY (NOUVEAU)
-- Inclut les items retirés des factories
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game.company_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES game.companies(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES game.items(id) ON DELETE CASCADE,
    qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
    airport_ident VARCHAR(8) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(company_id, item_id, airport_ident)
);

CREATE INDEX IF NOT EXISTS idx_company_inventory_company ON game.company_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_company_inventory_airport ON game.company_inventory(airport_ident);

-- ───────────────────────────────────────────────────────────
-- INVENTAIRE AVION (cargo en transit)
-- Les items dans l'avion n'ont pas de airport_ident
-- La localisation = position actuelle de l'avion
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game.aircraft_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aircraft_id UUID NOT NULL REFERENCES game.company_aircraft(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES game.items(id) ON DELETE CASCADE,
    qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(aircraft_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_aircraft_inventory_aircraft ON game.aircraft_inventory(aircraft_id);

-- ───────────────────────────────────────────────────────────
-- AUDIT TRAIL SIMPLIFIÉ (optionnel)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game.inventory_audit_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Qui possède l'item
    owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('player', 'company', 'aircraft')),
    owner_id UUID NOT NULL,

    -- L'item concerné
    item_id UUID NOT NULL REFERENCES game.items(id),
    quantity_delta INTEGER NOT NULL,

    -- Contexte
    action VARCHAR(50) NOT NULL, -- 'load', 'unload', 'buy', 'sell', 'produce', 'withdraw_factory'
    airport_ident VARCHAR(8),
    aircraft_id UUID REFERENCES game.company_aircraft(id),

    -- Métadonnées
    user_id UUID REFERENCES game.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_v2_owner ON game.inventory_audit_v2(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_v2_created ON game.inventory_audit_v2(created_at);

-- ───────────────────────────────────────────────────────────
-- TRIGGER: updated_at automatique
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION game.update_inventory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_player_inventory_updated ON game.player_inventory;
CREATE TRIGGER trg_player_inventory_updated
    BEFORE UPDATE ON game.player_inventory
    FOR EACH ROW EXECUTE FUNCTION game.update_inventory_timestamp();

DROP TRIGGER IF EXISTS trg_company_inventory_updated ON game.company_inventory;
CREATE TRIGGER trg_company_inventory_updated
    BEFORE UPDATE ON game.company_inventory
    FOR EACH ROW EXECUTE FUNCTION game.update_inventory_timestamp();

DROP TRIGGER IF EXISTS trg_aircraft_inventory_updated ON game.aircraft_inventory;
CREATE TRIGGER trg_aircraft_inventory_updated
    BEFORE UPDATE ON game.aircraft_inventory
    FOR EACH ROW EXECUTE FUNCTION game.update_inventory_timestamp();
