/**
 * Main Application
 */
const App = {
    mapReady: false,
    initialized: false,
    liveMode: false,

    /**
     * Called when Mapbox map is ready
     */
    onMapReady() {
        console.log('🚀 Map ready, initializing app...');
        this.mapReady = true;
        this.init();
    },

    /**
     * Initialize application
     */
    async init() {
        if (this.initialized || !this.mapReady) return;
        this.initialized = true;

        try {
            // Initialize modules
            HistoryManager.init();
            this._initUIControls();

            // Load initial data
            await DeviceManager.loadDevices();

            // Fit map to show all devices
            setTimeout(() => MapManager.fitBounds(), 500);

            // Connect WebSocket for real-time updates
            this._initWebSocket();

            // Auto-enable LIVE mode on start
            this.toggleLiveMode(true);

        } catch (error) {
            console.error('App initialization failed:', error);
        }
    },

    /**
     * Initialize UI controls
     */
    _initUIControls() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        let searchTimeout;

        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                DeviceManager.renderDeviceList();
            }, 300);
        });

        // LIVE button
        document.getElementById('liveBtn')?.addEventListener('click', () => {
            this.toggleLiveMode(!this.liveMode);
        });

        // Info card close button
        document.getElementById('infoCardClose')?.addEventListener('click', () => {
            MapManager.hideInfoCard();
            this.toggleLiveMode(true);
        });

        // Route Today button
        document.getElementById('routeTodayBtn')?.addEventListener('click', () => {
            if (MapManager.selectedDeviceId) {
                HistoryManager.loadTodayRoute(MapManager.selectedDeviceId);
            }
        });

        // Route Custom button
        document.getElementById('routeCustomBtn')?.addEventListener('click', () => {
            if (MapManager.selectedDeviceId) {
                HistoryManager.openCustomRouteModal(MapManager.selectedDeviceId);
            }
        });

        // Follow button - toggle follow mode
        document.getElementById('followBtn')?.addEventListener('click', () => {
            if (MapManager.selectedDeviceId) {
                if (MapManager.followMode && MapManager.followDeviceId === MapManager.selectedDeviceId) {
                    // Already following this device - stop
                    MapManager.stopFollow();
                } else {
                    // Start following
                    MapManager.startFollow(MapManager.selectedDeviceId);
                }
            }
        });

        // Detail modal close
        document.getElementById('modalClose')?.addEventListener('click', () => {
            document.getElementById('detailModal')?.classList.remove('active');
        });

        document.querySelector('#detailModal .modal-overlay')?.addEventListener('click', () => {
            document.getElementById('detailModal')?.classList.remove('active');
        });
    },

    /**
     * Toggle LIVE mode
     */
    toggleLiveMode(enabled) {
        this.liveMode = enabled;

        const btn = document.getElementById('liveBtn');
        if (btn) {
            btn.classList.toggle('active', enabled);
        }

        // Update map manager
        MapManager.setLiveMode(enabled);

        // Clear device selection in LIVE mode
        if (enabled) {
            DeviceManager.clearActiveDevice();
        }

        console.log(`📡 LIVE mode: ${enabled ? 'ON' : 'OFF'}`);
    },

    /**
     * Initialize WebSocket connection
     */
    _initWebSocket() {
        // Position updates
        WebSocketManager.on('position', (position) => {
            DeviceManager.updatePosition(position);

            // Update follow path if following this device
            if (MapManager.followMode && position.deviceId == MapManager.followDeviceId) {
                MapManager.addFollowPosition(position);
            }
        });

        // Device status updates
        WebSocketManager.on('device', (device) => {
            DeviceManager.updateDevice(device);
        });

        // Connection status
        WebSocketManager.on('connect', () => {
            console.log('✅ Real-time updates active');
        });

        WebSocketManager.on('disconnect', () => {
            console.log('⚠️ Real-time updates paused');
        });

        // Connect
        WebSocketManager.connect();
    }
};

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM ready');
    // Mapbox map initialization is handled in map.js
    // App.onMapReady() will be called when map is loaded
});
