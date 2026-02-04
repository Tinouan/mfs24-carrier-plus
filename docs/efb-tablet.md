# MFS World of Aircraft - EFB Tablet Documentation

Documentation de l'app EFB (Electronic Flight Bag) pour Microsoft Flight Simulator 2024.

---

## Workflow de Deploiement (IMPORTANT)

### Build + Deploy manuel

Le build genere les fichiers dans `dist/` mais **MSFS lit depuis le dossier Community**.
Il faut copier manuellement apres chaque build:

```bash
# 1. Build
cd "tablette ingame/PackageSources/WorldOfAircraft"
npm run build

# 2. Copier vers Community (PowerShell/Git Bash)
cp dist/WorldOfAircraft.js "C:/Users/tinou/AppData/Local/Packages/Microsoft.Limitless_8wekyb3d8bbwe/LocalCache/Packages/Community2024/mfs-carrierplus-efb/html_ui/efb_ui/efb_apps/WorldOfAircraft/"
cp dist/WorldOfAircraft.js.map "C:/Users/tinou/AppData/Local/Packages/Microsoft.Limitless_8wekyb3d8bbwe/LocalCache/Packages/Community2024/mfs-carrierplus-efb/html_ui/efb_ui/efb_apps/WorldOfAircraft/"

# 3. Recharger dans MSFS: Ctrl+Shift+R dans le debugger (http://localhost:19999)
```

### Verifier que les fichiers sont a jour

```bash
# Comparer les timestamps
ls -la "tablette ingame/PackageSources/WorldOfAircraft/dist/WorldOfAircraft.js"
ls -la "C:/Users/tinou/AppData/Local/Packages/Microsoft.Limitless_8wekyb3d8bbwe/LocalCache/Packages/Community2024/mfs-carrierplus-efb/html_ui/efb_ui/efb_apps/WorldOfAircraft/WorldOfAircraft.js"
```

---

## Localisation des fichiers

### Source code
```
tablette ingame/PackageSources/WorldOfAircraft/
├── src/
│   ├── WorldOfAircraft.tsx     # Code principal
│   ├── WorldOfAircraft.scss    # Styles (note: CSS classes ne fonctionnent pas, utiliser inline styles)
│   └── Assets/
│       └── app-icon.svg    # Icone de l'app
├── dist/                   # Fichiers compiles (generes)
├── build.js                # Script de build esbuild
├── watch-and-deploy.js     # Script de watch + auto-deploy
├── watch.bat               # Lanceur du watch script
├── package.json
└── tsconfig.json
```

### Dossier deploye (Community)
```
C:\Users\tinou\AppData\Local\Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache\Packages\Community2024\mfs-carrierplus-efb\
├── html_ui/efb_ui/efb_apps/WorldOfAircraft/
│   ├── WorldOfAircraft.js      # Bundle compile
│   ├── WorldOfAircraft.css     # Styles
│   └── Assets/
│       └── app-icon.svg
├── layout.json
└── manifest.json
```

---

## Developpement

### Build & Deploy

```bash
# Build une fois
cd "tablette ingame/PackageSources/WorldOfAircraft"
npm run build

# Watch mode (auto-rebuild + auto-deploy)
watch.bat
```

### Hot Reload (sans restart MSFS)

1. Ouvrir le debugger Coherent: `http://localhost:19999`
2. Apres modification + build
3. **Ctrl+Shift+R** dans le debugger = recharge l'EFB avec le nouveau code

> Note: Un simple refresh (F5) ne suffit pas toujours, utiliser Ctrl+Shift+R

---

## API EFB - Points importants

### Imports
```tsx
import {
  App,
  AppBootMode,
  AppInstallProps,
  AppSuspendMode,
  AppView,
  AppViewProps,
  Button,           // Composant bouton officiel
  Efb,
  RequiredProps,
  TabSelector,      // Composant onglet
  TVNode,
} from "@efb/efb-api";

import { FSComponent, VNode, Subject } from "@microsoft/msfs-sdk";
```

### Boutons - IMPORTANT

**NE PAS utiliser `onClick`** - ca ne fonctionne pas dans Coherent GT.

Utiliser le composant `Button` officiel avec `callback`:

```tsx
// CORRECT
<Button callback={(): void => { this.maFonction(); }}>
  <div style="...">Mon Bouton</div>
</Button>

// INCORRECT (ne fonctionne pas)
<div onClick={(): void => { this.maFonction(); }}>Mon Bouton</div>
```

### Styles - IMPORTANT

**Les classes CSS ne fonctionnent pas** dans l'EFB malgre le prefix `.efb-view.WorldOfAircraft`.

**Utiliser les styles inline:**

```tsx
// CORRECT
<div style="background: #252532; padding: 16px; color: white;">
  Contenu
</div>

// INCORRECT (ne s'applique pas)
<div class="ma-classe">Contenu</div>
```

### Reactive State (Subject)

```tsx
// Declaration
private monEtat = Subject.create<string>("valeur initiale");

// Modifier
this.monEtat.set("nouvelle valeur");

// Lire dans le JSX (reactive)
<div>{this.monEtat}</div>

// Transformer pour attributs
<div style={this.monEtat.map(v => v === "actif" ? "color: green;" : "color: gray;")}>
  {this.monEtat}
</div>
```

### TabSelector

```tsx
<TabSelector
  tabName="VOL"
  active={this.activeTab.map(t => t === "flight")}
  hidden={Subject.create(false)}
  callback={(): void => this.activeTab.set("flight")}
/>
```

### SimVars

```tsx
// Declaration globale
declare const SimVar: {
  GetSimVarValue(name: string, unit: string): number | boolean | string;
};

// Lecture
const lat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number;
const alt = SimVar.GetSimVarValue("PLANE ALTITUDE", "feet") as number;
const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "bool") as boolean;
```

SimVars utiles:
- `PLANE LATITUDE` / `PLANE LONGITUDE` (degrees)
- `PLANE ALTITUDE` (feet)
- `PLANE HEADING DEGREES TRUE` (degrees)
- `GROUND VELOCITY` (knots)
- `AIRSPEED INDICATED` (knots)
- `VERTICAL SPEED` (feet per minute)
- `G FORCE` (GForce)
- `FUEL TOTAL QUANTITY` (gallons)
- `SIM ON GROUND` (bool)

---

## Architecture P2P (Mode Local-First)

### Stockage SQLite local

L'EFB utilise SQLite (sql.js) pour le stockage local:

```tsx
import { DatabaseManager } from './managers/DatabaseManager';

// Lecture des données
const aircraft = await DatabaseManager.query('SELECT * FROM aircraft WHERE id = ?', [id]);

// Écriture des données
await DatabaseManager.run('UPDATE aircraft SET fuel_gallons = ? WHERE id = ?', [fuel, id]);
```

### Services via DataLayer

Tous les services passent par le DataLayer qui gère le mode local/réseau:

```tsx
// Mode solo → SQLite local
DataLayer.setLocalMode();

// Mode multi → Sync P2P
DataLayer.setNetworkMode({ host: '192.168.1.10', port: 7777 });

// Les services utilisent DataLayer automatiquement
const fleet = await FleetService.getFleet();
```

---

## Coherent GT - Limitations CSS

Coherent GT (le moteur de rendu de MSFS) a des limitations importantes:

### Ce qui NE FONCTIONNE PAS

```css
/* Gradients - ne s'affichent pas */
background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%);  /* NON */

/* Backdrop filter - ignore */
backdrop-filter: blur(10px);  /* NON */

/* Position absolute dans certains contextes */
position: absolute;  /* Parfois bugge */

/* Canvas getImageData (utilise par OpenLayers) */
ctx.getImageData();  /* Erreur: Not supported */
```

### Solutions de contournement

```tsx
/* Utiliser des couleurs solides */
background: #1e2433;  /* OUI */

/* Pour centrer des boutons: text-align + inline-block */
<div style="text-align: center;">
  <Button callback={...}>
    <div style="display: inline-block; padding: 12px 40px;">
      Mon Bouton
    </div>
  </Button>
</div>

/* Pour les popups: pas d'absolute, utiliser transform */
<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
  Popup centree
</div>
```

---

## OpenLayers Map Integration

### Installation

```bash
npm install ol
```

### Import

```tsx
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromLonLat, toLonLat } from "ol/proj";
import { Style, Icon, Fill, Stroke, Circle as CircleStyle } from "ol/style";
```

### Click Detection - IMPORTANT

**`forEachFeatureAtPixel` ne fonctionne PAS** dans Coherent GT car il utilise `getImageData()`.

Solution: Detection manuelle par distance aux coordonnees:

```tsx
private async handleMapClick(e: MouseEvent, container: HTMLElement): Promise<void> {
  const rect = container.getBoundingClientRect();
  const pixel: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];

  // Convertir pixel -> coordonnees
  const clickCoord = this.olMap.getCoordinateFromPixel(pixel);
  const clickLonLat = toLonLat(clickCoord);

  // Tolerance basee sur le zoom
  const zoom = this.olMap.getView().getZoom() || 5;
  const tolerance = 0.5 / Math.pow(2, zoom - 5);

  // Chercher la feature la plus proche
  let nearestFeature: Feature | null = null;
  let nearestDistance = Infinity;

  this.airportsSource.getFeatures().forEach((feature) => {
    const geom = feature.getGeometry() as Point;
    if (!geom) return;

    const featureCoord = toLonLat(geom.getCoordinates());
    const dx = clickLonLat[0] - featureCoord[0];
    const dy = clickLonLat[1] - featureCoord[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < tolerance && distance < nearestDistance) {
      nearestFeature = feature;
      nearestDistance = distance;
    }
  });

  if (nearestFeature) {
    const icao = nearestFeature.get("icao");
    // Traiter le clic sur l'aeroport
  }
}
```

### Drag Detection (pour eviter les clics pendant le drag)

```tsx
private setupManualMapDrag(container: HTMLElement): void {
  let isDragging = false;
  let startX = 0, startY = 0;

  container.addEventListener("mousedown", (e) => {
    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;
  });

  container.addEventListener("mousemove", (e) => {
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > 5 || dy > 5) {
      isDragging = true;
    }
  });

  container.addEventListener("mouseup", (e) => {
    if (!isDragging) {
      // C'est un vrai clic, pas un drag
      this.handleMapClick(e, container);
    }
  });
}
```

---

## Airport Context Menu

### Structure du popup

```tsx
{/* Popup container - visible seulement si airport selectionne */}
<div style={this.selectedAirport.map(airport => airport
  ? "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1e2433; border: 2px solid #3b82f6; border-radius: 16px; min-width: 280px; z-index: 1000; padding: 16px;"
  : "display: none;")}>

  {/* Header */}
  <div style="text-align: center;">
    <div style="font-size: 28px; color: #60a5fa;">
      {this.selectedAirport.map(a => a?.icao || "")}
    </div>
    <div style="font-size: 14px; color: #e5e7eb;">
      {this.selectedAirport.map(a => a?.name || "")}
    </div>
  </div>

  {/* Boutons centres */}
  <div style="text-align: center; margin-top: 16px;">
    <Button callback={(): void => { /* action */ }}>
      <div style="display: inline-block; padding: 12px 40px; background: #3b82f6; border-radius: 8px; color: white;">
        {this.availableSlotsAtAirport.map(slots =>
          slots !== null ? `Creer une usine (${slots})` : "Creer une usine"
        )}
      </div>
    </Button>
  </div>
</div>
```

### Fetch des slots disponibles

```tsx
private async fetchAvailableSlotsAtAirport(icaoCode: string): Promise<void> {
  try {
    const data = await WorldService.getAirportSlots(icaoCode);
    // data = { airport_ident, airport_type, max_slots, occupied_slots, available_slots }
    this.availableSlotsAtAirport.set(data.available_slots ?? 0);
  } catch (error) {
    console.error("[WorldOfAircraft] Failed to fetch available slots:", error);
    this.availableSlotsAtAirport.set(null);
  }
}
```

### Slots par type d'aeroport

Limites de slots (calculées localement):
- `large_airport`: 12 slots
- `medium_airport`: 6 slots
- `small_airport`: 3 slots
- `heliport`: 1 slot

---

## Debugging

### Coherent GT Debugger

URL: `http://localhost:19999`

- **Elements**: Inspecter le DOM
- **Console**: Voir les logs `console.log()`
- **Network**: Voir les requetes fetch
- **Sources**: Voir le code source (avec source maps)

### Erreurs 404 .map

Les erreurs 404 pour les fichiers `.map` sont normales (Asobo n'a pas inclus les source maps).

---

## Structure de l'App WorldOfAircraft (V0.8)

### Onglets (dans l'ordre sidebar)

| Tab | Description |
|-----|-------------|
| **Map** | Carte OpenLayers avec position avion, aeroports, factories, helipads |
| **Profile** | Profil utilisateur (connexion/deconnexion) |
| **Missions** | Liste des missions actives/historique + tracking en vol |
| **Create Mission** | Creation de mission: selection destination + avion + cargo |
| **Company** | Infos company, membres, flotte |
| **Market** | Hotel des Ventes - acheter des ressources |
| **Inventory** | Inventaire personnel/company |
| **Hangar** | V2.3 - Liste de tous les avions (perso + company) avec details |

### Cycle de vie

```tsx
class WorldOfAircraftView extends AppView {
  public onOpen(): void {
    // App ouverte - demarrer les updates
  }

  public onClose(): void {
    // App fermee - arreter les updates
  }

  public onResume(): void {
    // App revenue au premier plan
  }

  public onPause(): void {
    // App mise en arriere-plan
  }
}
```

---

## Commandes utiles

```bash
# Build
npm run build

# Watch (dans le dossier WorldOfAircraft)
npm run watch

# Watch + Deploy automatique
watch.bat

# Deployer manuellement
cp dist/WorldOfAircraft.js "C:/Users/tinou/AppData/Local/Packages/Microsoft.Limitless_8wekyb3d8bbwe/LocalCache/Packages/Community2024/mfs-carrierplus-efb/html_ui/efb_ui/efb_apps/WorldOfAircraft/"
```

---

## Troubleshooting

### Les changements EFB ne s'appliquent pas

1. Verifier que le build a reussi
2. Verifier que les fichiers sont copies vers Community:
   ```bash
   ls -la "tablette ingame/PackageSources/WorldOfAircraft/dist/WorldOfAircraft.js"
   ls -la "C:/Users/tinou/AppData/.../WorldOfAircraft/WorldOfAircraft.js"
   ```
3. Les timestamps doivent correspondre
4. Recharger l'EFB: **Ctrl+Shift+R** dans le debugger

---

## Market Tab (V0.8)

L'onglet Market permet d'acheter des ressources sur l'Hotel des Ventes (HV).

### Fonctionnalites

- **Wallets Header**: Affiche les soldes personnel et company
- **Filtres Tier**: Boutons T0, T1, T2, T3 pour filtrer par tier
- **Liste des offres**: Cards avec item, tier, prix, quantite, vendeur, aeroport
- **Popup d'achat**: Selection quantite + wallet (perso/company) + confirmation

### Services utilises

| Service | Description |
|---------|-------------|
| `PlayerService.getPlayer()` | Wallet personnel |
| `CompanyService.getMyCompany()` | Solde company |
| `MarketService.getListings()` | Listings du marche |
| `MarketService.buy()` | Acheter un item |

### Coherent GT Pattern (refs + innerHTML)

Pour afficher des listes dynamiques dans Coherent GT, utiliser le pattern refs + innerHTML:

```tsx
// Declaration du ref
private marketListingsRef = FSComponent.createRef<HTMLDivElement>();

// JSX placeholder
<div ref={this.marketListingsRef}>
  <div>Chargement...</div>
</div>

// Mise a jour via innerHTML
private renderMarketTab(): void {
  const el = this.marketListingsRef.getOrDefault();
  if (!el) return;

  const listings = this.marketListings.get();
  el.innerHTML = listings.map(item => `
    <div class="market-item" data-id="${item.item_id}">
      ${item.item_name} - ${item.sale_price} CR
    </div>
  `).join("");

  // Ajouter les event listeners
  el.querySelectorAll(".market-item").forEach(el => {
    el.addEventListener("click", () => { /* ... */ });
  });
}
```

**Important**: Les retours de `.map()` dans le JSX ne fonctionnent PAS dans Coherent GT. Toujours utiliser refs + innerHTML pour les listes dynamiques.

---

### Données non chargées

En mode P2P, les données sont stockées localement. Si elles ne chargent pas:

1. Vérifier que l'initialisation SQLite a réussi
2. Vérifier la console pour les erreurs DatabaseManager
3. Essayer de recharger l'EFB (Ctrl+Shift+R)

### Les logs n'apparaissent pas dans la console

Verifier que le bon fichier est charge:
1. Le fichier `dist/` est-il a jour?
2. Le fichier `Community/` est-il a jour?
3. L'EFB a-t-il ete recharge (Ctrl+Shift+R)?

### Erreur "getImageData is not supported"

C'est normal dans Coherent GT. Ne pas utiliser `forEachFeatureAtPixel` d'OpenLayers.
Utiliser la detection manuelle par distance (voir section OpenLayers).

---

## Map Tab - Fonctionnalites avancees

### Recherche ICAO

Barre de recherche sous les controles de la map pour centrer sur un aeroport par code ICAO.

```tsx
// Input ref avec keyboard blocking
private icaoSearchInputRef = FSComponent.createRef<HTMLInputElement>();

// Fonction de recherche
private async searchAirportByIcao(): Promise<void> {
  const icao = this.icaoSearchInputRef.getOrDefault()?.value.trim().toUpperCase();
  if (!icao || icao.length < 2) return;

  const airports = await WorldService.searchAirports({ ident: icao, limit: 1 });

  if (airports.length > 0) {
    const airport = airports[0];
    this.olMap.getView().animate({
      center: fromLonLat([airport.longitude_deg, airport.latitude_deg]),
      zoom: 12,
      duration: 800,
    });
  }
}
```

**Service** - La recherche utilise `WorldService.searchAirports()` qui query la base SQLite locale.

### Filtres d'aeroports

Boutons toggle pour afficher/masquer les aeroports par taille:

| Bouton | Type API | Description |
|--------|----------|-------------|
| Grands | `large_airport` | Grands aeroports internationaux |
| Moyens | `medium_airport` | Aeroports regionaux |
| Petits | `small_airport` | Petits aerodromes |
| HELI | `heliport` | Helipads |
| FAC | - | Factories (usines) |

---

## Keyboard Capture - Coherent GT

### Probleme

Dans Coherent GT, les inputs text peuvent declencher les raccourcis du simulateur (ex: "P" = pause).

### Solution officielle MSFS

Utiliser `Coherent.trigger()` pour capturer/relacher le clavier:

```tsx
private setupInputEventBlocker(input: HTMLInputElement | null): void {
  if (!input) return;

  // UUID unique pour ce champ
  const uuid = `carrierplus-input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  input.addEventListener("focus", () => {
    // Capture le clavier - le simulateur ignore les touches
    // @ts-ignore
    Coherent.trigger("FOCUS_INPUT_FIELD", { uuid, isPassword: input.type === "password" });
  });

  input.addEventListener("blur", () => {
    // Relache le clavier - le simulateur reprend le controle
    // @ts-ignore
    Coherent.trigger("UNFOCUS_INPUT_FIELD", uuid);
  });
}
```

**Important**: Appeler `setupInputEventBlocker()` apres que l'input soit rendu dans le DOM.

---

## Map Lifecycle - Gestion du refresh GT

### Probleme

Quand le debugger GT rafraichit (Ctrl+Shift+R), le DOM est recree mais l'etat JavaScript persiste.
L'objet `olMap` pointe alors vers un container DOM detruit = map noire.

### Solution: disposeMap()

Nettoyer la map a chaque ouverture de l'app:

```tsx
public onOpen(): void {
  this.startSimVarUpdates();
  this.loadAuthFromStorage();

  // Force re-initialization (handles GT debugger refresh)
  this.disposeMap();

  // Si deja sur l'onglet map, initialiser immediatement
  if (this.activeTab.get() === "map") {
    setTimeout(() => this.initializeMap(), 100);
  }

  // Subscription pour changement d'onglet
  this.activeTab.sub((tab) => {
    if (tab === "map" && !this.mapInitialized) {
      setTimeout(() => this.initializeMap(), 100);
    }
  });
}

private disposeMap(): void {
  if (this.olMap) {
    try {
      this.olMap.setTarget(undefined); // Detache du DOM
      this.olMap.dispose();            // Libere les ressources
    } catch (e) {
      console.log("[WorldOfAircraft] Map dispose error (normal after refresh)");
    }
    this.olMap = null;
  }
  this.mapInitialized = false;
  this.aircraftFeature = null;
  this.aircraftSource = null;
  this.airportsSource = null;
  this.airportsLayer = null;
  this.factoriesSource = null;
  this.factoriesLayer = null;
  this.helipadsSource = null;
  this.helipadsLayer = null;
}
```

### onResume - Recalcul de taille

Apres un resume (retour de pause), forcer OpenLayers a recalculer:

```tsx
public onResume(): void {
  this.startSimVarUpdates();

  if (this.activeTab.get() === "map" && this.olMap) {
    setTimeout(() => {
      this.olMap?.updateSize();
    }, 100);
  }
}
```

---

## Hangar Tab (V2.3)

L'onglet Hangar affiche **tous** les avions accessibles par le joueur (personnels ET company) avec distinction visuelle.

### Fonctionnalites

- **Liste de la flotte**: Affiche tous les avions avec badge PERSO (vert) ou COMPANY (violet)
- **Details avion**: Panel droit avec infos detaillees (carburant, cargo, systemes)
- **Refresh**: Bouton pour recharger la liste depuis l'API

### Services utilises

| Service | Description |
|---------|-------------|
| `FleetService.getFleet()` | Liste tous les avions (personal + company) |
| `FleetService.getAircraft(id)` | Details d'un avion specifique |

### Format des donnees

```typescript
interface HangarAircraftItem {
  id: string;
  registration: string;
  aircraft_type: string;
  current_airport_ident: string;
  status: string;
  owner_type: "player" | "company";
}
```

### Pattern FSComponent pour listes dynamiques

Les listes dynamiques doivent utiliser le pattern refs + innerHTML:

```tsx
// 1. Declaration du ref
private hangarListRef = FSComponent.createRef<HTMLDivElement>();

// 2. JSX placeholder
<div ref={this.hangarListRef}>
  <div>Cliquez sur Refresh</div>
</div>

// 3. Fonction de rendu
private renderHangarList(): void {
  const listEl = this.hangarListRef.getOrDefault();
  if (!listEl) return;

  const aircraft = this.hangarAircraftList.get();

  listEl.innerHTML = aircraft.map(ac => {
    const isPersonal = ac.owner_type === "player";
    const badgeStyle = isPersonal
      ? "background: #10b981;"  // vert
      : "background: #6366f1;"; // violet

    return `
      <div class="hangar-aircraft-item" data-aircraft-id="${ac.id}">
        <span>${ac.registration}</span>
        <span style="${badgeStyle}">${isPersonal ? "PERSO" : "COMPANY"}</span>
      </div>
    `;
  }).join("");

  // 4. Ajouter les event listeners
  listEl.querySelectorAll(".hangar-aircraft-item").forEach(item => {
    item.addEventListener("click", () => {
      const id = item.getAttribute("data-aircraft-id");
      if (id) void this.fetchAircraftDetails(id);
    });
  });
}

// 5. Appeler apres fetch
this.hangarAircraftList.set(data);
this.renderHangarList();
```

**Important**: Ne jamais utiliser `.map()` inline dans le JSX pour des listes - ca affiche `[object Object]`.

---

## Mission Tracking (V2.2)

### 5 Phases de vol

| Phase | ID | Couleur | Condition |
|-------|-----|---------|-----------|
| Roulage depart | `taxi_out` | Vert | Au sol, progress < 5% |
| Montee | `climb` | Orange | En vol, VS > 200 fpm, progress < 80% |
| Croisiere | `cruise` | Vert | En vol, VS stable |
| Descente | `descent` | Orange | En vol, VS < -200 fpm, progress > 50% |
| Roulage arrivee | `taxi_in` | Vert | Au sol, progress > 95% |

### XP Bonus

| Bonus | Description | Calcul |
|-------|-------------|--------|
| Nuit | Vol de nuit (20h-6h local) | +100 XP si heure locale < 6 ou >= 20 |
| Eco | Carburant economise | % non consomme vs max autorise |
| Cargo | Poids correct | 100% si payload = cargo attendu (±10% tolerance) |

### SimVars utilisees pour le tracking

```tsx
// Position
SimVar.GetSimVarValue("PLANE LATITUDE", "degrees");
SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees");

// Heure locale (pour bonus nuit)
SimVar.GetSimVarValue("E:LOCAL TIME", "seconds");
const hour = Math.floor(localTimeSeconds / 3600) % 24;

// Payload (pour bonus cargo)
const stationCount = SimVar.GetSimVarValue("PAYLOAD STATION COUNT", "number");
for (let i = 1; i <= stationCount; i++) {
  const weight = SimVar.GetSimVarValue(`PAYLOAD STATION WEIGHT:${i}`, "pounds");
  totalPayload += weight;
}
const cargoKg = totalPayload * 0.453592;
```

### Calcul de progression (Haversine)

```tsx
// Distance depuis l'origine (pas GPS WP DISTANCE qui est unreliable)
private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Rayon Terre en nm
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Progress = distance parcourue / distance totale
const flownNm = this.haversineDistance(originLat, originLon, currentLat, currentLon);
const progressPct = Math.min(100, (flownNm / totalDistanceNm) * 100);
```

---

## Mode P2P Local-First (V0.9)

### Concept

L'app supporte deux modes de fonctionnement:
- **Mode P2P**: Données stockées localement dans localStorage, joueur solo
- **Mode Network**: Backend FastAPI centralisé, multijoueur synchronisé

### Service Router Pattern

Architecture dual-mode pour basculer automatiquement entre P2P et Network:

```tsx
// Dans ServiceRouter.ts
const isP2P = (): boolean => authState.isP2PMode.get();

export const FleetRouter = {
  async getFleet(token?: string | null): Promise<HangarAircraftItem[]> {
    if (isP2P()) {
      return Services.fleet.getFleet();  // Local service
    }
    return fleetService.getFleet(token!); // Network API
  },
  // ...
};
```

### Routers disponibles

| Router | P2P Service | Network Service |
|--------|-------------|-----------------|
| `FleetRouter` | `localFleetService` | `fleetService` |
| `MissionRouter` | `localMissionService` | `missionService` |
| `MarketRouter` | `localMarketService` | `marketService` |
| `WorldRouter` | `localWorldService` | `worldService` |
| `PlayerRouter` | `Services.player` | - |
| `CompanyRouter` | `Services.company` | - |
| `FreeFlightRouter` | `Services.freeFlight` | - |

### Stockage P2P (localStorage)

```
carrierplus_
├── player           # Profil joueur (id, name, money, xp)
├── company          # Company (si achetée)
├── aircraft         # Flotte (personal + company)
├── missions         # Historique missions
├── inventory        # Items par location
├── market_orders    # Ordres marché
├── items            # Catalogue items (94 items)
├── recipes          # Recettes (60 recipes)
├── aircraft_catalog # Types avions supportés
└── airports         # Cache aéroports (en mémoire)
```

### First Launch Setup

Au premier lancement (pas de player en localStorage):

```tsx
// InitService.ts
async initialize(callbacks: InitCallbacks): Promise<void> {
  // Check if first launch
  const playerCount = await DatabaseManager.count("player");

  if (playerCount === 0) {
    // First launch - show welcome popup
    callbacks.onFirstLaunch?.();
    return;
  }

  // Existing player - load data
  callbacks.onComplete?.();
}

// Après saisie du formulaire welcome
async completeFirstLaunch(pilotName, nationality, startingAirport): Promise<void> {
  // 1. Créer player avec 100,000 CR
  const playerId = await this.createCustomPlayer(pilotName, nationality);

  // 2. Créer avion personnel (C172) - PAS de company
  await this.createPersonalStarterAircraft(playerId, startingAirport);

  // 3. Générer ordres marché IA
  await this.generateInitialMarket();
}
```

### Achat de Company (P2P)

Le joueur démarre **sans company** avec un avion personnel:

```tsx
// InitService.ts
async purchaseCompany(companyName: string): Promise<Company> {
  const COMPANY_COST = 50000;

  const player = await DatabaseManager.getPlayer();
  if (!player) throw new Error("No player found");

  // Check existing company
  const existingCompany = await DatabaseManager.getCompanyByOwner(player.id);
  if (existingCompany) throw new Error("Already has company");

  // Check funds
  if (player.money < COMPANY_COST) {
    throw new Error(`Insufficient funds. Need ${COMPANY_COST}`);
  }

  // Deduct and create
  player.money -= COMPANY_COST;
  await DatabaseManager.savePlayer(player);

  const company: Company = {
    id: generateUUID(),
    name: companyName,
    balance: 0,
    owner_id: player.id,
    created_at: new Date().toISOString(),
  };

  await DatabaseManager.put("company", company);
  return company;
}
```

### Ownership Model (Avions)

Deux types de propriété d'avion:

| Type | Champs | Description |
|------|--------|-------------|
| **Personal** | `owner_id = player_id`, `company_id = null` | Avion personnel |
| **Company** | `owner_id = null`, `company_id = company_id` | Avion de company |

Le hangar affiche les deux types avec badge distinctif.

### State Management

L'état P2P est géré dans `AuthState`:

```tsx
// state/AuthState.ts
export const authState = {
  // ...
  isP2PMode: Subject.create(true), // Par défaut en P2P
  showFirstLaunchPopup: Subject.create(false),
  firstLaunchPilotName: Subject.create(""),
  firstLaunchNationality: Subject.create("FR"),
  firstLaunchAirport: Subject.create("LFPG"),
};
```

### Token Checks Adaptés

Toutes les fonctions fetch doivent supporter le mode P2P:

```tsx
// Pattern standard
private async fetchSomething(): Promise<void> {
  const token = authState.authToken.get();
  // P2P mode doesn't require token
  if (!authState.isP2PMode.get() && !token) return;

  // ... fetch logic using Router
}
```

### Data Files (JSON)

Les données statiques sont chargées depuis des fichiers JSON bundlés:

| Fichier | Contenu | Taille |
|---------|---------|--------|
| `airports-main.json` | ~5000 aéroports | 1.5 MB |
| `items.json` | 94 items catalogue | 50 KB |
| `recipes.json` | 60 recettes | 30 KB |
| `aircraft.json` | Types d'avions supportés | 20 KB |
| `seed.json` | Config démarrage (starter money, etc.) | 2 KB |

---

## Structure des modules State (V0.9)

### 15 modules dans `src/state/`

| Module | Subjects | Description |
|--------|----------|-------------|
| `AuthState` | 10 | Login, token, P2P mode, first launch |
| `NavigationState` | 5 | Tabs actifs, sub-tabs |
| `SettingsState` | 8 | Langue, unités, thème |
| `SimVarState` | 16 | Position, fuel, vitesse, altitude |
| `MapState` | 15 | Layers, sélection, zoom |
| `MissionState` | 17 | Mission active, status |
| `MissionCreationState` | 12 | Flight plan, validation |
| `TrackingState` | 20 | Bonus, progression, checkpoints |
| `CheckpointState` | 12 | Next CP, lignes |
| `CargoState` | 10 | Popup, transfert |
| `HangarState` | 20 | Aircraft, systems, repair |
| `CompanyState` | 11 | Data, membres, achat company |
| `MarketState` | 15 | Listings, buy popup, wallet |
| `PopupState` | 8 | Refuel, systems |
| `InventoryState` | 5 | Items, status |

### Import barrel

```tsx
// state/index.ts
export { authState } from "./AuthState";
export { navigationState } from "./NavigationState";
export { settingsState } from "./SettingsState";
// ... etc

// Usage dans WorldOfAircraft.tsx
import {
  authState,
  navigationState,
  settingsState,
  // ...
} from "./state";
```
