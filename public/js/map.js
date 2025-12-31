/**
 * Map module - Mapbox GL JS integration
 */
const MapManager = {
    map: null,
    markers: {},       // deviceId -> marker
    markerLabels: {},  // deviceId -> label element
    blinkElements: {}, // deviceId -> blink animation element
    popup: null,
    routeLayerId: 'route-layer',
    routeSourceId: 'route-source',
    bounds: null,
    selectedDeviceId: null,  // Currently selected device for info card
    liveMode: false,
    userInteracted: false,   // Track if user manually zoomed/panned in LIVE mode
    mapboxToken: null,

    // Follow mode state
    followMode: false,           // Is follow mode active
    followDeviceId: null,        // Device being followed  
    followPositions: [],         // Positions collected since follow started
    followSourceId: 'follow-source',

    // Route animation state
    _animationFrame: null,
    _dashOffset: 0,

    /**
     * Initialize Mapbox map
     */
    async init() {
        // Fetch Mapbox token from backend
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            this.mapboxToken = config.mapboxToken;

            if (!this.mapboxToken) {
                console.error('Mapbox token not configured');
                return;
            }
        } catch (error) {
            console.error('Failed to load Mapbox config:', error);
            return;
        }

        mapboxgl.accessToken = this.mapboxToken;

        this.map = new mapboxgl.Map({
            container: 'map',
            style: CONFIG.MAP_STYLE,
            center: CONFIG.MAP_CENTER,
            zoom: CONFIG.MAP_ZOOM
        });

        // Add navigation controls
        this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        this.map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

        // Initialize popup
        this.popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false
        });

        // Initialize bounds
        this.bounds = new mapboxgl.LngLatBounds();

        // Wait for map to load before triggering app
        this.map.on('load', () => {
            console.log('🗺️ Mapbox GL initialized');

            // Add route source and layer
            this.map.addSource(this.routeSourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            this.map.addLayer({
                id: this.routeLayerId,
                type: 'line',
                source: this.routeSourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 6,
                    'line-opacity': 1
                }
            });

            // Add animated dash layer for direction indication (on top of route)
            this.map.addLayer({
                id: 'route-layer-animated',
                type: 'line',
                source: this.routeSourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#ffffff',
                    'line-width': 2,
                    'line-opacity': 0.6,
                    'line-dasharray': [0, 4, 3]
                }
            });

            // Add follow source and layer
            this.map.addSource(this.followSourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            this.map.addLayer({
                id: 'follow-layer',
                type: 'line',
                source: this.followSourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 6,
                    'line-opacity': 1
                }
            });

            // Add animated dash layer for follow path
            this.map.addLayer({
                id: 'follow-layer-animated',
                type: 'line',
                source: this.followSourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#ffffff',
                    'line-width': 2,
                    'line-opacity': 0.6,
                    'line-dasharray': [0, 4, 3]
                }
            });

            // Trigger app initialization
            if (typeof App !== 'undefined' && App.onMapReady) {
                App.onMapReady();
            }
        });

        // Track user interactions with map (zoom, pan)
        this.map.on('zoomstart', (e) => {
            // Only set userInteracted if this is a user-initiated zoom (not programmatic)
            if (e.originalEvent && this.liveMode) {
                this.userInteracted = true;
                console.log('🖐️ User interaction detected - auto-fit disabled');
            }
        });

        this.map.on('dragstart', (e) => {
            if (e.originalEvent && this.liveMode) {
                this.userInteracted = true;
                console.log('🖐️ User interaction detected - auto-fit disabled');
            }
        });
    },

    /**
     * Set LIVE mode
     */
    setLiveMode(enabled) {
        this.liveMode = enabled;

        if (enabled) {
            // Stop follow mode when entering LIVE mode
            this.stopFollow();

            // Reset user interaction flag when entering LIVE mode
            this.userInteracted = false;

            // Hide info card
            this.hideInfoCard();

            // Show all marker labels
            this._updateAllMarkerLabels(true);

            // Fit to show all online devices
            this.fitBounds();
        } else {
            // Hide all marker labels when not in LIVE mode
            this._updateAllMarkerLabels(false);
        }

        console.log(`📡 LIVE mode: ${enabled ? 'ON' : 'OFF'}`);
    },

    /**
     * Update visibility of all marker labels
     */
    _updateAllMarkerLabels(visible) {
        Object.keys(this.markerLabels).forEach(deviceId => {
            const labelData = this.markerLabels[deviceId];
            if (labelData && labelData.el) {
                labelData.el.style.display = visible ? 'block' : 'none';
            }
        });
    },

    /**
     * Create or update a device marker
     */
    updateMarker(deviceId, position, device, shouldBlink = false) {
        const lngLat = [position.longitude, position.latitude];
        const deviceName = device ? device.name : `Device ${deviceId}`;

        if (this.markers[deviceId]) {
            // Update existing marker position
            this.markers[deviceId].setLngLat(lngLat);

            // Update marker icon rotation and color
            const el = this.markers[deviceId].getElement();
            this._updateMarkerElement(el, position, device);

            // Update label position
            if (this.markerLabels[deviceId]) {
                this.markerLabels[deviceId].marker.setLngLat(lngLat);
            }
        } else {
            // Create new marker element
            const el = this._createMarkerElement(position, device);

            // Create marker
            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                .setLngLat(lngLat)
                .addTo(this.map);

            // Click handler
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showInfoCard(deviceId);
            });

            this.markers[deviceId] = marker;

            // Create label for device name
            this._createMarkerLabel(deviceId, lngLat, deviceName);
        }

        // Auto-center on selected device when its position updates
        if (this.selectedDeviceId && this.selectedDeviceId == deviceId && !this.liveMode) {
            // Smoothly pan to the new position of the selected device
            this.map.easeTo({
                center: lngLat,
                duration: 500
            });
        }

        // Auto-fit bounds in LIVE mode when device moves (only if no device is selected)
        if (shouldBlink && this.liveMode && !this.selectedDeviceId) {
            // Reset bounds and recalculate to include all current markers
            this._autoFitBoundsDebounced();
        }

        // Extend bounds
        this.bounds.extend(lngLat);
    },

    // Debounced auto-fit to avoid too frequent updates
    _autoFitTimeout: null,
    _autoFitBoundsDebounced() {
        if (this._autoFitTimeout) {
            clearTimeout(this._autoFitTimeout);
        }
        this._autoFitTimeout = setTimeout(() => {
            if (this.userInteracted) {
                // User has manually adjusted zoom - only pan to center, keep zoom level
                this._panToCenterOfDevices();
            } else {
                // Normal auto-fit with zoom adjustment
                this.fitBounds();
            }
        }, 2000); // Wait 2 seconds before fitting
    },

    /**
     * Pan to center of all online devices without changing zoom
     */
    _panToCenterOfDevices() {
        const onlineMarkers = Object.entries(this.markers).filter(([deviceId]) => {
            const device = typeof DeviceManager !== 'undefined' ? DeviceManager.devices[deviceId] : null;
            return device && device.status === 'online';
        });

        if (onlineMarkers.length === 0) return;

        // Calculate center point of all online devices
        let sumLng = 0, sumLat = 0;
        onlineMarkers.forEach(([_, marker]) => {
            const lngLat = marker.getLngLat();
            sumLng += lngLat.lng;
            sumLat += lngLat.lat;
        });

        const centerLng = sumLng / onlineMarkers.length;
        const centerLat = sumLat / onlineMarkers.length;

        // Smoothly pan to center without changing zoom
        this.map.easeTo({
            center: [centerLng, centerLat],
            duration: 500
        });
    },

    /**
     * Create marker DOM element
     */
    _createMarkerElement(position, device) {
        const el = document.createElement('div');
        el.className = 'mapbox-marker';
        this._updateMarkerElement(el, position, device);
        return el;
    },

    /**
     * Update marker element appearance
     */
    _updateMarkerElement(el, position, device) {
        const isMoving = position.speed > 1;
        const rotation = position.course || 0;
        const isOnline = device && device.status === 'online';

        // Color based on status
        let color = '#888';  // offline
        if (isOnline) {
            color = isMoving ? '#00d4ff' : '#00ff88';  // moving: cyan, stopped: green
        }

        el.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" style="transform: rotate(${rotation}deg)">
                <circle cx="16" cy="16" r="14" fill="${color}" opacity="0.2"/>
                <circle cx="16" cy="16" r="10" fill="${color}"/>
                <path d="M16 6 L22 22 L16 18 L10 22 Z" fill="white"/>
            </svg>
        `;
    },

    /**
     * Create a label above the marker
     */
    _createMarkerLabel(deviceId, lngLat, name) {
        const labelEl = document.createElement('div');
        labelEl.className = 'marker-label';
        labelEl.textContent = name;
        labelEl.style.display = this.liveMode ? 'block' : 'none';

        const labelMarker = new mapboxgl.Marker({ element: labelEl, anchor: 'bottom', offset: [0, -25] })
            .setLngLat(lngLat)
            .addTo(this.map);

        this.markerLabels[deviceId] = { el: labelEl, marker: labelMarker };
    },

    /**
     * Create a blink effect around the marker
     */
    _blinkMarker(deviceId, lngLat, device) {
        // Remove any existing blink marker for this device
        if (this.blinkElements[deviceId]) {
            this.blinkElements[deviceId].marker.remove();
            delete this.blinkElements[deviceId];
        }

        // Validate coordinates
        if (!lngLat || !Array.isArray(lngLat) || lngLat.length !== 2 ||
            isNaN(lngLat[0]) || isNaN(lngLat[1])) {
            console.error('Invalid lngLat for blink:', lngLat);
            return;
        }

        console.log(`🔵 Blink at: [${lngLat[0].toFixed(6)}, ${lngLat[1].toFixed(6)}]`);

        const isMoving = device && device.status === 'online';
        const color = isMoving ? '#00d4ff' : '#00ff88';

        const blinkEl = document.createElement('div');
        blinkEl.className = 'marker-blink';
        blinkEl.style.borderColor = color;
        blinkEl.style.backgroundColor = color;

        const blinkMarker = new mapboxgl.Marker({ element: blinkEl, anchor: 'center' })
            .setLngLat(lngLat)
            .addTo(this.map);

        // Store both element and marker for proper cleanup
        this.blinkElements[deviceId] = { el: blinkEl, marker: blinkMarker };

        // Remove after animation
        setTimeout(() => {
            if (this.blinkElements[deviceId] && this.blinkElements[deviceId].marker === blinkMarker) {
                blinkMarker.remove();
                delete this.blinkElements[deviceId];
            }
        }, 1000);
    },

    /**
     * Show fixed info card for a device
     */
    showInfoCard(deviceId) {
        // Stop follow mode if selecting a different device
        if (this.selectedDeviceId && this.selectedDeviceId !== deviceId) {
            this.stopFollow();
            this.clearRoute();
        }

        this.selectedDeviceId = deviceId;
        this.todayKm = null;  // Reset today's km

        // Exit LIVE mode when selecting a device
        if (this.liveMode && typeof App !== 'undefined') {
            App.toggleLiveMode(false);
        }

        // Update follow button state
        const followBtn = document.getElementById('followBtn');
        if (followBtn) {
            followBtn.classList.toggle('active', this.followMode && this.followDeviceId === deviceId);
        }

        const card = document.getElementById('deviceInfoCard');
        if (card) {
            card.style.display = 'block';
            this.updateInfoCard();
            this._fetchTodayKm(deviceId);  // Fetch today's km asynchronously
        }
    },

    /**
     * Fetch today's km for a device
     */
    async _fetchTodayKm(deviceId) {
        try {
            // Set to loading
            const kmEl = document.getElementById('infoCardTodayKm');
            if (kmEl) kmEl.textContent = 'Đang tải...';

            // Get today's date range
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            const from = startOfDay.toISOString();
            const to = now.toISOString();

            // Fetch positions for today
            const response = await fetch(`/api/reports/route?deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

            if (!response.ok) {
                throw new Error('Failed to fetch positions');
            }

            const positions = await response.json();

            // Calculate total distance
            let totalKm = 0;
            if (positions.length > 1) {
                for (let i = 1; i < positions.length; i++) {
                    const dist = this._calculateDistance(
                        positions[i - 1].latitude, positions[i - 1].longitude,
                        positions[i].latitude, positions[i].longitude
                    );
                    totalKm += dist;
                }
            }

            // Update display if still showing the same device
            if (this.selectedDeviceId === deviceId && kmEl) {
                kmEl.textContent = `${totalKm.toFixed(1)} km`;
            }
        } catch (error) {
            console.error('Error fetching today km:', error);
            const kmEl = document.getElementById('infoCardTodayKm');
            if (kmEl && this.selectedDeviceId === deviceId) {
                kmEl.textContent = '--';
            }
        }
    },

    /**
     * Calculate distance between two coordinates in km (Haversine formula)
     */
    _calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    // Debounced refetch for today's km (every 30 seconds max)
    _refetchKmTimeout: null,
    _lastKmFetch: 0,
    _refetchTodayKmDebounced(deviceId) {
        const now = Date.now();
        // Only refetch if more than 30 seconds since last fetch
        if (now - this._lastKmFetch < 30000) {
            return;
        }

        if (this._refetchKmTimeout) {
            clearTimeout(this._refetchKmTimeout);
        }

        this._refetchKmTimeout = setTimeout(() => {
            this._lastKmFetch = Date.now();
            this._fetchTodayKm(deviceId);
        }, 1000);
    },

    /**
     * Update info card with current device data
     */
    updateInfoCard() {
        if (!this.selectedDeviceId) return;

        const device = DeviceManager.devices[this.selectedDeviceId];
        const position = DeviceManager.positions[this.selectedDeviceId];

        if (!device || !position) return;

        const speed = (position.speed * 1.852).toFixed(1);
        const isOnline = device.status === 'online';

        // Format time with DD/MM
        const date = new Date(position.deviceTime);
        const time = this._formatDateTime(date);

        // Additional attributes
        const satellites = position.attributes?.sat || '--';
        const operator = position.attributes?.operator || '--';
        const signal = position.attributes?.signal ? `${position.attributes.signal}` : '--';
        const uptime = this._formatUptime(position.attributes?.uptime);

        document.getElementById('infoCardName').textContent = device.name;

        const statusEl = document.getElementById('infoCardStatus');
        statusEl.textContent = isOnline ? 'Online' : 'Offline';
        statusEl.className = 'info-card-status ' + (isOnline ? 'online' : 'offline');

        document.getElementById('infoCardSpeed').textContent = `${speed} km/h`;
        document.getElementById('infoCardCoords').textContent = `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
        document.getElementById('infoCardSat').textContent = satellites;
        document.getElementById('infoCardOperator').textContent = operator;
        document.getElementById('infoCardSignal').textContent = signal;
        document.getElementById('infoCardUptime').textContent = uptime;
        document.getElementById('infoCardTime').textContent = time;
    },

    /**
     * Format datetime as DD/MM HH:mm:ss
     */
    _formatDateTime(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds} ${day}/${month}`;
    },

    /**
     * Format uptime in seconds to days, hours, minutes
     */
    _formatUptime(seconds) {
        if (!seconds && seconds !== 0) return '--';

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        let result = [];
        if (days > 0) result.push(`${days}d`);
        if (hours > 0) result.push(`${hours}h`);
        result.push(`${minutes}m`);

        return result.join(' ');
    },

    /**
     * Hide info card and clear route
     */
    hideInfoCard() {
        this.selectedDeviceId = null;
        const card = document.getElementById('deviceInfoCard');
        if (card) {
            card.style.display = 'none';
        }

        // Clear any displayed route
        this.clearRoute();
    },

    /**
     * Focus on a specific device
     */
    focusDevice(deviceId) {
        const marker = this.markers[deviceId];
        if (marker) {
            this.map.flyTo({
                center: marker.getLngLat(),
                zoom: 15,
                duration: 1000
            });
            this.showInfoCard(deviceId);
        }
    },

    /**
     * Fit map to show all online markers with appropriate zoom level
     */
    fitBounds() {
        // Reset bounds and rebuild from current online markers only
        this.bounds = new mapboxgl.LngLatBounds();

        Object.entries(this.markers).forEach(([deviceId, marker]) => {
            const device = typeof DeviceManager !== 'undefined' ? DeviceManager.devices[deviceId] : null;
            if (device && device.status === 'online') {
                this.bounds.extend(marker.getLngLat());
            }
        });

        if (!this.bounds.isEmpty()) {
            this.map.fitBounds(this.bounds, {
                padding: 50,
                maxZoom: 9,
                duration: 1000
            });
        }
    },

    /**
     * Draw route polyline with time-based gradient colors
     * Green (start) → Orange (middle) → Red (end)
     */
    drawRoute(positions) {
        // Clear previous route
        this.clearRoute();

        if (!positions || positions.length === 0) return;

        // Create GeoJSON features with time-based gradient coloring
        const features = [];
        const totalSegments = positions.length - 1;

        for (let i = 1; i < positions.length; i++) {
            // Calculate time ratio (0 = start, 1 = end)
            const ratio = (i - 1) / Math.max(totalSegments - 1, 1);
            const color = this._getTimeGradientColor(ratio);

            features.push({
                type: 'Feature',
                properties: { color },
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [positions[i - 1].longitude, positions[i - 1].latitude],
                        [positions[i].longitude, positions[i].latitude]
                    ]
                }
            });
        }

        // Update route source
        this.map.getSource(this.routeSourceId).setData({
            type: 'FeatureCollection',
            features
        });

        // Start dash animation
        this._startRouteAnimation();

        // Fit bounds to route
        const routeBounds = new mapboxgl.LngLatBounds();
        positions.forEach(p => routeBounds.extend([p.longitude, p.latitude]));
        this.map.fitBounds(routeBounds, { padding: 50 });

        // Add start/end markers
        if (positions.length > 0) {
            this._addRouteMarker(positions[0], '#00ff88', 'Điểm bắt đầu');
            this._addRouteMarker(positions[positions.length - 1], '#ff4466', 'Điểm kết thúc');
        }
    },

    /**
     * Get gradient color based on time ratio (0-1)
     * Returns color from green → orange → red
     */
    _getTimeGradientColor(ratio) {
        // Clamp ratio between 0 and 1
        ratio = Math.max(0, Math.min(1, ratio));

        // Color stops: darker/more saturated colors for better visibility
        const colors = [
            { pos: 0, r: 0, g: 200, b: 83 },     // #00c853 dark green
            { pos: 0.5, r: 255, g: 145, b: 0 },  // #ff9100 dark orange
            { pos: 1, r: 213, g: 0, b: 0 }       // #d50000 dark red
        ];

        // Find the two colors to interpolate between
        let c1 = colors[0], c2 = colors[1];
        for (let i = 0; i < colors.length - 1; i++) {
            if (ratio >= colors[i].pos && ratio <= colors[i + 1].pos) {
                c1 = colors[i];
                c2 = colors[i + 1];
                break;
            }
        }

        // Interpolate
        const range = c2.pos - c1.pos;
        const t = range > 0 ? (ratio - c1.pos) / range : 0;

        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);

        return `rgb(${r}, ${g}, ${b})`;
    },

    /**
     * Start route dash animation for direction indication
     */
    _startRouteAnimation() {
        // Stop any existing animation
        this._stopRouteAnimation();

        const animate = () => {
            this._dashOffset += 0.5;
            if (this._dashOffset > 7) this._dashOffset = 0;

            // Calculate dash array based on offset
            const dashLength = 3;
            const gapLength = 4;
            const offset = this._dashOffset % (dashLength + gapLength);

            // Update dash pattern for route layer
            if (this.map.getLayer('route-layer-animated')) {
                this.map.setPaintProperty('route-layer-animated', 'line-dasharray', [
                    offset,
                    gapLength,
                    dashLength - offset > 0 ? dashLength - offset : 0
                ]);
            }

            // Update dash pattern for follow layer
            if (this.map.getLayer('follow-layer-animated')) {
                this.map.setPaintProperty('follow-layer-animated', 'line-dasharray', [
                    offset,
                    gapLength,
                    dashLength - offset > 0 ? dashLength - offset : 0
                ]);
            }

            this._animationFrame = requestAnimationFrame(animate);
        };

        this._animationFrame = requestAnimationFrame(animate);
    },

    /**
     * Stop route dash animation
     */
    _stopRouteAnimation() {
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
            this._animationFrame = null;
        }
        this._dashOffset = 0;
    },

    /**
     * Add route start/end marker
     */
    _addRouteMarker(position, color, title) {
        const el = document.createElement('div');
        el.className = 'route-marker';
        el.style.backgroundColor = color;
        el.title = title;

        const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([position.longitude, position.latitude])
            .addTo(this.map);

        if (!this.routeMarkers) this.routeMarkers = [];
        this.routeMarkers.push(marker);
    },

    /**
     * Clear route polylines and markers
     */
    clearRoute() {
        // Stop animation
        this._stopRouteAnimation();

        // Clear route data
        if (this.map && this.map.getSource(this.routeSourceId)) {
            this.map.getSource(this.routeSourceId).setData({
                type: 'FeatureCollection',
                features: []
            });
        }

        // Clear route markers
        if (this.routeMarkers) {
            this.routeMarkers.forEach(m => m.remove());
            this.routeMarkers = [];
        }

        // Clear route markers via HistoryManager
        if (typeof HistoryManager !== 'undefined' && HistoryManager._clearRouteMarkers) {
            HistoryManager._clearRouteMarkers();
        }
    },

    /**
     * Remove a marker
     */
    removeMarker(deviceId) {
        if (this.markers[deviceId]) {
            this.markers[deviceId].remove();
            delete this.markers[deviceId];
        }
        if (this.markerLabels[deviceId]) {
            this.markerLabels[deviceId].marker.remove();
            delete this.markerLabels[deviceId];
        }
    },

    // =====================================================
    // Follow Mode Functions
    // =====================================================

    /**
     * Start following a device - draw path as it moves
     */
    startFollow(deviceId) {
        // Get current position as starting point
        const position = DeviceManager.positions[deviceId];
        if (!position) {
            console.error('Cannot start follow: no position data');
            return;
        }

        this.followMode = true;
        this.followDeviceId = deviceId;
        this.followPositions = [{
            latitude: position.latitude,
            longitude: position.longitude,
            speed: position.speed,
            deviceTime: position.deviceTime
        }];

        // Clear any existing route
        this.clearRoute();

        // Update button state
        const followBtn = document.getElementById('followBtn');
        if (followBtn) {
            followBtn.classList.add('active');
        }

        // Center on the device
        this.map.flyTo({
            center: [position.longitude, position.latitude],
            zoom: 16,
            duration: 1000
        });

        console.log(`🎯 Follow mode started for device ${deviceId}`);
    },

    /**
     * Stop following device and clear path
     */
    stopFollow() {
        if (!this.followMode) return;

        this.followMode = false;
        this.followDeviceId = null;
        this.followPositions = [];

        // Stop animation
        this._stopRouteAnimation();

        // Clear follow path
        if (this.map && this.map.getSource(this.followSourceId)) {
            this.map.getSource(this.followSourceId).setData({
                type: 'FeatureCollection',
                features: []
            });
        }

        // Update button state
        const followBtn = document.getElementById('followBtn');
        if (followBtn) {
            followBtn.classList.remove('active');
        }

        console.log('🎯 Follow mode stopped');
    },

    /**
     * Add a new position to the follow path
     */
    addFollowPosition(position) {
        if (!this.followMode || position.deviceId != this.followDeviceId) return;

        // Add position to array
        this.followPositions.push({
            latitude: position.latitude,
            longitude: position.longitude,
            speed: position.speed,
            deviceTime: position.deviceTime
        });

        // Redraw path
        this._drawFollowPath();

        // Center map on new position
        this.map.easeTo({
            center: [position.longitude, position.latitude],
            duration: 500
        });
    },

    /**
     * Draw the follow path polyline
     */
    _drawFollowPath() {
        if (this.followPositions.length < 2) return;

        // Create features with time-based gradient coloring
        const features = [];
        const totalSegments = this.followPositions.length - 1;

        for (let i = 1; i < this.followPositions.length; i++) {
            // Calculate time ratio (0 = start, 1 = end)
            const ratio = (i - 1) / Math.max(totalSegments - 1, 1);
            const color = this._getTimeGradientColor(ratio);

            features.push({
                type: 'Feature',
                properties: { color },
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [this.followPositions[i - 1].longitude, this.followPositions[i - 1].latitude],
                        [this.followPositions[i].longitude, this.followPositions[i].latitude]
                    ]
                }
            });
        }

        if (this.map.getSource(this.followSourceId)) {
            this.map.getSource(this.followSourceId).setData({
                type: 'FeatureCollection',
                features: features
            });
        }

        // Start animation if not already running
        if (!this._animationFrame) {
            this._startRouteAnimation();
        }
    }
};

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    MapManager.init();
});
