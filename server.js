/**
 * GPS Realtime Tracking Server
 * Proxies requests to Traccar API with automatic authentication
 */

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configuration
const TRACCAR_URL = process.env.TRACCAR_URL || 'https://traccar.apixgate.com';
const TRACCAR_EMAIL = process.env.TRACCAR_EMAIL;
const TRACCAR_PASSWORD = process.env.TRACCAR_PASSWORD;
const PORT = process.env.PORT || 3000;
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

// Session storage
let sessionCookie = null;

/**
 * Authenticate with Traccar and store session cookie
 */
async function authenticateTraccar() {
    console.log('🔐 Authenticating with Traccar...');

    try {
        const response = await fetch(`${TRACCAR_URL}/api/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `email=${encodeURIComponent(TRACCAR_EMAIL)}&password=${encodeURIComponent(TRACCAR_PASSWORD)}`
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status}`);
        }

        // Extract session cookie
        const cookies = response.headers.raw()['set-cookie'];
        if (cookies) {
            sessionCookie = cookies.map(cookie => cookie.split(';')[0]).join('; ');
            console.log('✅ Authentication successful!');
            return true;
        }

        throw new Error('No session cookie received');
    } catch (error) {
        console.error('❌ Authentication error:', error.message);
        return false;
    }
}

/**
 * Proxy middleware for Traccar API
 */
async function proxyToTraccar(req, res, endpoint) {
    if (!sessionCookie) {
        const authenticated = await authenticateTraccar();
        if (!authenticated) {
            return res.status(503).json({ error: 'Unable to connect to Traccar' });
        }
    }

    try {
        const url = `${TRACCAR_URL}${endpoint}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;

        const response = await fetch(url, {
            method: req.method,
            headers: {
                'Cookie': sessionCookie,
                'Accept': 'application/json'
            }
        });

        // If unauthorized, try to re-authenticate
        if (response.status === 401) {
            console.log('🔄 Session expired, re-authenticating...');
            const authenticated = await authenticateTraccar();
            if (authenticated) {
                return proxyToTraccar(req, res, endpoint);
            }
            return res.status(503).json({ error: 'Unable to reconnect to Traccar' });
        }

        // Check content type before parsing JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Unexpected response from Traccar:', text.substring(0, 200));
            return res.status(502).json({ error: 'Traccar returned non-JSON response' });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).json({ error: error.message });
    }
}

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Proxy routes
app.get('/api/devices', (req, res) => proxyToTraccar(req, res, '/api/devices'));
app.get('/api/positions', (req, res) => proxyToTraccar(req, res, '/api/positions'));

// Route history with validation
app.get('/api/reports/route', (req, res) => {
    const { deviceId, from, to } = req.query;

    // Validate required parameters
    if (!deviceId || !from || !to) {
        return res.status(400).json({ error: 'Missing required parameters: deviceId, from, to' });
    }

    // Validate device ID is a number
    if (isNaN(parseInt(deviceId))) {
        return res.status(400).json({ error: 'Invalid deviceId format' });
    }

    // Validate date formats
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use ISO 8601 format.' });
    }

    // Validate start < end
    if (fromDate >= toDate) {
        return res.status(400).json({ error: 'Start date must be before end date' });
    }

    // Validate max range (7 days)
    const maxRange = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    if (toDate - fromDate > maxRange) {
        return res.status(400).json({ error: 'Date range cannot exceed 7 days' });
    }

    // Validate not future dates
    const now = new Date();
    if (toDate > now) {
        return res.status(400).json({ error: 'End date cannot be in the future' });
    }

    proxyToTraccar(req, res, '/api/reports/route');
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        authenticated: !!sessionCookie,
        timestamp: new Date().toISOString()
    });
});

// Config endpoint - provides frontend configuration
app.get('/api/config', (req, res) => {
    res.json({
        mapboxToken: MAPBOX_TOKEN
    });
});

// WebSocket server for proxying Traccar WebSocket
const wss = new WebSocket.Server({ server, path: '/ws' });

// Heartbeat interval to detect dead connections
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log('💀 Terminating dead WebSocket connection');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

wss.on('connection', async (clientWs) => {
    console.log('📡 New WebSocket client connected');

    // Initialize heartbeat tracking
    clientWs.isAlive = true;
    clientWs.on('pong', () => { clientWs.isAlive = true; });

    // Ensure we have a session
    if (!sessionCookie) {
        await authenticateTraccar();
    }

    if (!sessionCookie) {
        clientWs.close(1008, 'Unable to authenticate with Traccar');
        return;
    }

    // Connect to Traccar WebSocket
    const traccarWsUrl = TRACCAR_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/socket';

    const traccarWs = new WebSocket(traccarWsUrl, {
        headers: {
            'Cookie': sessionCookie
        }
    });

    traccarWs.on('open', () => {
        console.log('✅ Connected to Traccar WebSocket');
    });

    traccarWs.on('message', (data) => {
        // Forward messages from Traccar to client
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data.toString());
        }
    });

    traccarWs.on('error', (error) => {
        console.error('❌ Traccar WebSocket error:', error.message);
    });

    traccarWs.on('close', () => {
        console.log('🔌 Traccar WebSocket closed');
        clientWs.close();
    });

    clientWs.on('close', () => {
        console.log('📴 Client WebSocket disconnected');
        traccarWs.close();
    });

    clientWs.on('error', (error) => {
        console.error('Client WebSocket error:', error.message);
        traccarWs.close();
    });
});

// Start server
async function start() {
    // Pre-authenticate with Traccar
    await authenticateTraccar();

    server.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║         🚗 GPS Realtime Tracking Server                   ║
╠═══════════════════════════════════════════════════════════╣
║  🌐 Server running at: http://localhost:${PORT}              ║
║  📡 WebSocket at: ws://localhost:${PORT}/ws                  ║
║  🔗 Traccar API: ${TRACCAR_URL}        ║
╚═══════════════════════════════════════════════════════════╝
        `);
    });
}

start();
