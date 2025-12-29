// WebSocket-based real-time updates
let ws = null;
let wsReconnectTimer = null;

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        if (wsReconnectTimer) {
            clearTimeout(wsReconnectTimer);
            wsReconnectTimer = null;
        }
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleWSMessage(msg);
        } catch (err) {
            console.error('WS message parse error:', err);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in 3s...');
        wsReconnectTimer = setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };
}

function handleWSMessage(msg) {
    switch (msg.type) {
        case 'torrents':
            if (typeof renderTorrents === 'function') {
                const torrents = msg.data || [];
                renderTorrents(torrents);
                updateTorrentCount(torrents.length);
            }
            break;
        case 'aria2':
            if (typeof renderAria2Downloads === 'function') {
                const downloads = msg.data || [];
                renderAria2Downloads(downloads);
                updateDownloadCount(downloads.length);
            }
            break;
        case 'ffmpeg':
            if (typeof renderConversionQueue === 'function') {
                renderConversionQueue(msg.data || []);
            }
            break;
        case 'aria2_status':
            if (msg.data && typeof updateAria2UI === 'function') {
                window.aria2Available = msg.data.available;
                updateAria2UI();
            }
            break;
        case 'ffmpeg_status':
            if (msg.data && typeof updateFFmpegUI === 'function') {
                window.ffmpegAvailable = msg.data.available;
                updateFFmpegUI();
            }
            break;
        case 'response':
            // Handle command responses
            if (msg.data && msg.data.message) {
                Toast(msg.data.message, msg.data.status === 'ok' ? 'success' : 'error');
            }
            break;
    }
}

function sendWSCommand(action, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action, data }));
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
});
