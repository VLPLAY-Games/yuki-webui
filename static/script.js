let ws = null;
let reconnectTimer = null;
const RECONNECT_DELAY = 3000;
let devices = {};
let pendingConfirmation = null;
let pendingAuthRequest = null;

// ID устройства, для которого в данный момент открыта панель быстрых команд
let expandedQuickCommandsId = null;

// Для отслеживания уже показанных уведомлений о pending-устройствах
const notifiedPendingIds = new Set();

const statusIndicator = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const devicesTbody = document.querySelector('#devices-table tbody');
const groupTabs = document.getElementById('group-tabs');
const logList = document.getElementById('log-list');

const commandModal = document.getElementById('command-modal');
const confirmModal = document.getElementById('confirm-modal');
const authModal = document.getElementById('auth-modal');
const modalDeviceId = document.getElementById('modal-device-id');
const modalCommand = document.getElementById('modal-command');
const modalPayload = document.getElementById('modal-payload');
const confirmText = document.getElementById('confirm-text');
const authText = document.getElementById('auth-text');

let currentGroup = 'all';

// Запрос разрешения на уведомления при загрузке
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        addLogEntry('warning', 'This browser does not support desktop notifications');
        return;
    }
    if (Notification.permission === 'granted') {
        addLogEntry('system', 'Notifications already enabled');
        updateNotificationButtonState();
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                addLogEntry('system', 'Notification permission granted');
                updateNotificationButtonState();
            } else {
                addLogEntry('warning', 'Notification permission denied');
            }
        });
    }
}

function updateNotificationButtonState() {
    const btn = document.getElementById('enable-notifications');
    if (btn) {
        if (Notification.permission === 'granted') {
            btn.textContent = 'Notifications Enabled';
            btn.disabled = true;
            btn.style.opacity = '0.7';
        } else {
            btn.textContent = 'Enable Notifications';
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }
}

// Показ уведомления о новом pending-устройстве
function showPendingNotification(deviceId, deviceType) {
    if (Notification.permission !== 'granted') return;
    if (notifiedPendingIds.has(deviceId)) return; // уже показывали

    const title = 'New device pending authorization';
    const options = {
        body: `Device ${deviceId} (${deviceType}) is waiting for approval.`,
        icon: '/static/favicon.ico', // можно заменить на свой значок
        tag: `pending-${deviceId}`,
        requireInteraction: true, // остаётся до взаимодействия пользователя
    };
    const notification = new Notification(title, options);
    notification.onclick = () => {
        window.focus();
        // Попытка переключиться на вкладку pending
        const pendingTab = document.querySelector('.tab[data-group="pending"]');
        if (pendingTab) pendingTab.click();
        notification.close();
    };

    notifiedPendingIds.add(deviceId);
    addLogEntry('system', `Notification sent for pending device ${deviceId}`);
}

// Проверка устройств на наличие новых pending и показ уведомлений
function checkAndNotifyPending() {
    if (!devices) return;
    Object.entries(devices).forEach(([id, device]) => {
        if (device.status === 'pending' && !notifiedPendingIds.has(id)) {
            showPendingNotification(id, device.type);
        }
    });
}

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
            checkAndNotifyPending(); // проверяем и показываем уведомления
        }
    } else if (data.type === 'confirm_command') {
        const { device_id, command, params } = data.payload;
        pendingConfirmation = { id: data.id, device_id, command, params };
        confirmText.textContent = `Execute "${command}" on ${device_id}?`;
        confirmModal.style.display = 'block';
    } else if (data.type === 'device_auth_request') {
        const { device_id, device_type, capabilities } = data.payload;
        pendingAuthRequest = { id: data.id, device_id, device_type, capabilities };

        // Заполняем обновлённые поля
        document.getElementById('auth-device-id').textContent = device_id;
        document.getElementById('auth-device-type').textContent = device_type;

        const capsContainer = document.getElementById('auth-capabilities-list');
        capsContainer.innerHTML = capabilities.map(cap =>
            `<span class="capability-chip">${cap}</span>`
        ).join('');

        authModal.style.display = 'block';
    }
}

function renderGroups() {
    const types = new Set();
    Object.values(devices).forEach(d => types.add(d.type));
    const groups = ['all', 'online', 'pending', 'offline'];
    groupTabs.innerHTML = groups.map(g =>
        `<button class="tab ${currentGroup === g ? 'active' : ''}" data-group="${g}">${g.charAt(0).toUpperCase() + g.slice(1)}</button>`
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
    // Сбрасываем открытую панель при перерисовке
    expandedQuickCommandsId = null;

    const filtered = Object.entries(devices).filter(([id, d]) => {
        if (currentGroup === 'all') return true;
        if (currentGroup === 'online') return d.status === 'online';
        if (currentGroup === 'pending') return d.status === 'pending';
        if (currentGroup === 'offline') return d.status === 'offline';
        return true;
    });

    if (filtered.length === 0) {
        devicesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No devices</td></tr>`;
        return;
    }

    devicesTbody.innerHTML = filtered.map(([id, d]) => {
        const statusClass = `status-${d.status}`;
        const lastSeen = d.last_seen ? new Date(d.last_seen * 1000).toLocaleTimeString() : '—';
        const isOnline = d.status === 'online';
        const isPending = d.status === 'pending';

        let actionsHtml = '';
        if (isPending) {
            actionsHtml = `<button class="approve-device" data-id="${id}">Approve</button>
                           <button class="deny-device" data-id="${id}">Deny</button>`;
        } else if (isOnline) {
            actionsHtml = `<button class="send-cmd" data-id="${id}">Send Command</button>
                           <button class="json-cmd" data-id="${id}">JSON</button>
                           <button class="disconnect-device" data-id="${id}">Disconnect</button>
                           <button class="remove-device" data-id="${id}">Remove</button>`;
        } else {
            actionsHtml = `<button class="remove-device" data-id="${id}">Remove</button>`;
        }

        return `
            <tr data-device-id="${id}">
                <td><code>${id}</code></td>
                <td>${d.type}</td>
                <td><span class="status-badge ${statusClass}">${d.status}</span></td>
                <td>${lastSeen}</td>
                <td>${actionsHtml}</td>
            </tr>
        `;
    }).join('');

    // Привязываем обработчики событий
    document.querySelectorAll('.send-cmd').forEach(btn => {
        btn.addEventListener('click', () => toggleQuickCommandsRow(btn.dataset.id));
    });

    document.querySelectorAll('.json-cmd').forEach(btn => {
        btn.addEventListener('click', () => {
            modalDeviceId.value = btn.dataset.id;
            modalCommand.value = '';
            modalPayload.value = '{}';
            commandModal.style.display = 'block';
        });
    });

    document.querySelectorAll('.approve-device').forEach(btn => {
        btn.addEventListener('click', () => approveDevice(btn.dataset.id, true));
    });
    document.querySelectorAll('.deny-device').forEach(btn => {
        btn.addEventListener('click', () => approveDevice(btn.dataset.id, false));
    });
    document.querySelectorAll('.disconnect-device').forEach(btn => {
        btn.addEventListener('click', () => disconnectDevice(btn.dataset.id));
    });
    document.querySelectorAll('.remove-device').forEach(btn => {
        btn.addEventListener('click', () => removeDevice(btn.dataset.id));
    });
}

/**
 * Показывает или скрывает строку с кнопками быстрых команд под указанным устройством.
 */
function toggleQuickCommandsRow(deviceId) {
    const device = devices[deviceId];
    if (!device || device.status !== 'online') {
        addLogEntry('warning', `Cannot send commands to offline device ${deviceId}`);
        return;
    }

    // Если уже открыта панель для этого же устройства – закрываем
    if (expandedQuickCommandsId === deviceId) {
        removeQuickCommandsRow();
        expandedQuickCommandsId = null;
        return;
    }

    // Удаляем предыдущую панель (если была)
    removeQuickCommandsRow();

    // Находим строку устройства, к которой будем добавлять панель
    const deviceRow = document.querySelector(`tr[data-device-id="${deviceId}"]`);
    if (!deviceRow) return;

    // Создаём новую строку с кнопками
    const quickRow = document.createElement('tr');
    quickRow.className = 'quick-commands-row';
    quickRow.id = `quick-row-${deviceId}`;

    const td = document.createElement('td');
    td.colSpan = 5; // объединяем все колонки

    const container = document.createElement('div');
    container.className = 'quick-commands-container';

    // Добавляем кнопки для каждой capability
    const capabilities = device.capabilities || [];
    if (capabilities.length === 0) {
        const span = document.createElement('span');
        span.style.color = 'var(--text-color)';
        span.style.opacity = '0.7';
        span.textContent = 'No quick commands available';
        container.appendChild(span);
    } else {
        capabilities.forEach(cmd => {
            const btn = document.createElement('button');
            btn.className = 'quick-cmd';
            btn.textContent = cmd;
            btn.addEventListener('click', () => {
                sendCommand(deviceId, cmd, {});
            });
            container.appendChild(btn);
        });
    }

    td.appendChild(container);
    quickRow.appendChild(td);

    // Вставляем строку сразу после строки устройства
    deviceRow.insertAdjacentElement('afterend', quickRow);

    expandedQuickCommandsId = deviceId;
}

/**
 * Удаляет открытую строку быстрых команд, если она существует.
 */
function removeQuickCommandsRow() {
    if (expandedQuickCommandsId) {
        const row = document.getElementById(`quick-row-${expandedQuickCommandsId}`);
        if (row) row.remove();
    }
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

function approveDevice(deviceId, approved) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg = pendingAuthRequest && pendingAuthRequest.device_id === deviceId
        ? { type: 'device_auth_response', id: pendingAuthRequest.id, device_id: deviceId, approved }
        : { type: 'device_auth_response', device_id: deviceId, approved };

    ws.send(JSON.stringify(msg));
    if (pendingAuthRequest && pendingAuthRequest.device_id === deviceId) {
        pendingAuthRequest = null;
        authModal.style.display = 'none';
    }
    addLogEntry('action', `Device ${deviceId} ${approved ? 'approved' : 'denied'}`);
}

function disconnectDevice(deviceId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'disconnect_device', device_id: deviceId }));
    addLogEntry('action', `Disconnect device ${deviceId}`);
}

function removeDevice(deviceId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (confirm(`Remove device ${deviceId} from authorized list?`)) {
        ws.send(JSON.stringify({ type: 'remove_device', device_id: deviceId }));
        addLogEntry('action', `Remove device ${deviceId}`);
    }
}

function addLogEntry(category, message) {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    li.innerHTML = `<span class="log-time">[${time}]</span> [${category}] ${message}`;
    logList.appendChild(li);
    document.getElementById('log-container').scrollTop = logList.scrollHeight;
    if (logList.children.length > 100) logList.removeChild(logList.firstChild);
}

// Обработчики модальных окон и кнопок
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
        addLogEntry('command', `Confirmed: ${pendingConfirmation.command} on ${pendingConfirmation.device_id}`);
    }
    confirmModal.style.display = 'none';
    pendingConfirmation = null;
};
document.getElementById('confirm-no').onclick = () => {
    if (pendingConfirmation) {
        addLogEntry('command', `Rejected: ${pendingConfirmation.command} on ${pendingConfirmation.device_id}`);
    }
    confirmModal.style.display = 'none';
    pendingConfirmation = null;
};

document.getElementById('auth-approve').onclick = () => {
    if (pendingAuthRequest) {
        approveDevice(pendingAuthRequest.device_id, true);
    }
    authModal.style.display = 'none';
};
document.getElementById('auth-deny').onclick = () => {
    if (pendingAuthRequest) {
        approveDevice(pendingAuthRequest.device_id, false);
    }
    authModal.style.display = 'none';
};

window.onclick = (e) => {
    if (e.target === commandModal) commandModal.style.display = 'none';
    if (e.target === confirmModal) confirmModal.style.display = 'none';
    if (e.target === authModal) authModal.style.display = 'none';
};

// Обработчик кнопки запроса уведомлений
const enableNotificationsBtn = document.getElementById('enable-notifications');
if (enableNotificationsBtn) {
    enableNotificationsBtn.addEventListener('click', requestNotificationPermission);
}

// При загрузке проверяем текущее состояние разрешений и обновляем кнопку
document.addEventListener('DOMContentLoaded', () => {
    if ('Notification' in window) {
        updateNotificationButtonState();
        // Можно автоматически запросить разрешение при первом посещении
        if (Notification.permission === 'default') {
            // requestNotificationPermission(); // раскомментировать для автоматического запроса
        }
    } else {
        const btn = document.getElementById('enable-notifications');
        if (btn) btn.style.display = 'none';
    }
});

// Запуск WebSocket
connectWebSocket();