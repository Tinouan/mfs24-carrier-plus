"""
Import airports from OurAirports CSV into PostgreSQL via Directus table.
Run this script from the project root: python scripts/import_airports.py
"""
import csv
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'game-api'))

import psycopg2
from psycopg2.extras import execute_values

# Database connection (same as docker-compose)
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'msfs',
    'user': 'msfs',
    'password': 'msfs'
}

CSV_FILE = 'airports.csv'

def import_airports():
    """Import airports from CSV to PostgreSQL."""

    print(f"Connecting to database...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Check current count
    cur.execute("SELECT COUNT(*) FROM public.airports")
    count = cur.fetchone()[0]
    print(f"Current airports in database: {count}")

    if count > 0:
        response = input("Table has data. Truncate and reimport? (y/n): ")
        if response.lower() != 'y':
            print("Aborted.")
            return
        cur.execute("TRUNCATE TABLE public.airports RESTART IDENTITY CASCADE")
        conn.commit()
        print("Table truncated.")

    print(f"Reading {CSV_FILE}...")

    # Read CSV
    airports = []
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            airports.append(row)

    print(f"Found {len(airports)} airports in CSV")

    # Prepare data for insert
    # Map CSV columns to DB columns (handling the typo in Directus: schedule_service)
    insert_sql = """
        INSERT INTO public.airports (
            ident, type, name, latitude_deg, longitude_deg, elevation_ft,
            continent, iso_country, iso_region, municipality, schedule_service,
            gps_code, iata_code, local_code, home_link, wikipedia_link, keywords,
            max_factories_slots, occupied_slots
        ) VALUES %s
    """

    # Prepare values
    values = []
    for row in airports:
        values.append((
            row.get('ident', '')[:255] or None,
            row.get('type', '')[:255] or None,
            row.get('name', '')[:255] or None,
            float(row['latitude_deg']) if row.get('latitude_deg') else None,
            float(row['longitude_deg']) if row.get('longitude_deg') else None,
            int(row['elevation_ft']) if row.get('elevation_ft') else None,
            row.get('continent', '')[:255] or None,
            row.get('iso_country', '')[:255] or None,
            row.get('iso_region', '')[:255] or None,
            row.get('municipality', '')[:255] or None,
            row.get('scheduled_service', '')[:255] or None,  # CSV: scheduled_service -> DB: schedule_service
            row.get('gps_code', '')[:255] or None,
            row.get('iata_code', '')[:255] or None,
            row.get('local_code', '')[:255] or None,
            row.get('home_link', '')[:255] or None,
            row.get('wikipedia_link', '')[:255] or None,
            row.get('keywords', '')[:255] or None,
            0,  # max_factories_slots (will be calculated by trigger)
            0   # occupied_slots
        ))

    print(f"Inserting {len(values)} airports...")

    # Batch insert using execute_values (much faster than individual inserts)
    execute_values(cur, insert_sql, values, page_size=1000)

    conn.commit()

    # Verify
    cur.execute("SELECT COUNT(*) FROM public.airports")
    final_count = cur.fetchone()[0]
    print(f"Import complete! {final_count} airports in database.")

    # Show sample
    cur.execute("SELECT ident, name, type FROM public.airports LIMIT 5")
    print("\nSample data:")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]} ({row[2]})")

    cur.close()
    conn.close()
    print("\nDone!")

if __name__ == '__main__':
    import_airports()
