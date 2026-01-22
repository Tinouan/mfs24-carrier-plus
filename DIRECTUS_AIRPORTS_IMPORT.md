# Airports Database - Configuration Complete

## Status: DONE ✅

The airports database has been successfully imported and configured.

## Current State

**84,435 airports** imported from OurAirports with factory slots calculated:

| Type | Slots | Count |
|------|-------|-------|
| large_airport (scheduled) | 12 | 1,011 |
| medium_airport | 6 | 4,168 |
| small_airport | 3 | 42,555 |
| heliport | 1 | 22,440 |
| seaplane_base | 1 | 1,251 |
| closed/military/other | 0 | ~13,000 |

## Database Structure

**Table:** `public.airports` (managed by Directus)

**Key columns:**
- `ident` - ICAO code (e.g., LFPG, KJFK)
- `type` - Airport type (large_airport, medium_airport, etc.)
- `name` - Airport name
- `schedule_service` - 'yes' or 'no' (note: Directus typo, not scheduled_service)
- `max_factories_slots` - Calculated by trigger (note: Directus typo)
- `occupied_slots` - Updated when factories created/deleted

## PostgreSQL Trigger

The trigger `calculate_max_slots` automatically calculates `max_factories_slots` based on:
- `large_airport` + `schedule_service = 'yes'` → 12 slots
- `medium_airport` → 6 slots
- `small_airport` → 3 slots
- `heliport` / `seaplane_base` → 1 slot
- Other types → 0 slots

## Files

- `scripts/import_airports.py` - Python import script (already executed)
- `sql/add_factory_slots_to_airports.sql` - Trigger creation script (already executed)
- `game-api/app/models/airport.py` - SQLAlchemy model

## Verification Queries

```sql
-- Count airports by type and slots
SELECT type, max_factories_slots, COUNT(*) as count
FROM public.airports
GROUP BY type, max_factories_slots
ORDER BY max_factories_slots DESC;

-- Check specific airport
SELECT ident, name, type, max_factories_slots
FROM public.airports
WHERE ident = 'LFPG';

-- Find airports with available slots in a country
SELECT ident, name, type, max_factories_slots
FROM public.airports
WHERE iso_country = 'FR' AND max_factories_slots > 0
ORDER BY max_factories_slots DESC
LIMIT 20;
```

## Notes

- **Directus column typos:** The table uses `schedule_service` and `max_factories_slots` (with typos). The code has been updated to match these names.
- **T0 factories (NPC)** will NOT count toward slot limits - only player T1+ factories count.
- Large airports without scheduled service (military bases, etc.) have 0 slots intentionally.
