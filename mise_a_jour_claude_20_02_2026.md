# Mise a jour — 20 fevrier 2026

## Changements majeurs

### Position System
- PositionService est la seule source de verite pour les positions
- 5 contournements elimines (HangarController, MissionController, etc.)
- Fallback lat/lon quand GPS MSFS retourne "----"
- Flag hasReceivedSimData pour eviter les faux positifs au boot

### Free Flight
- FreeFlightController.ts extrait de AeroCorpOnline.tsx
- FlightTracker corrige : XP sauve + authState rafraichi
- Career stats (flight time, landings, distance) mises a jour
- Touchdown FPM capture au bon moment (transition air->sol)
- Arrivee ICAO : fallback position BDD si GPS "----"
- Historique : free flights visibles + clic -> popup recap

### Missions
- maxGForce correctement tracke via TrackingManager
- distance_flown_nm envoyee (plus hardcode a 0)
- distance_nm dans recap (plus hardcode a 0)
- Money reward ajoute en solo (distance*5 + cargo*0.3 * grade)

### UI
- position: fixed -> position: absolute (9 fichiers, Coherent GT)
- Messages erreur creation mission : aeroport detecte affiche
- Transfert "----" plus affiche dans les suggestions

## Fichiers modifies
- controllers/FreeFlightController.ts (NOUVEAU)
- controllers/HangarController.ts
- controllers/MissionController.ts
- controllers/MapController.ts
- services/FlightTracker.ts
- services/PositionService.ts
- services/LocalMissionService.ts
- AeroCorpOnline.tsx
- helpers/freeFlightRecapHelper.ts
- helpers/FreeFlightRenderHelpers.ts
- + 9 fichiers UI (position: fixed -> absolute)

## Bugs connus restants
- Free flight : ATC, fuel restant, bonus tous hardcodes a 0/false
- Free flight : XP bareme a affiner
- GPS "----" : certains aeroports MSFS ne retournent pas d'ICAO
