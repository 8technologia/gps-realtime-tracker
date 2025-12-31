/**
 * History module - Route history viewing with enhanced visualization (Mapbox)
 */
const HistoryManager = {
    modal: null,
    isLoading: false,
    currentDeviceId: null,
    routeMarkers: [],  // Store route markers for cleanup

    /**
     * Initialize history module
     */
    init() {
        this.modal = document.getElementById('historyModal');

        // Event listeners
        document.getElementById('historyClose')?.addEventListener('click', () => this.close());
        document.getElementById('loadHistoryBtn')?.addEventListener('click', () => this.loadHistory());

        // Close on overlay click
        this.modal?.querySelector('.modal-overlay')?.addEventListener('click', () => this.close());

        // Live validation on date/hour changes
        ['historyFromDate', 'historyFromHour', 'historyToDate', 'historyToHour'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this._validateForm());
        });

        // Force date picker to open on click (for better UX)
        ['historyFromDate', 'historyToDate'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('click', () => {
                    if (input.showPicker) {
                        input.showPicker();
                    }
                });
            }
        });
    },

    /**
     * Open general history modal (from header button)
     */
    openGeneralHistory() {
        const deviceId = MapManager.selectedDeviceId || Object.keys(DeviceManager.devices)[0];
        if (deviceId) {
            this.openCustomRouteModal(parseInt(deviceId));
        }
    },

    /**
     * Open custom route modal for specific device
     */
    openCustomRouteModal(deviceId) {
        if (!this.modal) return;

        this.currentDeviceId = deviceId;
        const device = DeviceManager.devices[deviceId];

        // Update modal title with device name
        const nameEl = document.getElementById('historyDeviceName');
        if (nameEl) {
            nameEl.textContent = device?.name || 'Xe';
        }

        // Set hidden device ID
        const deviceInput = document.getElementById('historyDevice');
        if (deviceInput) {
            deviceInput.value = deviceId;
        }

        // Set default dates (today)
        this._setDefaultDates();

        // Clear previous stats
        document.getElementById('historyStats').style.display = 'none';

        // Clear validation errors
        this._clearValidationErrors();

        this.modal.classList.add('active');
    },

    /**
     * Load today's route directly
     */
    async loadTodayRoute(deviceId) {
        if (this.isLoading) return;

        const device = DeviceManager.devices[deviceId];
        if (!device) return;

        // Get today's date range (00:00 to now)
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

        const from = todayStart.toISOString();
        const to = now.toISOString();

        try {
            this.isLoading = true;

            const positions = await API.getRouteHistory(deviceId, from, to);

            if (positions.length === 0) {
                alert('Không có dữ liệu lộ trình hôm nay');
                return;
            }

            // Draw enhanced route on map
            this._drawEnhancedRoute(positions);

            // Calculate and show stats
            const stats = this._calculateStats(positions);
            console.log(`📍 Today's route: ${stats.distance.toFixed(1)} km, ${stats.points} points`);

        } catch (error) {
            console.error('Failed to load today route:', error);
            alert(error.message || 'Lỗi khi tải lộ trình. Vui lòng thử lại.');
        } finally {
            this.isLoading = false;
        }
    },

    /**
     * Close history modal
     */
    close() {
        if (!this.modal) return;
        this.modal.classList.remove('active');
    },

    /**
     * Set default date range (today)
     */
    _setDefaultDates() {
        const now = new Date();
        const todayStr = this._formatDate(now);
        const currentHour = now.getHours();

        const fromDateInput = document.getElementById('historyFromDate');
        const fromHourInput = document.getElementById('historyFromHour');
        const toDateInput = document.getElementById('historyToDate');
        const toHourInput = document.getElementById('historyToHour');

        if (fromDateInput) {
            fromDateInput.value = todayStr;
            fromDateInput.max = todayStr;  // Can't select future dates
        }
        if (fromHourInput) fromHourInput.value = '0';
        if (toDateInput) {
            toDateInput.value = todayStr;
            toDateInput.max = todayStr;
        }
        if (toHourInput) toHourInput.value = (currentHour + 1).toString();  // Current hour + 1
    },

    /**
     * Format date for date input (YYYY-MM-DD)
     */
    _formatDate(date) {
        const pad = n => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },

    /**
     * Validate form inputs
     */
    _validateForm() {
        const fromDate = document.getElementById('historyFromDate')?.value;
        const fromHour = parseInt(document.getElementById('historyFromHour')?.value || '0');
        const toDate = document.getElementById('historyToDate')?.value;
        const toHour = parseInt(document.getElementById('historyToHour')?.value || '0');
        const btn = document.getElementById('loadHistoryBtn');

        this._clearValidationErrors();

        if (!fromDate || !toDate) {
            btn.disabled = true;
            return false;
        }

        const errors = [];

        // Check if from > to (overall)
        const fromDateTime = new Date(`${fromDate}T${fromHour.toString().padStart(2, '0')}:00:00`);
        const toDateTime = new Date(`${toDate}T${toHour.toString().padStart(2, '0')}:00:00`);

        if (fromDateTime >= toDateTime) {
            errors.push('Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc');
        }

        // Check max 7 days
        const maxRange = 7 * 24 * 60 * 60 * 1000;
        if (toDateTime - fromDateTime > maxRange) {
            errors.push('Khoảng thời gian không được vượt quá 7 ngày');
        }

        // Check not future
        const now = new Date();
        if (toDateTime > now) {
            errors.push('Không thể chọn thời gian trong tương lai');
        }

        if (errors.length > 0) {
            this._showValidationErrors(errors);
            btn.disabled = true;
            return false;
        }

        btn.disabled = false;
        return true;
    },

    _showValidationErrors(errors) {
        const container = document.getElementById('historyStats');
        if (container) {
            container.style.display = 'block';
            container.innerHTML = `
                <div style="color: var(--accent-danger); font-size: 0.85rem;">
                    ${errors.map(e => `⚠️ ${e}`).join('<br>')}
                </div>
            `;
        }
    },

    _clearValidationErrors() {
        const container = document.getElementById('historyStats');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
    },

    /**
     * Load and display route history
     */
    async loadHistory() {
        if (this.isLoading) return;

        if (!this._validateForm()) {
            return;
        }

        const deviceId = document.getElementById('historyDevice')?.value;
        const fromDate = document.getElementById('historyFromDate')?.value;
        const fromHour = document.getElementById('historyFromHour')?.value;
        const toDate = document.getElementById('historyToDate')?.value;
        const toHour = document.getElementById('historyToHour')?.value;

        // Build date objects from date + hour
        const fromDateTime = new Date(`${fromDate}T${fromHour.padStart(2, '0')}:00:00`);
        const toDateTime = new Date(`${toDate}T${toHour.padStart(2, '0')}:00:00`);

        const from = fromDateTime.toISOString();
        const to = toDateTime.toISOString();

        const btn = document.getElementById('loadHistoryBtn');
        const statsEl = document.getElementById('historyStats');

        try {
            this.isLoading = true;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Đang tải...';

            const positions = await API.getRouteHistory(deviceId, from, to);

            if (positions.length === 0) {
                alert('Không có dữ liệu trong khoảng thời gian này');
                return;
            }

            // Draw enhanced route on map
            this._drawEnhancedRoute(positions);

            // Calculate stats
            const stats = this._calculateStats(positions);

            // Show stats
            statsEl.style.display = 'block';
            statsEl.innerHTML = `
                <div class="history-stats-grid">
                    <div class="history-stat">
                        <div class="history-stat-value">${stats.distance.toFixed(1)}</div>
                        <div class="history-stat-label">Km di chuyển</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-value">${stats.maxSpeed.toFixed(0)}</div>
                        <div class="history-stat-label">Km/h tối đa</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-value">${stats.avgSpeed.toFixed(0)}</div>
                        <div class="history-stat-label">Km/h trung bình</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-value">${stats.stops}</div>
                        <div class="history-stat-label">Lần dừng đỗ</div>
                    </div>
                </div>
            `;

            // Close modal after delay
            setTimeout(() => this.close(), 500);

        } catch (error) {
            console.error('Failed to load history:', error);
            alert(error.message || 'Lỗi khi tải lịch sử. Vui lòng thử lại.');
        } finally {
            this.isLoading = false;
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                Xem lộ trình
            `;
        }
    },

    /**
     * Draw enhanced route with direction arrows, speed colors, and stop markers (Mapbox)
     */
    _drawEnhancedRoute(positions) {
        // Clear previous route
        MapManager.clearRoute();
        this._clearRouteMarkers();

        if (!positions || positions.length === 0) return;

        // Show legend
        const legend = document.getElementById('routeLegend');
        if (legend) legend.style.display = 'block';

        // Create GeoJSON features for each segment with speed-based colors
        const features = [];
        let stops = [];
        let stopStart = null;

        for (let i = 1; i < positions.length; i++) {
            const prevPos = positions[i - 1];
            const pos = positions[i];
            const speedKmh = pos.speed * 1.852;

            // Determine color based on speed
            let color;
            if (speedKmh < 1) {
                color = '#ff4466';  // Stopped - red
                // Track stop duration
                if (!stopStart) {
                    stopStart = { pos: prevPos, index: i - 1 };
                }
            } else if (speedKmh < 30) {
                color = '#ffaa00';  // Slow - orange
                if (stopStart) {
                    const duration = new Date(pos.deviceTime) - new Date(stopStart.pos.deviceTime);
                    if (duration > 60000) { // More than 1 minute = stop
                        stops.push({
                            lng: stopStart.pos.longitude,
                            lat: stopStart.pos.latitude,
                            duration: duration,
                            time: stopStart.pos.deviceTime
                        });
                    }
                    stopStart = null;
                }
            } else if (speedKmh < 60) {
                color = '#00ff88';  // Normal - green
                stopStart = null;
            } else {
                color = '#00d4ff';  // Fast - cyan
                stopStart = null;
            }

            features.push({
                type: 'Feature',
                properties: { color },
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [prevPos.longitude, prevPos.latitude],
                        [pos.longitude, pos.latitude]
                    ]
                }
            });
        }

        // Update route source
        if (MapManager.map.getSource(MapManager.routeSourceId)) {
            MapManager.map.getSource(MapManager.routeSourceId).setData({
                type: 'FeatureCollection',
                features
            });
        }

        // Add direction arrows along the route
        this._addDirectionArrows(positions);

        // Add start marker
        if (positions.length > 0) {
            this._addMarker(
                positions[0].longitude,
                positions[0].latitude,
                '#00ff88',
                'Bắt đầu: ' + new Date(positions[0].deviceTime).toLocaleString('vi-VN')
            );

            // Add end marker
            const lastPos = positions[positions.length - 1];
            this._addMarker(
                lastPos.longitude,
                lastPos.latitude,
                '#ff4466',
                'Kết thúc: ' + new Date(lastPos.deviceTime).toLocaleString('vi-VN')
            );
        }

        // Add stop markers
        stops.forEach((stop) => {
            const minutes = Math.round(stop.duration / 60000);
            this._addMarker(
                stop.lng,
                stop.lat,
                '#ffaa00',
                `Dừng ${minutes} phút - ${new Date(stop.time).toLocaleTimeString('vi-VN')}`,
                true  // smaller marker
            );
        });

        // Fit bounds
        const routeBounds = new mapboxgl.LngLatBounds();
        positions.forEach(p => routeBounds.extend([p.longitude, p.latitude]));
        MapManager.map.fitBounds(routeBounds, { padding: 50 });
    },

    /**
     * Add a marker to the map (Mapbox)
     */
    _addMarker(lng, lat, color, title, small = false) {
        const el = document.createElement('div');
        el.className = 'route-marker';
        el.style.backgroundColor = color;
        el.style.width = small ? '10px' : '16px';
        el.style.height = small ? '10px' : '16px';
        el.title = title;

        const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(MapManager.map);

        this.routeMarkers.push(marker);
    },

    /**
     * Add direction arrows along the route (Mapbox)
     */
    _addDirectionArrows(positions) {
        // Add arrows every N positions
        const arrowInterval = Math.max(1, Math.floor(positions.length / 20));

        for (let i = arrowInterval; i < positions.length - 1; i += arrowInterval) {
            const pos = positions[i];
            const nextPos = positions[i + 1] || pos;

            // Calculate bearing
            const bearing = this._calculateBearing(
                pos.latitude, pos.longitude,
                nextPos.latitude, nextPos.longitude
            );

            const el = document.createElement('div');
            el.className = 'direction-arrow';
            el.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="#000" stroke-width="1" style="transform: rotate(${bearing}deg)">
                    <path d="M12 2 L22 22 L12 16 L2 22 Z"/>
                </svg>
            `;

            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                .setLngLat([pos.longitude, pos.latitude])
                .addTo(MapManager.map);

            this.routeMarkers.push(marker);
        }
    },

    /**
     * Calculate bearing between two points
     */
    _calculateBearing(lat1, lon1, lat2, lon2) {
        const dLon = this._toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(this._toRad(lat2));
        const x = Math.cos(this._toRad(lat1)) * Math.sin(this._toRad(lat2)) -
            Math.sin(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) * Math.cos(dLon);
        return (this._toDeg(Math.atan2(y, x)) + 360) % 360;
    },

    _toDeg(rad) {
        return rad * 180 / Math.PI;
    },

    /**
     * Clear route markers
     */
    _clearRouteMarkers() {
        this.routeMarkers.forEach(marker => marker.remove());
        this.routeMarkers = [];

        // Hide legend
        const legend = document.getElementById('routeLegend');
        if (legend) legend.style.display = 'none';
    },

    /**
     * Clear route (called when closing info card)
     */
    clearRoute() {
        MapManager.clearRoute();
        this._clearRouteMarkers();
    },

    /**
     * Calculate route statistics
     */
    _calculateStats(positions) {
        let totalDistance = 0;
        let maxSpeed = 0;
        let speedSum = 0;
        let speedCount = 0;
        let stops = 0;
        let inStop = false;

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const speedKmh = pos.speed * 1.852;

            if (speedKmh > maxSpeed) maxSpeed = speedKmh;
            if (speedKmh > 0) {
                speedSum += speedKmh;
                speedCount++;
                inStop = false;
            } else {
                if (!inStop && i > 0) {
                    stops++;
                    inStop = true;
                }
            }

            // Calculate distance from previous point
            if (i > 0) {
                const prev = positions[i - 1];
                totalDistance += this._haversineDistance(
                    prev.latitude, prev.longitude,
                    pos.latitude, pos.longitude
                );
            }
        }

        return {
            distance: totalDistance,
            maxSpeed: maxSpeed,
            avgSpeed: speedCount > 0 ? speedSum / speedCount : 0,
            points: positions.length,
            stops: stops
        };
    },

    /**
     * Haversine formula for distance calculation
     */
    _haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this._toRad(lat2 - lat1);
        const dLon = this._toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    _toRad(deg) {
        return deg * Math.PI / 180;
    }
};
