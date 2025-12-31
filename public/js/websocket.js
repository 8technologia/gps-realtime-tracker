/**
 * WebSocket module - Handles real-time updates
 */
const WebSocketManager = {
    socket: null,
    isConnected: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    listeners: {
        position: [],
        device: [],
        event: [],
        connect: [],
        disconnect: []
    },

    /**
     * Connect to WebSocket server
     */
    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected');
            return;
        }

        console.log('🔌 Connecting to WebSocket...');

        try {
            this.socket = new WebSocket(CONFIG.WS_URL);

            this.socket.onopen = () => {
                console.log('✅ WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this._notify('connect', { connected: true });
                this._updateConnectionStatus(true);
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this._handleMessage(data);
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            };

            this.socket.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
            };

            this.socket.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                this.isConnected = false;
                this._notify('disconnect', { connected: false });
                this._updateConnectionStatus(false);
                this._scheduleReconnect();
            };
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this._scheduleReconnect();
        }
    },

    /**
     * Handle incoming messages
     */
    _handleMessage(data) {
        // Traccar sends updates as { positions: [...], devices: [...], events: [...] }
        if (data.positions) {
            data.positions.forEach(pos => this._notify('position', pos));
        }
        if (data.devices) {
            data.devices.forEach(dev => this._notify('device', dev));
        }
        if (data.events) {
            data.events.forEach(evt => this._notify('event', evt));
        }
    },

    /**
     * Schedule reconnection
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(CONFIG.RECONNECT_INTERVAL * this.reconnectAttempts, 30000);

        console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);

        setTimeout(() => this.connect(), delay);
    },

    /**
     * Update UI connection status
     */
    _updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            const dot = statusEl.querySelector('.status-dot');
            const text = statusEl.querySelector('.status-text');

            if (connected) {
                dot.classList.add('online');
                text.textContent = 'Đã kết nối';
            } else {
                dot.classList.remove('online');
                text.textContent = 'Mất kết nối...';
            }
        }
    },

    /**
     * Register event listener
     */
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    },

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    },

    /**
     * Notify listeners
     */
    _notify(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error('Listener error:', e);
                }
            });
        }
    },

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
};
