// script.js
let ws = null;
let reconnectTimer = null;
const RECONNECT_DELAY = 3000;
let devices = {};
let pendingConfirmation = null;
let pendingAuthRequest = null;
let expandedQuickCommandsId = null;
const notifiedPendingIds = new Set();

// Состояние UI
let currentGroup = 'all';
let searchQuery = '';
let sortColumn = 'id';
let sortDirection = 'asc'; // 'asc' или 'desc'

// История команд
let commandHistory = [];
const MAX_HISTORY = 100;
// Карта ожидающих результатов команд (по ID сообщения)
const pendingCommands = new Map();

// Настройки удаления (храним в localStorage)
let skipDeleteConfirm = localStorage.getItem('skipDeleteConfirm') === 'true';

// DOM элементы
const statusIndicator = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const devicesTbody = document.querySelector('#devices-table tbody');
const groupTabs = document.getElementById('group-tabs');
const logList = document.getElementById('log-list');
const historyList = document.getElementById('history-list');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const exportCsvBtn = document.getElementById('export-csv');
const commandModal = document.getElementById('command-modal');
const confirmModal = document.getElementById('confirm-modal');
const authModal = document.getElementById('auth-modal');
const deleteModal = document.getElementById('delete-modal');
const modalDeviceId = document.getElementById('modal-device-id');
const modalCommand = document.getElementById('modal-command');
const modalPayload = document.getElementById('modal-payload');
const confirmText = document.getElementById('confirm-text');
const authText = document.getElementById('auth-text');
const deleteDeviceIdSpan = document.getElementById('delete-device-id');
const dontAskDeleteCheck = document.getElementById('dont-ask-delete');

let deviceToDelete = null;

// === Инициализация ===
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

function showPendingNotification(deviceId, deviceType) {
    if (Notification.permission !== 'granted') return;
    if (notifiedPendingIds.has(deviceId)) return;
    const title = 'New device pending authorization';
    const options = {
        body: `Device ${deviceId} (${deviceType}) is waiting for approval.`,
        icon: '/static/favicon.ico',
        tag: `pending-${deviceId}`,
        requireInteraction: true,
    };
    const notification = new Notification(title, options);
    notification.onclick = () => {
        window.focus();
        const pendingTab = document.querySelector('.tab[data-group="pending"]');
        if (pendingTab) pendingTab.click();
        notification.close();
    };
    notifiedPendingIds.add(deviceId);
    addLogEntry('system', `Notification sent for pending device ${deviceId}`);
}

function checkAndNotifyPending() {
    if (!devices) return;
    Object.entries(devices).forEach(([id, device]) => {
        if (device.status === 'pending' && !notifiedPendingIds.has(id)) {
            showPendingNotification(id, device.type);
        }
    });
}

// === WebSocket ===
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket('ws://localhost:8000/webui');
    ws.onopen = () => {
        updateConnectionStatus(true);
        addLogEntry('system', 'Connected to Core');
        if (reconnectTimer) clearTimeout(reconnectTimer);
        ws.send(JSON.stringify({ type: 'get_token_info' }));
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
            checkAndNotifyPending();
        }
    } else if (data.type === 'confirm_command') {
        const { device_id, command, params } = data.payload;
        pendingConfirmation = { id: data.id, device_id, command, params };
        confirmText.textContent = `Execute "${command}" on ${device_id}?`;
        confirmModal.style.display = 'block';
    } else if (data.type === 'device_auth_request') {
        const { device_id, device_type, capabilities } = data.payload;
        pendingAuthRequest = { id: data.id, device_id, device_type, capabilities };
        document.getElementById('auth-device-id').textContent = device_id;
        document.getElementById('auth-device-type').textContent = device_type;
        const capsContainer = document.getElementById('auth-capabilities-list');
        capsContainer.innerHTML = capabilities.map(cap => `<span class="capability-chip">${cap}</span>`).join('');
        authModal.style.display = 'block';
    } else if (data.type === 'token_info') {
        updateTokenInfo(data.payload);
    } else if (data.type === 'token_rotated') {
        addLogEntry('system', 'Token rotated successfully');
        ws.send(JSON.stringify({ type: 'get_token_info' }));
    } else if (data.type === 'command_result') {
        // Обработка результата выполнения команды
        const { id, device_id, payload } = data;
        const pending = pendingCommands.get(id);
        if (pending) {
            const success = payload.success;
            const error = payload.error;
            // Обновляем запись в истории
            updateHistoryEntry(pending.historyId, device_id, pending.command, pending.params, success, error);
            pendingCommands.delete(id);
        }
    }
}

function updateTokenInfo(payload) {
    const infoDiv = document.getElementById('token-info');
    if (!infoDiv) return;
    const created = payload.created_at ? new Date(payload.created_at * 1000).toLocaleString() : 'N/A';
    const expiresIn = payload.expires_in ? formatTime(payload.expires_in) : 'Never';
    infoDiv.innerHTML = `Token created: ${created}<br>Expires in: ${expiresIn}`;
}

function formatTime(seconds) {
    if (seconds <= 0) return 'Expired';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

// === Группы и сортировка/фильтрация ===
function renderGroups() {
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

function getFilteredAndSortedDevices() {
    let entries = Object.entries(devices).filter(([id, d]) => {
        // Группа
        if (currentGroup === 'online') return d.status === 'online';
        if (currentGroup === 'pending') return d.status === 'pending';
        if (currentGroup === 'offline') return d.status === 'offline';
        return true;
    }).filter(([id, d]) => {
        // Поиск
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return id.toLowerCase().includes(query) || d.type.toLowerCase().includes(query);
    });

    // Сортировка
    entries.sort((a, b) => {
        let valA, valB;
        const [idA, devA] = a;
        const [idB, devB] = b;
        switch (sortColumn) {
            case 'id':
                valA = idA.toLowerCase();
                valB = idB.toLowerCase();
                break;
            case 'type':
                valA = devA.type.toLowerCase();
                valB = devB.type.toLowerCase();
                break;
            case 'status':
                valA = devA.status;
                valB = devB.status;
                break;
            case 'last_seen':
                valA = devA.last_seen || 0;
                valB = devB.last_seen || 0;
                break;
            default:
                return 0;
        }
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    return entries;
}

function renderTable() {
    expandedQuickCommandsId = null;
    const filtered = getFilteredAndSortedDevices();
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
                           <button class="reconnect-device" data-id="${id}">Reconnect</button>
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

    // Обработчики кнопок
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
    document.querySelectorAll('.reconnect-device').forEach(btn => {
        btn.addEventListener('click', () => reconnectDevice(btn.dataset.id));
    });
    document.querySelectorAll('.remove-device').forEach(btn => {
        btn.addEventListener('click', () => promptDeleteDevice(btn.dataset.id));
    });

    updateSortIndicators();
}

function updateSortIndicators() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === sortColumn) {
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// === Быстрые команды ===
function toggleQuickCommandsRow(deviceId) {
    const device = devices[deviceId];
    if (!device || device.status !== 'online') {
        addLogEntry('warning', `Cannot send commands to offline device ${deviceId}`);
        return;
    }
    if (expandedQuickCommandsId === deviceId) {
        removeQuickCommandsRow();
        expandedQuickCommandsId = null;
        return;
    }
    removeQuickCommandsRow();
    const deviceRow = document.querySelector(`tr[data-device-id="${deviceId}"]`);
    if (!deviceRow) return;
    const quickRow = document.createElement('tr');
    quickRow.className = 'quick-commands-row';
    quickRow.id = `quick-row-${deviceId}`;
    const td = document.createElement('td');
    td.colSpan = 5;
    const container = document.createElement('div');
    container.className = 'quick-commands-container';
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
            btn.addEventListener('click', (e) => {
                if (btn.classList.contains('loading')) return;
                btn.classList.add('loading');
                sendCommand(deviceId, cmd, {}, (success, error) => {
                    btn.classList.remove('loading');
                    if (!success) {
                        addLogEntry('error', `Command ${cmd} failed: ${error || 'Unknown error'}`);
                    }
                });
            });
            container.appendChild(btn);
        });
    }
    td.appendChild(container);
    quickRow.appendChild(td);
    deviceRow.insertAdjacentElement('afterend', quickRow);
    expandedQuickCommandsId = deviceId;
}

function removeQuickCommandsRow() {
    if (expandedQuickCommandsId) {
        const row = document.getElementById(`quick-row-${expandedQuickCommandsId}`);
        if (row) row.remove();
    }
}

// === Отправка команд с индикацией и отслеживанием результата ===
function sendCommand(deviceId, command, payload, callback) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected');
        if (callback) callback(false, 'Not connected');
        return;
    }
    const msgId = generateUUID();
    const msg = { type: 'command', device_id: deviceId, command, payload, id: msgId };
    ws.send(JSON.stringify(msg));
    addLogEntry('command', `→ ${deviceId}: ${command} ${JSON.stringify(payload)}`);
    const historyId = addToHistory(deviceId, command, payload, 'pending');
    // Сохраняем ожидание результата
    pendingCommands.set(msgId, {
        historyId,
        deviceId,
        command,
        params: payload,
        callback
    });
    // Таймаут для очистки ожидания (если ответ не придёт)
    setTimeout(() => {
        if (pendingCommands.has(msgId)) {
            const pending = pendingCommands.get(msgId);
            updateHistoryEntry(pending.historyId, deviceId, command, payload, false, 'Timeout');
            pendingCommands.delete(msgId);
            if (pending.callback) pending.callback(false, 'Timeout');
        }
    }, 10000);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function addToHistory(deviceId, command, payload, status = 'pending') {
    const entry = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        timestamp: new Date(),
        deviceId,
        command,
        payload: JSON.stringify(payload),
        status: status, // 'pending', 'success', 'error'
        error: null
    };
    commandHistory.unshift(entry);
    if (commandHistory.length > MAX_HISTORY) commandHistory.pop();
    renderHistory();
    return entry.id;
}

function updateHistoryEntry(historyId, deviceId, command, payload, success, error) {
    const entry = commandHistory.find(e => e.id === historyId);
    if (entry) {
        entry.status = success ? 'success' : 'error';
        entry.error = error || null;
        renderHistory();
    }
}

function renderHistory() {
    if (!historyList) return;
    if (commandHistory.length === 0) {
        historyList.innerHTML = '<li style="justify-content:center; opacity:0.7;">No commands yet</li>';
        return;
    }
    historyList.innerHTML = commandHistory.map(entry => {
        const timeStr = entry.timestamp.toLocaleTimeString();
        let statusIndicator = '';
        if (entry.status === 'pending') {
            statusIndicator = '<span class="history-status pending">⏳</span>';
        } else if (entry.status === 'success') {
            statusIndicator = '<span class="history-status success">✓</span>';
        } else if (entry.status === 'error') {
            statusIndicator = `<span class="history-status error" title="${entry.error || 'Error'}">✗</span>`;
        }
        return `<li>
            <span class="history-time">[${timeStr}]</span>
            ${statusIndicator}
            <span class="history-device">${entry.deviceId}</span>
            <span class="history-command">${entry.command}</span>
            <span class="history-payload">${entry.payload}</span>
        </li>`;
    }).join('');
}

// === Действия с устройствами ===
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

function reconnectDevice(deviceId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'reconnect_device', device_id: deviceId }));
    addLogEntry('action', `Reconnect device ${deviceId} requested`);
}

function promptDeleteDevice(deviceId) {
    if (skipDeleteConfirm) {
        performDeleteDevice(deviceId);
        return;
    }
    deviceToDelete = deviceId;
    deleteDeviceIdSpan.textContent = deviceId;
    deleteModal.style.display = 'block';
}

function performDeleteDevice(deviceId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'remove_device', device_id: deviceId }));
    addLogEntry('action', `Remove device ${deviceId}`);
    deleteModal.style.display = 'none';
    deviceToDelete = null;
}

// === Экспорт CSV ===
function exportToCsv() {
    const filtered = getFilteredAndSortedDevices();
    const headers = ['ID', 'Type', 'Status', 'Last Seen'];
    const rows = filtered.map(([id, d]) => [
        id,
        d.type,
        d.status,
        d.last_seen ? new Date(d.last_seen * 1000).toLocaleString() : ''
    ]);
    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `devices_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// === Логи ===
function addLogEntry(category, message) {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    li.innerHTML = `<span class="log-time">[${time}]</span> [${category}] ${message}`;
    logList.appendChild(li);
    document.getElementById('log-container').scrollTop = logList.scrollHeight;
    if (logList.children.length > 100) logList.removeChild(logList.firstChild);
}

// === Обработчики UI ===
function initUI() {
    // Поиск
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderTable();
    });
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        renderTable();
    });

    // Сортировка
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            renderTable();
        });
    });

    // Экспорт
    exportCsvBtn.addEventListener('click', exportToCsv);

    // Сворачивание истории
    const historyHeader = document.getElementById('history-header');
    const historySection = document.querySelector('.collapsible');
    historyHeader.addEventListener('click', () => {
        historySection.classList.toggle('collapsed');
    });

    // Кнопки модалок
    document.getElementById('clear-logs').onclick = () => logList.innerHTML = '';
    document.getElementById('clear-history').onclick = () => {
        commandHistory = [];
        renderHistory();
    };

    document.querySelector('#command-modal .close').onclick = () => commandModal.style.display = 'none';
    document.querySelector('#command-modal .close-modal').onclick = () => commandModal.style.display = 'none';
    document.getElementById('send-json-command').onclick = () => {
        const deviceId = modalDeviceId.value;
        const command = modalCommand.value.trim();
        let payload = {};
        try { payload = JSON.parse(modalPayload.value); } catch { alert('Invalid JSON'); return; }
        if (!command) { alert('Command required'); return; }
        const btn = document.getElementById('send-json-command');
        btn.classList.add('loading');
        sendCommand(deviceId, command, payload, (success, error) => {
            btn.classList.remove('loading');
            if (!success) {
                addLogEntry('error', `Command ${command} failed: ${error || 'Unknown error'}`);
            }
        });
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
        if (pendingAuthRequest) approveDevice(pendingAuthRequest.device_id, true);
        authModal.style.display = 'none';
    };
    document.getElementById('auth-deny').onclick = () => {
        if (pendingAuthRequest) approveDevice(pendingAuthRequest.device_id, false);
        authModal.style.display = 'none';
    };

    // Удаление
    document.getElementById('delete-confirm').onclick = () => {
        if (dontAskDeleteCheck.checked) {
            localStorage.setItem('skipDeleteConfirm', 'true');
            skipDeleteConfirm = true;
        }
        if (deviceToDelete) performDeleteDevice(deviceToDelete);
    };
    document.getElementById('delete-cancel').onclick = () => {
        deleteModal.style.display = 'none';
        deviceToDelete = null;
    };

    window.onclick = (e) => {
        if (e.target === commandModal) commandModal.style.display = 'none';
        if (e.target === confirmModal) confirmModal.style.display = 'none';
        if (e.target === authModal) authModal.style.display = 'none';
        if (e.target === deleteModal) deleteModal.style.display = 'none';
    };

    const enableNotificationsBtn = document.getElementById('enable-notifications');
    if (enableNotificationsBtn) {
        enableNotificationsBtn.addEventListener('click', requestNotificationPermission);
    }
    const rotateTokenBtn = document.getElementById('rotate-token');
    if (rotateTokenBtn) {
        rotateTokenBtn.addEventListener('click', rotateToken);
    }

    // Инициализация истории
    renderHistory();
}

function rotateToken() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected');
        return;
    }
    if (confirm('Generate a new authentication token? All online devices will receive the new token. Offline devices will need manual update.')) {
        ws.send(JSON.stringify({ type: 'rotate_token' }));
        addLogEntry('action', 'Token rotation requested');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if ('Notification' in window) {
        updateNotificationButtonState();
    } else {
        const btn = document.getElementById('enable-notifications');
        if (btn) btn.style.display = 'none';
    }
    initUI();
    connectWebSocket();
});