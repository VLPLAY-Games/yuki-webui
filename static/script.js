let ws = null;
let reconnectTimer = null;
const RECONNECT_DELAY = 3000;

const statusIndicator = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const devicesTbody = document.querySelector('#devices-table tbody');
const logList = document.getElementById('log-list');
const clearLogsBtn = document.getElementById('clear-logs');

const modal = document.getElementById('command-modal');
const modalDeviceId = document.getElementById('modal-device-id');
const modalCommand = document.getElementById('modal-command');
const modalPayload = document.getElementById('modal-payload');
const sendJsonBtn = document.getElementById('send-json-command');
const closeModalBtn = document.querySelector('.close');

let devices = {};

function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    ws = new WebSocket('ws://localhost:8000/webui');

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        addLogEntry('system', 'Connected to Yuki Core');
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (e) {
            console.error('Invalid JSON from Core:', e);
            addLogEntry('error', 'Received malformed message from Core');
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        addLogEntry('system', 'Disconnected from Core');
        scheduleReconnect();
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        addLogEntry('error', 'WebSocket error');
    };
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        addLogEntry('system', 'Attempting to reconnect...');
        connectWebSocket();
    }, RECONNECT_DELAY);
}

function updateConnectionStatus(connected) {
    if (connected) {
        statusIndicator.classList.add('connected');
        statusIndicator.classList.remove('disconnected');
        statusText.textContent = 'Connected';
    } else {
        statusIndicator.classList.remove('connected');
        statusIndicator.classList.add('disconnected');
        statusText.textContent = 'Disconnected';
    }
}

function handleMessage(data) {
    if (data.type === 'devices_list' || data.type === 'devices_update') {
        if (data.payload && data.payload.devices) {
            updateDeviceTable(data.payload.devices);
        }
    }
}

function updateDeviceTable(newDevices) {
    devices = newDevices;
    devicesTbody.innerHTML = '';

    if (Object.keys(devices).length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" style="text-align: center; color: #888;">No devices connected</td>`;
        devicesTbody.appendChild(tr);
        return;
    }

    for (let id in devices) {
        const dev = devices[id];
        const tr = document.createElement('tr');

        const statusClass = `status-${dev.status}`;
        const statusBadge = `<span class="status-badge ${statusClass}">${dev.status}</span>`;
        const lastSeen = dev.last_seen ? new Date(dev.last_seen * 1000).toLocaleTimeString() : '—';

        tr.innerHTML = `
            <td><code>${id}</code></td>
            <td>${dev.type}</td>
            <td>${statusBadge}</td>
            <td>${lastSeen}</td>
            <td>
                <input type="text" id="cmd-${id}" placeholder="Command" style="width: 120px;">
                <button onclick="sendSimpleCommand('${id}')">Send</button>
                <button class="secondary" onclick="openJsonModal('${id}')">JSON</button>
            </td>
        `;
        devicesTbody.appendChild(tr);
    }
}

function sendSimpleCommand(deviceId) {
    const input = document.getElementById(`cmd-${deviceId}`);
    const command = input.value.trim();
    if (!command) {
        alert('Please enter a command');
        return;
    }
    sendCommand(deviceId, command, {});
    input.value = '';
}

function sendCommand(deviceId, command, payload = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to Core');
        addLogEntry('error', 'Cannot send command: WebSocket not connected');
        return;
    }
    const msg = {
        device_id: deviceId,
        command: command,
        payload: payload
    };
    ws.send(JSON.stringify(msg));
    addLogEntry('command', `→ ${deviceId}: ${command} ${JSON.stringify(payload)}`);
}

function openJsonModal(deviceId) {
    modalDeviceId.value = deviceId;
    modalCommand.value = '';
    modalPayload.value = '{}';
    modal.style.display = 'block';
}

function addLogEntry(category, message) {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    li.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-cat">[${category}]</span> ${message}`;
    logList.appendChild(li);
    const container = document.getElementById('log-container');
    container.scrollTop = container.scrollHeight;
    if (logList.children.length > 100) {
        logList.removeChild(logList.firstChild);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();

    clearLogsBtn.addEventListener('click', () => {
        logList.innerHTML = '';
    });

    closeModalBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target === modal) modal.style.display = 'none';
    };

    sendJsonBtn.onclick = () => {
        const deviceId = modalDeviceId.value;
        const command = modalCommand.value.trim();
        let payload = {};
        try {
            payload = JSON.parse(modalPayload.value);
        } catch (e) {
            alert('Invalid JSON payload');
            return;
        }
        if (!command) {
            alert('Command is required');
            return;
        }
        sendCommand(deviceId, command, payload);
        modal.style.display = 'none';
    };
});

window.sendSimpleCommand = sendSimpleCommand;
window.openJsonModal = openJsonModal;