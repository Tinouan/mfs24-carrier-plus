"""
Seed T0 NPC factories for France with realistic geographic distribution.
T0 factories produce raw materials and don't count toward airport slots.
"""
import psycopg2
from psycopg2.extras import execute_values

DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'msfs',
    'user': 'msfs',
    'password': 'msfs'
}

# NPC Company UUID (created in migration)
NPC_COMPANY_ID = '00000000-0000-0000-0000-000000000001'

# French T0 factories with realistic geographic placement
# Format: (airport_ident, factory_name, item_name, region_description)
FRENCH_T0_FACTORIES = [
    # === CEREALES / AGRICULTURE ===
    # Beauce - grenier à blé de la France
    ('LFOC', 'Exploitation Céréalière Beauce', 'Raw Wheat', 'Beauce - Chartres'),
    ('LFPG', 'Coopérative Agricole Île-de-France', 'Raw Wheat', 'Île-de-France'),
    ('LFQQ', 'Ferme Céréalière du Nord', 'Raw Wheat', 'Nord-Pas-de-Calais'),

    # === ELEVAGE / VIANDE ===
    # Bretagne et Normandie
    ('LFRN', 'Élevage Breton', 'Raw Meat', 'Bretagne - Rennes'),
    ('LFOP', 'Ferme Normande', 'Raw Meat', 'Normandie - Rouen'),
    ('LFLL', 'Boucherie Lyonnaise', 'Raw Meat', 'Rhône-Alpes'),

    # === PRODUITS LAITIERS ===
    # Normandie - capitale du fromage
    ('LFRK', 'Laiterie Normande', 'Raw Milk', 'Normandie - Caen'),
    ('LFRN', 'Coopérative Laitière Bretagne', 'Raw Milk', 'Bretagne'),
    ('LFLP', 'Fromagerie Alpine', 'Raw Milk', 'Alpes - Annecy'),

    # === FRUITS ET LEGUMES ===
    # Provence et Sud-Ouest
    ('LFML', 'Vergers de Provence', 'Raw Fruits', 'Provence'),
    ('LFBD', 'Fruits du Sud-Ouest', 'Raw Fruits', 'Aquitaine - Bordeaux'),
    ('LFMV', 'Maraîchers du Vaucluse', 'Raw Vegetables', 'Provence - Avignon'),
    ('LFBO', 'Légumes du Midi', 'Raw Vegetables', 'Occitanie - Toulouse'),

    # === PECHE ===
    # Côtes atlantique et méditerranée
    ('LFML', 'Pêcherie Méditerranéenne', 'Raw Fish', 'Marseille'),
    ('LFRB', 'Criée de Bretagne', 'Raw Fish', 'Bretagne - Brest'),
    ('LFRS', 'Port de Pêche Atlantique', 'Raw Fish', 'Loire-Atlantique - Nantes'),

    # === SEL ===
    # Camargue et Guérande
    ('LFML', 'Salines de Camargue', 'Raw Salt', 'Camargue'),
    ('LFRS', 'Marais Salants de Guérande', 'Raw Salt', 'Loire-Atlantique'),

    # === BOIS / FORET ===
    # Landes, Vosges, Massif Central
    ('LFBD', 'Forêt des Landes', 'Raw Wood', 'Landes'),
    ('LFSB', 'Exploitation Forestière Vosges', 'Raw Wood', 'Alsace - Mulhouse'),
    ('LFLC', 'Bois du Massif Central', 'Raw Wood', 'Auvergne - Clermont'),

    # === MINERAIS ===
    # Lorraine (historique) et carrières
    ('LFSB', 'Mine de Lorraine', 'Iron Ore', 'Lorraine'),
    ('LFQQ', 'Bassin Minier du Nord', 'Coal', 'Nord'),
    ('LFLL', 'Carrières du Rhône', 'Limestone', 'Rhône-Alpes'),
    ('LFST', 'Carrières d\'Alsace', 'Granite', 'Alsace - Strasbourg'),

    # === ENERGIE ===
    # Lacq (gaz), divers (pétrole)
    ('LFBP', 'Gisement de Lacq', 'Natural Gas', 'Béarn - Pau'),
    ('LFML', 'Raffinerie de Fos', 'Crude Oil', 'Fos-sur-Mer'),
    ('LFBO', 'Biocarburants Occitanie', 'Biomass', 'Occitanie'),

    # === EAU ===
    # Sources naturelles
    ('LFLC', 'Source Volvic', 'Water', 'Auvergne'),
    ('LFLP', 'Eaux des Alpes', 'Water', 'Alpes'),
]


def get_item_id(cur, item_name):
    """Get item ID by name."""
    cur.execute("SELECT id FROM game.items WHERE name = %s", (item_name,))
    result = cur.fetchone()
    if not result:
        print(f"WARNING: Item '{item_name}' not found!")
        return None
    return result[0]


def get_recipe_for_item(cur, item_id):
    """Get a recipe that produces this item (for T0, it's usually a simple extraction recipe)."""
    cur.execute("SELECT id FROM game.recipes WHERE result_item_id = %s LIMIT 1", (item_id,))
    result = cur.fetchone()
    return result[0] if result else None


def seed_factories():
    """Seed T0 NPC factories for France."""
    print("Connecting to database...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Verify NPC company exists
    cur.execute("SELECT id FROM game.companies WHERE id = %s", (NPC_COMPANY_ID,))
    if not cur.fetchone():
        print("ERROR: NPC Company not found! Run add_factory_tier.sql first.")
        return

    print(f"NPC Company found: {NPC_COMPANY_ID}")

    # Check existing T0 factories
    cur.execute("SELECT COUNT(*) FROM game.factories WHERE tier = 0")
    existing = cur.fetchone()[0]

    if existing > 0:
        response = input(f"Found {existing} existing T0 factories. Delete and recreate? (y/n): ")
        if response.lower() == 'y':
            cur.execute("DELETE FROM game.factories WHERE tier = 0")
            conn.commit()
            print(f"Deleted {existing} T0 factories.")
        else:
            print("Keeping existing factories. Adding new ones...")

    # Cache item IDs
    print("Loading item IDs...")
    item_cache = {}
    for _, _, item_name, _ in FRENCH_T0_FACTORIES:
        if item_name not in item_cache:
            item_id = get_item_id(cur, item_name)
            item_cache[item_name] = item_id

    # Verify airport codes exist
    print("Verifying airport codes...")
    airport_codes = set(f[0] for f in FRENCH_T0_FACTORIES)
    cur.execute(
        "SELECT ident FROM public.airports WHERE ident = ANY(%s)",
        (list(airport_codes),)
    )
    valid_airports = set(row[0] for row in cur.fetchall())
    invalid = airport_codes - valid_airports
    if invalid:
        print(f"WARNING: Invalid airport codes: {invalid}")

    # Insert factories
    print(f"Creating {len(FRENCH_T0_FACTORIES)} T0 factories...")

    created = 0
    skipped = 0

    for airport_ident, factory_name, item_name, region in FRENCH_T0_FACTORIES:
        if airport_ident not in valid_airports:
            print(f"  SKIP: {factory_name} - invalid airport {airport_ident}")
            skipped += 1
            continue

        item_id = item_cache.get(item_name)
        if not item_id:
            print(f"  SKIP: {factory_name} - item '{item_name}' not found")
            skipped += 1
            continue

        # Get recipe for this item (if exists)
        recipe_id = get_recipe_for_item(cur, item_id)

        try:
            cur.execute("""
                INSERT INTO game.factories
                (company_id, airport_ident, name, tier, factory_type, status)
                VALUES (%s, %s, %s, 0, 'extraction', 'producing')
            """, (NPC_COMPANY_ID, airport_ident, factory_name))
            created += 1
            print(f"  OK: {factory_name} @ {airport_ident} ({region})")
        except Exception as e:
            print(f"  ERROR: {factory_name} - {e}")
            skipped += 1

    conn.commit()

    # Summary
    print(f"\n=== Summary ===")
    print(f"Created: {created} factories")
    print(f"Skipped: {skipped} factories")

    # Verify by region
    cur.execute("""
        SELECT f.airport_ident, f.name, a.municipality
        FROM game.factories f
        JOIN public.airports a ON f.airport_ident = a.ident
        WHERE f.tier = 0
        ORDER BY f.airport_ident
    """)

    print(f"\n=== T0 Factories in France ===")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]} ({row[2]})")

    cur.close()
    conn.close()
    print("\nDone!")


if __name__ == '__main__':
    seed_factories()
