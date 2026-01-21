require('dotenv').config();
const WebSocket = require('ws');
const zlib = require('zlib');
const express = require('express');
const expressWs = require('express-ws');

const app = express();
const wsInstance = expressWs(app);

const url = process.env.WS_URL;
const PORT = process.env.PORT || 3000;

if (!url) {
    console.error("WS_URL not found in environment variables");
    process.exit(1);
}

// Global cache for the latest data
const cache = {
    contactDetails: null,
    referanceDetails: null,
    liveRates: {},
    workerPublishCoin: null,
    lastUpdate: null
};

// WebSocket clients for our /ws/stream endpoint
const clients = new Set();

function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function connectToSource() {
    console.log(`Connecting to Source: ${url}`);
    const ws = new WebSocket(url, {
        origin: 'https://radhikajewellers.in'
    });

    let pingInterval;

    ws.on('open', () => {
        console.log('Connected to Starlinedashboard WebSocket');

        // 1. Send SignalR Handshake
        ws.send(JSON.stringify({ protocol: "json", version: 1 }) + "\x1e");

        // 2. Send Subscription/Initialization Message
        ws.send(JSON.stringify({
            arguments: ["radhika"],
            invocationId: "0",
            target: "client",
            type: 1
        }) + "\x1e");

        // 3. Keep Connection Alive (SignalR Heartbeat)
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 6 }) + "\x1e");
            }
        }, 15000);
    });

    ws.on('message', (data) => {
        const strData = data.toString();
        const frames = strData.split("\x1e").filter(Boolean);

        for (const frame of frames) {
            try {
                const msg = JSON.parse(frame);

                if (msg.type === 6) continue;

                if (msg.type === 1) {
                    handleSourceMessage(msg.target, msg.arguments);
                }
            } catch (e) {
                console.error("Error parsing frame from source:", e);
            }
        }
    });

    ws.on('error', (err) => {
        console.error("Source WebSocket error:", err);
    });

    ws.on('close', () => {
        console.log("Source WebSocket connection closed. Reconnecting in 5s...");
        clearInterval(pingInterval);
        setTimeout(connectToSource, 5000);
    });
}

function handleSourceMessage(target, args) {
    if (!args || args.length === 0) return;

    try {
        const gz = Buffer.from(args[0], "base64");
        const unzipped = zlib.gunzipSync(gz).toString();
        const data = JSON.parse(unzipped);

        // Update Cache
        if (target === 'contactDetails') cache.contactDetails = data;
        if (target === 'referanceDetails') cache.referanceDetails = data;
        if (target === 'workerPublish') {
            // Merge into liveRates or handle as discrete updates
            cache.liveRates = data;
            cache.lastUpdate = new Date().toISOString();
            // Broadcast to our clients
            broadcast({ target, data, timestamp: cache.lastUpdate });
        }
        if (target === 'workerPublishCoin') {
            cache.workerPublishCoin = data;
            broadcast({ target, data, timestamp: new Date().toISOString() });
        }

    } catch (e) {
        // console.error(`Error processing ${target}:`, e.message);
    }
}

// REST API
app.get('/api/latest', (req, res) => {
    res.json({
        success: true,
        data: cache
    });
});

// WebSocket Stream
app.ws('/ws/stream', (ws, req) => {
    console.log('New client subscribed to stream');
    clients.add(ws);

    // Send initial cache to the new client
    ws.send(JSON.stringify({ target: 'initialStore', data: cache }));

    ws.on('close', () => {
        console.log('Client unsubscribed');
        clients.delete(ws);
    });
});

// Start Source Connection
connectToSource();

// Start HTTP Server
app.listen(PORT, () => {
    console.log(`API Server running at http://localhost:${PORT}`);
    console.log(`WebSocket Stream available at ws://localhost:${PORT}/ws/stream`);
});
