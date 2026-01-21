const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/ws/stream');

ws.on('open', () => {
    console.log('Connected to Proxy WebSocket');
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log('Received from Proxy:', JSON.stringify(msg, null, 2));
});

ws.on('close', () => {
    console.log('Proxy connection closed');
});

ws.on('error', (err) => {
    console.error('Proxy Error:', err);
});

// Run for 15 seconds then exit
setTimeout(() => {
    console.log('Test finished');
    ws.close();
    process.exit(0);
}, 15000);
