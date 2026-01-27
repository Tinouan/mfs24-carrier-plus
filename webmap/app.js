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
    },
    // Wallets state
    wallets: {
        personal: 0,
        company: 0,
        companyId: null,
        companyName: null
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

// Toggle user dropdown menu
function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
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

// Authenticated fetch helper - handles 401 errors automatically
async function authFetch(url, options = {}) {
    if (!state.token || state.token === 'demo-token') {
        throw new Error('Non authentifié');
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${state.token}`
        }
    });

    // Handle expired/invalid token
    if (response.status === 401) {
        console.warn('[AUTH] Token expired or invalid, logging out...');
        handleLogout();
        showToast('Session expirée, veuillez vous reconnecter', 'warning');
        throw new Error('Session expirée');
    }

    return response;
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

    // Add manage button for T1+ factories
    const manageBtn = factory.tier >= 1
        ? `<button class="btn btn-small" style="margin-top: 0.5rem; width: 100%;" onclick="openFactoryManageModal('${factory.id}')">⚙️ Gérer</button>`
        : '';

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
            ${manageBtn}
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
            <div class="factory-card">
                <div class="factory-card-icon">${getFactoryEmoji(factory.factory_type)}</div>
                <div class="factory-card-info">
                    <div class="factory-card-name">${factory.name}</div>
                    <div class="factory-card-meta">
                        <span>📍 ${factory.airport_ident}</span>
                        <span>🏭 ${factory.factory_type || 'Production'}</span>
                    </div>
                </div>
                <div class="factory-card-status ${factory.status}">${factory.status}</div>
                <div class="factory-card-actions">
                    <button class="btn-manage" onclick="event.stopPropagation(); openFactoryManageModal('${factory.id}')">⚙️ Gérer</button>
                </div>
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
// INVENTORY VIEW V0.7.1 - Grouped by Airport
// ========================================

let inventoryData = {
    overview: null,           // Full overview from API
    flatItems: [],            // Flattened items list for DataTable
    expandedAirports: {},     // Track which airports are expanded
    currentFilter: 'all',     // Type filter
    searchQuery: '',          // Search query
    selectedItem: null,
    dragSource: null,
    currentDetailContainer: null  // For detail modal
};

// Instance globale du DataTable Inventaire
let inventoryDataTable = null;

// Load inventory view
async function loadInventoryView() {
    console.log('[INVENTORY] Loading inventory view...');

    // Check if logged in
    if (!state.token || state.token === 'demo-token') {
        showToast('Connectez-vous pour voir votre inventaire', 'warning');
        document.getElementById('inventory-datatable').innerHTML = `
            <div class="dt-empty">
                <span class="dt-empty-icon">🔒</span>
                <p class="dt-empty-text">Connectez-vous pour voir votre inventaire</p>
            </div>
        `;
        return;
    }

    // Load wallets and inventory in parallel
    await Promise.all([
        loadWallets(),
        refreshInventory()
    ]);
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Refresh inventory data
async function refreshInventory() {
    const container = document.getElementById('inventory-datatable');

    // Check authentication
    if (!state.token || state.token === 'demo-token') {
        container.innerHTML = `
            <div class="dt-empty">
                <span class="dt-empty-icon">🔒</span>
                <p class="dt-empty-text">Connectez-vous pour voir votre inventaire</p>
            </div>
        `;
        return;
    }

    // Show loading
    if (!inventoryDataTable) {
        container.innerHTML = `
            <div class="market-loading">
                <div class="loading-spinner"></div>
                <p>Chargement de l'inventaire...</p>
            </div>
        `;
    }

    try {
        // Load inventory, my listings, and workers V2 in parallel
        const [invResponse, listingsResponse, workersResponse] = await Promise.all([
            authFetch(`${API_BASE}/inventory/overview`),
            authFetch(`${API_BASE}/inventory/my-listings`),
            authFetch(`${API_BASE}/workers/v2/all`)
        ]);

        // Handle my-listings response
        let myListings = [];
        if (listingsResponse.ok) {
            myListings = await listingsResponse.json();
        }

        // Handle workers V2 response
        let workersV2 = [];
        if (workersResponse.ok) {
            workersV2 = await workersResponse.json();
        }

        const response = invResponse;

        if (!response.ok) {
            if (response.status === 404) {
                inventoryData.overview = null;
                inventoryData.flatItems = [];
                if (inventoryDataTable) {
                    inventoryDataTable.setData([]);
                } else {
                    container.innerHTML = `
                        <div class="dt-empty">
                            <span class="dt-empty-icon">📦</span>
                            <p class="dt-empty-text">Aucun inventaire. Créez un entrepôt pour commencer.</p>
                        </div>
                    `;
                }
                return;
            }
            throw new Error('Failed to load inventory');
        }

        const data = await response.json();
        console.log('[INVENTORY] Loaded:', data);
        console.log('[INVENTORY] My listings:', myListings);

        inventoryData.overview = data;
        inventoryData.myListings = myListings;

        // Flatten inventory items (not for sale)
        const inventoryItems = flattenInventoryData(data);

        // Convert my listings to flat items format
        const listingItems = myListings.map(listing => ({
            item_id: listing.item_id,
            item_name: listing.item_name,
            tier: listing.item_tier,
            qty: listing.sale_qty,
            weight_kg: 0, // Not tracked for listings
            value: parseFloat(listing.sale_price) * listing.sale_qty,
            airport_ident: listing.airport_ident,
            airport_name: listing.airport_ident,
            container_id: listing.location_id,
            container_name: `En Vente - ${listing.airport_ident}`,
            container_type: 'for_sale',
            container_owner: listing.company_name,
            for_sale: true,
            sale_price: parseFloat(listing.sale_price)
        }));

        // Convert workers V2 to flat items format
        const workerItems = workersV2.map(worker => {
            // Determine container based on status
            let containerName, containerType;
            if (worker.factory_id) {
                containerName = `Usine - ${worker.airport_ident}`;
                containerType = 'factory';
            } else {
                containerName = `Workers - ${worker.airport_ident}`;
                containerType = 'worker_inventory';
            }

            return {
                item_id: worker.id, // Worker instance ID
                item_name: worker.item_name || `Worker-${worker.country_code}`,
                tier: worker.tier,
                qty: 1, // Each worker is unique
                weight_kg: 0,
                value: parseFloat(worker.hourly_salary) * 24, // Daily salary as "value"
                airport_ident: worker.airport_ident,
                airport_name: worker.airport_ident,
                container_id: worker.factory_id || worker.id,
                container_name: containerName,
                container_type: containerType,
                container_owner: 'Company',
                for_sale: false,
                is_worker: true, // Flag for special rendering
                worker_data: worker // Keep full worker data
            };
        });

        inventoryData.flatItems = [...inventoryItems, ...listingItems, ...workerItems];
        inventoryData.workersV2 = workersV2; // Keep raw data

        updateInventorySubtitle(data, myListings, workersV2);

        // Initialize or update DataTable
        if (!inventoryDataTable) {
            inventoryDataTable = createInventoryDataTable(inventoryData.flatItems);
        } else {
            inventoryDataTable.setData(inventoryData.flatItems);
        }

    } catch (error) {
        console.error('[INVENTORY] Error:', error);
        container.innerHTML = `
            <div class="dt-empty">
                <span class="dt-empty-icon">⚠️</span>
                <p class="dt-empty-text">Erreur de chargement de l'inventaire</p>
            </div>
        `;
    }
}

// Update inventory subtitle stats
function updateInventorySubtitle(data, listings = [], workers = []) {
    const totalItems = data.total_items || 0;
    const totalValue = parseFloat(data.total_value) || 0;
    const airportCount = data.locations?.length || 0;
    const listingsCount = listings.length;
    const workersCount = workers.length;

    let subtitle = `${totalItems} items | ${formatMoney(totalValue)} | ${airportCount} aéroport${airportCount > 1 ? 's' : ''}`;
    if (workersCount > 0) {
        subtitle += ` | ${workersCount} worker${workersCount > 1 ? 's' : ''}`;
    }
    if (listingsCount > 0) {
        subtitle += ` | ${listingsCount} en vente`;
    }
    document.getElementById('inv-subtitle').textContent = subtitle;
}

// Flatten inventory data for DataTable
function flattenInventoryData(data) {
    const items = [];

    if (!data || !data.locations) return items;

    data.locations.forEach(airport => {
        const containers = airport.containers || [];

        containers.forEach(container => {
            const containerItems = container.items || [];

            // Generate clean container name based on type
            let containerName;
            switch (container.type) {
                case 'player_warehouse':
                    containerName = `Stock Perso - ${airport.airport_ident}`;
                    break;
                case 'company_warehouse':
                    containerName = `Stock Company - ${airport.airport_ident}`;
                    break;
                case 'aircraft':
                    containerName = container.name || `Avion - ${airport.airport_ident}`;
                    break;
                case 'factory_storage':
                    containerName = container.name || `Usine - ${airport.airport_ident}`;
                    break;
                default:
                    containerName = container.name || container.type;
            }

            containerItems.forEach(item => {
                items.push({
                    // Item info
                    item_id: item.item_id,
                    item_name: item.item_name,
                    tier: item.tier,
                    qty: item.qty,
                    weight_kg: parseFloat(item.total_weight_kg) || 0,
                    value: parseFloat(item.total_value) || 0,

                    // Location info
                    airport_ident: airport.airport_ident,
                    airport_name: airport.airport_name,

                    // Container info
                    container_id: container.id,
                    container_name: containerName,
                    container_type: container.type,
                    container_owner: container.owner_name
                });
            });
        });
    });

    return items;
}

// Create Inventory DataTable
function createInventoryDataTable(data) {
    return createDataTable({
        containerId: 'inventory-datatable',
        data: data,
        columns: [
            {
                key: 'item_name',
                label: 'Item',
                sortable: true,
                render: (value, row) => {
                    // Special rendering for workers
                    if (row.is_worker && row.worker_data) {
                        const flag = getCountryFlag(row.worker_data.country_code);
                        const statusIcon = row.worker_data.status === 'working' ? '🔧' :
                                          row.worker_data.status === 'injured' ? '🤕' :
                                          row.worker_data.status === 'available' ? '✅' : '⚫';
                        return `<span class="dt-item-name"><span class="dt-item-icon">${flag}</span> ${value} <span class="worker-status">${statusIcon}</span></span>`;
                    }
                    const icon = getItemEmoji(value);
                    return `<span class="dt-item-name"><span class="dt-item-icon">${icon}</span> ${value}</span>`;
                }
            },
            {
                key: 'tier',
                label: 'Tier',
                sortable: true,
                width: '60px',
                render: (value) => `<span class="dt-tier tier-t${value}">T${value}</span>`
            },
            {
                key: 'qty',
                label: 'Qté',
                sortable: true,
                width: '60px'
            },
            {
                key: 'airport_ident',
                label: 'Lieu',
                sortable: true,
                width: '80px',
                render: (value) => `<span>📍 ${value}</span>`
            },
            {
                key: 'container_name',
                label: 'Conteneur',
                sortable: true,
                render: (value, row) => {
                    const icon = getContainerIcon(row.container_type);
                    return `<span>${icon} ${value}</span>`;
                }
            },
            {
                key: 'weight_kg',
                label: 'Poids',
                sortable: true,
                width: '80px',
                render: (value) => `${value.toFixed(0)} kg`
            },
            {
                key: 'value',
                label: 'Valeur',
                sortable: true,
                width: '90px',
                render: (value, row) => {
                    // Special rendering for workers - show stats instead of value
                    if (row.is_worker && row.worker_data) {
                        const w = row.worker_data;
                        return `<span class="worker-stats-mini" title="Speed: ${w.speed}, Resistance: ${w.resistance}">⚡${w.speed} 🛡️${w.resistance}</span>`;
                    }
                    return `<span class="dt-price">${formatMoney(value)}</span>`;
                }
            }
        ],
        actions: [
            {
                label: 'Transférer',
                icon: '↗️',
                show: (row) => !row.for_sale && !row.is_worker,
                onClick: (row) => openTransferModalForItem(row.container_id, row.item_id, row.qty, row.item_name, row.airport_ident)
            },
            {
                label: 'Vendre',
                icon: '💰',
                className: 'btn-primary',
                show: (row) => !row.for_sale && !row.is_worker,
                onClick: (row) => openSellModal(row)
            },
            {
                label: 'Annuler',
                icon: '❌',
                className: 'btn-danger',
                show: (row) => row.for_sale,
                onClick: (row) => cancelSale(row)
            }
        ],
        filters: {
            search: true,
            searchKeys: ['item_name', 'container_name'],
            icao: true,
            icaoKey: 'airport_ident',
            chips: [
                {
                    key: 'tier',
                    label: 'Tier',
                    values: [
                        { value: 0, label: 'T0' },
                        { value: 1, label: 'T1' },
                        { value: 2, label: 'T2' },
                        { value: 3, label: 'T3' },
                        { value: 4, label: 'T4' },
                        { value: 5, label: 'T5' }
                    ]
                },
                {
                    key: 'container_type',
                    label: 'Type',
                    values: [
                        { value: 'player_warehouse', label: '👤 Perso' },
                        { value: 'company_warehouse', label: '🏢 Company' },
                        { value: 'aircraft', label: '✈️ Avion' },
                        { value: 'factory_storage', label: '🏭 Usine' },
                        { value: 'worker_inventory', label: '👷 Workers' },
                        { value: 'factory', label: '🔧 En Travail' },
                        { value: 'for_sale', label: '🏷️ En Vente' }
                    ]
                }
            ]
        },
        pagination: true,
        pageSize: 25,
        emptyMessage: 'Aucun item en inventaire',
        emptyIcon: '📦'
    });
}

// ========================================
// SELL MODAL
// ========================================

// Current item being sold
let pendingSellItem = null;

function openSellModal(item) {
    if (!state.token || state.token === 'demo-token') {
        showToast('Connectez-vous pour vendre', 'warning');
        return;
    }

    pendingSellItem = item;

    // Update modal content
    const icon = getItemEmoji(item.item_name);
    document.getElementById('sell-item-icon').textContent = icon;
    document.getElementById('sell-item-name').textContent = item.item_name;
    document.getElementById('sell-item-tier').textContent = `T${item.tier}`;

    document.getElementById('sell-available-qty').textContent = item.qty;
    document.getElementById('sell-location').textContent = item.airport_ident;
    document.getElementById('sell-container').textContent = `${getContainerIcon(item.container_type)} ${item.container_name}`;

    document.getElementById('sell-qty').value = 1;
    document.getElementById('sell-qty').max = item.qty;
    document.getElementById('sell-price').value = 10;

    updateSellTotal();

    document.getElementById('market-sell-error').classList.remove('visible');
    document.getElementById('modal-market-sell').classList.add('active');
}

function closeSellModal() {
    document.getElementById('modal-market-sell').classList.remove('active');
    pendingSellItem = null;
}

function setSellMax() {
    if (pendingSellItem) {
        document.getElementById('sell-qty').value = pendingSellItem.qty;
        updateSellTotal();
    }
}

function updateSellTotal() {
    const qty = parseInt(document.getElementById('sell-qty').value) || 0;
    const price = parseFloat(document.getElementById('sell-price').value) || 0;
    const total = qty * price;

    document.getElementById('sell-total').textContent = formatMoney(total);
}

async function confirmMarketSell() {
    if (!pendingSellItem) return;

    const qty = parseInt(document.getElementById('sell-qty').value);
    const price = parseFloat(document.getElementById('sell-price').value);
    const errorEl = document.getElementById('market-sell-error');
    const btn = document.getElementById('btn-confirm-sell');

    if (!qty || qty < 1) {
        errorEl.textContent = 'Quantité invalide';
        errorEl.classList.add('visible');
        return;
    }

    if (qty > pendingSellItem.qty) {
        errorEl.textContent = `Quantité max: ${pendingSellItem.qty}`;
        errorEl.classList.add('visible');
        return;
    }

    if (!price || price < 1) {
        errorEl.textContent = 'Prix invalide (min: 1$)';
        errorEl.classList.add('visible');
        return;
    }

    btn.classList.add('loading');
    btn.textContent = 'MISE EN VENTE...';
    errorEl.classList.remove('visible');

    try {
        const response = await fetch(`${API_BASE}/inventory/set-for-sale`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                location_id: pendingSellItem.container_id,
                item_code: pendingSellItem.item_name,
                for_sale: true,
                sale_price: price,
                sale_qty: qty
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur lors de la mise en vente');
        }

        showToast(`${qty}× ${pendingSellItem.item_name} mis en vente à ${formatMoney(price)}/unité`, 'success');
        closeSellModal();

        // Refresh inventory
        await refreshInventory();

    } catch (error) {
        console.error('[SELL] Error:', error);
        errorEl.textContent = error.message;
        errorEl.classList.add('visible');
    } finally {
        btn.classList.remove('loading');
        btn.textContent = 'METTRE EN VENTE';
    }
}

// Filter inventory type (legacy - kept for compatibility)
function filterInventory() {
    inventoryData.currentFilter = document.getElementById('inv-type-filter').value;
    renderInventoryAirportGroups();
}

// Toggle airport group expand/collapse
function toggleAirportGroup(ident) {
    inventoryData.expandedAirports[ident] = !inventoryData.expandedAirports[ident];
    renderInventoryAirportGroups();
}

// Render inventory grouped by airport
function renderInventoryAirportGroups() {
    const container = document.getElementById('inventory-airports');
    const emptyState = document.getElementById('inventory-empty-state');

    if (!inventoryData.overview || !inventoryData.overview.locations || inventoryData.overview.locations.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    container.style.display = 'block';
    emptyState.style.display = 'none';

    let html = '';

    inventoryData.overview.locations.forEach(airport => {
        // Filter containers by type
        let containers = airport.containers || [];
        if (inventoryData.currentFilter !== 'all') {
            containers = containers.filter(c => c.type === inventoryData.currentFilter);
        }

        // Filter by search query
        if (inventoryData.searchQuery) {
            containers = containers.filter(c => {
                // Check container name
                if (c.name && c.name.toLowerCase().includes(inventoryData.searchQuery)) return true;
                // Check items
                return c.items && c.items.some(item =>
                    item.item_name && item.item_name.toLowerCase().includes(inventoryData.searchQuery)
                );
            });
        }

        if (containers.length === 0) return;

        const isExpanded = inventoryData.expandedAirports[airport.airport_ident];
        const totalItems = containers.reduce((sum, c) => sum + (c.total_items || 0), 0);
        const totalValue = containers.reduce((sum, c) => sum + parseFloat(c.total_value || 0), 0);

        html += `
            <div class="inv-airport-group ${isExpanded ? 'expanded' : ''}">
                <div class="inv-airport-header" onclick="toggleAirportGroup('${airport.airport_ident}')">
                    <span class="inv-airport-toggle">${isExpanded ? '▼' : '▶'}</span>
                    <span class="inv-airport-icon">📍</span>
                    <span class="inv-airport-name">${airport.airport_ident}</span>
                    <span class="inv-airport-fullname">${airport.airport_name || ''}</span>
                    <span class="inv-airport-stats">${containers.length} conteneur${containers.length > 1 ? 's' : ''} | ${totalItems} items | ${formatMoney(totalValue)}</span>
                </div>
                <div class="inv-airport-content" style="display: ${isExpanded ? 'grid' : 'none'};">
                    ${containers.map(c => renderInventoryContainerCard(c, airport.airport_ident)).join('')}
                </div>
            </div>
        `;
    });

    if (!html) {
        container.innerHTML = '<div class="inventory-no-results">Aucun résultat pour ces filtres</div>';
    } else {
        container.innerHTML = html;
    }

    // Setup drag and drop
    setupDragAndDrop();
}

// Render a single container card
function renderInventoryContainerCard(container, airportIdent) {
    const containerClass = getContainerClass(container.type);
    const containerIcon = getContainerIcon(container.type);
    const items = container.items || [];

    // Preview first 3 items
    const previewItems = items.slice(0, 3);
    let itemsPreviewHtml = '';

    if (items.length === 0) {
        itemsPreviewHtml = '<div class="inv-container-empty">📦 Vide</div>';
    } else {
        itemsPreviewHtml = previewItems.map(item => {
            const emoji = getItemEmoji(item.item_name);
            return `<div class="inv-item-preview">${emoji} ${item.item_name} ×${item.qty}</div>`;
        }).join('');

        if (items.length > 3) {
            itemsPreviewHtml += `<div class="inv-item-more">+${items.length - 3} autres...</div>`;
        }
    }

    // Cargo bar for aircraft
    let cargoBarHtml = '';
    if (container.type === 'aircraft' && container.cargo_capacity_kg) {
        const currentWeight = items.reduce((sum, item) => sum + parseFloat(item.total_weight_kg || 0), 0);
        const capacity = parseFloat(container.cargo_capacity_kg);
        const percent = capacity > 0 ? (currentWeight / capacity) * 100 : 0;
        const barClass = percent > 90 ? 'danger' : (percent > 70 ? 'warning' : '');

        cargoBarHtml = `
            <div class="inv-cargo-bar">
                <div class="inv-cargo-bar-fill ${barClass}" style="width: ${Math.min(percent, 100)}%"></div>
            </div>
            <div class="inv-cargo-text">${currentWeight.toFixed(0)}/${capacity}kg</div>
        `;
    }

    return `
        <div class="inv-container-card ${containerClass}" data-container-id="${container.id}" data-airport="${airportIdent}">
            <div class="inv-container-header">
                <span class="inv-container-icon">${containerIcon}</span>
                <div class="inv-container-info">
                    <div class="inv-container-name">${container.name || container.type}</div>
                    <div class="inv-container-owner">${container.owner_name || ''}</div>
                </div>
            </div>
            <div class="inv-container-items" data-location-id="${container.id}"
                 ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
                ${itemsPreviewHtml}
            </div>
            ${cargoBarHtml}
            <div class="inv-container-footer">
                <span class="inv-container-value">${formatMoney(parseFloat(container.total_value || 0))}</span>
                <div class="inv-container-actions">
                    <button class="btn btn-small btn-secondary" onclick="openInventoryDetailModal('${container.id}', '${airportIdent}')">Voir</button>
                    <button class="btn btn-small" onclick="openTransferFromContainer('${container.id}', '${airportIdent}')">🔄</button>
                </div>
            </div>
        </div>
    `;
}

// Get item emoji from name
function getItemEmoji(name) {
    if (!name) return '📦';
    const lowerName = name.toLowerCase();

    const emojiMap = {
        'blé': '🌾', 'wheat': '🌾', 'ble': '🌾',
        'lait': '🥛', 'milk': '🥛',
        'boeuf': '🥩', 'beef': '🥩', 'viande': '🥩',
        'fromage': '🧀', 'cheese': '🧀',
        'pain': '🍞', 'bread': '🍞',
        'vin': '🍷', 'wine': '🍷',
        'poisson': '🐟', 'fish': '🐟',
        'fruit': '🍎', 'fruits': '🍎',
        'légume': '🥬', 'legume': '🥬', 'vegetables': '🥬',
        'pétrole': '🛢️', 'petrole': '🛢️', 'oil': '🛢️',
        'carburant': '⛽', 'fuel': '⛽',
        'fer': '🪨', 'iron': '🪨',
        'acier': '🔩', 'steel': '🔩',
        'bois': '🪵', 'wood': '🪵',
        'charbon': '�ite', 'coal': '🪨',
        'électronique': '📱', 'electronics': '📱',
        'textile': '🧶', 'fabric': '🧶',
        'plastique': '🧪', 'plastic': '🧪'
    };

    for (const [key, emoji] of Object.entries(emojiMap)) {
        if (lowerName.includes(key)) return emoji;
    }
    return '📦';
}

// Get container class based on type
function getContainerClass(type) {
    const classes = {
        'player_warehouse': 'player-warehouse',
        'company_warehouse': 'company-warehouse',
        'factory_storage': 'factory-storage',
        'aircraft': 'aircraft'
    };
    return classes[type] || '';
}

// Get container icon based on type
function getContainerIcon(type) {
    const icons = {
        'player_warehouse': '👤',
        'company_warehouse': '🏢',
        'factory_storage': '🏭',
        'aircraft': '✈️',
        'for_sale': '🏷️',
        'worker_inventory': '👷',
        'factory': '🔧'
    };
    return icons[type] || '📦';
}

// Cancel a sale and return items to inventory
async function cancelSale(item) {
    if (!state.token || state.token === 'demo-token') {
        showToast('Connectez-vous pour annuler la vente', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/inventory/set-for-sale`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                location_id: item.container_id,
                item_code: item.item_name,
                for_sale: false,
                sale_price: 0,
                sale_qty: 0
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur lors de l\'annulation');
        }

        showToast(`Vente annulée: ${item.qty}× ${item.item_name} retournés en inventaire`, 'success');

        // Refresh inventory
        await refreshInventory();

    } catch (error) {
        console.error('[CANCEL SALE] Error:', error);
        showToast(error.message, 'error');
    }
}

// ========================================
// DATATABLE - COMPOSANT GÉNÉRIQUE
// ========================================

/**
 * DataTable - Composant tableau générique réutilisable
 *
 * @param {Object} config - Configuration du tableau
 * @param {string} config.containerId - ID du conteneur HTML
 * @param {Array} config.columns - Définition des colonnes
 *   - key: string - Clé de la propriété dans data
 *   - label: string - Label affiché dans le header
 *   - sortable: boolean - Si triable (défaut: true)
 *   - render: function(value, row) - Rendu personnalisé (optionnel)
 *   - width: string - Largeur CSS (optionnel)
 * @param {Array} config.data - Données à afficher
 * @param {Array} config.actions - Actions par ligne (optionnel)
 *   - label: string - Texte du bouton
 *   - icon: string - Emoji/icône
 *   - onClick: function(row) - Handler du clic
 *   - className: string - Classes CSS additionnelles
 * @param {Object} config.filters - Configuration des filtres (optionnel)
 *   - search: boolean - Activer la recherche
 *   - searchKeys: Array<string> - Clés à chercher
 *   - icao: boolean - Activer le filtre ICAO
 *   - icaoKey: string - Clé du champ ICAO (ex: 'airport_ident')
 *   - chips: Array - Filtres par chips {key, label, values: [{value, label}]}
 * @param {boolean} config.pagination - Activer la pagination (défaut: false)
 * @param {number} config.pageSize - Nombre d'items par page (défaut: 50)
 * @param {string} config.emptyMessage - Message si pas de données
 * @param {string} config.emptyIcon - Icône si pas de données
 */
class DataTable {
    constructor(config) {
        this.containerId = config.containerId;
        this.columns = config.columns || [];
        this.data = config.data || [];
        this.actions = config.actions || [];
        this.filters = config.filters || {};
        this.pagination = config.pagination || false;
        this.pageSize = config.pageSize || 50;
        this.emptyMessage = config.emptyMessage || 'Aucune donnée';
        this.emptyIcon = config.emptyIcon || '📭';
        this.onRowClick = config.onRowClick || null;

        // État interne
        this.sortKey = null;
        this.sortDirection = 'asc';
        this.searchValue = '';
        this.icaoValue = '';
        this.activeFilters = {};
        this.currentPage = 0;
        this.filteredData = [...this.data];

        // Initialisation
        this._init();
    }

    _init() {
        this.render();
    }

    // Mise à jour des données
    setData(data) {
        this.data = data || [];
        this.currentPage = 0;
        this._applyFiltersAndSort();
        this.render();
    }

    // Tri
    sort(key) {
        if (this.sortKey === key) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortKey = key;
            this.sortDirection = 'asc';
        }
        this._applyFiltersAndSort();
        this._updateTableContent();
    }

    // Recherche (mise à jour partielle pour garder le focus)
    search(value) {
        this.searchValue = value.toLowerCase();
        this.currentPage = 0;
        this._applyFiltersAndSort();
        this._updateTableContent();
    }

    // Filtre ICAO (mise à jour partielle pour garder le focus)
    filterIcao(value) {
        this.icaoValue = value.toUpperCase();
        this.currentPage = 0;
        this._applyFiltersAndSort();
        this._updateTableContent();
    }

    // Filtre par chips
    setFilter(key, value) {
        if (value === '' || value === 'all') {
            delete this.activeFilters[key];
        } else {
            this.activeFilters[key] = value;
        }
        this.currentPage = 0;
        this._applyFiltersAndSort();
        this._updateTableContent();
    }

    // Pagination
    nextPage() {
        const maxPage = Math.ceil(this.filteredData.length / this.pageSize) - 1;
        if (this.currentPage < maxPage) {
            this.currentPage++;
            this._updateTableContent();
        }
    }

    prevPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this._updateTableContent();
        }
    }

    // Appliquer filtres et tri
    _applyFiltersAndSort() {
        let result = [...this.data];

        // Recherche
        if (this.searchValue && this.filters.searchKeys) {
            result = result.filter(row => {
                return this.filters.searchKeys.some(key => {
                    const value = this._getNestedValue(row, key);
                    return value && String(value).toLowerCase().includes(this.searchValue);
                });
            });
        }

        // Filtre ICAO
        if (this.icaoValue && this.filters.icaoKey) {
            result = result.filter(row => {
                const value = this._getNestedValue(row, this.filters.icaoKey);
                return value && String(value).toUpperCase().includes(this.icaoValue);
            });
        }

        // Filtres chips
        for (const [key, value] of Object.entries(this.activeFilters)) {
            result = result.filter(row => {
                const rowValue = this._getNestedValue(row, key);
                return String(rowValue) === String(value);
            });
        }

        // Tri
        if (this.sortKey) {
            result.sort((a, b) => {
                const aVal = this._getNestedValue(a, this.sortKey);
                const bVal = this._getNestedValue(b, this.sortKey);

                // Tri numérique si possible
                const aNum = parseFloat(aVal);
                const bNum = parseFloat(bVal);

                let comparison = 0;
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    comparison = aNum - bNum;
                } else {
                    comparison = String(aVal).localeCompare(String(bVal));
                }

                return this.sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        this.filteredData = result;
    }

    // Récupérer valeur imbriquée (ex: "item.name")
    _getNestedValue(obj, key) {
        return key.split('.').reduce((o, k) => (o || {})[k], obj);
    }

    // Rendu HTML complet (initial)
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const paginatedData = this._getPaginatedData();

        container.innerHTML = `
            ${this._renderToolbar()}
            <div class="dt-content">
                ${paginatedData.length > 0
                    ? this._renderTable(paginatedData)
                    : this._renderEmpty()}
            </div>
            ${this.pagination ? `<div class="dt-pagination-wrapper">${this._renderPagination()}</div>` : ''}
        `;

        this._attachEvents();
    }

    // Mise à jour partielle (garde le focus sur la recherche)
    _updateTableContent() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const paginatedData = this._getPaginatedData();

        // Mettre à jour le contenu du tableau (tbody ou empty state)
        const contentEl = container.querySelector('.dt-content');
        if (contentEl) {
            contentEl.innerHTML = paginatedData.length > 0
                ? this._renderTable(paginatedData)
                : this._renderEmpty();
        }

        // Mettre à jour la pagination
        const paginationWrapper = container.querySelector('.dt-pagination-wrapper');
        if (paginationWrapper && this.pagination) {
            paginationWrapper.innerHTML = this._renderPagination();
        }

        // Mettre à jour les états actifs des chips
        container.querySelectorAll('[data-dt-filter]').forEach(btn => {
            const key = btn.dataset.dtFilter;
            const value = btn.dataset.dtValue;
            const isActive = value === ''
                ? !this.activeFilters[key]
                : this.activeFilters[key] === value;
            btn.classList.toggle('active', isActive);
        });

        // Mettre à jour les indicateurs de tri
        container.querySelectorAll('[data-dt-sort]').forEach(th => {
            const key = th.dataset.dtSort;
            th.classList.toggle('dt-sorted', this.sortKey === key);
            const icon = th.querySelector('.dt-sort-icon');
            if (icon) {
                icon.textContent = this.sortKey === key
                    ? (this.sortDirection === 'asc' ? '▲' : '▼')
                    : '';
            }
        });

        // Réattacher les événements dynamiques (pas la recherche)
        this._attachDynamicEvents();
    }

    // Barre d'outils (recherche + filtres)
    _renderToolbar() {
        if (!this.filters.search && !this.filters.icao && !this.filters.chips?.length) return '';

        return `
            <div class="dt-toolbar">
                ${this.filters.search ? `
                    <div class="dt-search">
                        <span class="dt-search-icon">🔍</span>
                        <input type="text"
                               class="dt-search-input"
                               placeholder="Rechercher..."
                               value="${this.searchValue}"
                               data-dt-search>
                    </div>
                ` : ''}
                ${this.filters.icao ? `
                    <div class="dt-search dt-icao">
                        <span class="dt-search-icon">📍</span>
                        <input type="text"
                               class="dt-search-input"
                               placeholder="ICAO..."
                               value="${this.icaoValue}"
                               maxlength="4"
                               style="text-transform: uppercase; width: 80px;"
                               data-dt-icao>
                    </div>
                ` : ''}
                ${this.filters.chips?.length ? `
                    <div class="dt-filters">
                        ${this.filters.chips.map(chip => `
                            <div class="dt-filter-group">
                                <span class="dt-filter-label">${chip.label}:</span>
                                <div class="dt-filter-chips">
                                    <button class="dt-chip ${!this.activeFilters[chip.key] ? 'active' : ''}"
                                            data-dt-filter="${chip.key}" data-dt-value="">
                                        Tous
                                    </button>
                                    ${chip.values.map(v => `
                                        <button class="dt-chip ${this.activeFilters[chip.key] === String(v.value) ? 'active' : ''}"
                                                data-dt-filter="${chip.key}" data-dt-value="${v.value}">
                                            ${v.label}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Tableau
    _renderTable(data) {
        return `
            <div class="dt-table-wrapper">
                <table class="dt-table">
                    <thead>
                        <tr>
                            ${this.columns.map(col => `
                                <th class="${col.sortable !== false ? 'dt-sortable' : ''} ${this.sortKey === col.key ? 'dt-sorted' : ''}"
                                    style="${col.width ? `width: ${col.width}` : ''}"
                                    ${col.sortable !== false ? `data-dt-sort="${col.key}"` : ''}>
                                    ${col.label}
                                    ${col.sortable !== false ? `
                                        <span class="dt-sort-icon">
                                            ${this.sortKey === col.key
                                                ? (this.sortDirection === 'asc' ? '▲' : '▼')
                                                : ''}
                                        </span>
                                    ` : ''}
                                </th>
                            `).join('')}
                            ${this.actions.length > 0 ? '<th class="dt-actions-header">Actions</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((row, idx) => `
                            <tr class="dt-row ${this.onRowClick ? 'dt-clickable' : ''}"
                                data-dt-row-idx="${idx}">
                                ${this.columns.map(col => `
                                    <td>
                                        ${col.render
                                            ? col.render(this._getNestedValue(row, col.key), row)
                                            : this._getNestedValue(row, col.key) ?? '-'}
                                    </td>
                                `).join('')}
                                ${this.actions.length > 0 ? `
                                    <td class="dt-actions">
                                        ${this.actions.map((action, actionIdx) => {
                                            // Check if action should be shown
                                            if (action.show && !action.show(row)) {
                                                return '';
                                            }
                                            return `
                                            <button class="dt-action-btn ${action.className || ''}"
                                                    data-dt-action="${actionIdx}"
                                                    data-dt-row-idx="${idx}"
                                                    title="${action.label}">
                                                ${action.icon || action.label}
                                            </button>
                                        `;
                                        }).join('')}
                                    </td>
                                ` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // État vide
    _renderEmpty() {
        return `
            <div class="dt-empty">
                <span class="dt-empty-icon">${this.emptyIcon}</span>
                <p class="dt-empty-text">${this.emptyMessage}</p>
            </div>
        `;
    }

    // Pagination
    _renderPagination() {
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        const start = this.currentPage * this.pageSize + 1;
        const end = Math.min((this.currentPage + 1) * this.pageSize, this.filteredData.length);

        return `
            <div class="dt-pagination">
                <button class="dt-page-btn" data-dt-page="prev" ${this.currentPage === 0 ? 'disabled' : ''}>
                    ◀ Préc
                </button>
                <span class="dt-page-info">
                    ${this.filteredData.length > 0 ? `${start}-${end} sur ${this.filteredData.length}` : '0 résultat'}
                </span>
                <button class="dt-page-btn" data-dt-page="next" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''}>
                    Suiv ▶
                </button>
            </div>
        `;
    }

    // Attachement de tous les événements (initial)
    _attachEvents() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Recherche (attaché une seule fois, ne change pas)
        const searchInput = container.querySelector('[data-dt-search]');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.search(e.target.value));
        }

        // ICAO (attaché une seule fois, ne change pas)
        const icaoInput = container.querySelector('[data-dt-icao]');
        if (icaoInput) {
            icaoInput.addEventListener('input', (e) => this.filterIcao(e.target.value));
        }

        // Événements dynamiques
        this._attachDynamicEvents();
    }

    // Événements dynamiques (réattachés après mise à jour du contenu)
    _attachDynamicEvents() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Tri
        container.querySelectorAll('[data-dt-sort]').forEach(th => {
            th.onclick = () => this.sort(th.dataset.dtSort);
        });

        // Filtres chips
        container.querySelectorAll('[data-dt-filter]').forEach(btn => {
            btn.onclick = () => this.setFilter(btn.dataset.dtFilter, btn.dataset.dtValue);
        });

        // Actions
        container.querySelectorAll('[data-dt-action]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const actionIdx = parseInt(btn.dataset.dtAction);
                const rowIdx = parseInt(btn.dataset.dtRowIdx);
                const row = this._getPaginatedData()[rowIdx];
                if (this.actions[actionIdx]?.onClick) {
                    this.actions[actionIdx].onClick(row);
                }
            };
        });

        // Clic ligne
        if (this.onRowClick) {
            container.querySelectorAll('.dt-row').forEach(tr => {
                tr.onclick = () => {
                    const rowIdx = parseInt(tr.dataset.dtRowIdx);
                    const row = this._getPaginatedData()[rowIdx];
                    this.onRowClick(row);
                };
            });
        }

        // Pagination
        container.querySelectorAll('[data-dt-page]').forEach(btn => {
            btn.onclick = () => {
                if (btn.dataset.dtPage === 'prev') this.prevPage();
                if (btn.dataset.dtPage === 'next') this.nextPage();
            };
        });
    }

    _getPaginatedData() {
        return this.pagination
            ? this.filteredData.slice(
                this.currentPage * this.pageSize,
                (this.currentPage + 1) * this.pageSize
              )
            : this.filteredData;
    }
}

// Factory function pour créer un DataTable
function createDataTable(config) {
    return new DataTable(config);
}

// Show empty inventory state
function showEmptyInventoryState() {
    const airports = document.getElementById('inventory-airports');
    if (airports) airports.style.display = 'none';
    document.getElementById('inventory-empty-state').style.display = 'block';
}

// ========================================
// INVENTORY DETAIL MODAL
// ========================================

function openInventoryDetailModal(containerId, airportIdent) {
    // Find the container in our data
    let container = null;
    if (inventoryData.overview && inventoryData.overview.locations) {
        for (const airport of inventoryData.overview.locations) {
            if (airport.airport_ident === airportIdent) {
                container = airport.containers.find(c => c.id === containerId);
                break;
            }
        }
    }

    if (!container) {
        showToast('Conteneur introuvable', 'error');
        return;
    }

    inventoryData.currentDetailContainer = { container, airportIdent };

    // Update modal content
    document.getElementById('detail-container-title').textContent = container.name || container.type;
    document.getElementById('detail-container-type').textContent = getContainerIcon(container.type) + ' ' + (container.type || '-');
    document.getElementById('detail-container-airport').textContent = airportIdent;
    document.getElementById('detail-container-value').textContent = formatMoney(parseFloat(container.total_value || 0));

    const items = container.items || [];
    const tbody = document.getElementById('detail-items-body');
    const emptyEl = document.getElementById('detail-empty');
    const tableEl = document.getElementById('detail-items-table');

    if (items.length === 0) {
        tableEl.style.display = 'none';
        emptyEl.style.display = 'block';
    } else {
        tableEl.style.display = 'block';
        emptyEl.style.display = 'none';

        tbody.innerHTML = items.map(item => {
            const emoji = getItemEmoji(item.item_name);
            return `
                <tr>
                    <td>${emoji} ${item.item_name}</td>
                    <td>T${item.tier}</td>
                    <td>${item.qty}</td>
                    <td>${item.total_weight_kg}kg</td>
                    <td>${formatMoney(parseFloat(item.total_value || 0))}</td>
                    <td>
                        <button class="btn btn-small" onclick="openTransferModalForItem('${containerId}', '${item.item_id}', ${item.qty}, '${item.item_name}', '${airportIdent}')">
                            🔄
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('modal-inventory-detail').classList.add('active');
}

function closeInventoryDetailModal() {
    document.getElementById('modal-inventory-detail').classList.remove('active');
    inventoryData.currentDetailContainer = null;
}

// Open transfer from container button
function openTransferFromContainer(containerId, airportIdent) {
    // Find container and first item
    let container = null;
    if (inventoryData.overview && inventoryData.overview.locations) {
        for (const airport of inventoryData.overview.locations) {
            if (airport.airport_ident === airportIdent) {
                container = airport.containers.find(c => c.id === containerId);
                break;
            }
        }
    }

    if (!container || !container.items || container.items.length === 0) {
        showToast('Aucun item à transférer', 'warning');
        return;
    }

    // Open detail modal to select which item to transfer
    openInventoryDetailModal(containerId, airportIdent);
}

// Open transfer modal for a specific item
function openTransferModalForItem(fromContainerId, itemId, maxQty, itemName, airportIdent) {
    // Find other containers at the same airport
    let destinations = [];
    if (inventoryData.overview && inventoryData.overview.locations) {
        for (const airport of inventoryData.overview.locations) {
            if (airport.airport_ident === airportIdent) {
                destinations = airport.containers.filter(c => c.id !== fromContainerId);
                break;
            }
        }
    }

    if (destinations.length === 0) {
        showToast('Aucune destination disponible au même aéroport', 'warning');
        return;
    }

    // Use first destination as default
    openTransferModal(fromContainerId, destinations[0].id, itemId, maxQty, itemName);
}

// ========================================
// TRANSFER MODAL
// ========================================

let pendingTransfer = null;

// Helper to find a container by ID in the new overview structure
function findContainerById(containerId) {
    if (!inventoryData.overview || !inventoryData.overview.locations) return null;

    for (const airport of inventoryData.overview.locations) {
        const container = airport.containers.find(c => c.id === containerId);
        if (container) {
            return { ...container, airport_ident: airport.airport_ident };
        }
    }
    return null;
}

function openTransferModal(fromLocationId, toLocationId, itemId, maxQty, itemName) {
    console.log('[TRANSFER] Opening modal:', { fromLocationId, toLocationId, itemId, maxQty });

    const fromLocation = findContainerById(fromLocationId);
    const toLocation = findContainerById(toLocationId);

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
    document.getElementById('transfer-from-name').textContent = fromLocation.name || fromLocation.type;
    document.getElementById('transfer-from-type').textContent = fromLocation.type;
    document.getElementById('transfer-to-name').textContent = toLocation.name || toLocation.type;
    document.getElementById('transfer-to-type').textContent = toLocation.type;

    const emoji = getItemEmoji(itemName);
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
    const nameField = document.getElementById('warehouse-name');
    if (nameField) nameField.value = '';
    document.getElementById('warehouse-create-error').classList.remove('visible');
    document.getElementById('modal-create-warehouse').classList.add('active');
}

function closeCreateWarehouseModal() {
    document.getElementById('modal-create-warehouse').classList.remove('active');
}

async function submitCreateWarehouse() {
    const airport = document.getElementById('warehouse-airport').value.trim().toUpperCase();
    const name = document.getElementById('warehouse-name')?.value.trim() || '';
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

    // Build request body
    const body = { airport_ident: airport };
    if (name) body.name = name;

    try {
        const response = await fetch(`${API_BASE}/inventory/warehouse/player`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify(body)
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

// Instance globale du DataTable Market
let marketDataTable = null;

async function loadMarketView() {
    console.log('[MARKET] Loading market view...');

    // Load wallets and listings in parallel
    await Promise.all([
        loadWallets(),
        loadMarketListings()
    ]);
}

// Load user and company wallets
async function loadWallets() {
    // Reset wallets display (Market + Inventory)
    updateWalletDisplays('0$', '-', 'Pas de company');

    if (!state.token || state.token === 'demo-token') {
        return;
    }

    try {
        // Load user wallet
        const userResponse = await authFetch(`${API_BASE}/users/me`);

        if (userResponse.ok) {
            const userData = await userResponse.json();
            state.wallets.personal = parseFloat(userData.wallet) || 0;

            // If user has a company, load company balance
            if (userData.company_id) {
                state.wallets.companyId = userData.company_id;

                const companyResponse = await authFetch(`${API_BASE}/company/${userData.company_id}`);

                if (companyResponse.ok) {
                    const companyData = await companyResponse.json();
                    state.wallets.company = parseFloat(companyData.balance) || 0;
                    state.wallets.companyName = companyData.name;
                }
            }

            // Update all wallet displays
            updateWalletDisplays(
                formatMoney(state.wallets.personal),
                state.wallets.companyName ? formatMoney(state.wallets.company) : '-',
                state.wallets.companyName || 'Pas de company'
            );
        }
    } catch (error) {
        // Don't log error for session expiration (already handled by authFetch)
        if (!error.message.includes('Session expirée')) {
            console.error('[WALLETS] Error loading wallets:', error);
        }
    }
}

// Update wallet displays in both Market and Inventory views
function updateWalletDisplays(personalValue, companyValue, companyName) {
    // Market view
    const marketPersonal = document.getElementById('wallet-personal');
    const marketCompany = document.getElementById('wallet-company');
    const marketCompanyName = document.getElementById('wallet-company-name');
    if (marketPersonal) marketPersonal.textContent = personalValue;
    if (marketCompany) marketCompany.textContent = companyValue;
    if (marketCompanyName) marketCompanyName.textContent = companyName;

    // Inventory view
    const invPersonal = document.getElementById('inv-wallet-personal');
    const invCompany = document.getElementById('inv-wallet-company');
    const invCompanyName = document.getElementById('inv-wallet-company-name');
    if (invPersonal) invPersonal.textContent = personalValue;
    if (invCompany) invCompany.textContent = companyValue;
    if (invCompanyName) invCompanyName.textContent = companyName;
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
    const container = document.getElementById('market-datatable');

    // Show loading initially
    if (!marketDataTable) {
        container.innerHTML = `
            <div class="market-loading">
                <div class="loading-spinner"></div>
                <p>Chargement du marché...</p>
            </div>
        `;
    }

    try {
        // Fetch all listings (without pagination - DataTable handles it)
        const params = new URLSearchParams();
        params.append('limit', 1000); // Get all listings

        const url = `${API_BASE}/inventory/market?${params.toString()}`;

        const response = await fetch(url, {
            headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
        });

        if (!response.ok) {
            throw new Error('Failed to load market listings');
        }

        const listings = await response.json();
        state.market.listings = listings;

        // Initialize or update DataTable
        if (!marketDataTable) {
            marketDataTable = createMarketDataTable(listings);
        } else {
            marketDataTable.setData(listings);
        }

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

function createMarketDataTable(data) {
    return createDataTable({
        containerId: 'market-datatable',
        data: data,
        columns: [
            {
                key: 'item_name',
                label: 'Item',
                sortable: true,
                render: (value, row) => {
                    const icon = row.item_icon || getItemEmoji(value);
                    return `<span class="dt-item-name"><span class="dt-item-icon">${icon}</span> ${value}</span>`;
                }
            },
            {
                key: 'item_tier',
                label: 'Tier',
                sortable: true,
                width: '60px',
                render: (value) => `<span class="dt-tier tier-t${value}">T${value}</span>`
            },
            {
                key: 'company_name',
                label: 'Vendeur',
                sortable: true
            },
            {
                key: 'airport_ident',
                label: 'Lieu',
                sortable: true,
                width: '80px',
                render: (value) => `<span>📍 ${value}</span>`
            },
            {
                key: 'sale_price',
                label: 'Prix',
                sortable: true,
                width: '90px',
                render: (value) => `<span class="dt-price">${formatMoney(value)}</span>`
            },
            {
                key: 'sale_qty',
                label: 'Qté',
                sortable: true,
                width: '60px',
                render: (value) => `×${value}`
            }
        ],
        actions: [
            {
                label: 'Acheter',
                icon: '🛒',
                className: 'btn-primary',
                onClick: (row) => openMarketBuyModal(row.location_id, row.item_id)
            }
        ],
        filters: {
            search: true,
            searchKeys: ['item_name', 'company_name'],
            icao: true,
            icaoKey: 'airport_ident',
            chips: [
                {
                    key: 'item_tier',
                    label: 'Tier',
                    values: [
                        { value: 0, label: 'T0' },
                        { value: 1, label: 'T1' },
                        { value: 2, label: 'T2' },
                        { value: 3, label: 'T3' },
                        { value: 4, label: 'T4' },
                        { value: 5, label: 'T5' }
                    ]
                }
            ]
        },
        pagination: true,
        pageSize: 25,
        emptyMessage: 'Aucune annonce trouvée',
        emptyIcon: '🏪',
        onRowClick: (row) => openMarketBuyModal(row.location_id, row.item_id)
    });
}

// Legacy functions (kept for compatibility)
function applyMarketFilters() {
    loadMarketListings();
}

function resetMarketFilters() {
    if (marketDataTable) {
        marketDataTable.searchValue = '';
        marketDataTable.activeFilters = {};
        marketDataTable._applyFiltersAndSort();
        marketDataTable.render();
    }
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
    const icon = listing.item_icon || getItemEmoji(listing.item_name);
    document.getElementById('buy-item-icon').textContent = icon;
    document.getElementById('buy-item-name').textContent = listing.item_name;
    document.getElementById('buy-item-tier').textContent = `T${listing.item_tier}`;

    document.getElementById('buy-seller-name').textContent = listing.company_name;
    document.getElementById('buy-airport').textContent = listing.airport_ident;
    document.getElementById('buy-unit-price').textContent = formatMoney(listing.sale_price);
    document.getElementById('buy-available-qty').textContent = listing.sale_qty;

    // Update wallet balances in modal
    document.getElementById('buy-wallet-personal').textContent = formatMoney(state.wallets.personal);
    document.getElementById('buy-wallet-company').textContent = formatMoney(state.wallets.company);

    // Update company name and visibility
    const companyOption = document.getElementById('buy-wallet-company-option');
    if (state.wallets.companyId) {
        document.getElementById('buy-wallet-company-name').textContent = state.wallets.companyName || 'Company';
        companyOption.style.display = 'block';
    } else {
        companyOption.style.display = 'none';
    }

    // Reset to personal wallet
    document.querySelector('input[name="buy-wallet"][value="player"]').checked = true;

    document.getElementById('buy-qty').value = 1;
    document.getElementById('buy-qty').max = listing.sale_qty;

    updateBuyTotal();

    document.getElementById('market-buy-error').classList.remove('visible');
    document.getElementById('buy-wallet-warning').style.display = 'none';
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

function updateBuyWalletSelection() {
    updateBuyTotal();
}

function updateBuyTotal() {
    if (!state.market.selectedListing) return;

    const qty = parseInt(document.getElementById('buy-qty').value) || 0;
    const unitPrice = parseFloat(state.market.selectedListing.sale_price);
    const total = qty * unitPrice;

    document.getElementById('buy-total').textContent = formatMoney(total);

    // Check if selected wallet has enough balance
    const selectedWallet = document.querySelector('input[name="buy-wallet"]:checked').value;
    const balance = selectedWallet === 'player' ? state.wallets.personal : state.wallets.company;
    const warningEl = document.getElementById('buy-wallet-warning');
    const buyBtn = document.getElementById('btn-confirm-buy');

    if (total > balance) {
        warningEl.style.display = 'block';
        buyBtn.disabled = true;
    } else {
        warningEl.style.display = 'none';
        buyBtn.disabled = false;
    }
}

async function confirmMarketBuy() {
    if (!state.market.selectedListing) return;

    const qty = parseInt(document.getElementById('buy-qty').value);
    const selectedWallet = document.querySelector('input[name="buy-wallet"]:checked').value;
    const buyerType = selectedWallet === 'player' ? 'player' : 'company';
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

    // Check balance
    const unitPrice = parseFloat(state.market.selectedListing.sale_price);
    const total = qty * unitPrice;
    const balance = buyerType === 'player' ? state.wallets.personal : state.wallets.company;

    if (total > balance) {
        errorEl.textContent = 'Solde insuffisant';
        errorEl.classList.add('visible');
        return;
    }

    btn.classList.add('loading');
    btn.textContent = 'ACHAT...';
    errorEl.classList.remove('visible');

    try {
        const response = await fetch(`${API_BASE}/inventory/market/buy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                seller_location_id: state.market.selectedListing.location_id,
                item_code: state.market.selectedListing.item_code,
                qty: qty,
                buyer_type: buyerType
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur lors de l\'achat');
        }

        const result = await response.json();

        const walletLabel = buyerType === 'player' ? 'personnel' : 'company';
        showToast(`Achat ${walletLabel} réussi! ${qty}× ${state.market.selectedListing.item_name}`, 'success');
        closeMarketBuyModal();

        // Refresh market and wallets
        await Promise.all([
            loadMarketListings(),
            loadWallets()
        ]);

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

// ========================================
// FACTORY MANAGEMENT MODAL (V0.7.2)
// ========================================

// State for factory management (V2)
const factoryManageState = {
    currentFactoryId: null,
    factoryData: null,
    recipeData: null,        // Selected/detected recipe
    workersData: [],
    engineersData: [],       // Engineers assigned to factory
    inventoryData: [],       // company_inventory items at airport
    allRecipes: [],          // All recipes loaded from API
    selectedIngredients: [], // [{slot: 0, item_id, item_name, qty}]
    detectedRecipes: [],     // Recipes matching selected ingredients
    itemSelectMode: null,    // Legacy - for food modal
    selectedItems: []        // Legacy - for food modal
};

// Open factory management modal
async function openFactoryManageModal(factoryId) {
    console.log('[FACTORY] Opening manage modal for:', factoryId);

    if (!state.token || state.token === 'demo-token') {
        showToast('Connectez-vous pour gérer vos usines', 'warning');
        return;
    }

    factoryManageState.currentFactoryId = factoryId;

    // Show modal with loading state
    document.getElementById('factory-manage-loading').style.display = 'flex';
    document.getElementById('factory-manage-content').style.display = 'none';
    document.getElementById('modal-factory-manage').classList.add('active');

    // Load factory details
    await loadFactoryDetails(factoryId);
}

// Close factory management modal
function closeFactoryManageModal() {
    document.getElementById('modal-factory-manage').classList.remove('active');
    factoryManageState.currentFactoryId = null;
    factoryManageState.factoryData = null;
}

// Load factory details from API
async function loadFactoryDetails(factoryId) {
    try {
        // Fetch factory details
        const factoryResponse = await authFetch(`${API_BASE}/factories/${factoryId}`);
        if (!factoryResponse.ok) {
            throw new Error('Erreur lors du chargement de l\'usine');
        }
        const factory = await factoryResponse.json();
        factoryManageState.factoryData = factory;

        console.log('[FACTORY] Factory data:', factory);

        // Update modal header
        document.getElementById('factory-manage-icon').textContent = getFactoryEmoji(factory.factory_type);
        document.getElementById('factory-manage-name').textContent = factory.name || 'Usine';
        document.getElementById('factory-manage-tier').textContent = `T${factory.tier}`;
        document.getElementById('factory-manage-tier').className = `badge tier-t${factory.tier}`;

        // Update info bar
        document.getElementById('factory-manage-airport').textContent = `📍 ${factory.airport_ident}`;
        const statusEl = document.getElementById('factory-manage-status');
        statusEl.textContent = factory.status || 'idle';
        statusEl.className = `factory-manage-status ${factory.status || 'idle'}`;

        // V2: Load company inventory + all recipes in parallel
        await Promise.all([
            loadCompanyInventoryForFactory(factory.airport_ident),
            loadAllRecipes(),
            loadFactoryWorkers(factoryId)
        ]);

        // V2: Render ingredient slots based on tier
        renderIngredientSlots(factory.tier);

        // Calculate and display efficiency
        updateEfficiencyDisplay();

        // Update production status
        updateProductionDisplay(factory);

        // Update food display
        updateFoodDisplay(factory);

        // Hide loading, show content
        document.getElementById('factory-manage-loading').style.display = 'none';
        document.getElementById('factory-manage-content').style.display = 'block';

    } catch (error) {
        console.error('[FACTORY] Error loading factory details:', error);
        showToast(error.message || 'Erreur de chargement', 'error');
        closeFactoryManageModal();
    }
}

// Load factory recipe details
async function loadFactoryRecipe(recipeId) {
    try {
        const response = await authFetch(`${API_BASE}/recipes/${recipeId}`);
        if (!response.ok) {
            throw new Error('Erreur lors du chargement de la recette');
        }
        const recipe = await response.json();
        factoryManageState.recipeData = recipe;

        console.log('[FACTORY] Recipe data:', recipe);

        // Update recipe display
        document.getElementById('factory-recipe-name').textContent = recipe.name || recipe.output_item_name;
        document.getElementById('factory-recipe-tier').textContent = `T${recipe.tier}`;
        document.getElementById('factory-recipe-tier').style.display = 'inline-block';

        // Build ingredients list
        renderIngredientsDisplay(recipe);

    } catch (error) {
        console.error('[FACTORY] Error loading recipe:', error);
        factoryManageState.recipeData = null;
    }
}

// Render ingredients list with stock status
function renderIngredientsDisplay(recipe) {
    const container = document.getElementById('ingredients-list');
    const factory = factoryManageState.factoryData;

    if (!recipe.inputs || recipe.inputs.length === 0) {
        container.innerHTML = '<p class="workers-empty">Aucun ingrédient requis</p>';
        return;
    }

    // Get factory storage from factory data
    const storage = factory.storage || {};

    container.innerHTML = recipe.inputs.map(input => {
        const emoji = getItemEmoji(input.item_name);
        const inStock = storage[input.item_code] || 0;
        const required = input.qty;
        let statusClass = 'ok';
        let statusText = `${inStock}/${required}`;

        if (inStock === 0) {
            statusClass = 'missing';
        } else if (inStock < required) {
            statusClass = 'partial';
        }

        return `
            <div class="ingredient-row">
                <span class="ingredient-name">
                    <span class="ingredient-icon">${emoji}</span>
                    ${input.item_name}
                </span>
                <span class="ingredient-status ${statusClass}">${statusText}</span>
            </div>
        `;
    }).join('');
}

// Load factory workers (V2)
async function loadFactoryWorkers(factoryId) {
    try {
        // V2 endpoint
        const response = await authFetch(`${API_BASE}/workers/v2/factory/${factoryId}`);
        if (!response.ok) {
            throw new Error('Erreur lors du chargement des workers');
        }
        const data = await response.json();

        // V2 API returns { factory_id, factory_name, max_workers, current_workers, workers: [] }
        const workers = data.workers || [];
        factoryManageState.workersData = workers;
        factoryManageState.engineersData = []; // V2 n'a pas d'engineers séparés

        const factory = factoryManageState.factoryData;
        const tier = factory?.tier || 1;
        const maxWorkers = MAX_WORKERS_BY_TIER[tier] || data.max_workers || 10;

        // Update workers count
        document.getElementById('workers-current').textContent = workers.length;
        document.getElementById('workers-max').textContent = maxWorkers;

        // Render workers list
        const container = document.getElementById('workers-list');
        if (workers.length === 0) {
            container.innerHTML = '<p class="workers-empty">Aucun worker assigné</p>';
        } else {
            container.innerHTML = workers.map(worker => `
                <div class="worker-card" data-worker-id="${worker.id}">
                    <span class="worker-avatar">👷</span>
                    <div class="worker-info">
                        <div class="worker-name">${worker.item_name || 'Worker-' + worker.country_code}</div>
                        <div class="worker-meta">
                            <span class="worker-flag">${getCountryFlag(worker.country_code)}</span>
                            <span>T${worker.tier}</span>
                            <span>SPD: ${worker.speed}</span>
                            <span>RES: ${worker.resistance}</span>
                        </div>
                    </div>
                    <button class="btn btn-small btn-danger" onclick="unassignWorkerV2('${worker.id}')" title="Retirer">✕</button>
                </div>
            `).join('');
        }

        // Update efficiency display
        updateEfficiencyDisplay();

    } catch (error) {
        console.error('[FACTORY] Error loading workers:', error);
        factoryManageState.workersData = [];
        factoryManageState.engineersData = [];
    }
}

// Get country flag emoji from country code
function getCountryFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🏳️';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

// Unassign worker from factory (V2)
async function unassignWorkerV2(workerId) {
    const factoryId = factoryManageState.currentFactoryId;
    if (!factoryId) return;

    try {
        const response = await authFetch(`${API_BASE}/workers/v2/${workerId}/unassign`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur');
        }

        showToast('Worker retiré de l\'usine', 'success');

        // Reload workers list
        await loadFactoryWorkers(factoryId);

    } catch (error) {
        console.error('[FACTORY] Error unassigning worker:', error);
        showToast(error.message, 'error');
    }
}

// Calculate and display efficiency (V0.8.1 Compact)
function updateEfficiencyDisplay() {
    const factory = factoryManageState.factoryData;
    const workers = factoryManageState.workersData || [];

    if (!factory) return;

    const tier = factory.tier || 1;
    const maxWorkers = MAX_WORKERS_BY_TIER[tier] || factory.max_workers || 10;
    const currentWorkers = workers.length;
    const foodStock = factory.food_stock || 0;

    // V0.8.1: Worker base efficiency = sum(speed) / (nb_workers × 100)
    let workerBasePercent = 0;
    if (currentWorkers > 0) {
        const totalSpeed = workers.reduce((sum, w) => sum + (w.speed || 50), 0);
        workerBasePercent = (totalSpeed / (currentWorkers * 100)) * 100;
    }

    // V0.8.1: Food bonus based on food tier
    // No food = 30% multiplier, T0=100%, T1=115%, T2=130%, T3=145%, T4=160%, T5=175%
    const foodOk = foodStock > 0;
    const foodTier = factory.food_tier || 0;
    const FOOD_TIER_BONUS = [0, 15, 30, 45, 60, 75]; // T0-T5 bonus %
    const foodTierBonus = foodOk ? (FOOD_TIER_BONUS[foodTier] || 0) : 0;
    const foodMultiplier = foodOk ? (1.0 + foodTierBonus / 100) : 0.3;
    const foodPercent = foodOk ? (100 + foodTierBonus) : 30;

    // V0.8.1: Worker tier bonus (separate from food)
    let avgTier = 1;
    let workerTierBonus = 0;
    if (currentWorkers > 0) {
        avgTier = workers.reduce((sum, w) => sum + (w.tier || 1), 0) / currentWorkers;
        workerTierBonus = Math.min((avgTier - 1) * 5, 25);
    }

    // Final efficiency = worker% × food multiplier
    const totalEfficiency = currentWorkers > 0 ? workerBasePercent * foodMultiplier : 0;

    // Update main gauge
    const gaugeFill = document.getElementById('efficiency-gauge-fill');
    const gaugeValue = document.getElementById('efficiency-value');

    gaugeFill.style.width = `${Math.min(totalEfficiency, 100)}%`;

    // Color based on efficiency
    let colorClass = 'green';
    if (totalEfficiency < 30) colorClass = 'red';
    else if (totalEfficiency < 70) colorClass = 'yellow';

    gaugeFill.className = `efficiency-gauge-fill ${colorClass}`;
    gaugeValue.className = `efficiency-value ${colorClass}`;
    gaugeValue.textContent = `${Math.round(totalEfficiency)}%`;

    // Update tooltip mini bars
    const workersBar = document.getElementById('tooltip-workers-fill');
    const workersVal = document.getElementById('tooltip-workers-value');
    const foodBar = document.getElementById('tooltip-food-fill');
    const foodVal = document.getElementById('tooltip-food-value');
    const bonusBar = document.getElementById('tooltip-bonus-fill');
    const bonusVal = document.getElementById('tooltip-bonus-value');

    // Workers bar
    workersBar.style.width = `${Math.min(workerBasePercent, 100)}%`;
    workersBar.className = `tooltip-mini-fill ${workerBasePercent >= 50 ? 'green' : workerBasePercent > 0 ? 'yellow' : 'red'}`;
    workersVal.textContent = `${Math.round(workerBasePercent)}%`;

    // Food bar
    foodBar.style.width = `${foodPercent}%`;
    foodBar.className = `tooltip-mini-fill ${foodOk ? 'green' : 'red'}`;
    foodVal.textContent = `${foodPercent}%`;

    // Bonus bar: shows food tier bonus + worker tier bonus
    const totalBonus = foodTierBonus + workerTierBonus;
    bonusBar.style.width = `${Math.min(totalBonus, 100)}%`;
    bonusBar.className = `tooltip-mini-fill ${totalBonus > 0 ? 'green' : 'yellow'}`;
    bonusVal.textContent = `+${Math.round(totalBonus)}%`;

    // Update upgrade button visibility (hide for T10)
    const upgradeBtn = document.getElementById('btn-factory-upgrade');
    if (upgradeBtn) {
        upgradeBtn.style.display = tier >= 10 ? 'none' : 'inline-block';
    }
}

// Update production display
function updateProductionDisplay(factory) {
    const statusEl = document.getElementById('production-status');
    const progressEl = document.getElementById('production-progress');
    const btnStart = document.getElementById('btn-start-production');
    const btnStop = document.getElementById('btn-stop-production');

    if (factory.status === 'producing') {
        // Show progress
        statusEl.style.display = 'none';
        progressEl.style.display = 'block';

        // Calculate progress
        const progress = factory.production_progress || 0;
        document.getElementById('production-progress-fill').style.width = `${progress}%`;
        document.getElementById('production-progress-pct').textContent = `${Math.round(progress)}%`;

        // Calculate time left
        if (factory.production_ends_at) {
            const endsAt = new Date(factory.production_ends_at);
            const now = new Date();
            const secondsLeft = Math.max(0, (endsAt - now) / 1000);
            document.getElementById('production-time-left').textContent = formatTimeRemaining(secondsLeft);
        } else {
            document.getElementById('production-time-left').textContent = '--';
        }

        btnStart.disabled = true;
        btnStop.disabled = false;
    } else {
        // Show status message
        statusEl.style.display = 'block';
        progressEl.style.display = 'none';

        if (factory.status === 'paused') {
            document.getElementById('production-message').textContent = 'Production en pause';
            document.getElementById('production-message').className = 'production-message warning';
            btnStart.disabled = false;
        } else {
            // V2: updateStartButton handles the message based on recipe detection
            btnStop.disabled = true;
        }
    }
}

// Check if factory can produce
function checkCanProduce() {
    const factory = factoryManageState.factoryData;
    const recipe = factoryManageState.recipeData;
    const workers = factoryManageState.workersData;

    if (!recipe) {
        return { ok: false, reason: 'Aucune recette définie' };
    }

    if (workers.length === 0) {
        return { ok: false, reason: 'Aucun worker assigné' };
    }

    // Note: food_stock = 0 reduces efficiency but does NOT block production

    // Check ingredients
    const storage = factory.storage || {};
    for (const input of recipe.inputs || []) {
        const inStock = storage[input.item_code] || 0;
        if (inStock < input.qty) {
            return { ok: false, reason: `Ingrédient manquant: ${input.item_name}` };
        }
    }

    return { ok: true };
}

// Update food display (V0.8.1 - item-based, same style as efficiency)
function updateFoodDisplay(factory) {
    const foodStock = factory.food_stock || 0;
    const foodCapacity = factory.food_capacity || 100;
    const percentage = (foodStock / foodCapacity) * 100;

    // V0.8.1: Display food item info
    const foodIcon = document.getElementById('food-icon');
    const foodItemName = document.getElementById('food-item-name');
    const foodTierBadge = document.getElementById('food-tier-badge');
    const foodBonus = document.getElementById('food-bonus');
    const foodValue = document.getElementById('food-value');

    if (factory.food_item_id && factory.food_item_name) {
        // Food is loaded
        foodIcon.textContent = factory.food_item_icon || '🍎';
        foodItemName.textContent = factory.food_item_name;
        foodTierBadge.textContent = `T${factory.food_tier || 0}`;
        foodTierBadge.style.display = 'inline';

        // Calculate bonus based on tier (T0=0%, T1=15%, T2=30%, T3=45%, T4=60%, T5=75%)
        const tierBonus = [0, 15, 30, 45, 60, 75][factory.food_tier] || 0;
        foodBonus.textContent = `+${tierBonus}%`;
        foodBonus.className = tierBonus > 0 ? 'food-bonus' : 'food-bonus no-bonus';
    } else {
        // No food loaded
        foodIcon.textContent = '❌';
        foodItemName.textContent = 'Aucun';
        foodTierBadge.style.display = 'none';
        foodBonus.textContent = '-30%';
        foodBonus.className = 'food-bonus no-food';
    }

    // Update value display
    foodValue.textContent = `${foodStock}/${foodCapacity}`;

    // Calculate hours of food
    const consumptionPerHour = factory.food_consumption_per_hour || 0;
    const hoursLeft = consumptionPerHour > 0 ? Math.floor(foodStock / consumptionPerHour) : 0;
    document.getElementById('food-hours').textContent = consumptionPerHour > 0 ? `(${hoursLeft}h)` : '';

    // Update gauge
    const gaugeFill = document.getElementById('food-gauge-fill');
    if (gaugeFill) {
        const widthPercent = Math.min(100, percentage);
        gaugeFill.style.width = `${widthPercent}%`;
        gaugeFill.classList.toggle('low', percentage < 20);
    }
}

// Format time remaining
function formatTimeRemaining(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ========================================
// PRODUCTION CONTROLS
// ========================================

async function startProduction() {
    console.log('[START] Button clicked');

    const factoryId = factoryManageState.currentFactoryId;
    console.log('[START] factoryId:', factoryId);
    if (!factoryId) {
        console.log('[START] No factoryId - abort');
        return;
    }

    const recipe = factoryManageState.recipeData;
    const workers = factoryManageState.workersData;
    const factory = factoryManageState.factoryData;
    const quantity = factoryManageState.selectedBatches || 1;

    console.log('[START] recipe:', recipe);
    console.log('[START] workers:', workers?.length);
    console.log('[START] quantity:', quantity, '/ max:', factoryManageState.maxBatches);

    // V2: Validate locally before API call
    if (!recipe || !recipe.id) {
        console.log('[START] No recipe - abort');
        showToast('Aucune recette détectée - sélectionnez des ingrédients', 'warning');
        return;
    }

    if (quantity < 1 || quantity > factoryManageState.maxBatches) {
        console.log('[START] Invalid quantity - abort');
        showToast('Quantité invalide', 'warning');
        return;
    }

    if (workers.length === 0) {
        showToast('Aucun worker assigné', 'warning');
        return;
    }

    // Note: food_stock = 0 reduces efficiency but does NOT block production

    const btn = document.getElementById('btn-start-production');
    btn.disabled = true;
    btn.textContent = 'Démarrage...';

    try {
        // V2.1: Send recipe_id + quantity (number of batches)
        const response = await authFetch(`${API_BASE}/factories/${factoryId}/production`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipe_id: recipe.id,
                quantity: quantity
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur au démarrage');
        }

        showToast(`Production démarrée: ${quantity} batch(es)!`, 'success');
        await loadFactoryDetails(factoryId);

    } catch (error) {
        console.error('[FACTORY] Start error:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'START';
    }
}

async function stopProduction() {
    const factoryId = factoryManageState.currentFactoryId;
    if (!factoryId) return;

    const btn = document.getElementById('btn-stop-production');
    btn.disabled = true;
    btn.textContent = 'Arrêt...';

    try {
        const response = await authFetch(`${API_BASE}/factories/${factoryId}/production/stop`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur à l\'arrêt');
        }

        showToast('Production arrêtée', 'success');
        await loadFactoryDetails(factoryId);

    } catch (error) {
        console.error('[FACTORY] Stop error:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'STOP';
    }
}

// ========================================
// ITEM SELECT SUB-MODAL
// ========================================

async function openItemSelectModal(mode) {
    const factory = factoryManageState.factoryData;
    if (!factory) return;

    factoryManageState.itemSelectMode = mode;
    factoryManageState.selectedItems = [];

    // Update title
    const title = mode === 'food' ? 'Charger Food' : 'Charger Ingrédients';
    document.getElementById('item-select-title').textContent = title;

    // Update airport
    document.getElementById('item-select-airport').textContent = `📍 ${factory.airport_ident}`;

    // Reset filters
    document.getElementById('item-select-search').value = '';
    setItemSelectFilter('all');

    // Show modal and load inventory
    document.getElementById('item-select-list').innerHTML = '<div class="loading-small">Chargement...</div>';
    document.getElementById('modal-item-select').classList.add('active');

    await loadItemSelectInventory();
}

function closeItemSelectModal() {
    document.getElementById('modal-item-select').classList.remove('active');
    factoryManageState.itemSelectMode = null;
    factoryManageState.selectedItems = [];
}

// Load inventory items for selection
async function loadItemSelectInventory() {
    const factory = factoryManageState.factoryData;
    if (!factory) return;

    try {
        // Fetch company inventory at this airport
        const response = await authFetch(`${API_BASE}/inventory/overview`);
        if (!response.ok) {
            throw new Error('Erreur lors du chargement de l\'inventaire');
        }
        const data = await response.json();

        // Find containers at this airport
        const airportData = data.locations?.find(l => l.airport_ident === factory.airport_ident);
        if (!airportData) {
            document.getElementById('item-select-list').innerHTML = '<div class="item-select-empty">Aucun stock à cet aéroport</div>';
            return;
        }

        // Collect all items from warehouses (not factory storage)
        const items = [];
        for (const container of airportData.containers) {
            if (container.type === 'company_warehouse' || container.type === 'player_warehouse') {
                for (const item of container.items || []) {
                    items.push({
                        ...item,
                        container_id: container.id,
                        container_name: container.name
                    });
                }
            }
        }

        factoryManageState.inventoryData = items;
        renderItemSelectList();

    } catch (error) {
        console.error('[FACTORY] Error loading inventory:', error);
        document.getElementById('item-select-list').innerHTML = '<div class="item-select-empty">Erreur de chargement</div>';
    }
}

// Set filter for item select
function setItemSelectFilter(filter) {
    // Update chip states
    document.querySelectorAll('.item-select-chips .filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.filter === filter);
    });

    factoryManageState.itemSelectFilter = filter;
    renderItemSelectList();
}

// Filter item select list based on search
function filterItemSelectList() {
    renderItemSelectList();
}

// Render item select list
function renderItemSelectList() {
    const container = document.getElementById('item-select-list');
    const mode = factoryManageState.itemSelectMode;
    const filter = factoryManageState.itemSelectFilter || 'all';
    const searchValue = document.getElementById('item-select-search').value.toLowerCase();
    const recipe = factoryManageState.recipeData;

    let items = [...factoryManageState.inventoryData];

    // Apply filter
    if (mode === 'food' || filter === 'food') {
        // Filter for food items (items with is_food flag or name contains food-related terms)
        items = items.filter(item =>
            item.is_food ||
            item.item_name.toLowerCase().includes('food') ||
            item.item_name.toLowerCase().includes('meal') ||
            item.item_name.toLowerCase().includes('bread') ||
            item.item_name.toLowerCase().includes('sandwich')
        );
    } else if (filter === 'required' && recipe) {
        // Filter for required ingredients
        const requiredCodes = (recipe.inputs || []).map(i => i.item_code);
        items = items.filter(item => requiredCodes.includes(item.item_code));
    }

    // Apply search
    if (searchValue) {
        items = items.filter(item =>
            item.item_name.toLowerCase().includes(searchValue) ||
            item.item_code?.toLowerCase().includes(searchValue)
        );
    }

    if (items.length === 0) {
        container.innerHTML = '<div class="item-select-empty">Aucun item correspondant</div>';
        return;
    }

    container.innerHTML = items.map((item) => {
        const emoji = getItemEmoji(item.item_name);
        const isSelected = factoryManageState.selectedItems.some(s => s.item_id === item.item_id);
        const selectedItem = factoryManageState.selectedItems.find(s => s.item_id === item.item_id);
        const qtyValue = selectedItem ? selectedItem.qty : item.qty;

        return `
            <div class="item-select-row">
                <input type="checkbox" class="item-select-checkbox"
                    data-item-id="${item.item_id}"
                    ${isSelected ? 'checked' : ''}
                    onchange="toggleItemSelection('${item.item_id}')">
                <span class="item-select-icon">${emoji}</span>
                <div class="item-select-info">
                    <div class="item-select-name">${item.item_name}</div>
                    <div class="item-select-stock">Stock: ${item.qty} | ${item.container_name}</div>
                </div>
                <div class="item-select-qty">
                    <input type="number" min="1" max="${item.qty}" value="${qtyValue}"
                        data-item-id="${item.item_id}"
                        onchange="updateItemQty('${item.item_id}', this.value)"
                        ${!isSelected ? 'disabled' : ''}>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle item selection
function toggleItemSelection(itemId) {
    const item = factoryManageState.inventoryData.find(i => i.item_id === itemId);
    if (!item) return;

    const existingIndex = factoryManageState.selectedItems.findIndex(s => s.item_id === itemId);

    if (existingIndex >= 0) {
        factoryManageState.selectedItems.splice(existingIndex, 1);
    } else {
        factoryManageState.selectedItems.push({
            item_id: item.item_id,
            item_code: item.item_code,
            container_id: item.container_id,
            qty: item.qty
        });
    }

    // Re-render to update disabled states
    renderItemSelectList();
}

// Update item quantity
function updateItemQty(itemId, value) {
    const item = factoryManageState.inventoryData.find(i => i.item_id === itemId);
    if (!item) return;

    const qty = Math.min(Math.max(1, parseInt(value) || 1), item.qty);
    const selected = factoryManageState.selectedItems.find(s => s.item_id === itemId);
    if (selected) {
        selected.qty = qty;
    }
}

// Submit item deposit
async function submitItemDeposit() {
    const factoryId = factoryManageState.currentFactoryId;
    const mode = factoryManageState.itemSelectMode;
    const selectedItems = factoryManageState.selectedItems;

    if (!factoryId || selectedItems.length === 0) {
        showToast('Sélectionnez au moins un item', 'warning');
        return;
    }

    const btn = document.getElementById('btn-confirm-deposit');
    btn.disabled = true;
    btn.textContent = 'Chargement...';

    try {
        // Deposit each selected item
        for (const selected of selectedItems) {
            const endpoint = mode === 'food'
                ? `${API_BASE}/factories/${factoryId}/food/deposit`
                : `${API_BASE}/factories/${factoryId}/storage/deposit`;

            const response = await authFetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: selected.item_id,
                    quantity: selected.qty
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erreur lors du dépôt');
            }
        }

        showToast(`${selectedItems.length} item(s) chargé(s)!`, 'success');
        closeItemSelectModal();

        // Refresh factory details
        await loadFactoryDetails(factoryId);

    } catch (error) {
        console.error('[FACTORY] Deposit error:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'CHARGER SÉLECTION';
    }
}

// Open workers management modal (V2)
async function openManageWorkersModal() {
    const factory = factoryManageState.factoryData;
    if (!factory) return;

    // Update airport in modal
    document.getElementById('workers-modal-airport').textContent = factory.airport_ident;

    // Show modal
    document.getElementById('modal-workers-manage').classList.add('active');

    // Load available workers
    await loadAvailableWorkersV2();
}

// Close workers modal
function closeWorkersModal() {
    document.getElementById('modal-workers-manage').classList.remove('active');
}

// Load available workers from inventory (V2)
async function loadAvailableWorkersV2() {
    const factory = factoryManageState.factoryData;
    if (!factory) return;

    const container = document.getElementById('workers-available-list');
    container.innerHTML = '<div class="loading-small">Chargement...</div>';

    try {
        const response = await authFetch(`${API_BASE}/workers/v2/inventory?airport=${factory.airport_ident}`);
        if (!response.ok) {
            throw new Error('Erreur lors du chargement des workers');
        }
        const data = await response.json();
        const workers = data.workers || [];

        if (workers.length === 0) {
            container.innerHTML = '<p class="workers-empty">Aucun worker disponible à cet aéroport</p>';
            return;
        }

        // Check current factory capacity
        const currentWorkers = factoryManageState.workersData?.length || 0;
        const tier = factory.tier || 1;
        const maxWorkers = MAX_WORKERS_BY_TIER[tier] || factory.max_workers || 10;
        const canAddMore = currentWorkers < maxWorkers;

        container.innerHTML = workers.map(worker => `
            <div class="worker-available-card" data-worker-id="${worker.id}">
                <div class="worker-available-info">
                    <span class="worker-flag">${getCountryFlag(worker.country_code)}</span>
                    <span class="worker-name">${worker.item_name || 'Worker-' + worker.country_code}</span>
                    <span class="worker-tier badge">T${worker.tier}</span>
                </div>
                <div class="worker-available-stats">
                    <span>SPD: ${worker.speed}</span>
                    <span>RES: ${worker.resistance}</span>
                    <span>${worker.hourly_salary.toFixed(2)}€/h</span>
                </div>
                <button class="btn btn-small" onclick="assignWorkerV2('${worker.id}')" ${canAddMore ? '' : 'disabled'}>
                    Ajouter
                </button>
            </div>
        `).join('');

        if (!canAddMore) {
            container.insertAdjacentHTML('afterbegin',
                `<div class="workers-capacity-warning">⚠️ Usine pleine (${currentWorkers}/${maxWorkers})</div>`
            );
        }

    } catch (error) {
        console.error('[FACTORY] Error loading available workers:', error);
        container.innerHTML = '<p class="workers-empty">Erreur de chargement</p>';
    }
}

// Assign worker to factory (V2)
async function assignWorkerV2(workerId) {
    const factoryId = factoryManageState.currentFactoryId;
    if (!factoryId) return;

    try {
        const response = await authFetch(`${API_BASE}/workers/v2/${workerId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ factory_id: factoryId })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur');
        }

        showToast('Worker assigné à l\'usine', 'success');

        // Reload both lists
        await Promise.all([
            loadFactoryWorkers(factoryId),
            loadAvailableWorkersV2()
        ]);

    } catch (error) {
        console.error('[FACTORY] Error assigning worker:', error);
        showToast(error.message, 'error');
    }
}

// Upgrade factory (placeholder)
function upgradeFactory() {
    const factory = factoryManageState.factoryData;
    if (!factory) return;

    const currentTier = factory.tier || 1;
    const nextTier = currentTier + 1;

    if (nextTier > 10) {
        showToast('Cette usine est déjà au niveau maximum (T10)', 'info');
        return;
    }

    // TODO: Implement upgrade logic
    // - Check upgrade cost
    // - Check requirements
    // - Call API to upgrade
    showToast(`Upgrade T${currentTier} → T${nextTier} - À venir`, 'info');
}

// Get factory emoji helper
function getFactoryEmoji(factoryType) {
    const emojis = {
        'farm': '🌾',
        'mine': '⛏️',
        'refinery': '🏭',
        'factory': '🏭',
        'bakery': '🍞',
        'brewery': '🍺',
        'sawmill': '🪵',
        'steel_mill': '🔩',
        'food_factory': '🍔',
        'textile': '🧵'
    };
    return emojis[factoryType] || '🏭';
}

// ========================================
// FACTORY MANAGEMENT V2: SLOTS & DETECTION
// ========================================

// V2.1 Official factory tier values
const SLOTS_BY_TIER = {
    1: 2, 2: 2,           // T1-T2: 2 slots
    3: 3, 4: 3,           // T3-T4: 3 slots
    5: 4, 6: 4,           // T5-T6: 4 slots
    7: 5, 8: 5, 9: 5, 10: 5  // T7-T10: 5 slots
};

const MAX_WORKERS_BY_TIER = {
    1: 10, 2: 20, 3: 30, 4: 40, 5: 50,
    6: 60, 7: 70, 8: 80, 9: 90, 10: 100
};

const MAX_ENGINEERS_BY_TIER = {
    1: 0, 2: 1, 3: 1, 4: 2, 5: 2,
    6: 3, 7: 3, 8: 4, 9: 4, 10: 5
};

// Load company inventory at specified airport
async function loadCompanyInventoryForFactory(airportIdent) {
    try {
        const response = await authFetch(`${API_BASE}/inventory/company`);
        if (!response.ok) {
            throw new Error('Erreur chargement inventaire');
        }
        const data = await response.json();

        // Filter items at this airport
        const items = (data.items || []).filter(item => item.airport_ident === airportIdent);
        factoryManageState.inventoryData = items;

        console.log('[FACTORY V2] Inventory loaded:', items.length, 'items at', airportIdent);

    } catch (error) {
        console.error('[FACTORY V2] Error loading inventory:', error);
        factoryManageState.inventoryData = [];
    }
}

// Load all recipes from API
async function loadAllRecipes() {
    try {
        const response = await fetch(`${API_BASE}/world/recipes?limit=500`);
        if (!response.ok) {
            throw new Error('Erreur chargement recettes');
        }
        const recipes = await response.json();
        factoryManageState.allRecipes = recipes;

        console.log('[FACTORY V2] Recipes loaded:', recipes.length);

    } catch (error) {
        console.error('[FACTORY V2] Error loading recipes:', error);
        factoryManageState.allRecipes = [];
    }
}

// Render ingredient slots based on factory tier
function renderIngredientSlots(tier) {
    const container = document.getElementById('ingredient-slots');
    const numSlots = SLOTS_BY_TIER[tier] || 2;
    const items = factoryManageState.inventoryData;

    // Reset selected ingredients and batches
    factoryManageState.selectedIngredients = [];
    factoryManageState.recipeData = null;
    factoryManageState.detectedRecipes = [];
    factoryManageState.maxBatches = 0;
    factoryManageState.selectedBatches = 0;

    // Build dropdown options with stock info
    const itemOptions = items.map(item => {
        const emoji = getItemEmoji(item.item_name);
        return `<option value="${item.item_id}" data-name="${item.item_name}" data-stock="${item.qty}">${emoji} ${item.item_name} (${item.qty} en stock)</option>`;
    }).join('');

    // Build slots - NO quantity input, just dropdown + clear button
    let slotsHtml = '';
    for (let i = 0; i < numSlots; i++) {
        slotsHtml += `
            <div class="ingredient-slot" data-slot="${i}">
                <select class="slot-item-select" data-slot="${i}" onchange="onIngredientChange(${i})">
                    <option value="">-- Slot ${i + 1} --</option>
                    ${itemOptions}
                </select>
                <button class="slot-clear" onclick="clearSlot(${i})" title="Vider">✕</button>
            </div>
        `;
    }

    container.innerHTML = slotsHtml;

    // Reset recipe display
    updateRecipeDisplay();
    updateStartButton();
}

// When ingredient is selected in a slot
function onIngredientChange(slotIndex) {
    const select = document.querySelector(`.slot-item-select[data-slot="${slotIndex}"]`);
    const itemId = select.value;
    const selectedOption = select.options[select.selectedIndex];

    // Update or remove from selected ingredients
    const existingIndex = factoryManageState.selectedIngredients.findIndex(s => s.slot === slotIndex);

    if (itemId) {
        const itemName = selectedOption.dataset.name;
        const stock = parseInt(selectedOption.dataset.stock) || 0;

        const ingredient = {
            slot: slotIndex,
            item_id: itemId,
            item_name: itemName,
            stock: stock  // Store available stock, not selected qty
        };

        if (existingIndex >= 0) {
            factoryManageState.selectedIngredients[existingIndex] = ingredient;
        } else {
            factoryManageState.selectedIngredients.push(ingredient);
        }
    } else {
        if (existingIndex >= 0) {
            factoryManageState.selectedIngredients.splice(existingIndex, 1);
        }
    }

    // Detect matching recipes and calculate batches
    detectMatchingRecipes();
}

// Clear a slot
function clearSlot(slotIndex) {
    const select = document.querySelector(`.slot-item-select[data-slot="${slotIndex}"]`);
    select.value = '';

    const existingIndex = factoryManageState.selectedIngredients.findIndex(s => s.slot === slotIndex);
    if (existingIndex >= 0) {
        factoryManageState.selectedIngredients.splice(existingIndex, 1);
    }

    detectMatchingRecipes();
}

// Detect recipes that match the selected ingredients and calculate batches
function detectMatchingRecipes() {
    const selected = factoryManageState.selectedIngredients;
    const allRecipes = factoryManageState.allRecipes;
    const factory = factoryManageState.factoryData;

    console.log('[RECIPE DETECT] Selected ingredients:', selected);

    // Reset batches
    factoryManageState.maxBatches = 0;
    factoryManageState.selectedBatches = 0;

    if (selected.length === 0) {
        factoryManageState.detectedRecipes = [];
        factoryManageState.recipeData = null;
        updateRecipeDisplay();
        updateStartButton();
        return;
    }

    // Get unique selected item names (lowercase for matching)
    const selectedItemNames = [...new Set(selected.map(s => s.item_name.toLowerCase()))];

    // Find recipes where ALL inputs match selected items (just check item match, not quantity)
    const matching = allRecipes.filter(recipe => {
        // Recipe must be same tier or lower than factory
        if (recipe.tier > factory.tier) return false;

        // Check if all recipe inputs are in selected items
        const inputs = recipe.inputs || [];
        if (inputs.length === 0) return false;

        // Get recipe input names
        const recipeInputNames = inputs.map(i => (i.item_name || i.name || '').toLowerCase());

        // Check if selected items match recipe inputs (exact match)
        const allInputsSelected = recipeInputNames.every(name => selectedItemNames.includes(name));
        const allSelectedAreInputs = selectedItemNames.every(name => recipeInputNames.includes(name));

        return allInputsSelected && allSelectedAreInputs;
    });

    console.log('[RECIPE DETECT] Matching recipes:', matching.length, matching.map(r => r.name));

    factoryManageState.detectedRecipes = matching;

    // Auto-select if only one match
    if (matching.length === 1) {
        factoryManageState.recipeData = matching[0];
    } else if (matching.length > 1) {
        factoryManageState.recipeData = matching[0];
    } else {
        factoryManageState.recipeData = null;
    }

    // Calculate max batches for selected recipe
    calculateMaxBatches();

    updateRecipeDisplay();
    updateStartButton();
}

// Calculate maximum batches possible based on stock
function calculateMaxBatches() {
    const recipe = factoryManageState.recipeData;
    const selected = factoryManageState.selectedIngredients;

    if (!recipe) {
        factoryManageState.maxBatches = 0;
        factoryManageState.selectedBatches = 0;
        return;
    }

    const inputs = recipe.inputs || [];
    let minBatches = Infinity;

    // For each recipe input, calculate how many batches we can make
    for (const input of inputs) {
        const inputName = (input.item_name || input.name || '').toLowerCase();
        const requiredPerBatch = input.quantity_required || input.qty || 1;

        // Find stock for this ingredient
        const matchingIngredient = selected.find(s => s.item_name.toLowerCase() === inputName);
        const availableStock = matchingIngredient?.stock || 0;

        // Calculate batches possible with this ingredient
        const batchesForIngredient = Math.floor(availableStock / requiredPerBatch);
        console.log(`[BATCHES] ${inputName}: ${availableStock} stock / ${requiredPerBatch} required = ${batchesForIngredient} batches`);

        minBatches = Math.min(minBatches, batchesForIngredient);
    }

    factoryManageState.maxBatches = minBatches === Infinity ? 0 : minBatches;
    factoryManageState.selectedBatches = factoryManageState.maxBatches; // Default to max

    console.log('[BATCHES] Max batches possible:', factoryManageState.maxBatches);
}

// Update the recipe display section
function updateRecipeDisplay() {
    const noRecipeEl = document.getElementById('no-recipe-message');
    const recipeFoundEl = document.getElementById('recipe-found');
    const selectorEl = document.getElementById('recipe-selector');
    const detected = factoryManageState.detectedRecipes;
    const recipe = factoryManageState.recipeData;
    const maxBatches = factoryManageState.maxBatches;

    if (!recipe) {
        noRecipeEl.style.display = 'block';
        recipeFoundEl.style.display = 'none';
        return;
    }

    noRecipeEl.style.display = 'none';
    recipeFoundEl.style.display = 'block';

    // Update recipe info
    const emoji = getItemEmoji(recipe.output_item_name || recipe.name);
    document.getElementById('detected-recipe-icon').textContent = emoji;
    document.getElementById('detected-recipe-name').textContent = recipe.output_item_name || recipe.name;
    document.getElementById('detected-recipe-tier').textContent = `T${recipe.tier}`;
    document.getElementById('detected-recipe-time').textContent = formatTimeRemaining(recipe.base_time_seconds || 60);
    document.getElementById('detected-recipe-output').textContent = `${recipe.output_qty || 1}x`;

    // Build required ingredients string
    const inputs = recipe.inputs || [];
    const reqStr = inputs.map(i => `${i.quantity_required || i.qty || 1}× ${i.item_name || i.name}`).join(' + ');
    document.getElementById('detected-recipe-required').textContent = reqStr || '-';

    // Update batches section
    const batchesStatusEl = document.getElementById('batches-status');
    const batchesInputEl = document.getElementById('batches-input');
    const batchesMaxEl = document.getElementById('batches-max');

    if (maxBatches > 0) {
        batchesStatusEl.textContent = `${maxBatches} batches possibles`;
        batchesStatusEl.className = 'batches-status success';
        batchesInputEl.disabled = false;
        batchesInputEl.max = maxBatches;
        batchesInputEl.value = factoryManageState.selectedBatches || maxBatches;
        batchesMaxEl.textContent = `(max: ${maxBatches})`;
    } else {
        batchesStatusEl.textContent = 'Stock insuffisant';
        batchesStatusEl.className = 'batches-status warning';
        batchesInputEl.disabled = true;
        batchesInputEl.value = 0;
        batchesMaxEl.textContent = '';
    }

    // Show selector if multiple recipes match
    if (detected.length > 1) {
        selectorEl.style.display = 'block';
        selectorEl.innerHTML = detected.map((r, i) => {
            const rEmoji = getItemEmoji(r.output_item_name || r.name);
            return `<option value="${i}" ${r.id === recipe.id ? 'selected' : ''}>${rEmoji} ${r.output_item_name || r.name} (T${r.tier})</option>`;
        }).join('');
    } else {
        selectorEl.style.display = 'none';
    }
}

// When user changes batch quantity
function onBatchesChange() {
    const input = document.getElementById('batches-input');
    const value = parseInt(input.value) || 0;
    const max = factoryManageState.maxBatches;

    // Clamp value between 1 and max
    factoryManageState.selectedBatches = Math.max(1, Math.min(value, max));
    input.value = factoryManageState.selectedBatches;

    updateStartButton();
}

// When user selects a recipe from dropdown (multiple matches)
function onRecipeSelect() {
    const selectorEl = document.getElementById('recipe-selector');
    const index = parseInt(selectorEl.value);
    const detected = factoryManageState.detectedRecipes;

    if (detected[index]) {
        factoryManageState.recipeData = detected[index];
        calculateMaxBatches(); // Recalculate batches for new recipe
        updateRecipeDisplay();
        updateStartButton();
    }
}

// Update START button state
function updateStartButton() {
    const btnStart = document.getElementById('btn-start-production');
    const messageEl = document.getElementById('production-message');
    const factory = factoryManageState.factoryData;
    const recipe = factoryManageState.recipeData;
    const workers = factoryManageState.workersData;
    const selectedBatches = factoryManageState.selectedBatches || 0;

    console.log('[updateStartButton] recipe:', !!recipe, 'maxBatches:', factoryManageState.maxBatches, 'selectedBatches:', selectedBatches, 'workers:', workers?.length);

    // If already producing, don't change
    if (factory?.status === 'producing') {
        console.log('[updateStartButton] Factory producing - skip');
        return;
    }

    if (!recipe) {
        btnStart.disabled = true;
        messageEl.textContent = 'Sélectionnez des ingrédients pour détecter une recette';
        messageEl.className = 'production-message warning';
        console.log('[updateStartButton] No recipe - disabled');
        return;
    }

    if (factoryManageState.maxBatches === 0) {
        btnStart.disabled = true;
        messageEl.textContent = 'Stock insuffisant pour cette recette';
        messageEl.className = 'production-message warning';
        console.log('[updateStartButton] maxBatches=0 - disabled');
        return;
    }

    if (selectedBatches < 1) {
        btnStart.disabled = true;
        messageEl.textContent = 'Sélectionnez au moins 1 batch';
        messageEl.className = 'production-message warning';
        console.log('[updateStartButton] selectedBatches<1 - disabled');
        return;
    }

    if (workers.length === 0) {
        btnStart.disabled = true;
        messageEl.textContent = 'Aucun worker assigné';
        messageEl.className = 'production-message warning';
        console.log('[updateStartButton] No workers - disabled');
        return;
    }

    // Note: food_stock = 0 reduces efficiency but does NOT block production

    console.log('[updateStartButton] All checks passed - ENABLED');
    btnStart.disabled = false;
    const outputQty = (recipe.output_qty || 1) * selectedBatches;
    messageEl.textContent = `Prêt: ${selectedBatches} batch(es) → ${outputQty} unités`;
    messageEl.className = 'production-message';
}

// ========================================
// FOOD MODAL V2
// ========================================

function openFoodModal() {
    const factory = factoryManageState.factoryData;
    if (!factory) return;

    // Show modal
    document.getElementById('modal-food-select').classList.add('active');

    // Load food items from inventory
    loadFoodItems();
}

function closeFoodModal() {
    document.getElementById('modal-food-select').classList.remove('active');
}

async function loadFoodItems() {
    const factory = factoryManageState.factoryData;
    const items = factoryManageState.inventoryData;

    // Filter for food items - V0.8.1: Check tags array for 'food' or 'consumable'
    const foodItems = items.filter(item => {
        // Check tags array (V0.8.1)
        if (item.tags && Array.isArray(item.tags)) {
            if (item.tags.includes('food') || item.tags.includes('consumable')) {
                return true;
            }
        }
        // Fallback: check item name patterns
        const name = item.item_name.toLowerCase();
        return name.includes('ration') ||
            name.includes('bread') ||
            name.includes('meat') ||
            name.includes('fish') ||
            name.includes('cheese') ||
            name.includes('butter') ||
            name.includes('flour') ||
            name.includes('jam') ||
            name.includes('stew') ||
            name.includes('cake') ||
            name.includes('chocolate') ||
            name.includes('syrup') ||
            name.includes('cocoa') ||
            name.includes('vanilla');
    });

    const selectEl = document.getElementById('food-item-select');
    if (selectEl) {
        if (foodItems.length === 0) {
            selectEl.innerHTML = '<option value="">Aucun food disponible</option>';
        } else {
            selectEl.innerHTML = foodItems.map(item => {
                const emoji = getItemEmoji(item.item_name);
                return `<option value="${item.item_id}" data-max="${item.qty}">${emoji} ${item.item_name} (${item.qty})</option>`;
            }).join('');
        }
    }

    // Update max qty
    updateFoodMaxQty();
}

function updateFoodMaxQty() {
    const selectEl = document.getElementById('food-item-select');
    const qtyInput = document.getElementById('food-qty-input');

    if (selectEl && qtyInput) {
        const selectedOption = selectEl.options[selectEl.selectedIndex];
        const maxQty = selectedOption ? parseInt(selectedOption.dataset.max) || 0 : 0;
        qtyInput.max = maxQty;
        qtyInput.value = Math.min(parseInt(qtyInput.value) || 1, maxQty);
    }
}

async function submitFoodDeposit() {
    const factoryId = factoryManageState.currentFactoryId;
    const selectEl = document.getElementById('food-item-select');
    const qtyInput = document.getElementById('food-qty-input');

    if (!factoryId || !selectEl || !qtyInput) return;

    const itemId = selectEl.value;
    const qty = parseInt(qtyInput.value) || 0;

    if (!itemId || qty <= 0) {
        showToast('Sélectionnez un item et une quantité', 'warning');
        return;
    }

    const btn = document.getElementById('btn-confirm-food');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Chargement...';
    }

    try {
        const response = await authFetch(`${API_BASE}/factories/${factoryId}/food`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                item_id: itemId,
                quantity: qty
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erreur lors du dépôt');
        }

        showToast('Food rechargé!', 'success');
        closeFoodModal();

        // Refresh factory
        await loadFactoryDetails(factoryId);

    } catch (error) {
        console.error('[FACTORY] Food deposit error:', error);
        showToast(error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'CHARGER';
        }
    }
}
