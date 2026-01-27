# MFS Carrier+ - EFB Tablet Documentation

Documentation de l'app EFB (Electronic Flight Bag) pour Microsoft Flight Simulator 2024.

---

## Workflow de Deploiement (IMPORTANT)

### Build + Deploy manuel

Le build genere les fichiers dans `dist/` mais **MSFS lit depuis le dossier Community**.
Il faut copier manuellement apres chaque build:

```bash
# 1. Build
cd "tablette ingame/PackageSources/CarrierPlus"
npm run build

# 2. Copier vers Community (PowerShell/Git Bash)
cp dist/CarrierPlus.js "C:/Users/tinou/AppData/Local/Packages/Microsoft.Limitless_8wekyb3d8bbwe/LocalCache/Packages/Community2024/mfs-carrierplus-efb/html_ui/efb_ui/efb_apps/CarrierPlus/"
cp dist/CarrierPlus.js.map "C:/Users/tinou/AppData/Local/Packages/Microsoft.Limitless_8wekyb3d8bbwe/LocalCache/Packages/Community2024/mfs-carrierplus-efb/html_ui/efb_ui/efb_apps/CarrierPlus/"

# 3. Recharger dans MSFS: Ctrl+Shift+R dans le debugger (http://localhost:19999)
```

### Verifier que les fichiers sont a jour

```bash
# Comparer les timestamps
ls -la "tablette ingame/PackageSources/CarrierPlus/dist/CarrierPlus.js"
ls -la "C:/Users/tinou/AppData/Local/Packages/Microsoft.Limitless_8wekyb3d8bbwe/LocalCache/Packages/Community2024/mfs-carrierplus-efb/html_ui/efb_ui/efb_apps/CarrierPlus/CarrierPlus.js"
```

---

## Localisation des fichiers

### Source code
```
tablette ingame/PackageSources/CarrierPlus/
├── src/
│   ├── CarrierPlus.tsx     # Code principal
│   ├── CarrierPlus.scss    # Styles (note: CSS classes ne fonctionnent pas, utiliser inline styles)
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
├── html_ui/efb_ui/efb_apps/CarrierPlus/
│   ├── CarrierPlus.js      # Bundle compile
│   ├── CarrierPlus.css     # Styles
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
cd "tablette ingame/PackageSources/CarrierPlus"
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

**Les classes CSS ne fonctionnent pas** dans l'EFB malgre le prefix `.efb-view.CarrierPlus`.

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

## Connectivite Backend

### fetch() fonctionne !

Contrairement aux iframes (bloquees), les appels `fetch()` vers localhost fonctionnent:

```tsx
const response = await fetch("http://localhost:8000/api/endpoint", {
  method: "GET",
  headers: { "Accept": "application/json" },
});
const data = await response.json();
```

### iframes - BLOQUEES

Les iframes sont bloquees par le sandbox de l'EFB. Pas de solution connue.

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
    const response = await fetch(
      `http://localhost:8000/api/world/airports/${icaoCode}/available-slots`,
      { method: "GET" }
    );

    if (response.ok) {
      const data = await response.json();
      // data = { airport_ident, airport_type, max_slots, occupied_slots, available_slots }
      this.availableSlotsAtAirport.set(data.available_slots ?? 0);
    }
  } catch (error) {
    console.error("[CarrierPlus] Failed to fetch available slots:", error);
    this.availableSlotsAtAirport.set(null);
  }
}
```

### API Backend - Slots par type d'aeroport

```
GET /api/world/airports/{icao}/available-slots

Response:
{
  "airport_ident": "LFPG",
  "airport_type": "large_airport",
  "max_slots": 12,
  "occupied_slots": 2,
  "available_slots": 10
}
```

Limites de slots:
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

## Structure de l'App CarrierPlus (V0.8)

### Onglets (dans l'ordre sidebar)

| Tab | Description |
|-----|-------------|
| **Map** | Carte OpenLayers avec position avion, aeroports, factories, helipads |
| **Profile** | Profil utilisateur (connexion/deconnexion) |
| **Missions** | Liste des missions actives/historique |
| **Create Mission** | Creation de mission: selection destination + avion + cargo |
| **Company** | Infos company, membres, flotte |
| **Market** | Hotel des Ventes - acheter des ressources |
| **Inventory** | Inventaire personnel/company |

### Cycle de vie

```tsx
class CarrierPlusView extends AppView {
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

# Watch (dans le dossier CarrierPlus)
npm run watch

# Watch + Deploy automatique
watch.bat

# Deployer manuellement
cp dist/CarrierPlus.js "C:/Users/tinou/AppData/Local/Packages/Microsoft.Limitless_8wekyb3d8bbwe/LocalCache/Packages/Community2024/mfs-carrierplus-efb/html_ui/efb_ui/efb_apps/CarrierPlus/"
```

---

## Troubleshooting

### L'API retourne 500 Internal Server Error

Le conteneur Docker utilise peut-etre une version cachee du code Python.

```bash
# Redemarrer le conteneur API
docker restart msfs_game_api

# Verifier les logs
docker logs msfs_game_api --tail 30
```

### Les changements EFB ne s'appliquent pas

1. Verifier que le build a reussi
2. Verifier que les fichiers sont copies vers Community:
   ```bash
   ls -la "tablette ingame/PackageSources/CarrierPlus/dist/CarrierPlus.js"
   ls -la "C:/Users/tinou/AppData/.../CarrierPlus/CarrierPlus.js"
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

### API utilisees

| Endpoint | Description |
|----------|-------------|
| `GET /api/users/me` | Wallet personnel |
| `GET /api/company/me` | Solde company |
| `GET /api/inventory/market` | Listings du marche |
| `POST /api/inventory/market/buy` | Acheter un item |

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

### 401 Unauthorized sur les appels API

Le token JWT est peut-etre expire. Le code gere ca automatiquement:

```tsx
if (response.status === 401) {
  this.authToken.set(null);
  this.isLoggedIn.set(false);
  localStorage.removeItem("carrierplus_token");
}
```

### Les logs n'apparaissent pas dans la console

Verifier que le bon fichier est charge:
1. Le fichier `dist/` est-il a jour?
2. Le fichier `Community/` est-il a jour?
3. L'EFB a-t-il ete recharge (Ctrl+Shift+R)?

### Erreur "getImageData is not supported"

C'est normal dans Coherent GT. Ne pas utiliser `forEachFeatureAtPixel` d'OpenLayers.
Utiliser la detection manuelle par distance (voir section OpenLayers).
