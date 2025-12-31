/**
 * API module - Handles REST API calls
 */
const API = {
    /**
     * Fetch devices list
     */
    async getDevices() {
        try {
            const response = await fetch(`${CONFIG.API_BASE}/api/devices`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch devices:', error);
            throw error;
        }
    },

    /**
     * Fetch current positions
     */
    async getPositions() {
        try {
            const response = await fetch(`${CONFIG.API_BASE}/api/positions`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch positions:', error);
            throw error;
        }
    },

    /**
     * Fetch route history
     */
    async getRouteHistory(deviceId, from, to) {
        try {
            const params = new URLSearchParams({
                deviceId: deviceId,
                from: from,
                to: to
            });
            const response = await fetch(`${CONFIG.API_BASE}/api/reports/route?${params}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch route history:', error);
            throw error;
        }
    },

    /**
     * Check API health
     */
    async checkHealth() {
        try {
            const response = await fetch(`${CONFIG.API_BASE}/api/health`);
            return await response.json();
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }
};
