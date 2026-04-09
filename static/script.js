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
const notificationArea = document.getElementById('notification-area');

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
    } else if (data.type === 'device_auth_request') {
        const { device_id, device_type, capabilities } = data.payload;
        const requestId = data.id;
        showAuthNotification(requestId, device_id, device_type, capabilities);
    }
}

function showAuthNotification(requestId, deviceId, deviceType, capabilities) {
    const notif = document.createElement('div');
    notif.className = 'auth-notification';
    notif.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
            <span>
                <strong>New device wants to connect:</strong> ${deviceId} (${deviceType})<br>
                <small>Capabilities: ${capabilities.join(', ') || 'none'}</small>
            </span>
            <div>
                <button class="approve-auth" data-id="${requestId}" data-device="${deviceId}">Approve</button>
                <button class="reject-auth" data-id="${requestId}" data-device="${deviceId}">Reject</button>
            </div>
        </div>
    `;
    notificationArea.appendChild(notif);

    notif.querySelector('.approve-auth').addEventListener('click', () => {
        sendAuthResponse(requestId, true);
        notif.remove();
        addLogEntry('system', `Device ${deviceId} approved`);
    });
    notif.querySelector('.reject-auth').addEventListener('click', () => {
        sendAuthResponse(requestId, false);
        notif.remove();
        addLogEntry('system', `Device ${deviceId} rejected`);
    });

    // Автоматически удалить через 60 секунд, если нет ответа
    setTimeout(() => {
        if (notificationArea.contains(notif)) {
            notif.remove();
            addLogEntry('system', `Auth request for ${deviceId} expired`);
        }
    }, 60000);
}

function sendAuthResponse(requestId, approved) {
    const msg = {
        type: 'device_auth_response',
        id: requestId,
        approved: approved
    };
    ws.send(JSON.stringify(msg));
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
    devicesTbody.innerHTML = filtered.map(([id, d]) => {
        const statusClass = `status-${d.status}`;
        const lastSeen = d.last_seen ? new Date(d.last_seen * 1000).toLocaleTimeString() : '—';
        return `
            <tr class="${selectedDeviceId === id ? 'selected' : ''}" data-device-id="${id}">
                <td><code>${id}</code></td>
                <td>${d.type}</td>
                <td><span class="status-badge ${statusClass}">${d.status}</span></td>
                <td>${lastSeen}</td>
                <td>
                    <button class="select-device" data-id="${id}">Select</button>
                    <button class="json-cmd" data-id="${id}">JSON</button>
                    <button class="quick-toggle" data-id="${id}">Send command</button>
                </td>
            </tr>
        `;
    }).join('');

    // Обработчики
    document.querySelectorAll('.select-device').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedDeviceId = btn.dataset.id;
            renderTable();
        });
    });
    document.querySelectorAll('.json-cmd').forEach(btn => {
        btn.addEventListener('click', () => {
            modalDeviceId.value = btn.dataset.id;
            modalCommand.value = '';
            modalPayload.value = '{}';
            commandModal.style.display = 'block';
        });
    });
    document.querySelectorAll('.quick-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const deviceId = btn.dataset.id;
            const device = devices[deviceId];
            if (!device) return;
            // Найти или создать панель быстрых команд прямо под строкой
            const tr = e.target.closest('tr');
            let nextRow = tr.nextElementSibling;
            if (nextRow && nextRow.classList.contains('quick-row')) {
                nextRow.remove();
                return;
            }
            // Удалить другие открытые панели
            document.querySelectorAll('.quick-row').forEach(r => r.remove());
            // Создать новую строку с командами
            const newRow = document.createElement('tr');
            newRow.className = 'quick-row';
            newRow.innerHTML = `
                <td colspan="5" style="padding: 8px;">
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${device.capabilities.map(cmd => `<button class="quick-cmd" data-cmd="${cmd}">${cmd}</button>`).join('')}
                    </div>
                </td>
            `;
            tr.parentNode.insertBefore(newRow, tr.nextSibling);
            newRow.querySelectorAll('.quick-cmd').forEach(cmdBtn => {
                cmdBtn.addEventListener('click', () => {
                    const cmd = cmdBtn.dataset.cmd;
                    sendCommand(deviceId, cmd, {});
                });
            });
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