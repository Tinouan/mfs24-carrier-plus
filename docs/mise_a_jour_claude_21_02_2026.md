# Mise a jour — 21 fevrier 2026

## Changements majeurs (session du 21/02)

### AeroCorpOnline.tsx nettoyé (V5)
- 2557 → 2506 lignes (-51)
- ~30 console.log supprimés (spam haute fréquence, debug, état normal)
- `testWearAndTearSettable()` supprimé (59 lignes, test terminé, résultat: read-only)
- Callbacks AIEconomy/Persistence vidés (plus de logs)
- `forceUpdate()` en fire-and-forget

### loadPlayerDataIntoState() — Fix $0 CR au reload
- Nouvelle méthode partagée remplaçant ~50 lignes de code dupliqué
- Appelée dans les 4 chemins d'init (onComplete, handleSelectGameMode, handleSwitchToSolo, completeFirstLaunchSetup)
- Charge player money, XP, career stats, company balance depuis IndexedDB

### Header bar redesign
- padding-top: 50px → 44px (sidebar + content)
- Header height: 36px → 32px
- 3 séparateurs verticaux (#374151) entre les 4 groupes
- Argent affiché avec "CR" suffix
- XP bar élargie (60→80px) avec texte "43 / 1,000 XP" gris
- Badge SOLO : gris neutre (#6b7280) au lieu de rouge "OFFLINE"
- Badges flight status uppercase "EN VOL" / "AU SOL"

### Free Flight tracking UI
- Panneau tracking live dans onglet Missions > En cours
- Affiche : départ ICAO, temps vol, distance, atterrissages, XP
- Vitesse sol, altitude, statut (AU SOL / EN VOL)
- Grade estimé + score /1000 en temps réel
- Lumières (NAV/STR/BCN/LDG/TXI) avec code couleur
- G-Force max, fuel %, sim rate
- Recap automatique à l'arrêt moteur

### Free Flight fix démarrage
- `isAtCorrectAirport()` retiré du flow de démarrage free flight
- Le free flight démarre dès `engineRunning === true` (pas de validation aéroport)
- L'ICAO de départ se capture depuis `positionState.simVarAirport.get()`

### Nouveaux state subjects
- TrackingState: suiviAtcMode, suiviCrossTrackNm, suiviRouteStatus, suiviInCruise, suiviAlert, weatherScore, lightsUnnecessary, lightsStatusColor
- MissionCreationState: fpFlightMode ("IFR"/"VFR"), fpSource

### Détection VFR/IFR
- Si aucun plan de vol GPS actif → mode VFR automatique
- Si plan de vol GPS détecté → mode IFR + source "gps"

## Changements du 20/02 (session précédente)

### Position System
- PositionService est la seule source de vérité pour les positions
- 5 contournements éliminés (HangarController, MissionController, etc.)
- Fallback lat/lon quand GPS MSFS retourne "----"
- Flag hasReceivedSimData pour éviter les faux positifs au boot

### Free Flight
- FreeFlightController.ts extrait de AeroCorpOnline.tsx
- FlightTracker corrigé : XP sauvé + authState rafraîchi
- Career stats (flight time, landings, distance) mises à jour
- Touchdown FPM capture au bon moment (transition air→sol)
- Arrivée ICAO : fallback position BDD si GPS "----"
- Historique : free flights visibles + clic → popup recap

### Missions
- maxGForce correctement tracké via TrackingManager
- distance_flown_nm envoyée (plus hardcodé à 0)
- distance_nm dans recap (plus hardcodé à 0)
- Money reward ajouté en solo (distance×5 + cargo×0.3 × grade)

### UI
- position: fixed → position: absolute (9 fichiers, Coherent GT)
- Messages erreur création mission : aéroport détecté affiché
- Transfert "----" plus affiché dans les suggestions

## Bugs connus restants
- Free flight : ATC, fuel restant, bonus tous hardcodés à 0/false
- Free flight : XP barème à affiner (6 XP pour 3min vol semble bas)
- GPS "----" : certains aéroports MSFS ne retournent pas d'ICAO
- Cold & dark fallback position spam toutes les 500ms (cooldown 5s non respecté)
