// script.js - Modern Dashboard

// State
let ws = null;
let reconnectTimer = null;
let devices = {};
let currentView = 'dashboard';
let currentFilter = 'all';
let currentViewMode = 'grid';
let currentTheme = localStorage.getItem('theme') || 'dark';
let pendingConfirmation = null;
let pendingAuthRequest = null;
let commandHistory = [];
let eventLogs = [];
let notifiedPendingIds = new Set();

// DOM Elements
let sidebar, devicesContainer, historyList, logsContainer, searchInput;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // DOM references
    sidebar = document.getElementById('sidebar');
    devicesContainer = document.getElementById('devicesContainer');
    historyList = document.getElementById('historyList');
    logsContainer = document.getElementById('logsContainer');
    searchInput = document.getElementById('searchInput');
    
    // Initialize theme
    initTheme();
    
    // Event listeners
    initEventListeners();
    
    // Connect WebSocket
    connectWebSocket();
    
    // Load saved history from localStorage
    loadStoredData();
    
    // Start periodic updates
    setInterval(updateDashboardStats, 1000);
});

function initTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.checked = currentTheme === 'light';
        themeToggle.addEventListener('change', (e) => {
            currentTheme = e.target.checked ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', currentTheme);
            localStorage.setItem('theme', currentTheme);
            showToast(`Theme changed to ${currentTheme}`, 'success');
        });
    }
}

function initEventListeners() {
    // Sidebar toggle
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
            
            // Update active state
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
    
    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            currentFilter = chip.dataset.filter;
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderDevices();
        });
    });
    
    // View toggle
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentViewMode = btn.dataset.view;
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderDevices();
        });
    });
    
    // Search
    searchInput?.addEventListener('input', () => renderDevices());
    
    // Buttons
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportToCsv);
    document.getElementById('rotateTokenBtn')?.addEventListener('click', rotateToken);
    document.getElementById('enableNotificationsBtn')?.addEventListener('click', requestNotificationPermission);
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'get_devices' }));
            showToast('Refreshing devices...', 'info');
        }
    });
    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
        commandHistory = [];
        saveStoredData();
        renderHistory();
        showToast('Command history cleared', 'success');
    });
    document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
        eventLogs = [];
        renderLogs();
        showToast('Event logs cleared', 'success');
    });
    document.getElementById('copyTokenBtn')?.addEventListener('click', () => {
        const tokenInfo = document.getElementById('tokenInfo')?.innerText;
        if (tokenInfo) {
            navigator.clipboard.writeText(tokenInfo);
            showToast('Token info copied to clipboard', 'success');
        }
    });
    
    // Modal handlers
    initModalHandlers();
}

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`${view}View`)?.classList.add('active');
    
    if (view === 'devices') renderDevices();
    if (view === 'history') renderHistory();
    if (view === 'logs') renderLogs();
}

function initModalHandlers() {
    // Command modal
    const commandModal = document.getElementById('commandModal');
    const confirmModal = document.getElementById('confirmModal');
    const authModal = document.getElementById('authModal');
    
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            commandModal.style.display = 'none';
            confirmModal.style.display = 'none';
            authModal.style.display = 'none';
        });
    });
    
    document.getElementById('sendCommandBtn')?.addEventListener('click', () => {
        const deviceId = document.getElementById('modalDeviceId').value;
        const command = document.getElementById('modalCommand').value.trim();
        let payload = {};
        try {
            payload = JSON.parse(document.getElementById('modalPayload').value);
        } catch (e) {
            showToast('Invalid JSON payload', 'error');
            return;
        }
        if (!command) {
            showToast('Command is required', 'error');
            return;
        }
        sendCommand(deviceId, command, payload);
        commandModal.style.display = 'none';
    });
    
    document.getElementById('confirmYesBtn')?.addEventListener('click', () => {
        if (pendingConfirmation) {
            ws.send(JSON.stringify({
                type: 'confirm_response',
                id: pendingConfirmation.id,
                device_id: pendingConfirmation.device_id,
                command: pendingConfirmation.command,
                params: pendingConfirmation.params,
                approved: true
            }));
            showToast(`Command "${pendingConfirmation.command}" confirmed`, 'warning');
        }
        confirmModal.style.display = 'none';
        pendingConfirmation = null;
    });
    
    document.getElementById('confirmNoBtn')?.addEventListener('click', () => {
        confirmModal.style.display = 'none';
        pendingConfirmation = null;
    });
    
    document.getElementById('authApproveBtn')?.addEventListener('click', () => {
        if (pendingAuthRequest) {
            approveDevice(pendingAuthRequest.device_id, true);
        }
        authModal.style.display = 'none';
    });
    
    document.getElementById('authDenyBtn')?.addEventListener('click', () => {
        if (pendingAuthRequest) {
            approveDevice(pendingAuthRequest.device_id, false);
        }
        authModal.style.display = 'none';
    });
    
    window.onclick = (e) => {
        if (e.target === commandModal) commandModal.style.display = 'none';
        if (e.target === confirmModal) confirmModal.style.display = 'none';
        if (e.target === authModal) authModal.style.display = 'none';
    };
}

// WebSocket
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.hostname}:8000/webui`);
    
    ws.onopen = () => {
        updateConnectionStatus(true);
        addLogEntry('system', 'Connected to Core');
        if (reconnectTimer) clearTimeout(reconnectTimer);
        ws.send(JSON.stringify({ type: 'get_token_info' }));
        ws.send(JSON.stringify({ type: 'get_devices' }));
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (e) {
            console.error('Failed to parse message', e);
        }
    };
    
    ws.onclose = () => {
        updateConnectionStatus(false);
        addLogEntry('system', 'Disconnected from Core');
        scheduleReconnect();
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error', error);
        addLogEntry('error', 'WebSocket connection error');
    };
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        addLogEntry('system', 'Reconnecting...');
        connectWebSocket();
    }, 3000);
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        statusEl.classList.toggle('connected', connected);
        statusEl.classList.toggle('disconnected', !connected);
        statusEl.querySelector('span').textContent = connected ? 'Connected' : 'Disconnected';
    }
}

function handleMessage(data) {
    switch (data.type) {
        case 'devices_list':
        case 'devices_update':
            if (data.payload?.devices) {
                devices = data.payload.devices;
                updateDashboardStats();
                renderDevices();
                checkAndNotifyPending();
            }
            break;
            
        case 'confirm_command':
            pendingConfirmation = {
                id: data.id,
                device_id: data.payload.device_id,
                command: data.payload.command,
                params: data.payload.params
            };
            document.getElementById('confirmText').textContent = 
                `Execute "${data.payload.command}" on ${data.payload.device_id}?`;
            document.getElementById('confirmModal').style.display = 'block';
            break;
            
        case 'device_auth_request':
            pendingAuthRequest = {
                id: data.id,
                device_id: data.payload.device_id,
                device_type: data.payload.device_type,
                capabilities: data.payload.capabilities
            };
            document.getElementById('authDeviceId').textContent = data.payload.device_id;
            document.getElementById('authDeviceType').textContent = data.payload.device_type;
            const capsContainer = document.getElementById('authCapabilitiesList');
            capsContainer.innerHTML = data.payload.capabilities.map(cap => 
                `<span class="capability-chip">${cap}</span>`
            ).join('');
            document.getElementById('authModal').style.display = 'block';
            break;
            
        case 'token_info':
            updateTokenInfo(data.payload);
            break;
            
        case 'command_result':
            handleCommandResult(data);
            break;
            
        case 'status':
            if (data.payload?.device_id && devices[data.payload.device_id]) {
                devices[data.payload.device_id].status = data.payload.status;
                updateDashboardStats();
                renderDevices();
            }
            break;
    }
}

function handleCommandResult(data) {
    const { id, device_id, payload } = data;
    const success = payload.success;
    const error = payload.error;
    
    // Update history
    const historyEntry = commandHistory.find(h => h.id === id);
    if (historyEntry) {
        historyEntry.status = success ? 'success' : 'error';
        historyEntry.error = error;
        saveStoredData();
        renderHistory();
    }
    
    if (success) {
        showToast(`Command executed successfully on ${device_id}`, 'success');
        addLogEntry('command_result', `✅ Command ${id} succeeded on ${device_id}`);
    } else {
        showToast(`Command failed on ${device_id}: ${error}`, 'error');
        addLogEntry('command_result', `❌ Command ${id} failed on ${device_id}: ${error}`);
    }
}

function updateTokenInfo(payload) {
    const infoDiv = document.getElementById('tokenInfo');
    if (!infoDiv) return;
    
    const created = payload.created_at ? new Date(payload.created_at * 1000).toLocaleString() : 'N/A';
    const expiresIn = payload.expires_in ? formatTime(payload.expires_in) : 'Never';
    infoDiv.innerHTML = `<strong>Created:</strong> ${created}<br><strong>Expires:</strong> ${expiresIn}`;
}

function formatTime(seconds) {
    if (seconds <= 0) return 'Expired';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

function updateDashboardStats() {
    const total = Object.keys(devices).length;
    const online = Object.values(devices).filter(d => d.status === 'online').length;
    const pending = Object.values(devices).filter(d => d.status === 'pending').length;
    const offline = Object.values(devices).filter(d => d.status === 'offline').length;
    
    document.getElementById('totalDevices').textContent = total;
    document.getElementById('onlineDevices').textContent = online;
    document.getElementById('pendingDevices').textContent = pending;
    document.getElementById('offlineDevices').textContent = offline;
    document.getElementById('deviceCountBadge').textContent = total;
    
    // Recent commands preview
    const recentContainer = document.getElementById('recentCommands');
    if (recentContainer && commandHistory.length > 0) {
        const recent = commandHistory.slice(0, 5);
        recentContainer.innerHTML = recent.map(cmd => `
            <div class="history-item" style="padding: 10px;">
                <span class="history-time">${new Date(cmd.timestamp).toLocaleTimeString()}</span>
                <span class="history-status ${cmd.status}">${cmd.status}</span>
                <span class="history-device">${cmd.deviceId}</span>
                <span class="history-command">${cmd.command}</span>
            </div>
        `).join('');
    } else if (recentContainer) {
        recentContainer.innerHTML = '<div class="loading-placeholder">No recent commands</div>';
    }
}

function renderDevices() {
    if (!devicesContainer) return;
    
    let filteredDevices = Object.entries(devices);
    
    // Filter by status
    if (currentFilter !== 'all') {
        filteredDevices = filteredDevices.filter(([_, d]) => d.status === currentFilter);
    }
    
    // Filter by search
    const searchTerm = searchInput?.value.toLowerCase() || '';
    if (searchTerm) {
        filteredDevices = filteredDevices.filter(([id, d]) => 
            id.toLowerCase().includes(searchTerm) || 
            d.type.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredDevices.length === 0) {
        devicesContainer.innerHTML = '<div class="loading-placeholder">No devices found</div>';
        return;
    }
    
    if (currentViewMode === 'grid') {
        devicesContainer.innerHTML = filteredDevices.map(([id, d]) => renderDeviceCard(id, d)).join('');
    } else {
        devicesContainer.innerHTML = `
            <div class="devices-list">
                ${filteredDevices.map(([id, d]) => renderDeviceListItem(id, d)).join('')}
            </div>
        `;
    }
    
    // Attach event listeners to buttons
    attachDeviceEventListeners();
}

function renderDeviceCard(id, device) {
    const lastSeen = device.last_seen ? new Date(device.last_seen * 1000).toLocaleString() : 'Never';
    const capabilities = device.capabilities || [];
    const quickCommands = capabilities.slice(0, 4);
    
    return `
        <div class="device-card ${device.status}" data-device-id="${id}">
            <div class="card-header">
                <div class="device-icon">
                    <i class="fas fa-microchip"></i>
                </div>
                <span class="status-badge ${device.status}">${device.status}</span>
            </div>
            <div class="device-id"><code>${escapeHtml(id)}</code></div>
            <div class="device-type">${escapeHtml(device.type)}</div>
            <div class="device-last-seen"><i class="fas fa-clock"></i> Last seen: ${lastSeen}</div>
            <div class="card-actions">
                <button class="btn-primary send-cmd" data-id="${id}">Send Command</button>
                <button class="btn-secondary json-cmd" data-id="${id}">JSON</button>
                ${device.status === 'online' ? `<button class="btn-secondary disconnect-device" data-id="${id}">Disconnect</button>` : ''}
                <button class="btn-danger remove-device" data-id="${id}">Remove</button>
            </div>
            ${quickCommands.length > 0 ? `
                <div class="quick-commands">
                    ${quickCommands.map(cmd => `<button class="quick-cmd" data-id="${id}" data-cmd="${cmd}">${cmd}</button>`).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function renderDeviceListItem(id, device) {
    const lastSeen = device.last_seen ? new Date(device.last_seen * 1000).toLocaleString() : 'Never';
    
    return `
        <div class="device-list-item" data-device-id="${id}">
            <div><strong>${escapeHtml(id)}</strong><br><span style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(device.type)}</span></div>
            <div><span class="status-badge ${device.status}">${device.status}</span></div>
            <div style="font-size:0.75rem">${lastSeen}</div>
            <div>
                <button class="btn-primary send-cmd small" data-id="${id}">Command</button>
                <button class="btn-secondary disconnect-device small" data-id="${id}">Disconnect</button>
                <button class="btn-danger remove-device small" data-id="${id}">Remove</button>
            </div>
        </div>
    `;
}

function attachDeviceEventListeners() {
    document.querySelectorAll('.send-cmd').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = btn.dataset.id;
            const device = devices[deviceId];
            if (device?.status === 'online') {
                showCommandModal(deviceId);
            } else {
                showToast('Device is offline', 'warning');
            }
        });
    });
    
    document.querySelectorAll('.json-cmd').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showCommandModal(btn.dataset.id);
        });
    });
    
    document.querySelectorAll('.quick-cmd').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = btn.dataset.id;
            const command = btn.dataset.cmd;
            sendCommand(deviceId, command, {});
        });
    });
    
    document.querySelectorAll('.disconnect-device').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            disconnectDevice(btn.dataset.id);
        });
    });
    
    document.querySelectorAll('.remove-device').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Remove device ${btn.dataset.id}?`)) {
                removeDevice(btn.dataset.id);
            }
        });
    });
}

function showCommandModal(deviceId) {
    document.getElementById('modalDeviceId').value = deviceId;
    document.getElementById('modalCommand').value = '';
    document.getElementById('modalPayload').value = '{}';
    document.getElementById('commandModal').style.display = 'block';
}

function sendCommand(deviceId, command, payload, callback) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast('Not connected to Core', 'error');
        return;
    }
    
    const msgId = generateUUID();
    const msg = { type: 'command', device_id: deviceId, command, payload, id: msgId };
    ws.send(JSON.stringify(msg));
    
    // Add to history
    commandHistory.unshift({
        id: msgId,
        timestamp: Date.now(),
        deviceId,
        command,
        payload: JSON.stringify(payload),
        status: 'pending',
        error: null
    });
    
    if (commandHistory.length > 100) commandHistory.pop();
    saveStoredData();
    renderHistory();
    
    addLogEntry('command', `→ ${deviceId}: ${command}`);
    showToast(`Command sent to ${deviceId}`, 'info');
    
    if (callback) callback(true);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function disconnectDevice(deviceId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'disconnect_device', device_id: deviceId }));
    addLogEntry('action', `Disconnected device ${deviceId}`);
    showToast(`Disconnected ${deviceId}`, 'warning');
}

function removeDevice(deviceId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'remove_device', device_id: deviceId }));
    addLogEntry('action', `Removed device ${deviceId}`);
    showToast(`Removed ${deviceId}`, 'success');
}

function approveDevice(deviceId, approved) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg = { type: 'device_auth_response', device_id: deviceId, approved };
    if (pendingAuthRequest?.device_id === deviceId) {
        msg.id = pendingAuthRequest.id;
    }
    ws.send(JSON.stringify(msg));
    addLogEntry('auth', `Device ${deviceId} ${approved ? 'approved' : 'denied'}`);
    showToast(`Device ${deviceId} ${approved ? 'approved' : 'denied'}`, approved ? 'success' : 'warning');
}

function rotateToken() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast('Not connected', 'error');
        return;
    }
    if (confirm('Generate a new authentication token? All online devices will receive the new token.')) {
        ws.send(JSON.stringify({ type: 'rotate_token' }));
        addLogEntry('action', 'Token rotation requested');
        showToast('Token rotation requested', 'info');
    }
}

function exportToCsv() {
    const headers = ['ID', 'Type', 'Status', 'Last Seen', 'Capabilities'];
    const rows = Object.entries(devices).map(([id, d]) => [
        id, d.type, d.status,
        d.last_seen ? new Date(d.last_seen * 1000).toLocaleString() : '',
        (d.capabilities || []).join(',')
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
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Devices exported to CSV', 'success');
}

function renderHistory() {
    if (!historyList) return;
    
    if (commandHistory.length === 0) {
        historyList.innerHTML = '<div class="loading-placeholder">No command history</div>';
        return;
    }
    
    historyList.innerHTML = commandHistory.map(entry => `
        <div class="history-item">
            <span class="history-time">${new Date(entry.timestamp).toLocaleString()}</span>
            <span class="history-status ${entry.status}">${entry.status}</span>
            <span class="history-device">${escapeHtml(entry.deviceId)}</span>
            <span class="history-command">${escapeHtml(entry.command)}</span>
            <span class="history-payload">${entry.payload !== '{}' ? entry.payload : ''}</span>
            ${entry.error ? `<span class="history-error" style="color:var(--danger)">${escapeHtml(entry.error)}</span>` : ''}
        </div>
    `).join('');
}

function renderLogs() {
    if (!logsContainer) return;
    
    if (eventLogs.length === 0) {
        logsContainer.innerHTML = '<div class="loading-placeholder">No event logs</div>';
        return;
    }
    
    logsContainer.innerHTML = eventLogs.map(log => `
        <div class="log-item">
            <span class="log-time">${log.time}</span>
            <span class="log-category" style="color:var(--accent-primary)">[${log.category}]</span>
            <span class="log-message">${escapeHtml(log.message)}</span>
        </div>
    `).join('');
}

function addLogEntry(category, message) {
    eventLogs.unshift({
        time: new Date().toLocaleTimeString(),
        category,
        message
    });
    
    if (eventLogs.length > 200) eventLogs.pop();
    renderLogs();
    
    // Auto-scroll logs container
    if (logsContainer && currentView === 'logs') {
        logsContainer.scrollTop = 0;
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function checkAndNotifyPending() {
    if (Notification.permission !== 'granted') return;
    
    Object.entries(devices).forEach(([id, device]) => {
        if (device.status === 'pending' && !notifiedPendingIds.has(id)) {
            notifiedPendingIds.add(id);
            new Notification('New Device Pending Authorization', {
                body: `Device ${id} (${device.type}) is waiting for approval.`,
                icon: '/static/favicon.ico',
                tag: `pending-${id}`,
                requireInteraction: true
            });
        }
    });
}

function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showToast('Notifications not supported', 'error');
        return;
    }
    
    if (Notification.permission === 'granted') {
        showToast('Notifications already enabled', 'success');
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showToast('Notifications enabled', 'success');
            }
        });
    }
}

function saveStoredData() {
    localStorage.setItem('commandHistory', JSON.stringify(commandHistory.slice(0, 50)));
}

function loadStoredData() {
    const saved = localStorage.getItem('commandHistory');
    if (saved) {
        try {
            commandHistory = JSON.parse(saved);
            renderHistory();
        } catch (e) {}
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}