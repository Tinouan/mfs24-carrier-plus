/**
 * MFS Carrier+ - Web Application
 * Map interface with factory visualization
 */

// ============================================
// CONFIGURATION
// ============================================
const API_BASE = `${window.location.origin}/api`;
const MAP_DEFAULT_CENTER = [30, 0]; // World center
const MAP_DEFAULT_ZOOM = 3;

// ============================================
// STATE
// ============================================
let state = {
    user: null,
    token: null,
    map: null,
    factories: [],
    airports: [],
    markers: {
        // Airports by type with different decluster zoom levels
        largeAirports: null,   // decluster at zoom 5
        mediumAirports: null,  // decluster at zoom 7
        smallAirports: null,   // decluster at zoom 10
        // Factory markers and connection lines (always visible)
        factoryMarkers: null,
        factoryLines: null
    },
    filters: {
        tier: 'all',
        resource: 'all',
        country: 'all',
        withFactoriesOnly: false
    },
    showAirports: true,
    zoomLevel: 6,
    // Market (HV) state
    market: {
        listings: [],
        stats: null,
        filters: {
            search: '',
            airport: '',
            tier: '',
            maxPrice: ''
        },
        page: 0,
        pageSize: 50,
        selectedListing: null
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Check for existing session
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (token && user) {
        state.token = token;
        state.user = JSON.parse(user);
        showApp();
    } else {
        showLogin();
    }

    // Setup tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });

    // Setup filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const filter = chip.dataset.filter;
            const value = chip.dataset.value;

            // Update active state
            document.querySelectorAll(`.filter-chip[data-filter="${filter}"]`).forEach(c => {
                c.classList.remove('active');
            });
            chip.classList.add('active');

            // Update state and refresh
            state.filters[filter] = value;
            updateMapMarkers();
        });
    });

    // Setup country filter
    document.getElementById('country-filter')?.addEventListener('change', (e) => {
        state.filters.country = e.target.value;
        loadFactories();
    });

    // Setup factories-only filter
    document.getElementById('factories-only-filter')?.addEventListener('change', (e) => {
        state.filters.withFactoriesOnly = e.target.checked;
        updateAirportMarkers();
        showToast(e.target.checked ? 'Affichage: usines uniquement' : 'Affichage: tous les aéroports', 'success');
    });

    // Setup navigation
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
        });
    });

    // Hide loading after init
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
    }, 500);
});

// ============================================
// AUTH FUNCTIONS
// ============================================
function showLogin() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

function showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Update user info
    if (state.user) {
        document.getElementById('user-name').textContent = state.user.username || state.user.email;
        document.getElementById('user-avatar').textContent = (state.user.username || state.user.email).substring(0, 2).toUpperCase();
    }

    // Initialize map
    initMap();

    // Load data - factories first, then airports (airports show factory badges)
    checkApiStatus();
    loadAllData();
}

async function loadAllData() {
    // Load factories first
    await loadFactoriesData();
    // Then load airports (which will show factory counts)
    await loadAirports();
    updateStats();
}

async function loadFactoriesData() {
    console.log('[LOAD] Loading factories...');
    try {
        const country = state.filters.country;
        const url = country === 'all'
            ? `${API_BASE}/world/factories`
            : `${API_BASE}/world/factories?country=${country}`;

        console.log('[LOAD] Fetching from:', url);
        const response = await fetch(url, {
            headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
        });

        if (response.ok) {
            state.factories = await response.json();
            console.log('[LOAD] Loaded from API:', state.factories.length, 'factories');
        } else {
            console.log('[LOAD] API failed, trying fallback...');
            await loadFactoriesFromDB();
        }
    } catch (error) {
        console.error('[LOAD] Error loading factories:', error);
        await loadFactoriesFromDB();
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (!email || !password) {
        showError(errorEl, 'Veuillez remplir tous les champs');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Erreur de connexion');
        }

        const data = await response.json();
        state.token = data.access_token;
        state.user = data.user;

        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));

        showToast('Connexion réussie!', 'success');
        showApp();
    } catch (error) {
        showError(errorEl, error.message);
        // For demo, allow bypass
        if (email && password) {
            state.user = { email, username: email.split('@')[0] };
            state.token = 'demo-token';
            localStorage.setItem('token', 'demo-token');
            localStorage.setItem('user', JSON.stringify(state.user));
            showToast('Mode démo activé', 'warning');
            showApp();
        }
    }
}

async function handleRegister() {
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const errorEl = document.getElementById('register-error');

    if (!username || !email || !password || !confirm) {
        showError(errorEl, 'Veuillez remplir tous les champs');
        return;
    }

    if (password !== confirm) {
        showError(errorEl, 'Les mots de passe ne correspondent pas');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Erreur d\'inscription');
        }

        showToast('Compte créé! Vous pouvez vous connecter.', 'success');
        switchTab('login');
    } catch (error) {
        showError(errorEl, error.message);
    }
}

function handleLogout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showLogin();
    showToast('Déconnecté', 'success');
}

// ============================================
// MAP FUNCTIONS
// ============================================
function initMap() {
    if (state.map) return;

    // Define world bounds to prevent multiple worlds
    const worldBounds = L.latLngBounds(
        L.latLng(-85, -180),
        L.latLng(85, 180)
    );

    // Create map with bounds to show only one world
    state.map = L.map('map', {
        center: MAP_DEFAULT_CENTER,
        zoom: MAP_DEFAULT_ZOOM,
        zoomControl: true,
        maxBounds: worldBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 3
    });

    // ESRI World Imagery - satellite view (shows airport runways)
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        noWrap: true,
        bounds: worldBounds
    });

    // CartoDB Labels - overlay for place names
    const labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        subdomains: 'abcd',
        noWrap: true,
        bounds: worldBounds,
        pane: 'overlayPane'
    });

    // Add layers
    satellite.addTo(state.map);
    labels.addTo(state.map);

    // Create custom panes for layering
    state.map.createPane('linesPane');
    state.map.getPane('linesPane').style.zIndex = 600;

    state.map.createPane('factoriesPane');
    state.map.getPane('factoriesPane').style.zIndex = 700;

    // =========================================
    // Factory connection lines (below markers)
    // =========================================
    state.markers.factoryLines = L.layerGroup({ pane: 'linesPane' });
    state.markers.factoryLines.addTo(state.map);

    // =========================================
    // Factory markers (always visible, above lines)
    // =========================================
    state.markers.factoryMarkers = L.layerGroup({ pane: 'factoriesPane' });
    state.markers.factoryMarkers.addTo(state.map);

    // =========================================
    // Airport layers - Simple LayerGroups with zoom-based visibility
    // Visibility controlled by updateLayerVisibility()
    // =========================================
    state.markers.largeAirports = L.layerGroup();   // visible at zoom >= 5
    state.markers.mediumAirports = L.layerGroup();  // visible at zoom >= 7
    state.markers.smallAirports = L.layerGroup();   // visible at zoom >= 10
    // Layers will be added/removed by updateLayerVisibility() based on zoom

    // Store layers for toggle
    state.tileLayers = { satellite, labels };

    // Track zoom level and update layer visibility
    state.map.on('zoomend', () => {
        state.zoomLevel = state.map.getZoom();
        updateLayerVisibility();
    });

    // Initial visibility check
    updateLayerVisibility();

    // Reload airports when map viewport changes (pan/zoom)
    state.map.on('moveend', onMapMoveEnd);

    // Hide empty slots when clicking on the map (not on a marker)
    state.map.on('click', () => {
        hideEmptySlots();
    });

    console.log('[MAP] Initialized with satellite imagery');
}

// Control layer visibility based on zoom level
function updateLayerVisibility() {
    const zoom = state.map.getZoom();

    // Large airports: visible at zoom >= 5
    if (state.markers.largeAirports) {
        if (zoom >= 5) {
            if (!state.map.hasLayer(state.markers.largeAirports)) {
                state.map.addLayer(state.markers.largeAirports);
            }
        } else {
            if (state.map.hasLayer(state.markers.largeAirports)) {
                state.map.removeLayer(state.markers.largeAirports);
            }
        }
    }

    // Medium airports: visible at zoom >= 7
    if (state.markers.mediumAirports) {
        if (zoom >= 7) {
            if (!state.map.hasLayer(state.markers.mediumAirports)) {
                state.map.addLayer(state.markers.mediumAirports);
            }
        } else {
            if (state.map.hasLayer(state.markers.mediumAirports)) {
                state.map.removeLayer(state.markers.mediumAirports);
            }
        }
    }

    // Small airports (+ heliports, etc): visible at zoom >= 10
    if (state.markers.smallAirports) {
        if (zoom >= 10) {
            if (!state.map.hasLayer(state.markers.smallAirports)) {
                state.map.addLayer(state.markers.smallAirports);
            }
        } else {
            if (state.map.hasLayer(state.markers.smallAirports)) {
                state.map.removeLayer(state.markers.smallAirports);
            }
        }
    }
}

function centerOnFrance() {
    state.map.setView([46.603354, 1.888334], 6); // France center
}

let isDarkMode = false;
function toggleLabels() {
    if (!state.tileLayers) return;

    isDarkMode = !isDarkMode;

    if (isDarkMode) {
        // Switch to dark mode
        state.map.removeLayer(state.tileLayers.satellite);
        if (!state.tileLayers.dark) {
            state.tileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; CARTO',
                subdomains: 'abcd',
                noWrap: true
            });
        }
        state.tileLayers.dark.addTo(state.map);
        state.map.removeLayer(state.tileLayers.labels);
        showToast('Mode sombre activé', 'success');
    } else {
        // Switch to satellite
        if (state.tileLayers.dark) {
            state.map.removeLayer(state.tileLayers.dark);
        }
        state.tileLayers.satellite.addTo(state.map);
        state.tileLayers.labels.addTo(state.map);
        showToast('Vue satellite activée', 'success');
    }
}

async function loadFactories() {
    // Wrapper for backward compatibility
    await loadAllData();
}

async function loadFactoriesFromDB() {
    // Fallback: try to get T0 factories
    console.log('[LOAD] Trying fallback T0 endpoint...');
    try {
        const response = await fetch(`${API_BASE}/factories/t0?country=${state.filters.country}`);
        if (response.ok) {
            state.factories = await response.json();
            console.log('[LOAD] Loaded from T0 endpoint:', state.factories.length);
        } else {
            // Use demo data
            console.log('[LOAD] Using demo data...');
            state.factories = getDemoFactories();
        }
    } catch (e) {
        console.log('[LOAD] Fallback failed, using demo data:', e.message);
        state.factories = getDemoFactories();
    }
}

function getDemoFactories() {
    // Demo data matching what we seeded - with actual product info
    return [
        { id: 1, name: 'Exploitation Céréalière Beauce', airport_ident: 'LFOC', tier: 0, type: 'food', product: 'wheat', product_name: 'Blé', lat: 48.0583, lon: 1.3764, status: 'producing' },
        { id: 2, name: 'Coopérative Agricole Île-de-France', airport_ident: 'LFPG', tier: 0, type: 'food', product: 'wheat', product_name: 'Blé', lat: 49.0097, lon: 2.5479, status: 'producing' },
        { id: 3, name: 'Ferme Céréalière du Nord', airport_ident: 'LFQQ', tier: 0, type: 'food', product: 'wheat', product_name: 'Blé', lat: 50.5619, lon: 3.0894, status: 'producing' },
        { id: 4, name: 'Élevage Breton', airport_ident: 'LFRN', tier: 0, type: 'food', product: 'meat', product_name: 'Viande', lat: 48.0694, lon: -1.7347, status: 'producing' },
        { id: 5, name: 'Laiterie Normande', airport_ident: 'LFRK', tier: 0, type: 'food', product: 'milk', product_name: 'Lait', lat: 49.1733, lon: -0.4550, status: 'producing' },
        { id: 6, name: 'Vergers de Provence', airport_ident: 'LFML', tier: 0, type: 'food', product: 'fruits', product_name: 'Fruits', lat: 43.4393, lon: 5.2214, status: 'producing' },
        { id: 7, name: 'Raffinerie de Fos', airport_ident: 'LFML', tier: 0, type: 'fuel', product: 'crude_oil', product_name: 'Pétrole Brut', lat: 43.4393, lon: 5.2314, status: 'producing' },
        { id: 8, name: 'Gisement de Lacq', airport_ident: 'LFBP', tier: 0, type: 'fuel', product: 'natural_gas', product_name: 'Gaz Naturel', lat: 43.3800, lon: -0.4186, status: 'producing' },
        { id: 9, name: 'Mine de Lorraine', airport_ident: 'LFSB', tier: 0, type: 'mineral', product: 'iron_ore', product_name: 'Minerai de Fer', lat: 47.5896, lon: 7.5299, status: 'producing' },
        { id: 10, name: 'Bassin Minier du Nord', airport_ident: 'LFQQ', tier: 0, type: 'mineral', product: 'coal', product_name: 'Charbon', lat: 50.5719, lon: 3.0994, status: 'producing' },
        { id: 11, name: 'Forêt des Landes', airport_ident: 'LFBD', tier: 0, type: 'construction', product: 'wood', product_name: 'Bois', lat: 44.8283, lon: -0.7156, status: 'producing' },
        { id: 12, name: 'Boucherie Lyonnaise', airport_ident: 'LFLL', tier: 0, type: 'food', product: 'meat', product_name: 'Viande', lat: 45.7256, lon: 5.0811, status: 'producing' },
        { id: 13, name: 'Criée de Bretagne', airport_ident: 'LFRB', tier: 0, type: 'food', product: 'fish', product_name: 'Poisson', lat: 48.4478, lon: -4.4186, status: 'producing' },
        { id: 14, name: 'Source Volvic', airport_ident: 'LFLC', tier: 0, type: 'food', product: 'water', product_name: 'Eau', lat: 45.7867, lon: 3.1633, status: 'producing' },
        { id: 15, name: 'Salines de Guérande', airport_ident: 'LFRS', tier: 0, type: 'food', product: 'salt', product_name: 'Sel', lat: 47.1532, lon: -1.6108, status: 'producing' },
        { id: 16, name: 'Potager de Provence', airport_ident: 'LFMN', tier: 0, type: 'food', product: 'vegetables', product_name: 'Légumes', lat: 43.6584, lon: 7.2159, status: 'producing' },
    ];
}

function updateMapMarkers() {
    // Factories are now shown as badges on airport markers
    // This function updates stats and refreshes airport markers

    const filtered = state.factories.filter(f => {
        if (state.filters.tier !== 'all' && f.tier !== parseInt(state.filters.tier)) return false;
        if (state.filters.resource !== 'all' && f.type !== state.filters.resource) return false;
        return true;
    });

    // Update stats
    document.getElementById('stat-factories').textContent = filtered.length;

    // Refresh airport markers to show updated factory counts
    updateAirportMarkers();
}

function createFactoryIcon(factory) {
    const tierColor = factory.tier === 0 ? '#00aaff' : '#ff6b00';
    // Use product icon if available, otherwise fall back to category
    const productEmoji = getProductEmoji(factory.product, factory.type);

    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div style="
                background: rgba(0, 0, 0, 0.85);
                border: 3px solid ${tierColor};
                border-radius: 50%;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                box-shadow: 0 0 15px ${tierColor}, 0 2px 8px rgba(0,0,0,0.8);
                cursor: pointer;
            ">${productEmoji}</div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}

// Product icons - specific items
const PRODUCT_ICONS = {
    // Raw materials - Food
    wheat: '🌾',
    milk: '🥛',
    meat: '🥩',
    fruits: '🍎',
    vegetables: '🥬',
    fish: '🐟',
    salt: '🧂',
    water: '💧',
    // Raw materials - Fuel
    crude_oil: '🛢️',
    natural_gas: '🔥',
    coal: '⚫',
    // Raw materials - Minerals
    iron_ore: '🪨',
    copper_ore: '🟤',
    bauxite: '🟫',
    // Raw materials - Construction
    wood: '🪵',
    sand: '🏖️',
    stone: '🪨',
    // Processed - Food
    flour: '🌾',
    bread: '🍞',
    cheese: '🧀',
    butter: '🧈',
    // Processed - Fuel
    jet_fuel: '⛽',
    diesel: '🛢️',
    // Processed - Metals
    steel: '🔩',
    aluminum: '🔧',
    copper: '🟠',
    // Processed - Construction
    lumber: '🪵',
    concrete: '🧱',
    glass: '🪟',
    // Electronics
    circuits: '💾',
    chips: '🔌',
    // Default
    default: '🏭'
};

// Category icons (fallback)
const CATEGORY_ICONS = {
    food: '🌾',
    fuel: '⛽',
    mineral: '⛏️',
    construction: '🪵',
    electronics: '💻',
    chemical: '🧪'
};

function getProductEmoji(product, category) {
    // Try product first, then category, then default
    return PRODUCT_ICONS[product] || CATEGORY_ICONS[category] || PRODUCT_ICONS.default;
}

function getTypeEmoji(type) {
    return CATEGORY_ICONS[type] || '🏭';
}

function createFactoryPopup(factory) {
    const tierBadge = factory.tier === 0
        ? '<span class="badge badge-t0">T0 NPC</span>'
        : `<span class="badge badge-t1">T${factory.tier}</span>`;

    const productEmoji = getProductEmoji(factory.product, factory.type);
    const productName = factory.product_name || factory.product || 'N/A';

    return `
        <div class="popup-header">
            <div class="popup-title">${factory.name}</div>
        </div>
        <div class="popup-body">
            <div class="popup-row">
                <span class="popup-label">Tier</span>
                ${tierBadge}
            </div>
            <div class="popup-row">
                <span class="popup-label">Aéroport</span>
                <span class="popup-value">${factory.airport_ident}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Produit</span>
                <span class="popup-value">${productEmoji} ${productName}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Status</span>
                <span class="popup-value" style="color: #00ff00">${factory.status || 'Active'}</span>
            </div>
        </div>
    `;
}

function showFactoryInfo(factory) {
    const panel = document.getElementById('sidebar-info');
    const title = document.getElementById('sidebar-info-title');
    const body = document.getElementById('sidebar-info-body');

    const productEmoji = getProductEmoji(factory.product, factory.type);
    const productName = factory.product_name || factory.product || 'N/A';
    const tierLabel = factory.tier === 0 ? 'T0 (NPC)' : `T${factory.tier}`;

    title.textContent = factory.name;
    body.innerHTML = `
        <div class="info-row">
            <span class="info-label">Tier</span>
            <span class="info-value">${tierLabel}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Aéroport</span>
            <span class="info-value">${factory.airport_ident}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Produit</span>
            <span class="info-value">${productEmoji} ${productName}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Catégorie</span>
            <span class="info-value">${getTypeEmoji(factory.type)} ${factory.type || 'Raw'}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Status</span>
            <span class="info-value" style="color: var(--success)">${factory.status || 'Producing'}</span>
        </div>
        ${factory.tier === 0 ? `
        <div class="info-row">
            <span class="info-label">Mode</span>
            <span class="info-value" style="color: #00aaff">Auto (NPC)</span>
        </div>
        ` : ''}
    `;

    panel.style.display = 'block';
}

function closeSidebarInfo() {
    document.getElementById('sidebar-info').style.display = 'none';
    hideEmptySlots();
}

// ============================================
// AIRPORT FUNCTIONS
// ============================================
let airportLoadTimeout = null;

async function loadAirports() {
    if (!state.map) return;

    console.log('[AIRPORTS] Loading airports for current viewport...');
    try {
        // Get current map bounds
        const bounds = state.map.getBounds();
        const params = new URLSearchParams();

        // Add bounding box
        params.append('min_lat', bounds.getSouth().toFixed(4));
        params.append('max_lat', bounds.getNorth().toFixed(4));
        params.append('min_lon', bounds.getWest().toFixed(4));
        params.append('max_lon', bounds.getEast().toFixed(4));

        // Add country filter if set
        if (state.filters.country !== 'all') {
            params.append('country', state.filters.country);
        }

        const url = `${API_BASE}/world/airports?${params.toString()}`;
        console.log('[AIRPORTS] Fetching:', url);

        const response = await fetch(url);
        if (response.ok) {
            state.airports = await response.json();
            console.log('[AIRPORTS] Loaded from API:', state.airports.length);
        } else {
            console.log('[AIRPORTS] API failed, using demo data');
            state.airports = getDemoAirports();
        }
    } catch (e) {
        console.log('[AIRPORTS] Error, using demo data:', e.message);
        state.airports = getDemoAirports();
    }

    updateAirportMarkers();
    document.getElementById('stat-airports').textContent = state.airports.length;
}

// Debounced reload on map move
function onMapMoveEnd() {
    if (airportLoadTimeout) {
        clearTimeout(airportLoadTimeout);
    }
    airportLoadTimeout = setTimeout(() => {
        loadAirports();
    }, 300); // Wait 300ms after movement stops
}

function getDemoAirports() {
    // Demo airports in France - mix of types
    return [
        // Large airports
        { ident: 'LFPG', name: 'Paris Charles de Gaulle', type: 'large_airport', lat: 49.0097, lon: 2.5479, iata: 'CDG' },
        { ident: 'LFPO', name: 'Paris Orly', type: 'large_airport', lat: 48.7233, lon: 2.3794, iata: 'ORY' },
        { ident: 'LFML', name: 'Marseille Provence', type: 'large_airport', lat: 43.4393, lon: 5.2214, iata: 'MRS' },
        { ident: 'LFLL', name: 'Lyon Saint-Exupéry', type: 'large_airport', lat: 45.7256, lon: 5.0811, iata: 'LYS' },
        { ident: 'LFMN', name: 'Nice Côte d\'Azur', type: 'large_airport', lat: 43.6584, lon: 7.2159, iata: 'NCE' },
        { ident: 'LFBD', name: 'Bordeaux-Mérignac', type: 'large_airport', lat: 44.8283, lon: -0.7156, iata: 'BOD' },
        { ident: 'LFBO', name: 'Toulouse-Blagnac', type: 'large_airport', lat: 43.6291, lon: 1.3638, iata: 'TLS' },
        { ident: 'LFRS', name: 'Nantes Atlantique', type: 'large_airport', lat: 47.1532, lon: -1.6108, iata: 'NTE' },
        // Medium airports
        { ident: 'LFRN', name: 'Rennes-Saint-Jacques', type: 'medium_airport', lat: 48.0694, lon: -1.7347, iata: 'RNS' },
        { ident: 'LFRK', name: 'Caen-Carpiquet', type: 'medium_airport', lat: 49.1733, lon: -0.4550, iata: 'CFR' },
        { ident: 'LFRB', name: 'Brest Bretagne', type: 'medium_airport', lat: 48.4478, lon: -4.4186, iata: 'BES' },
        { ident: 'LFQQ', name: 'Lille-Lesquin', type: 'medium_airport', lat: 50.5619, lon: 3.0894, iata: 'LIL' },
        { ident: 'LFLC', name: 'Clermont-Ferrand Auvergne', type: 'medium_airport', lat: 45.7867, lon: 3.1633, iata: 'CFE' },
        { ident: 'LFSB', name: 'EuroAirport Basel-Mulhouse', type: 'large_airport', lat: 47.5896, lon: 7.5299, iata: 'BSL' },
        { ident: 'LFBP', name: 'Pau Pyrénées', type: 'medium_airport', lat: 43.3800, lon: -0.4186, iata: 'PUF' },
        { ident: 'LFOC', name: 'Châteaudun', type: 'medium_airport', lat: 48.0583, lon: 1.3764, iata: null },
        // Small airports
        { ident: 'LFOB', name: 'Beauvais-Tillé', type: 'small_airport', lat: 49.4544, lon: 2.1128, iata: 'BVA' },
        { ident: 'LFAT', name: 'Le Touquet', type: 'small_airport', lat: 50.5174, lon: 1.6206, iata: 'LTQ' },
        { ident: 'LFBT', name: 'Tarbes-Lourdes', type: 'small_airport', lat: 43.1787, lon: -0.0065, iata: 'LDE' },
        { ident: 'LFBZ', name: 'Biarritz Pays Basque', type: 'medium_airport', lat: 43.4683, lon: -1.5311, iata: 'BIQ' },
        { ident: 'LFTH', name: 'Toulon-Hyères', type: 'medium_airport', lat: 43.0973, lon: 6.1460, iata: 'TLN' },
        { ident: 'LFKJ', name: 'Ajaccio Napoleon Bonaparte', type: 'medium_airport', lat: 41.9236, lon: 8.8029, iata: 'AJA' },
        { ident: 'LFKB', name: 'Bastia Poretta', type: 'medium_airport', lat: 42.5527, lon: 9.4837, iata: 'BIA' },
        { ident: 'LFST', name: 'Strasbourg', type: 'medium_airport', lat: 48.5383, lon: 7.6282, iata: 'SXB' },
        { ident: 'LFMT', name: 'Montpellier', type: 'medium_airport', lat: 43.5762, lon: 3.9630, iata: 'MPL' },
    ];
}

function updateAirportMarkers() {
    // Clear all layers
    if (state.markers.factoryMarkers) state.markers.factoryMarkers.clearLayers();
    if (state.markers.factoryLines) state.markers.factoryLines.clearLayers();
    if (state.markers.largeAirports) state.markers.largeAirports.clearLayers();
    if (state.markers.mediumAirports) state.markers.mediumAirports.clearLayers();
    if (state.markers.smallAirports) state.markers.smallAirports.clearLayers();
    hideEmptySlots(); // Clear any visible empty slots

    if (!state.showAirports) return;

    // Filter factories based on current filters
    const filteredFactories = state.factories.filter(f => {
        if (state.filters.tier !== 'all' && f.tier !== parseInt(state.filters.tier)) return false;
        if (state.filters.resource !== 'all' && f.type !== state.filters.resource) return false;
        return true;
    });

    // Build factory map by airport ICAO
    const factoriesByAirport = {};
    filteredFactories.forEach(factory => {
        const ident = factory.airport_ident;
        if (!factoriesByAirport[ident]) {
            factoriesByAirport[ident] = [];
        }
        factoriesByAirport[ident].push(factory);
    });

    console.log('[AIRPORTS] Processing', state.airports.length, 'airports');
    console.log('[AIRPORTS] Factories:', filteredFactories.length, 'at', Object.keys(factoriesByAirport).length, 'airports');

    let stats = { airports: 0, factories: 0 };

    state.airports.forEach(airport => {
        const lat = airport.lat || airport.latitude_deg;
        const lon = airport.lon || airport.longitude_deg;
        if (!lat || !lon) return;

        const airportFactories = factoriesByAirport[airport.ident] || [];
        const hasFactories = airportFactories.length > 0;

        // Skip airports without factories if filter is enabled
        if (state.filters.withFactoriesOnly && !hasFactories) return;

        stats.airports++;

        // Create airport marker (always use standard airport icon)
        // No popup - info displayed in side panel only
        const airportMarker = L.marker([lat, lon], {
            icon: createAirportIcon(airport)
        })
            .on('click', () => {
                showAirportInfo(airport, airportFactories);
                showEmptySlotsForAirport(airport, airportFactories);
            });

        // Route airport to appropriate layer based on type
        if (airport.type === 'large_airport') {
            state.markers.largeAirports.addLayer(airportMarker);
        } else if (airport.type === 'medium_airport') {
            state.markers.mediumAirports.addLayer(airportMarker);
        } else {
            state.markers.smallAirports.addLayer(airportMarker);
        }

        // ==========================================
        // Render factories attached to this airport
        // ==========================================
        if (hasFactories) {
            renderFactoriesAroundAirport(lat, lon, airportFactories, airport);
            stats.factories += airportFactories.length;
        }
    });

    console.log('[AIRPORTS] Displayed:', stats);
}

// Render factory markers in a circular pattern around an airport
// Only renders OCCUPIED slots (factories) - empty slots shown on click
function renderFactoriesAroundAirport(airportLat, airportLon, factories, airport) {
    if (factories.length === 0) return;

    // Get max slots for calculating positions
    let maxSlots = airport.max_factories_slots;
    if (!maxSlots) {
        if (airport.type === 'large_airport') maxSlots = 12;
        else if (airport.type === 'medium_airport') maxSlots = 6;
        else maxSlots = 3;
    }

    const totalSlots = Math.max(factories.length, maxSlots);

    // Distance from airport (in degrees, roughly 0.01 = 1km)
    // Increased distance for better visibility
    const baseDistance = 0.035;
    const distance = baseDistance + (totalSlots > 6 ? 0.01 : 0);

    // Determine which layer to add to (same as airport)
    let targetLayer;
    if (airport.type === 'large_airport') {
        targetLayer = state.markers.largeAirports;
    } else if (airport.type === 'medium_airport') {
        targetLayer = state.markers.mediumAirports;
    } else {
        targetLayer = state.markers.smallAirports;
    }

    // Only render occupied slots (factories)
    factories.forEach((factory, arrayIndex) => {
        // Use factory's slot_index if available, otherwise use array index
        const slotIndex = factory.slot_index !== undefined ? factory.slot_index : arrayIndex;
        const angle = (slotIndex / totalSlots) * 2 * Math.PI - Math.PI / 2;
        const slotLat = airportLat + Math.sin(angle) * distance;
        const slotLon = airportLon + Math.cos(angle) * distance * 1.5;

        // Draw connection line
        const line = L.polyline(
            [[airportLat, airportLon], [slotLat, slotLon]],
            {
                color: getTypeColor(factory.type),
                weight: 2,
                opacity: 0.7,
                dashArray: '4, 4'
            }
        );
        targetLayer.addLayer(line);

        // Create factory marker with product emoji
        const emoji = getProductEmoji(factory.product, factory.type);
        const color = getTypeColor(factory.type);

        const factoryIcon = L.divIcon({
            className: 'factory-node',
            html: `
                <div class="factory-node-marker" style="--factory-color: ${color};">
                    <span>${emoji}</span>
                </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const marker = L.marker([slotLat, slotLon], { icon: factoryIcon })
            .bindPopup(createFactoryPopup(factory, airport));

        targetLayer.addLayer(marker);
    });
}

// Layer for empty slots (shown on airport click)
let emptySlotLayer = null;
let selectedAirportIdent = null;

// Show empty slots around an airport when clicked
function showEmptySlotsForAirport(airport, existingFactories) {
    // Clear previous empty slots
    hideEmptySlots();

    // Create layer if needed
    if (!emptySlotLayer) {
        emptySlotLayer = L.layerGroup();
        emptySlotLayer.addTo(state.map);
    }

    selectedAirportIdent = airport.ident;

    const lat = airport.lat || airport.latitude_deg;
    const lon = airport.lon || airport.longitude_deg;

    // Get max slots
    let maxSlots = airport.max_factories_slots;
    if (!maxSlots) {
        if (airport.type === 'large_airport') maxSlots = 12;
        else if (airport.type === 'medium_airport') maxSlots = 6;
        else maxSlots = 3;
    }

    const totalSlots = Math.max(existingFactories.length, maxSlots);
    // Same distance as renderFactoriesAroundAirport for alignment
    const baseDistance = 0.035;
    const distance = baseDistance + (totalSlots > 6 ? 0.01 : 0);

    // Build set of occupied slot indices
    const occupiedSlots = new Set();
    existingFactories.forEach((factory, arrayIndex) => {
        const slotIdx = factory.slot_index !== undefined ? factory.slot_index : arrayIndex;
        occupiedSlots.add(slotIdx);
    });

    // Render empty slots only
    for (let slotIndex = 0; slotIndex < totalSlots; slotIndex++) {
        // Skip if slot is occupied
        if (occupiedSlots.has(slotIndex)) continue;

        const angle = (slotIndex / totalSlots) * 2 * Math.PI - Math.PI / 2;
        const slotLat = lat + Math.sin(angle) * distance;
        const slotLon = lon + Math.cos(angle) * distance * 1.5;

        // Draw connection line for empty slot
        const line = L.polyline(
            [[lat, lon], [slotLat, slotLon]],
            {
                color: '#00aaff',
                weight: 1.5,
                opacity: 0.5,
                dashArray: '3, 6'
            }
        );
        emptySlotLayer.addLayer(line);

        // Create empty slot marker with "+"
        const emptySlotIcon = L.divIcon({
            className: 'factory-slot-empty',
            html: `
                <div class="factory-slot-marker">
                    <span>+</span>
                </div>
            `,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });

        const marker = L.marker([slotLat, slotLon], { icon: emptySlotIcon })
            .bindPopup(createEmptySlotPopup(airport, slotIndex));

        emptySlotLayer.addLayer(marker);
    }

    console.log(`[SLOTS] Showing ${maxSlots - existingFactories.length} empty slots for ${airport.ident}`);
}

// Hide empty slots
function hideEmptySlots() {
    if (emptySlotLayer) {
        emptySlotLayer.clearLayers();
    }
    selectedAirportIdent = null;
}

// Create popup for empty factory slot
function createEmptySlotPopup(airport, slotIndex) {
    return `
        <div class="popup-slot-empty">
            <div class="popup-slot-header">
                <span class="popup-slot-icon">📍</span>
                <span class="popup-slot-title">Emplacement disponible</span>
            </div>
            <div class="popup-slot-info">
                <span>${airport.ident}</span>
                <span class="popup-slot-separator">•</span>
                <span>Slot #${slotIndex + 1}</span>
            </div>
            <button class="popup-slot-btn" onclick="openCreateFactoryModal('${airport.ident}', ${slotIndex})">
                🏭 Création d'usine
            </button>
        </div>
    `;
}

// ============================================
// FACTORY CREATION MODAL
// ============================================

let pendingFactoryData = null;
let recipesCache = null;

// Open factory creation modal
async function openCreateFactoryModal(airportIdent, slotIndex) {
    console.log(`[FACTORY] Opening create modal for ${airportIdent}, slot ${slotIndex}`);

    // Close any open popup
    if (state.map) {
        state.map.closePopup();
    }

    // Store pending data
    pendingFactoryData = { airportIdent, slotIndex };

    // Update modal info
    document.getElementById('factory-airport-ident').textContent = airportIdent;
    document.getElementById('factory-slot-index').textContent = slotIndex + 1;
    document.getElementById('factory-name').value = '';
    document.getElementById('factory-create-error').classList.remove('visible');
    document.getElementById('recipe-details').style.display = 'none';

    // Load recipes if not cached
    if (!recipesCache) {
        await loadRecipesForModal();
    } else {
        populateRecipeSelect(recipesCache);
    }

    // Show modal
    document.getElementById('modal-create-factory').classList.add('active');

    // Focus on name input
    setTimeout(() => {
        document.getElementById('factory-name').focus();
    }, 100);
}

// Close factory creation modal
function closeCreateFactoryModal() {
    document.getElementById('modal-create-factory').classList.remove('active');
    pendingFactoryData = null;
}

// Load recipes from API
async function loadRecipesForModal() {
    const select = document.getElementById('factory-recipe');
    select.innerHTML = '<option value="">Chargement...</option>';

    try {
        const response = await fetch(`${API_BASE}/world/recipes?limit=100`);
        if (response.ok) {
            recipesCache = await response.json();
            console.log('[RECIPES] Loaded:', recipesCache.length);
            populateRecipeSelect(recipesCache);
        } else {
            throw new Error('API error');
        }
    } catch (error) {
        console.error('[RECIPES] Error loading recipes:', error);
        select.innerHTML = '<option value="">-- Aucune recette disponible --</option>';
    }
}

// Populate recipe select dropdown
function populateRecipeSelect(recipes) {
    const select = document.getElementById('factory-recipe');
    select.innerHTML = '<option value="">-- Sélectionner une recette --</option>';

    // Group recipes by tier
    const byTier = {};
    recipes.forEach(recipe => {
        const tier = recipe.tier || 1;
        if (!byTier[tier]) byTier[tier] = [];
        byTier[tier].push(recipe);
    });

    // Add options grouped by tier
    Object.keys(byTier).sort((a, b) => a - b).forEach(tier => {
        const group = document.createElement('optgroup');
        group.label = `Tier ${tier}`;

        byTier[tier].forEach(recipe => {
            const option = document.createElement('option');
            option.value = recipe.id;
            option.textContent = recipe.name;
            option.dataset.tier = recipe.tier;
            option.dataset.time = recipe.production_time_hours;
            option.dataset.qty = recipe.result_quantity;
            group.appendChild(option);
        });

        select.appendChild(group);
    });

    // Add change listener
    select.onchange = onRecipeSelectChange;
}

// Handle recipe selection change
function onRecipeSelectChange() {
    const select = document.getElementById('factory-recipe');
    const detailsBox = document.getElementById('recipe-details');

    if (!select.value) {
        detailsBox.style.display = 'none';
        return;
    }

    const option = select.options[select.selectedIndex];
    const tier = option.dataset.tier;
    const time = parseFloat(option.dataset.time);
    const qty = option.dataset.qty;

    document.getElementById('recipe-detail-name').textContent = option.textContent;
    document.getElementById('recipe-detail-tier').textContent = `T${tier}`;
    document.getElementById('recipe-detail-time').textContent = formatDuration(time);
    document.getElementById('recipe-detail-qty').textContent = qty;

    detailsBox.style.display = 'block';
}

// Format duration in hours to readable string
function formatDuration(hours) {
    if (hours < 1) {
        return `${Math.round(hours * 60)} min`;
    } else if (hours === 1) {
        return '1 heure';
    } else if (hours < 24) {
        return `${hours} heures`;
    } else {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        if (remainingHours === 0) {
            return `${days} jour${days > 1 ? 's' : ''}`;
        }
        return `${days}j ${remainingHours}h`;
    }
}

// Submit factory creation
async function submitCreateFactory() {
    const name = document.getElementById('factory-name').value.trim();
    const recipeId = document.getElementById('factory-recipe').value;
    const errorEl = document.getElementById('factory-create-error');
    const btn = document.getElementById('btn-create-factory');

    // Validate
    if (!name) {
        errorEl.textContent = 'Veuillez entrer un nom pour l\'usine';
        errorEl.classList.add('visible');
        return;
    }

    if (!pendingFactoryData) {
        errorEl.textContent = 'Erreur: données manquantes';
        errorEl.classList.add('visible');
        return;
    }

    // Check if in demo mode
    if (!state.token || state.token === 'demo-token') {
        errorEl.textContent = 'Mode démo: Connectez-vous avec un vrai compte pour créer des usines';
        errorEl.classList.add('visible');
        return;
    }

    // Set loading state
    btn.classList.add('loading');
    btn.textContent = 'CRÉATION...';
    errorEl.classList.remove('visible');

    try {
        // Create factory
        const createResponse = await fetch(`${API_BASE}/factories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                airport_ident: pendingFactoryData.airportIdent,
                name: name
            })
        });

        if (!createResponse.ok) {
            const errorData = await createResponse.json();
            // Handle specific errors
            if (createResponse.status === 401) {
                throw new Error('Session expirée. Veuillez vous reconnecter.');
            } else if (createResponse.status === 404 && errorData.detail === 'No company') {
                throw new Error('Vous devez d\'abord créer une company (Menu: Ma Company)');
            } else if (createResponse.status === 400 && errorData.detail?.includes('no available factory slots')) {
                throw new Error('Cet aéroport n\'a plus d\'emplacements disponibles');
            } else if (createResponse.status === 400 && errorData.detail?.includes('does not support factories')) {
                throw new Error('Cet aéroport ne supporte pas les usines');
            }
            throw new Error(errorData.detail || 'Erreur lors de la création');
        }

        const factory = await createResponse.json();
        console.log('[FACTORY] Created:', factory);

        // If recipe selected, set it
        if (recipeId) {
            try {
                await fetch(`${API_BASE}/factories/${factory.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${state.token}`
                    },
                    body: JSON.stringify({
                        current_recipe_id: recipeId
                    })
                });
                console.log('[FACTORY] Recipe set:', recipeId);
            } catch (e) {
                console.warn('[FACTORY] Could not set recipe:', e);
            }
        }

        // Success
        showToast(`Usine "${name}" créée avec succès!`, 'success');
        closeCreateFactoryModal();

        // Refresh map data
        await loadAllData();

    } catch (error) {
        console.error('[FACTORY] Create error:', error);
        errorEl.textContent = error.message || 'Erreur lors de la création de l\'usine';
        errorEl.classList.add('visible');
    } finally {
        btn.classList.remove('loading');
        btn.textContent = 'CRÉER L\'USINE';
    }
}

// Create popup for individual factory
function createFactoryPopup(factory, airport) {
    const emoji = getProductEmoji(factory.product, factory.type);
    const tierLabel = factory.tier === 0 ? 'NPC' : `T${factory.tier}`;

    return `
        <div class="popup-factory">
            <div class="popup-header">${emoji} ${factory.name || 'Usine'}</div>
            <div class="popup-row">
                <span>Tier</span>
                <span class="popup-value">${tierLabel}</span>
            </div>
            <div class="popup-row">
                <span>Type</span>
                <span class="popup-value">${factory.type}</span>
            </div>
            <div class="popup-row">
                <span>Produit</span>
                <span class="popup-value">${factory.product || 'N/A'}</span>
            </div>
            <div class="popup-row">
                <span>Aéroport</span>
                <span class="popup-value">${airport.ident}</span>
            </div>
        </div>
    `;
}

// PIN style icon for airports with factories (never clustered)
// Regular airport icon (no factories, will be clustered) - 50% transparent
function createAirportIcon(airport) {
    const type = airport.type || 'small_airport';
    let color, size, emoji;

    switch (type) {
        case 'large_airport':
            color = '#ff6b00';
            size = 28;
            emoji = '✈️';
            break;
        case 'medium_airport':
            color = '#ffaa00';
            size = 24;
            emoji = '🛩️';
            break;
        case 'small_airport':
            color = '#88ff88';
            size = 20;
            emoji = '🛫';
            break;
        case 'heliport':
            color = '#ff4444';
            size = 18;
            emoji = '🚁';
            break;
        case 'seaplane_base':
            color = '#44aaff';
            size = 18;
            emoji = '🌊';
            break;
        default:
            color = '#888888';
            size = 16;
            emoji = '📍';
    }

    return L.divIcon({
        className: 'airport-marker',
        html: `
            <div style="
                position: relative;
                background: rgba(0, 0, 0, 0.85);
                border: 2px solid ${color};
                border-radius: 50%;
                width: ${size}px;
                height: ${size}px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${size * 0.6}px;
                box-shadow: 0 0 10px ${color}80;
            ">
                ${emoji}
            </div>
        `,
        iconSize: [size + 10, size + 10],
        iconAnchor: [(size + 10)/2, (size + 10)/2]
    });
}

// Get color based on factory type
function getTypeColor(type) {
    const colors = {
        food: '#22cc22',      // Green for food
        fuel: '#ff6600',      // Orange for fuel
        mineral: '#8888ff',   // Blue/purple for minerals
        construction: '#cc8844', // Brown for construction
        electronics: '#00cccc',  // Cyan for electronics
        chemical: '#cc44cc'   // Magenta for chemical
    };
    return colors[type] || '#ff6600';
}

function createAirportPopup(airport, factories = []) {
    const typeLabels = {
        'large_airport': '🟠 Grand Aéroport',
        'medium_airport': '🟡 Aéroport Moyen',
        'small_airport': '🟢 Petit Aéroport',
        'heliport': '🔴 Héliport',
        'seaplane_base': '🔵 Base Hydravion',
        'closed': '⚫ Fermé'
    };

    const iata = airport.iata || airport.iata_code;

    // Factory list
    let factoriesHtml = '';
    if (factories.length > 0) {
        const factoryItems = factories.map(f => {
            const emoji = getProductEmoji(f.product, f.type);
            return `<div style="display:flex;align-items:center;gap:4px;font-size:12px;padding:2px 0;">
                ${emoji} ${f.product_name || f.product || 'Production'}
            </div>`;
        }).join('');

        factoriesHtml = `
            <div class="popup-row" style="flex-direction:column;align-items:flex-start;">
                <span class="popup-label" style="margin-bottom:4px;">🏭 Usines (${factories.length})</span>
                <div style="padding-left:8px;">${factoryItems}</div>
            </div>
        `;
    }

    return `
        <div class="popup-header">
            <div class="popup-title">${airport.name}</div>
        </div>
        <div class="popup-body">
            <div class="popup-row">
                <span class="popup-label">ICAO</span>
                <span class="popup-value">${airport.ident}</span>
            </div>
            ${iata ? `
            <div class="popup-row">
                <span class="popup-label">IATA</span>
                <span class="popup-value">${iata}</span>
            </div>
            ` : ''}
            <div class="popup-row">
                <span class="popup-label">Type</span>
                <span class="popup-value">${typeLabels[airport.type] || airport.type}</span>
            </div>
            ${factoriesHtml}
        </div>
    `;
}

function showAirportInfo(airport, factories = []) {
    const panel = document.getElementById('sidebar-info');
    const title = document.getElementById('sidebar-info-title');
    const body = document.getElementById('sidebar-info-body');

    const typeLabels = {
        'large_airport': '🟠 Grand Aéroport',
        'medium_airport': '🟡 Aéroport Moyen',
        'small_airport': '🟢 Petit Aéroport',
        'heliport': '🔴 Héliport',
        'seaplane_base': '🔵 Base Hydravion',
        'closed': '⚫ Fermé'
    };

    const iata = airport.iata || airport.iata_code;

    // Factory list for panel
    let factoriesHtml = '';
    if (factories.length > 0) {
        const factoryItems = factories.map(f => {
            const emoji = getProductEmoji(f.product, f.type);
            const tierColor = f.tier === 0 ? '#00aaff' : '#ff6b00';
            return `
                <div style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                    padding:8px;
                    background:rgba(0,0,0,0.3);
                    border-radius:4px;
                    margin-bottom:4px;
                    border-left:3px solid ${tierColor};
                ">
                    <span style="font-size:20px;">${emoji}</span>
                    <div>
                        <div style="font-weight:600;">${f.name}</div>
                        <div style="font-size:11px;color:#888;">
                            T${f.tier} • ${f.product_name || f.product}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        factoriesHtml = `
            <div style="margin-top:12px;border-top:1px solid #333;padding-top:12px;">
                <div style="font-weight:600;margin-bottom:8px;color:var(--accent);">
                    🏭 Usines (${factories.length})
                </div>
                ${factoryItems}
            </div>
        `;
    }

    title.textContent = airport.name;
    body.innerHTML = `
        <div class="info-row">
            <span class="info-label">ICAO</span>
            <span class="info-value">${airport.ident}</span>
        </div>
        ${iata ? `
        <div class="info-row">
            <span class="info-label">IATA</span>
            <span class="info-value">${iata}</span>
        </div>
        ` : ''}
        <div class="info-row">
            <span class="info-label">Type</span>
            <span class="info-value">${typeLabels[airport.type] || airport.type}</span>
        </div>
        ${factoriesHtml}
    `;

    panel.style.display = 'block';
}

function toggleAirports() {
    state.showAirports = !state.showAirports;
    updateAirportMarkers();
    showToast(state.showAirports ? 'Aéroports affichés' : 'Aéroports masqués', 'success');
}

function refreshFactories() {
    showToast('Rafraîchissement...', 'success');
    loadAllData();
}

function updateStats() {
    const t0Count = state.factories.filter(f => f.tier === 0).length;
    document.getElementById('stat-factories').textContent = state.factories.length;
    document.getElementById('factories-online').textContent = `${t0Count} T0 ONLINE`;
}

// ============================================
// API STATUS
// ============================================
async function checkApiStatus() {
    const statusLight = document.getElementById('api-status');
    const statusText = document.getElementById('api-status-text');

    try {
        const response = await fetch(`${API_BASE}/health`);
        if (response.ok) {
            statusLight.className = 'status-light';
            statusText.textContent = 'API:OK';
        } else {
            throw new Error('API Error');
        }
    } catch {
        statusLight.className = 'status-light warning';
        statusText.textContent = 'API:DEMO';
    }
}

// ============================================
// UI FUNCTIONS
// ============================================
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`tab-${tabName}`)?.classList.add('active');
}

function switchView(viewName) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${viewName}"]`)?.classList.add('active');

    document.getElementById('current-view').textContent = viewName.toUpperCase();

    // Hide all views
    document.getElementById('view-map').style.display = 'none';
    document.getElementById('view-company').style.display = 'none';
    document.getElementById('view-profile').style.display = 'none';
    document.getElementById('view-inventory').style.display = 'none';
    document.getElementById('view-market').style.display = 'none';

    // Show selected view
    if (viewName === 'map') {
        document.getElementById('view-map').style.display = 'block';
        if (state.map) state.map.invalidateSize();
    } else if (viewName === 'company') {
        document.getElementById('view-company').style.display = 'block';
        loadCompanyView();
    } else if (viewName === 'profile') {
        document.getElementById('view-profile').style.display = 'block';
        loadProfileView();
    } else if (viewName === 'inventory') {
        document.getElementById('view-inventory').style.display = 'block';
        loadInventoryView();
    } else if (viewName === 'market') {
        document.getElementById('view-market').style.display = 'block';
        loadMarketView();
    } else {
        // Other views not implemented yet, show map
        document.getElementById('view-map').style.display = 'block';
        showToast(`Vue "${viewName}" - à implémenter`, 'warning');
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main');

    sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded');

    // Invalidate map size after animation
    setTimeout(() => {
        if (state.map) state.map.invalidateSize();
    }, 300);
}

function showError(element, message) {
    element.textContent = message;
    element.classList.add('visible');
    setTimeout(() => element.classList.remove('visible'), 5000);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';
    toast.innerHTML = `<span>${icon}</span> ${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    // ESC to close panels and modals
    if (e.key === 'Escape') {
        // Close modal first if open
        const modal = document.getElementById('modal-create-factory');
        if (modal && modal.classList.contains('active')) {
            closeCreateFactoryModal();
            return;
        }
        closeSidebarInfo();
    }

    // F to center on France
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        const activeElement = document.activeElement;
        if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA' && activeElement.tagName !== 'SELECT') {
            centerOnFrance();
        }
    }

    // Enter to submit factory creation if modal is open and name field is focused
    if (e.key === 'Enter') {
        const modal = document.getElementById('modal-create-factory');
        const nameInput = document.getElementById('factory-name');
        if (modal && modal.classList.contains('active') && document.activeElement === nameInput) {
            submitCreateFactory();
        }
    }
});

// Close modal when clicking on overlay background
document.addEventListener('click', (e) => {
    const modal = document.getElementById('modal-create-factory');
    if (modal && e.target === modal) {
        closeCreateFactoryModal();
    }
});

// ============================================
// COMPANY FUNCTIONS
// ============================================

let companyData = null;

async function loadCompanyView() {
    console.log('[COMPANY] Loading company view...');

    // Check if logged in properly
    if (!state.token || state.token === 'demo-token') {
        showNoCompanyState();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/company/me`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (response.status === 404) {
            // No company
            showNoCompanyState();
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to load company');
        }

        companyData = await response.json();
        console.log('[COMPANY] Loaded:', companyData);
        showCompanyDashboard(companyData);

    } catch (error) {
        console.error('[COMPANY] Error:', error);
        showNoCompanyState();
    }
}

function showNoCompanyState() {
    document.getElementById('company-no-company').style.display = 'block';
    document.getElementById('company-create-form').style.display = 'none';
    document.getElementById('company-dashboard').style.display = 'none';
}

function showCreateCompanyForm() {
    // Check if logged in
    if (!state.token || state.token === 'demo-token') {
        showToast('Connectez-vous avec un vrai compte pour créer une company', 'warning');
        return;
    }

    document.getElementById('company-no-company').style.display = 'none';
    document.getElementById('company-create-form').style.display = 'block';
    document.getElementById('company-dashboard').style.display = 'none';

    // Clear form
    document.getElementById('company-name').value = '';
    document.getElementById('company-home-airport').value = '';
    document.getElementById('company-create-error').classList.remove('visible');

    // Focus name field
    setTimeout(() => {
        document.getElementById('company-name').focus();
    }, 100);
}

function hideCreateCompanyForm() {
    showNoCompanyState();
}

async function submitCreateCompany() {
    const name = document.getElementById('company-name').value.trim();
    const homeAirport = document.getElementById('company-home-airport').value.trim().toUpperCase();
    const errorEl = document.getElementById('company-create-error');
    const btn = document.getElementById('btn-create-company');

    // Validate
    if (!name || name.length < 3) {
        errorEl.textContent = 'Le nom doit faire au moins 3 caractères';
        errorEl.classList.add('visible');
        return;
    }

    if (!homeAirport || homeAirport.length < 3 || homeAirport.length > 4) {
        errorEl.textContent = 'Entrez un code ICAO valide (3-4 caractères)';
        errorEl.classList.add('visible');
        return;
    }

    // Set loading state
    btn.classList.add('loading');
    btn.textContent = 'CRÉATION...';
    errorEl.classList.remove('visible');

    try {
        const response = await fetch(`${API_BASE}/company`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                name: name,
                home_airport_ident: homeAirport
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 400 && errorData.detail === 'Invalid home_airport_ident') {
                throw new Error(`Aéroport "${homeAirport}" non trouvé. Vérifiez le code ICAO.`);
            }
            throw new Error(errorData.detail || 'Erreur lors de la création');
        }

        companyData = await response.json();
        console.log('[COMPANY] Created:', companyData);

        showToast(`Company "${name}" créée avec succès!`, 'success');
        showCompanyDashboard(companyData);

    } catch (error) {
        console.error('[COMPANY] Create error:', error);
        errorEl.textContent = error.message || 'Erreur lors de la création';
        errorEl.classList.add('visible');
    } finally {
        btn.classList.remove('loading');
        btn.textContent = 'CRÉER';
    }
}

function showCompanyDashboard(company) {
    document.getElementById('company-no-company').style.display = 'none';
    document.getElementById('company-create-form').style.display = 'none';
    document.getElementById('company-dashboard').style.display = 'block';

    // Update display
    document.getElementById('company-display-name').textContent = company.name;
    document.getElementById('company-home-ident').textContent = company.home_airport_ident;

    // Format date
    const createdDate = new Date(company.created_at);
    document.getElementById('company-created-date').textContent = createdDate.toLocaleDateString('fr-FR');

    // Balance (if available)
    const balance = company.balance || 0;
    document.getElementById('company-balance').textContent = `${balance.toLocaleString('fr-FR')} $`;

    // Load data for all tabs
    loadCompanyStats();
    loadCompanyFactories();
    loadCompanyFleet();
    loadCompanyEmployees();
}

// Switch company tab
function switchCompanyTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.company-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.company-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `company-tab-${tabName}`);
    });
}

// Load company stats for overview
async function loadCompanyStats() {
    try {
        const response = await fetch(`${API_BASE}/factories/stats/overview`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (response.ok) {
            const stats = await response.json();
            document.getElementById('company-factory-count').textContent = stats.total_factories || 0;
            document.getElementById('company-worker-count').textContent = stats.total_workers || 0;
            document.getElementById('tab-factories-count').textContent = stats.total_factories || 0;
        }
    } catch (error) {
        console.log('[COMPANY] Could not load stats:', error.message);
    }

    // Aircraft count - TODO: implement fleet API
    document.getElementById('company-aircraft-count').textContent = '0';
    document.getElementById('tab-fleet-count').textContent = '0';
}

// Load company factories
async function loadCompanyFactories() {
    const container = document.getElementById('company-factories-list');

    try {
        const response = await fetch(`${API_BASE}/factories`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load factories');
        }

        const factories = await response.json();

        if (factories.length === 0) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <span>🏭</span>
                    <p>Aucune usine. Allez sur la carte pour en créer une.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = factories.map(factory => `
            <div class="factory-card" onclick="showFactoryDetails('${factory.id}')">
                <div class="factory-card-icon">${getFactoryEmoji(factory.factory_type)}</div>
                <div class="factory-card-info">
                    <div class="factory-card-name">${factory.name}</div>
                    <div class="factory-card-meta">
                        <span>📍 ${factory.airport_ident}</span>
                        <span>🏭 ${factory.factory_type || 'Production'}</span>
                    </div>
                </div>
                <div class="factory-card-status ${factory.status}">${factory.status}</div>
            </div>
        `).join('');

        // Update counts
        document.getElementById('company-factory-count').textContent = factories.length;
        document.getElementById('tab-factories-count').textContent = factories.length;

    } catch (error) {
        console.error('[COMPANY] Error loading factories:', error);
        container.innerHTML = `
            <div class="empty-state-small">
                <span>⚠️</span>
                <p>Erreur de chargement des usines</p>
            </div>
        `;
    }
}

// Get emoji for factory type
function getFactoryEmoji(type) {
    const emojis = {
        'food_processing': '🌾',
        'extraction': '⛏️',
        'metal_smelting': '🔥',
        'construction': '🪵',
        'fuel': '⛽',
        'electronics': '💻',
        'chemical': '🧪'
    };
    return emojis[type] || '🏭';
}

// ========================================
// FLEET SYSTEM
// ========================================

let fleetState = {
    aircraft: [],
    catalog: [],
    selectedCatalogId: null,
    selectedAircraftId: null
};

// Load company fleet
async function loadCompanyFleet() {
    const container = document.getElementById('company-fleet-list');

    try {
        const response = await fetch(`${API_BASE}/fleet`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (response.status === 404) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <span>✈️</span>
                    <p>Aucun avion dans la flotte.</p>
                </div>
            `;
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to load fleet');
        }

        const aircraft = await response.json();
        fleetState.aircraft = aircraft;

        if (aircraft.length === 0) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <span>✈️</span>
                    <p>Aucun avion dans la flotte.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = aircraft.map(plane => {
            const statusLabel = {
                'parked': 'Disponible',
                'stored': 'Stocke',
                'in_flight': 'En vol',
                'maintenance': 'Maintenance'
            }[plane.status] || plane.status;
            const icon = getCategoryIcon(plane.icao_type || plane.aircraft_type);

            return `
                <div class="fleet-card" onclick="openAircraftDetails('${plane.id}')">
                    <div class="fleet-card-icon">${icon}</div>
                    <div class="fleet-card-info">
                        <div class="fleet-card-reg">${plane.registration || plane.name || plane.aircraft_type}</div>
                        <div class="fleet-card-type">${plane.aircraft_type || 'Unknown'}</div>
                        <div class="fleet-card-meta">
                            <span>📍 ${plane.current_airport_ident || 'N/A'}</span>
                            <span>📦 ${formatCargoWeight(plane.cargo_capacity_kg)}</span>
                        </div>
                    </div>
                    <div class="fleet-card-status ${plane.status}">${statusLabel}</div>
                </div>
            `;
        }).join('');

        // Update counts
        const countEl = document.getElementById('company-aircraft-count');
        if (countEl) countEl.textContent = aircraft.length;
        const tabCountEl = document.getElementById('tab-fleet-count');
        if (tabCountEl) tabCountEl.textContent = aircraft.length;

    } catch (error) {
        console.log('[COMPANY] Fleet not available:', error.message);
        container.innerHTML = `
            <div class="empty-state-small">
                <span>✈️</span>
                <p>Aucun avion dans la flotte.</p>
            </div>
        `;
    }
}

function getCategoryIcon(typeStr) {
    if (!typeStr) return '✈️';
    const t = typeStr.toUpperCase();
    if (t.includes('747') || t.includes('777') || t.includes('A380')) return '🛫';
    if (t.includes('737') || t.includes('A320')) return '🛩️';
    if (t.includes('HELICOPTER') || t.includes('H125') || t.includes('S76') || t.includes('EC30')) return '🚁';
    if (t.includes('CARAVAN') || t.includes('PC12') || t.includes('ATR') || t.includes('DHC6')) return '🛩️';
    return '✈️';
}

function formatCargoWeight(kg) {
    if (!kg) return '0 kg';
    if (kg >= 1000) {
        return `${(kg / 1000).toFixed(1)}t`;
    }
    return `${Math.round(kg)} kg`;
}

// Load company employees (members)
async function loadCompanyEmployees() {
    const container = document.getElementById('company-employees-list');

    try {
        const response = await fetch(`${API_BASE}/company/members`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load members');
        }

        const members = await response.json();

        if (members.length === 0) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <span>👥</span>
                    <p>Aucun membre.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = members.map(member => `
            <div class="employee-card">
                <div class="employee-card-icon">👤</div>
                <div class="employee-card-info">
                    <div class="employee-card-name">${member.username}</div>
                    <div class="employee-card-meta">
                        <span>${member.email}</span>
                    </div>
                </div>
                <div class="employee-role ${member.role}">${member.role}</div>
            </div>
        `).join('');

        // Update counts
        document.getElementById('company-member-count').textContent = members.length;
        document.getElementById('tab-employees-count').textContent = members.length;

    } catch (error) {
        console.error('[COMPANY] Error loading members:', error);
        container.innerHTML = `
            <div class="empty-state-small">
                <span>⚠️</span>
                <p>Erreur de chargement des membres</p>
            </div>
        `;
    }
}

// Navigate to map to create a factory
function goToMapForFactory() {
    switchView('map');
    showToast('Cliquez sur un aéroport puis sur un slot vide pour créer une usine', 'info');
}

// ========================================
// ADD AIRCRAFT MODAL
// ========================================

async function openAddAircraftModal() {
    console.log('[FLEET] Opening add aircraft modal');

    if (!state.token || state.token === 'demo-token') {
        showToast('Connectez-vous pour ajouter un avion', 'warning');
        return;
    }

    // Reset state
    fleetState.selectedCatalogId = null;
    const errorEl = document.getElementById('aircraft-add-error');
    if (errorEl) errorEl.textContent = '';
    document.getElementById('catalog-registration-section').style.display = 'none';
    document.getElementById('catalog-registration').value = '';
    document.getElementById('aircraft-price-box').style.display = 'none';

    // Reset manual form
    document.getElementById('manual-registration').value = '';
    document.getElementById('manual-type').value = '';
    document.getElementById('manual-icao').value = '';
    document.getElementById('manual-name').value = '';
    document.getElementById('manual-capacity').value = '1000';
    document.getElementById('manual-airport').value = '';

    // Load catalog
    await loadAircraftCatalog();

    // Load balance
    await loadCompanyBalanceForModal();

    // Show modal
    document.getElementById('modal-add-aircraft').classList.add('active');
    switchAircraftTab('catalog');
}

function closeAddAircraftModal() {
    document.getElementById('modal-add-aircraft').classList.remove('active');
    fleetState.selectedCatalogId = null;
}

function switchAircraftTab(tabName) {
    // Update tabs
    document.querySelectorAll('.aircraft-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update content
    document.getElementById('aircraft-tab-catalog').style.display = tabName === 'catalog' ? 'block' : 'none';
    document.getElementById('aircraft-tab-manual').style.display = tabName === 'manual' ? 'block' : 'none';

    // Hide registration section and price for manual tab
    if (tabName === 'manual') {
        document.getElementById('catalog-registration-section').style.display = 'none';
        document.getElementById('aircraft-price-box').style.display = 'none';
    }

    // Update button text
    const btn = document.getElementById('btn-add-aircraft');
    if (tabName === 'catalog') {
        btn.textContent = fleetState.selectedCatalogId ? 'ACHETER' : 'SELECTIONNER';
    } else {
        btn.textContent = 'AJOUTER';
    }
}

async function loadAircraftCatalog() {
    const container = document.getElementById('catalog-grid');
    container.innerHTML = '<div class="loading-small">Chargement du catalogue...</div>';

    try {
        const category = document.getElementById('catalog-category').value;
        const url = category
            ? `${API_BASE}/fleet/catalog?category=${category}`
            : `${API_BASE}/fleet/catalog`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Failed to load catalog');
        }

        fleetState.catalog = await response.json();
        renderCatalogGrid();

    } catch (error) {
        console.error('[FLEET] Catalog error:', error);
        container.innerHTML = '<div class="empty-state-small">Erreur de chargement</div>';
    }
}

function filterCatalog() {
    loadAircraftCatalog();
}

function renderCatalogGrid() {
    const container = document.getElementById('catalog-grid');

    if (fleetState.catalog.length === 0) {
        container.innerHTML = '<div class="empty-state-small">Aucun avion disponible</div>';
        return;
    }

    container.innerHTML = fleetState.catalog.map(aircraft => {
        const isSelected = fleetState.selectedCatalogId === aircraft.id;
        const icon = getCategoryIcon(aircraft.icao_type);

        return `
            <div class="catalog-card ${isSelected ? 'selected' : ''}"
                 onclick="selectCatalogAircraft('${aircraft.id}')">
                <div class="catalog-card-icon">${icon}</div>
                <div class="catalog-card-info">
                    <div class="catalog-card-name">${aircraft.name}</div>
                    <div class="catalog-card-meta">
                        <span>${aircraft.manufacturer}</span>
                        <span>📦 ${formatCargoWeight(aircraft.cargo_capacity_kg)}</span>
                        ${aircraft.max_range_nm ? `<span>🛫 ${aircraft.max_range_nm} NM</span>` : ''}
                    </div>
                </div>
                <div class="catalog-card-price">${formatMoney(aircraft.base_price)}</div>
            </div>
        `;
    }).join('');
}

function selectCatalogAircraft(catalogId) {
    fleetState.selectedCatalogId = catalogId;

    // Update selection visual
    document.querySelectorAll('.catalog-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');

    // Show registration input
    document.getElementById('catalog-registration-section').style.display = 'block';

    // Update button
    document.getElementById('btn-add-aircraft').textContent = 'ACHETER';

    // Update price label
    const aircraft = fleetState.catalog.find(a => a.id === catalogId);
    if (aircraft) {
        document.getElementById('aircraft-price-label').textContent = formatMoney(aircraft.base_price);
        document.getElementById('aircraft-price-box').style.display = 'block';
    }
}

async function loadCompanyBalanceForModal() {
    try {
        const response = await fetch(`${API_BASE}/company/me`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (response.ok) {
            const company = await response.json();
            document.getElementById('aircraft-balance-label').textContent = formatMoney(company.balance || 0);
        }
    } catch (e) {
        document.getElementById('aircraft-balance-label').textContent = '---';
    }
}

async function submitAddAircraft() {
    const errorEl = document.getElementById('aircraft-add-error');
    const btn = document.getElementById('btn-add-aircraft');
    const activeTab = document.querySelector('.aircraft-tab.active').dataset.tab;

    let payload = {};

    if (activeTab === 'catalog') {
        if (!fleetState.selectedCatalogId) {
            errorEl.textContent = 'Selectionnez un avion du catalogue';
            return;
        }

        const registration = document.getElementById('catalog-registration').value.trim();
        if (!registration) {
            errorEl.textContent = 'Entrez une immatriculation';
            return;
        }

        payload = {
            catalog_id: fleetState.selectedCatalogId,
            registration: registration
        };
    } else {
        // Manual
        const registration = document.getElementById('manual-registration').value.trim();
        const aircraftType = document.getElementById('manual-type').value.trim();

        if (!registration) {
            errorEl.textContent = 'Entrez une immatriculation';
            return;
        }

        if (!aircraftType) {
            errorEl.textContent = 'Entrez un type d\'avion';
            return;
        }

        payload = {
            registration: registration,
            aircraft_type: aircraftType,
            icao_type: document.getElementById('manual-icao').value.trim() || null,
            name: document.getElementById('manual-name').value.trim() || null,
            cargo_capacity_kg: parseInt(document.getElementById('manual-capacity').value) || 1000,
            current_airport: document.getElementById('manual-airport').value.trim().toUpperCase() || null
        };
    }

    btn.disabled = true;
    btn.textContent = 'Ajout en cours...';
    errorEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/fleet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Erreur lors de l\'ajout');
        }

        const aircraft = await response.json();
        showToast(`Avion ${aircraft.registration || aircraft.aircraft_type} ajoute a la flotte!`, 'success');
        closeAddAircraftModal();
        await loadCompanyFleet();

    } catch (error) {
        console.error('[FLEET] Add error:', error);
        errorEl.textContent = error.message;
    } finally {
        btn.disabled = false;
        btn.textContent = activeTab === 'catalog' ? 'ACHETER' : 'AJOUTER';
    }
}

// ========================================
// AIRCRAFT DETAILS MODAL
// ========================================

async function openAircraftDetails(aircraftId) {
    console.log('[FLEET] Opening aircraft details:', aircraftId);
    fleetState.selectedAircraftId = aircraftId;

    const body = document.getElementById('aircraft-detail-body');
    body.innerHTML = '<div class="loading-small">Chargement...</div>';

    document.getElementById('modal-aircraft-details').classList.add('active');

    try {
        const response = await fetch(`${API_BASE}/fleet/${aircraftId}/details`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load aircraft');
        }

        const aircraft = await response.json();
        renderAircraftDetails(aircraft);

    } catch (error) {
        console.error('[FLEET] Details error:', error);
        body.innerHTML = '<div class="empty-state-small">Erreur de chargement</div>';
    }
}

function renderAircraftDetails(aircraft) {
    document.getElementById('aircraft-detail-title').textContent = aircraft.registration || aircraft.aircraft_type;

    const statusLabel = {
        'parked': 'Disponible',
        'stored': 'Stocke',
        'in_flight': 'En vol',
        'maintenance': 'Maintenance'
    }[aircraft.status] || aircraft.status;

    const icon = getCategoryIcon(aircraft.icao_type || aircraft.aircraft_type);

    document.getElementById('aircraft-detail-body').innerHTML = `
        <div class="aircraft-detail-header">
            <div class="aircraft-detail-icon">${icon}</div>
            <div class="aircraft-detail-info">
                <div class="aircraft-detail-reg">${aircraft.registration || 'N/A'}</div>
                <div class="aircraft-detail-type">${aircraft.name || aircraft.aircraft_type}</div>
            </div>
            <div class="aircraft-detail-status ${aircraft.status}">${statusLabel}</div>
        </div>

        <div class="aircraft-stats-grid">
            <div class="aircraft-stat-box">
                <div class="aircraft-stat-value">${aircraft.current_airport_ident || 'N/A'}</div>
                <div class="aircraft-stat-label">📍 Position</div>
            </div>
            <div class="aircraft-stat-box">
                <div class="aircraft-stat-value">${formatCargoWeight(aircraft.cargo_capacity_kg)}</div>
                <div class="aircraft-stat-label">📦 Capacite</div>
            </div>
            <div class="aircraft-stat-box">
                <div class="aircraft-stat-value">${aircraft.hours?.toFixed(1) || 0}h</div>
                <div class="aircraft-stat-label">⏱️ Heures de vol</div>
            </div>
            <div class="aircraft-stat-box">
                <div class="aircraft-stat-value">${Math.round((1 - (aircraft.condition || 1)) * 100)}%</div>
                <div class="aircraft-stat-label">🔧 Usure</div>
            </div>
        </div>

        <div class="modal-info-box">
            <div class="modal-info-row">
                <span class="modal-info-label">Cargo actuel</span>
                <span class="modal-info-value">${formatCargoWeight(aircraft.current_cargo_kg)} / ${formatCargoWeight(aircraft.cargo_capacity_kg)}</span>
            </div>
            <div class="cargo-bar">
                <div class="cargo-bar-fill" style="width: ${aircraft.cargo_utilization_percent || 0}%"></div>
            </div>
            <div class="modal-info-row" style="margin-top: 0.5rem;">
                <span class="modal-info-label">Items en cargo</span>
                <span class="modal-info-value">${aircraft.current_cargo_items || 0}</span>
            </div>
            ${aircraft.purchase_price ? `
            <div class="modal-info-row">
                <span class="modal-info-label">Prix d'achat</span>
                <span class="modal-info-value">${formatMoney(aircraft.purchase_price)}</span>
            </div>
            ` : ''}
        </div>
    `;
}

function closeAircraftDetailsModal() {
    document.getElementById('modal-aircraft-details').classList.remove('active');
    fleetState.selectedAircraftId = null;
}

async function confirmRemoveAircraft() {
    if (!fleetState.selectedAircraftId) return;

    if (!confirm('Etes-vous sur de vouloir retirer cet avion de la flotte?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/fleet/${fleetState.selectedAircraftId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Erreur lors de la suppression');
        }

        showToast('Avion retire de la flotte', 'success');
        closeAircraftDetailsModal();
        await loadCompanyFleet();

    } catch (error) {
        console.error('[FLEET] Remove error:', error);
        showToast(error.message, 'error');
    }
}

// Placeholder functions for other modals
function openInviteMemberModal() {
    showToast('Fonctionnalite a venir: Inviter un membre', 'info');
}

function showFactoryDetails(factoryId) {
    showToast('Fonctionnalite a venir: Details de l\'usine', 'info');
}

// ========================================
// PROFILE VIEW
// ========================================

async function loadProfileView() {
    console.log('[PROFILE] Loading profile view...');

    // Check if logged in
    if (!state.token || state.token === 'demo-token') {
        showToast('Connectez-vous pour voir votre profil', 'warning');
        return;
    }

    // Load user data from state (set during login)
    const user = state.user || {};

    // Update header info
    document.getElementById('profile-username').textContent = user.username || 'Pilote';
    document.getElementById('profile-email').textContent = user.email || '-';
    document.getElementById('profile-avatar-letter').textContent = (user.username || 'P')[0].toUpperCase();

    // Format join date (if available)
    if (user.created_at) {
        const joinDate = new Date(user.created_at);
        document.getElementById('profile-joined-date').textContent = joinDate.toLocaleDateString('fr-FR');
    }

    // Load profile stats and data
    await loadProfileStats();
    await loadProfileCompanyInfo();
}

// Switch profile tab
function switchProfileTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.profile-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `profile-tab-${tabName}`);
    });
}

// Load profile stats
async function loadProfileStats() {
    // TODO: Load from API when available
    // For now, set placeholder values

    // XP system (placeholder)
    const xp = 250;
    const level = Math.floor(xp / 1000) + 1;
    const xpInLevel = xp % 1000;
    const xpForNextLevel = 1000;
    const xpPercent = (xpInLevel / xpForNextLevel) * 100;

    document.getElementById('profile-pilot-level').textContent = level;
    document.getElementById('profile-xp').textContent = xpInLevel;
    document.getElementById('profile-xp-next').textContent = xpForNextLevel;
    document.getElementById('profile-xp-fill').style.width = `${xpPercent}%`;

    // Stats (placeholders)
    document.getElementById('profile-flights-count').textContent = '0';
    document.getElementById('profile-flight-hours').textContent = '0h';
    document.getElementById('profile-cargo-delivered').textContent = '0t';
    document.getElementById('profile-earnings').textContent = '0$';
}

// Load company info for profile
async function loadProfileCompanyInfo() {
    try {
        const response = await fetch(`${API_BASE}/company/me`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (response.ok) {
            const company = await response.json();
            document.getElementById('profile-company-name').textContent = company.name;
            document.getElementById('profile-home-base').textContent = company.home_airport_ident;

            // Get member role
            const membersResponse = await fetch(`${API_BASE}/company/members`, {
                headers: { 'Authorization': `Bearer ${state.token}` }
            });

            if (membersResponse.ok) {
                const members = await membersResponse.json();
                const myMember = members.find(m => m.user_id === state.user?.id);
                if (myMember) {
                    const roleLabels = { owner: 'Propriétaire', admin: 'Administrateur', member: 'Membre' };
                    document.getElementById('profile-company-role').textContent = roleLabels[myMember.role] || myMember.role;
                }
            }
        } else {
            document.getElementById('profile-company-name').textContent = 'Aucune';
            document.getElementById('profile-company-role').textContent = '-';
            document.getElementById('profile-home-base').textContent = '-';
        }
    } catch (error) {
        console.log('[PROFILE] Error loading company info:', error.message);
        document.getElementById('profile-company-name').textContent = '-';
    }

    // Current location (placeholder)
    document.getElementById('profile-current-location').textContent = '-';
}

// Load mailbox messages
async function loadProfileMailbox() {
    const container = document.getElementById('profile-mailbox-list');

    // TODO: Implement mailbox API
    container.innerHTML = `
        <div class="empty-state-small">
            <span>📬</span>
            <p>Aucun message.</p>
        </div>
    `;
}

// Load transaction history
async function loadProfileTransactions() {
    const container = document.getElementById('profile-transactions-list');

    // TODO: Implement transactions API
    container.innerHTML = `
        <div class="empty-state-small">
            <span>💳</span>
            <p>Aucune transaction.</p>
        </div>
    `;
}

// ========================================
// INVENTORY VIEW V0.7
// ========================================

let inventoryData = {
    locations: [],
    items: {},
    currentAirport: 'all',
    currentTab: 'all',
    selectedItem: null,
    dragSource: null
};

// Load inventory view
async function loadInventoryView() {
    console.log('[INVENTORY] Loading inventory view...');

    // Check if logged in
    if (!state.token || state.token === 'demo-token') {
        showToast('Connectez-vous pour voir votre inventaire', 'warning');
        document.getElementById('inventory-empty-state').style.display = 'block';
        document.getElementById('inventory-grid').style.display = 'none';
        return;
    }

    await refreshInventory();
}

// Refresh inventory data
async function refreshInventory() {
    try {
        // Load inventory overview
        const response = await fetch(`${API_BASE}/inventory/overview`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!response.ok) {
            if (response.status === 404) {
                // No inventory yet
                showEmptyInventoryState();
                return;
            }
            throw new Error('Failed to load inventory');
        }

        const data = await response.json();
        console.log('[INVENTORY] Loaded:', data);

        inventoryData.locations = data.locations || [];
        inventoryData.items = {};

        // Build items map by location
        if (data.items) {
            data.items.forEach(item => {
                const locId = item.location_id;
                if (!inventoryData.items[locId]) {
                    inventoryData.items[locId] = [];
                }
                inventoryData.items[locId].push(item);
            });
        }

        updateInventoryStats(data);
        updateAirportTabs();
        renderInventoryContainers();

    } catch (error) {
        console.error('[INVENTORY] Error:', error);
        showEmptyInventoryState();
    }
}

// Update inventory stats
function updateInventoryStats(data) {
    const totalItems = data.items?.reduce((sum, item) => sum + (item.qty || 0), 0) || 0;
    const totalLocations = inventoryData.locations.length;
    const totalValue = data.items?.reduce((sum, item) => sum + ((item.qty || 0) * (item.base_value || 0)), 0) || 0;

    document.getElementById('inv-total-items').textContent = totalItems.toLocaleString();
    document.getElementById('inv-total-locations').textContent = totalLocations;
    document.getElementById('inv-total-value').textContent = `${totalValue.toLocaleString()}$`;
}

// Update airport tabs
function updateAirportTabs() {
    const container = document.getElementById('inventory-airport-tabs');
    const airports = new Set();

    inventoryData.locations.forEach(loc => {
        if (loc.airport_ident) {
            airports.add(loc.airport_ident);
        }
    });

    const airportList = Array.from(airports).sort();

    let html = `
        <div class="airport-tab ${inventoryData.currentAirport === 'all' ? 'active' : ''}"
             data-airport="all" onclick="selectAirportTab('all')">
            🌍 Tous
            <span class="tab-count">${inventoryData.locations.length}</span>
        </div>
    `;

    airportList.forEach(ident => {
        const count = inventoryData.locations.filter(l => l.airport_ident === ident).length;
        html += `
            <div class="airport-tab ${inventoryData.currentAirport === ident ? 'active' : ''}"
                 data-airport="${ident}" onclick="selectAirportTab('${ident}')">
                ✈️ ${ident}
                <span class="tab-count">${count}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Select airport tab
function selectAirportTab(airport) {
    inventoryData.currentAirport = airport;
    updateAirportTabs();
    renderInventoryContainers();
}

// Switch inventory tab (all, personal, company, aircraft)
function switchInventoryTab(tabName) {
    inventoryData.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.inventory-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    renderInventoryContainers();
}

// Render inventory containers
function renderInventoryContainers() {
    const grid = document.getElementById('inventory-grid');
    const emptyState = document.getElementById('inventory-empty-state');

    // Filter locations
    let locations = inventoryData.locations.filter(loc => {
        // Airport filter
        if (inventoryData.currentAirport !== 'all' && loc.airport_ident !== inventoryData.currentAirport) {
            return false;
        }

        // Tab filter
        switch (inventoryData.currentTab) {
            case 'personal':
                return loc.owner_type === 'player';
            case 'company':
                return loc.owner_type === 'company' && loc.kind !== 'aircraft';
            case 'aircraft':
                return loc.kind === 'aircraft';
            default:
                return true;
        }
    });

    if (locations.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = locations.map(loc => renderInventoryContainer(loc)).join('');

    // Setup drag and drop
    setupDragAndDrop();
}

// Render a single inventory container
function renderInventoryContainer(location) {
    const items = inventoryData.items[location.id] || [];
    const containerClass = getContainerClass(location.kind);
    const containerIcon = getContainerIcon(location.kind);

    // For aircraft, show weight info
    let capacityHtml = '';
    if (location.kind === 'aircraft' && location.cargo_capacity_kg) {
        const currentWeight = items.reduce((sum, item) => sum + (item.weight_kg || 0) * item.qty, 0);
        const percent = (currentWeight / location.cargo_capacity_kg) * 100;
        const isDanger = percent > 80;

        capacityHtml = `
            <div class="weight-bar-container">
                <div class="weight-bar">
                    <div class="weight-bar-fill ${isDanger ? 'danger' : ''}" style="width: ${Math.min(percent, 100)}%"></div>
                </div>
                <div class="weight-info">
                    <span>${currentWeight.toFixed(1)} kg</span>
                    <span>${location.cargo_capacity_kg} kg max</span>
                </div>
            </div>
        `;
    }

    let itemsHtml = '';
    if (items.length === 0) {
        itemsHtml = `<div class="container-items empty">Vide</div>`;
    } else {
        itemsHtml = `
            <div class="container-items" data-location-id="${location.id}"
                 ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
                ${items.map(item => renderInventoryItem(item, location)).join('')}
            </div>
        `;
    }

    return `
        <div class="inventory-container ${containerClass}" data-location-id="${location.id}">
            <div class="container-header">
                <div class="container-title">
                    <span class="container-icon">${containerIcon}</span>
                    <span class="container-name">${location.name || location.kind}</span>
                    <span class="container-type">${location.airport_ident}</span>
                </div>
                <div class="container-capacity">${items.length} items</div>
            </div>
            ${itemsHtml}
            ${capacityHtml}
        </div>
    `;
}

// Render a single inventory item
function renderInventoryItem(item, location) {
    const emoji = getProductEmoji(item.item_code, item.tag);
    const tierLabel = item.tier !== undefined ? `T${item.tier}` : '';

    return `
        <div class="inventory-item"
             draggable="true"
             data-item-id="${item.item_id}"
             data-location-id="${location.id}"
             data-qty="${item.qty}"
             data-item-name="${item.item_name || item.item_code}"
             ondragstart="handleDragStart(event)"
             ondragend="handleDragEnd(event)"
             onclick="selectInventoryItem(event, '${item.item_id}', '${location.id}')">
            <div class="item-icon">${emoji}</div>
            <div class="item-name">${item.item_name || item.item_code}</div>
            <div class="item-qty">×${item.qty}</div>
            ${tierLabel ? `<div class="item-tier">${tierLabel}</div>` : ''}
        </div>
    `;
}

// Get container class based on kind
function getContainerClass(kind) {
    const classes = {
        'player_warehouse': 'player-warehouse',
        'company_warehouse': 'company-warehouse',
        'factory_storage': 'factory-storage',
        'aircraft': 'aircraft'
    };
    return classes[kind] || '';
}

// Get container icon based on kind
function getContainerIcon(kind) {
    const icons = {
        'player_warehouse': '👤',
        'company_warehouse': '🏢',
        'factory_storage': '🏭',
        'aircraft': '✈️'
    };
    return icons[kind] || '📦';
}

// Show empty inventory state
function showEmptyInventoryState() {
    document.getElementById('inventory-grid').style.display = 'none';
    document.getElementById('inventory-empty-state').style.display = 'block';
}

// ========================================
// DRAG AND DROP
// ========================================

function setupDragAndDrop() {
    // Add drop zones to all containers
    document.querySelectorAll('.container-items').forEach(container => {
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
        container.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragStart(event) {
    const itemEl = event.target.closest('.inventory-item');
    if (!itemEl) return;

    itemEl.classList.add('dragging');

    inventoryData.dragSource = {
        itemId: itemEl.dataset.itemId,
        locationId: itemEl.dataset.locationId,
        qty: parseInt(itemEl.dataset.qty),
        itemName: itemEl.dataset.itemName
    };

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(inventoryData.dragSource));
}

function handleDragEnd(event) {
    event.target.classList.remove('dragging');
    inventoryData.dragSource = null;

    // Remove drag-over class from all containers
    document.querySelectorAll('.container-items').forEach(container => {
        container.classList.remove('drag-over');
    });
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const container = event.target.closest('.container-items');
    if (container && inventoryData.dragSource) {
        // Only allow drop if different location
        if (container.dataset.locationId !== inventoryData.dragSource.locationId) {
            container.classList.add('drag-over');
        }
    }
}

function handleDragLeave(event) {
    const container = event.target.closest('.container-items');
    if (container) {
        container.classList.remove('drag-over');
    }
}

function handleDrop(event) {
    event.preventDefault();

    const container = event.target.closest('.container-items');
    if (!container) return;

    container.classList.remove('drag-over');

    const toLocationId = container.dataset.locationId;

    if (!inventoryData.dragSource || toLocationId === inventoryData.dragSource.locationId) {
        return;
    }

    // Open transfer modal
    openTransferModal(
        inventoryData.dragSource.locationId,
        toLocationId,
        inventoryData.dragSource.itemId,
        inventoryData.dragSource.qty,
        inventoryData.dragSource.itemName
    );
}

function selectInventoryItem(event, itemId, locationId) {
    event.stopPropagation();

    // Toggle selection
    document.querySelectorAll('.inventory-item').forEach(el => {
        el.classList.remove('selected');
    });

    if (inventoryData.selectedItem?.itemId === itemId && inventoryData.selectedItem?.locationId === locationId) {
        inventoryData.selectedItem = null;
    } else {
        event.target.closest('.inventory-item')?.classList.add('selected');
        inventoryData.selectedItem = { itemId, locationId };
    }
}

// ========================================
// TRANSFER MODAL
// ========================================

let pendingTransfer = null;

function openTransferModal(fromLocationId, toLocationId, itemId, maxQty, itemName) {
    console.log('[TRANSFER] Opening modal:', { fromLocationId, toLocationId, itemId, maxQty });

    const fromLocation = inventoryData.locations.find(l => l.id === fromLocationId);
    const toLocation = inventoryData.locations.find(l => l.id === toLocationId);

    if (!fromLocation || !toLocation) {
        showToast('Erreur: Location introuvable', 'error');
        return;
    }

    // Check same airport
    if (fromLocation.airport_ident !== toLocation.airport_ident) {
        showToast(`Transfert inter-aéroport non autorisé. Utilisez un avion.`, 'error');
        return;
    }

    pendingTransfer = {
        fromLocationId,
        toLocationId,
        itemId,
        maxQty
    };

    // Update modal content
    document.getElementById('transfer-from-name').textContent = fromLocation.name || fromLocation.kind;
    document.getElementById('transfer-from-type').textContent = fromLocation.kind;
    document.getElementById('transfer-to-name').textContent = toLocation.name || toLocation.kind;
    document.getElementById('transfer-to-type').textContent = toLocation.kind;

    const emoji = getProductEmoji(itemName);
    document.getElementById('transfer-item-icon').textContent = emoji;
    document.getElementById('transfer-item-name').textContent = itemName;
    document.getElementById('transfer-item-available').textContent = maxQty;

    document.getElementById('transfer-qty').value = maxQty;
    document.getElementById('transfer-qty').max = maxQty;
    document.getElementById('transfer-error').classList.remove('visible');

    // Show modal
    document.getElementById('modal-transfer').classList.add('active');
}

function closeTransferModal() {
    document.getElementById('modal-transfer').classList.remove('active');
    pendingTransfer = null;
}

function setTransferMax() {
    if (pendingTransfer) {
        document.getElementById('transfer-qty').value = pendingTransfer.maxQty;
    }
}

async function confirmTransfer() {
    if (!pendingTransfer) return;

    const qty = parseInt(document.getElementById('transfer-qty').value);
    const errorEl = document.getElementById('transfer-error');
    const btn = document.getElementById('btn-confirm-transfer');

    if (!qty || qty < 1) {
        errorEl.textContent = 'Quantité invalide';
        errorEl.classList.add('visible');
        return;
    }

    if (qty > pendingTransfer.maxQty) {
        errorEl.textContent = `Quantité max: ${pendingTransfer.maxQty}`;
        errorEl.classList.add('visible');
        return;
    }

    btn.classList.add('loading');
    btn.textContent = 'TRANSFERT...';
    errorEl.classList.remove('visible');

    try {
        const response = await fetch(`${API_BASE}/inventory/transfer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                from_location_id: pendingTransfer.fromLocationId,
                to_location_id: pendingTransfer.toLocationId,
                item_id: pendingTransfer.itemId,
                qty: qty
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur de transfert');
        }

        showToast(`Transfert de ${qty} items réussi!`, 'success');
        closeTransferModal();

        // Refresh inventory
        await refreshInventory();

    } catch (error) {
        console.error('[TRANSFER] Error:', error);
        errorEl.textContent = error.message;
        errorEl.classList.add('visible');
    } finally {
        btn.classList.remove('loading');
        btn.textContent = 'TRANSFÉRER';
    }
}

// ========================================
// CREATE WAREHOUSE
// ========================================

function createPlayerWarehouse() {
    // Check if logged in
    if (!state.token || state.token === 'demo-token') {
        showToast('Connectez-vous pour créer un entrepôt', 'warning');
        return;
    }

    document.getElementById('warehouse-airport').value = '';
    document.getElementById('warehouse-create-error').classList.remove('visible');
    document.getElementById('modal-create-warehouse').classList.add('active');
}

function closeCreateWarehouseModal() {
    document.getElementById('modal-create-warehouse').classList.remove('active');
}

async function submitCreateWarehouse() {
    const airport = document.getElementById('warehouse-airport').value.trim().toUpperCase();
    const errorEl = document.getElementById('warehouse-create-error');
    const btn = document.getElementById('btn-create-warehouse');

    if (!airport || airport.length < 3 || airport.length > 4) {
        errorEl.textContent = 'Code ICAO invalide (3-4 caractères)';
        errorEl.classList.add('visible');
        return;
    }

    btn.classList.add('loading');
    btn.textContent = 'CRÉATION...';
    errorEl.classList.remove('visible');

    try {
        const response = await fetch(`${API_BASE}/inventory/warehouse/player`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                airport_ident: airport
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur lors de la création');
        }

        showToast(`Entrepôt créé à ${airport}!`, 'success');
        closeCreateWarehouseModal();

        // Refresh inventory
        await refreshInventory();

    } catch (error) {
        console.error('[WAREHOUSE] Create error:', error);
        errorEl.textContent = error.message;
        errorEl.classList.add('visible');
    } finally {
        btn.classList.remove('loading');
        btn.textContent = 'CRÉER L\'ENTREPÔT';
    }
}

// ========================================
// MARKET VIEW (HV - Hôtel des Ventes)
// ========================================

async function loadMarketView() {
    console.log('[MARKET] Loading market view...');

    // Reset state
    state.market.page = 0;

    // Load stats and listings in parallel
    await Promise.all([
        loadMarketStats(),
        loadMarketListings()
    ]);
}

async function loadMarketStats() {
    try {
        const response = await fetch(`${API_BASE}/inventory/market/stats`, {
            headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
        });

        if (!response.ok) {
            throw new Error('Failed to load market stats');
        }

        const stats = await response.json();
        state.market.stats = stats;

        // Update header stats
        document.getElementById('market-total-listings').textContent = stats.total_listings;
        document.getElementById('market-total-airports').textContent = stats.total_airports;
        document.getElementById('market-total-value').textContent = formatMoney(stats.total_value);

        // Update tier distribution chips
        renderTierChips(stats.tier_distribution);

    } catch (error) {
        console.error('[MARKET] Error loading stats:', error);
    }
}

function renderTierChips(tierDist) {
    const container = document.getElementById('market-tier-chips');
    if (!container) return;

    if (!tierDist || Object.keys(tierDist).length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = Object.entries(tierDist)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([tier, count]) => `
            <span class="tier-chip tier-${tier.toLowerCase()}">${tier}: ${count}</span>
        `)
        .join('');
}

async function loadMarketListings() {
    const container = document.getElementById('market-listings');

    // Show loading
    container.innerHTML = `
        <div class="market-loading">
            <div class="loading-spinner"></div>
            <p>Chargement du marché...</p>
        </div>
    `;

    try {
        // Build query params
        const params = new URLSearchParams();

        if (state.market.filters.search) {
            params.append('item_name', state.market.filters.search);
        }
        if (state.market.filters.airport) {
            params.append('airport', state.market.filters.airport.toUpperCase());
        }
        if (state.market.filters.tier !== '') {
            params.append('tier', state.market.filters.tier);
        }
        if (state.market.filters.maxPrice) {
            params.append('max_price', state.market.filters.maxPrice);
        }

        params.append('limit', state.market.pageSize);
        params.append('offset', state.market.page * state.market.pageSize);

        const url = `${API_BASE}/inventory/market?${params.toString()}`;

        const response = await fetch(url, {
            headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
        });

        if (!response.ok) {
            throw new Error('Failed to load market listings');
        }

        const listings = await response.json();
        state.market.listings = listings;

        renderMarketListings(listings);
        updateMarketPagination(listings.length);

    } catch (error) {
        console.error('[MARKET] Error loading listings:', error);
        container.innerHTML = `
            <div class="market-error">
                <span>⚠️</span>
                <p>Erreur de chargement du marché</p>
            </div>
        `;
    }
}

function renderMarketListings(listings) {
    const container = document.getElementById('market-listings');

    if (listings.length === 0) {
        container.innerHTML = `
            <div class="market-empty">
                <span class="market-empty-icon">🏪</span>
                <h3>Aucune annonce trouvée</h3>
                <p>Essayez de modifier vos filtres</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="market-listings-grid">
            ${listings.map(listing => renderMarketListing(listing)).join('')}
        </div>
    `;
}

function renderMarketListing(listing) {
    const icon = listing.item_icon || getProductEmoji(listing.item_code);
    const tierClass = `tier-t${listing.item_tier}`;

    return `
        <div class="market-listing-card" onclick="openMarketBuyModal('${listing.location_id}', '${listing.item_id}')">
            <div class="listing-header">
                <span class="listing-icon">${icon}</span>
                <span class="listing-tier ${tierClass}">T${listing.item_tier}</span>
            </div>
            <div class="listing-body">
                <div class="listing-item-name">${listing.item_name}</div>
                <div class="listing-seller">${listing.company_name}</div>
                <div class="listing-location">
                    <span>📍</span> ${listing.airport_ident}
                </div>
            </div>
            <div class="listing-footer">
                <div class="listing-price">${formatMoney(listing.sale_price)}</div>
                <div class="listing-qty">× ${listing.sale_qty}</div>
            </div>
        </div>
    `;
}

function updateMarketPagination(count) {
    const prevBtn = document.getElementById('market-prev-btn');
    const nextBtn = document.getElementById('market-next-btn');
    const info = document.getElementById('market-pagination-info');

    prevBtn.disabled = state.market.page === 0;
    nextBtn.disabled = count < state.market.pageSize;

    const start = state.market.page * state.market.pageSize + 1;
    const end = start + count - 1;
    info.textContent = `${start}-${end}`;
}

function marketPrevPage() {
    if (state.market.page > 0) {
        state.market.page--;
        loadMarketListings();
    }
}

function marketNextPage() {
    state.market.page++;
    loadMarketListings();
}

function applyMarketFilters() {
    state.market.filters.search = document.getElementById('market-search').value.trim();
    state.market.filters.airport = document.getElementById('market-airport-filter').value.trim();
    state.market.filters.tier = document.getElementById('market-tier-filter').value;
    state.market.filters.maxPrice = document.getElementById('market-max-price').value;

    state.market.page = 0;
    loadMarketListings();
}

function resetMarketFilters() {
    state.market.filters = {
        search: '',
        airport: '',
        tier: '',
        maxPrice: ''
    };
    state.market.page = 0;

    document.getElementById('market-search').value = '';
    document.getElementById('market-airport-filter').value = '';
    document.getElementById('market-tier-filter').value = '';
    document.getElementById('market-max-price').value = '';

    loadMarketListings();
}

// ========================================
// MARKET BUY MODAL
// ========================================

function openMarketBuyModal(locationId, itemId) {
    // Find the listing
    const listing = state.market.listings.find(l =>
        l.location_id === locationId && l.item_id === itemId
    );

    if (!listing) {
        showToast('Annonce introuvable', 'error');
        return;
    }

    state.market.selectedListing = listing;

    // Update modal content
    const icon = listing.item_icon || getProductEmoji(listing.item_code);
    document.getElementById('buy-item-icon').textContent = icon;
    document.getElementById('buy-item-name').textContent = listing.item_name;
    document.getElementById('buy-item-tier').textContent = `T${listing.item_tier}`;

    document.getElementById('buy-seller-name').textContent = listing.company_name;
    document.getElementById('buy-airport').textContent = listing.airport_ident;
    document.getElementById('buy-unit-price').textContent = formatMoney(listing.sale_price);
    document.getElementById('buy-available-qty').textContent = listing.sale_qty;

    document.getElementById('buy-qty').value = 1;
    document.getElementById('buy-qty').max = listing.sale_qty;

    updateBuyTotal();

    document.getElementById('market-buy-error').classList.remove('visible');
    document.getElementById('modal-market-buy').classList.add('active');
}

function closeMarketBuyModal() {
    document.getElementById('modal-market-buy').classList.remove('active');
    state.market.selectedListing = null;
}

function setBuyMax() {
    if (state.market.selectedListing) {
        document.getElementById('buy-qty').value = state.market.selectedListing.sale_qty;
        updateBuyTotal();
    }
}

function updateBuyTotal() {
    if (!state.market.selectedListing) return;

    const qty = parseInt(document.getElementById('buy-qty').value) || 0;
    const unitPrice = parseFloat(state.market.selectedListing.sale_price);
    const total = qty * unitPrice;

    document.getElementById('buy-total').textContent = formatMoney(total);
}

async function confirmMarketBuy() {
    if (!state.market.selectedListing) return;

    const qty = parseInt(document.getElementById('buy-qty').value);
    const errorEl = document.getElementById('market-buy-error');
    const btn = document.getElementById('btn-confirm-buy');

    if (!qty || qty < 1) {
        errorEl.textContent = 'Quantité invalide';
        errorEl.classList.add('visible');
        return;
    }

    if (qty > state.market.selectedListing.sale_qty) {
        errorEl.textContent = `Quantité max: ${state.market.selectedListing.sale_qty}`;
        errorEl.classList.add('visible');
        return;
    }

    if (!state.token || state.token === 'demo-token') {
        errorEl.textContent = 'Connectez-vous pour acheter';
        errorEl.classList.add('visible');
        return;
    }

    btn.classList.add('loading');
    btn.textContent = 'ACHAT...';
    errorEl.classList.remove('visible');

    try {
        const response = await fetch(`${API_BASE}/inventory/market/${state.market.selectedListing.airport_ident}/buy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                seller_location_id: state.market.selectedListing.location_id,
                item_id: state.market.selectedListing.item_id,
                qty: qty
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur lors de l\'achat');
        }

        const result = await response.json();

        showToast(`Achat réussi! ${qty}× ${state.market.selectedListing.item_name} pour ${formatMoney(result.total_cost)}`, 'success');
        closeMarketBuyModal();

        // Refresh market listings
        await loadMarketListings();
        await loadMarketStats();

    } catch (error) {
        console.error('[MARKET] Buy error:', error);
        errorEl.textContent = error.message;
        errorEl.classList.add('visible');
    } finally {
        btn.classList.remove('loading');
        btn.textContent = 'ACHETER';
    }
}

// Format money helper
function formatMoney(amount) {
    const num = parseFloat(amount) || 0;
    if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M$`;
    }
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K$`;
    }
    return `${num.toFixed(0)}$`;
}
