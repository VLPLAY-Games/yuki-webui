let ws = null;
let reconnectTimer = null;
const RECONNECT_DELAY = 3000;
let devices = {};
let selectedDeviceId = null;
let pendingConfirmation = null;

const statusIndicator = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const devicesTbody = document.querySelector('#devices-table tbody');
const groupTabs = document.getElementById('group-tabs');
const logList = document.getElementById('log-list');

// Modals
const commandModal = document.getElementById('command-modal');
const confirmModal = document.getElementById('confirm-modal');
const modalDeviceId = document.getElementById('modal-device-id');
const modalCommand = document.getElementById('modal-command');
const modalPayload = document.getElementById('modal-payload');
const confirmText = document.getElementById('confirm-text');

let currentGroup = 'all';

function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket('ws://localhost:8000/webui');
    ws.onopen = () => {
        updateConnectionStatus(true);
        addLogEntry('system', 'Connected to Core');
        if (reconnectTimer) clearTimeout(reconnectTimer);
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (e) {
            addLogEntry('error', 'Malformed message from Core');
        }
    };
    ws.onclose = () => {
        updateConnectionStatus(false);
        addLogEntry('system', 'Disconnected');
        scheduleReconnect();
    };
    ws.onerror = () => addLogEntry('error', 'WebSocket error');
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        addLogEntry('system', 'Reconnecting...');
        connectWebSocket();
    }, RECONNECT_DELAY);
}

function updateConnectionStatus(connected) {
    statusIndicator.classList.toggle('connected', connected);
    statusIndicator.classList.toggle('disconnected', !connected);
    statusText.textContent = connected ? 'Connected' : 'Disconnected';
}

function handleMessage(data) {
    if (data.type === 'devices_list' || data.type === 'devices_update') {
        if (data.payload && data.payload.devices) {
            devices = data.payload.devices;
            renderGroups();
            renderTable();
        }
    } else if (data.type === 'confirm_command') {
        const { device_id, command, params } = data.payload;
        pendingConfirmation = { id: data.id, device_id, command, params };
        confirmText.textContent = `Execute "${command}" on ${device_id}?`;
        confirmModal.style.display = 'block';
    }
}

function renderGroups() {
    const types = new Set();
    Object.values(devices).forEach(d => types.add(d.type));
    const groups = ['all', ...types];
    groupTabs.innerHTML = groups.map(g =>
        `<button class="tab ${currentGroup === g ? 'active' : ''}" data-group="${g}">${g}</button>`
    ).join('');
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            currentGroup = btn.dataset.group;
            renderGroups();
            renderTable();
        });
    });
}

function renderTable() {
    const filtered = Object.entries(devices).filter(([id, d]) =>
        currentGroup === 'all' || d.type === currentGroup
    );
    if (filtered.length === 0) {
        devicesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No devices</td></tr>`;
        return;
    }

    let html = '';
    for (const [id, d] of filtered) {
        const statusClass = `status-${d.status}`;
        const lastSeen = d.last_seen ? new Date(d.last_seen * 1000).toLocaleTimeString() : '—';
        const isSelected = (selectedDeviceId === id);
        html += `
            <tr class="${isSelected ? 'selected-row' : ''}" data-device-id="${id}">
                <td><code>${id}</code></td>
                <td>${d.type}</td>
                <td><span class="status-badge ${statusClass}">${d.status}</span></td>
                <td>${lastSeen}</td>
                <td>
                    <button class="select-device" data-id="${id}">${isSelected ? 'Hide' : 'Commands'}</button>
                    <button class="json-cmd" data-id="${id}">JSON</button>
                </td>
            </tr>
        `;
        // Если устройство выбрано и у него есть capabilities, добавляем строку с панелью команд
        if (isSelected && d.capabilities && d.capabilities.length > 0) {
            html += `
                <tr class="command-panel-row" data-for="${id}">
                    <td colspan="5" class="command-panel">
                        <div class="command-panel-buttons">
                            ${d.capabilities.map(cmd => `<button class="quick-cmd" data-cmd="${cmd}" data-device="${id}">${cmd}</button>`).join('')}
                        </div>
                    </td>
                </tr>
            `;
        }
    }
    devicesTbody.innerHTML = html;

    // Обработчики для кнопок "Select/Commands"
    document.querySelectorAll('.select-device').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.dataset.id;
            if (selectedDeviceId === id) {
                selectedDeviceId = null;
            } else {
                selectedDeviceId = id;
            }
            renderTable();
        });
    });

    // Обработчики для JSON кнопок
    document.querySelectorAll('.json-cmd').forEach(btn => {
        btn.addEventListener('click', (e) => {
            modalDeviceId.value = btn.dataset.id;
            modalCommand.value = '';
            modalPayload.value = '{}';
            commandModal.style.display = 'block';
        });
    });

    // Обработчики для быстрых команд
    document.querySelectorAll('.quick-cmd').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const deviceId = btn.dataset.device;
            const cmd = btn.dataset.cmd;
            sendCommand(deviceId, cmd, {});
        });
    });
}

function sendCommand(deviceId, command, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected');
        return;
    }
    const msg = { type: 'command', device_id: deviceId, command, payload };
    ws.send(JSON.stringify(msg));
    addLogEntry('command', `→ ${deviceId}: ${command} ${JSON.stringify(payload)}`);
}

function addLogEntry(category, message) {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    li.innerHTML = `<span class="log-time">[${time}]</span> [${category}] ${message}`;
    logList.appendChild(li);
    document.getElementById('log-container').scrollTop = logList.scrollHeight;
    if (logList.children.length > 100) logList.removeChild(logList.firstChild);
}

// Event listeners
document.getElementById('clear-logs').onclick = () => logList.innerHTML = '';

document.querySelector('#command-modal .close').onclick = () => commandModal.style.display = 'none';
document.getElementById('send-json-command').onclick = () => {
    const deviceId = modalDeviceId.value;
    const command = modalCommand.value.trim();
    let payload = {};
    try { payload = JSON.parse(modalPayload.value); } catch { alert('Invalid JSON'); return; }
    if (!command) { alert('Command required'); return; }
    sendCommand(deviceId, command, payload);
    commandModal.style.display = 'none';
};

document.getElementById('confirm-yes').onclick = () => {
    if (pendingConfirmation) {
        const resp = {
            type: 'confirm_response',
            id: pendingConfirmation.id,
            device_id: pendingConfirmation.device_id,
            command: pendingConfirmation.command,
            params: pendingConfirmation.params,
            approved: true
        };
        ws.send(JSON.stringify(resp));
        addLogEntry('command', `✓ Confirmed: ${pendingConfirmation.command} on ${pendingConfirmation.device_id}`);
    }
    confirmModal.style.display = 'none';
    pendingConfirmation = null;
};
document.getElementById('confirm-no').onclick = () => {
    if (pendingConfirmation) {
        addLogEntry('command', `✗ Rejected: ${pendingConfirmation.command} on ${pendingConfirmation.device_id}`);
    }
    confirmModal.style.display = 'none';
    pendingConfirmation = null;
};
window.onclick = (e) => {
    if (e.target === commandModal) commandModal.style.display = 'none';
    if (e.target === confirmModal) confirmModal.style.display = 'none';
};

// Start
connectWebSocket();