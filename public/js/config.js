/**
 * Configuration module
 */
const CONFIG = {
    // API endpoints (through local proxy)
    API_BASE: '',  // Empty = same origin
    WS_URL: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,

    // Map settings
    MAP_CENTER: [108.2068, 16.0471], // Vietnam center [lng, lat] for Mapbox
    MAP_ZOOM: 5,

    // Update intervals
    RECONNECT_INTERVAL: 5000,

    // Mapbox style - streets with nice colors
    MAP_STYLE: 'mapbox://styles/mapbox/streets-v12'
};
