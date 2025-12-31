/**
 * Devices module - Manages device list UI
 */
const DeviceManager = {
    devices: {},      // deviceId -> device data
    positions: {},    // deviceId -> position data
    activeDeviceId: null,

    /**
     * Load and display all devices
     */
    async loadDevices() {
        try {
            const [devices, positions] = await Promise.all([
                API.getDevices(),
                API.getPositions()
            ]);

            // Store data
            devices.forEach(d => this.devices[d.id] = d);
            positions.forEach(p => this.positions[p.deviceId] = p);

            // Render UI
            this.renderDeviceList();

            // Update map markers (no blink on initial load)
            this.updateAllMarkers(false);

            // Update device count
            this.updateDeviceCount();

            console.log(`📱 Loaded ${devices.length} devices`);
            return devices;
        } catch (error) {
            console.error('Failed to load devices:', error);
            this.showError();
            throw error;
        }
    },

    /**
     * Render device list in sidebar
     */
    renderDeviceList() {
        const container = document.getElementById('deviceList');
        if (!container) return;

        const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';

        // Filter devices
        let filteredDevices = Object.values(this.devices);
        if (searchTerm) {
            filteredDevices = filteredDevices.filter(d =>
                d.name.toLowerCase().includes(searchTerm)
            );
        }

        // Sort: online first, then by name
        filteredDevices.sort((a, b) => {
            if (a.status === 'online' && b.status !== 'online') return -1;
            if (a.status !== 'online' && b.status === 'online') return 1;
            return a.name.localeCompare(b.name);
        });

        // Generate HTML
        if (filteredDevices.length === 0) {
            container.innerHTML = `
                <div class="loading-placeholder">
                    <span>Không tìm thấy xe nào</span>
                </div>
            `;
            return;
        }

        container.innerHTML = filteredDevices.map(device => {
            const position = this.positions[device.id];
            const speed = position ? (position.speed * 1.852).toFixed(1) : '0';
            const isActive = device.id === this.activeDeviceId && !MapManager.liveMode;
            const statusClass = device.status === 'online' ? 'online' : 'offline';
            const statusText = device.status === 'online' ? 'Online' : 'Offline';

            return `
                <div class="device-item ${isActive ? 'active' : ''}" data-id="${device.id}">
                    <div class="device-header">
                        <span class="device-name">
                            <span>🚗</span>
                            ${this._escapeHtml(device.name)}
                        </span>
                        <span class="device-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="device-info">
                        <div class="device-info-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2L19 21l-7-4-7 4 7-19z"/>
                            </svg>
                            ${speed} km/h
                        </div>
                        <div class="device-info-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            ${this._formatTime(device.lastUpdate)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.device-item').forEach(item => {
            item.addEventListener('click', () => {
                const deviceId = parseInt(item.dataset.id);
                this.selectDevice(deviceId);
            });
        });
    },

    /**
     * Update all markers on map
     */
    updateAllMarkers(shouldBlink = false) {
        Object.keys(this.devices).forEach(deviceId => {
            const device = this.devices[deviceId];
            const position = this.positions[deviceId];
            if (position) {
                MapManager.updateMarker(deviceId, position, device, shouldBlink);
            }
        });
    },

    /**
     * Update single device position (called from WebSocket)
     */
    updatePosition(position) {
        this.positions[position.deviceId] = position;
        const device = this.devices[position.deviceId];

        if (device) {
            // Update marker on map (with auto-fit in LIVE mode)
            const shouldBlink = MapManager.liveMode;
            MapManager.updateMarker(position.deviceId, position, device, shouldBlink);

            // Update info card and refetch km if this device is selected
            if (MapManager.selectedDeviceId === position.deviceId) {
                MapManager.updateInfoCard();
                // Refetch today's km periodically (debounced)
                MapManager._refetchTodayKmDebounced(position.deviceId);
            }

            this.renderDeviceList();
            this._updateLastUpdateTime();

            // Highlight the updated device in the list
            this._highlightDeviceUpdate(position.deviceId);
        }
    },

    /**
     * Highlight device update time with blink animation
     */
    _highlightDeviceUpdate(deviceId) {
        const deviceItem = document.querySelector(`.device-item[data-id="${deviceId}"]`);
        if (deviceItem) {
            // Add blink class
            deviceItem.classList.add('device-updated');

            // Remove after animation
            setTimeout(() => {
                deviceItem.classList.remove('device-updated');
            }, 1500);
        }
    },

    /**
     * Update device status
     */
    updateDevice(device) {
        this.devices[device.id] = device;
        this.renderDeviceList();
        this.updateDeviceCount();
    },

    /**
     * Select a device - directly zoom to detail view
     */
    selectDevice(deviceId) {
        this.activeDeviceId = deviceId;
        this.renderDeviceList();
        // focusDevice will handle exiting LIVE mode and zooming
        MapManager.focusDevice(deviceId);
    },

    /**
     * Clear active device selection (for LIVE mode)
     */
    clearActiveDevice() {
        this.activeDeviceId = null;
        this.renderDeviceList();
    },

    /**
     * Update device count badge
     */
    updateDeviceCount() {
        const countEl = document.getElementById('deviceCount');
        if (!countEl) return;

        const total = Object.keys(this.devices).length;
        const online = Object.values(this.devices).filter(d => d.status === 'online').length;

        countEl.textContent = `${online}/${total} online`;
    },

    /**
     * Show error message
     */
    showError() {
        const container = document.getElementById('deviceList');
        if (container) {
            container.innerHTML = `
                <div class="loading-placeholder">
                    <span style="color: #ff4466">Lỗi kết nối. Đang thử lại...</span>
                </div>
            `;
        }
    },

    /**
     * Format time - show HH:mm:ss DD/MM
     */
    _formatTime(isoString) {
        if (!isoString) return 'N/A';

        const date = new Date(isoString);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');

        return `${hours}:${minutes}:${seconds} ${day}/${month}`;
    },

    /**
     * Update last update timestamp
     */
    _updateLastUpdateTime() {
        const el = document.getElementById('lastUpdate');
        if (el) {
            el.textContent = `Cập nhật: ${new Date().toLocaleTimeString('vi-VN')}`;
        }
    },

    /**
     * Escape HTML
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Get all devices (for history dropdown)
     */
    getAllDevices() {
        return Object.values(this.devices);
    }
};
