// script.js - Modern Dashboard with Settings

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
let manualDisconnect = false;

// Settings
let settings = {
    wsAddress: 'ws://localhost:8000/webui',
    autoReconnect: true,
    reconnectDelay: 3,
    maxReconnectAttempts: 0,
    theme: 'dark',
    defaultView: 'dashboard',
    defaultDisplayMode: 'grid',
    animationsEnabled: true,
    notifyDeviceOnline: true,
    notifyDeviceOffline: true,
    notifyCommandResult: false,
    notifyPendingDevice: true,
    historyLimit: 100,
    reconnectAttempts: 0
};

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
    
    // Load settings
    loadSettings();
    
    // Initialize theme
    initTheme();
    
    // Event listeners
    initEventListeners();
    initSettingsListeners();
    
    // Connect WebSocket
    connectWebSocket();
    
    // Load saved history from localStorage
    loadStoredData();
    
    // Start periodic updates
    setInterval(updateDashboardStats, 1000);
    setInterval(updateServerInfo, 5000);
    
    // Update server info
    updateServerInfo();
});

// ==================== SETTINGS MANAGEMENT ====================

function loadSettings() {
    const saved = localStorage.getItem('yuki_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            settings = { ...settings, ...parsed };
        } catch (e) {}
    }
    
    // Apply settings to UI if elements exist
    const wsAddressEl = document.getElementById('wsAddress');
    if (wsAddressEl) wsAddressEl.value = settings.wsAddress;
    
    const autoReconnectEl = document.getElementById('autoReconnectToggle');
    if (autoReconnectEl) autoReconnectEl.checked = settings.autoReconnect;
    
    const reconnectDelayEl = document.getElementById('reconnectDelay');
    if (reconnectDelayEl) reconnectDelayEl.value = settings.reconnectDelay;
    
    const maxReconnectAttemptsEl = document.getElementById('maxReconnectAttempts');
    if (maxReconnectAttemptsEl) maxReconnectAttemptsEl.value = settings.maxReconnectAttempts;
    
    const themeSelectEl = document.getElementById('themeSelect');
    if (themeSelectEl) themeSelectEl.value = settings.theme;
    
    const defaultViewEl = document.getElementById('defaultView');
    if (defaultViewEl) defaultViewEl.value = settings.defaultView;
    
    const defaultDisplayModeEl = document.getElementById('defaultDisplayMode');
    if (defaultDisplayModeEl) defaultDisplayModeEl.value = settings.defaultDisplayMode;
    
    const animationsToggleEl = document.getElementById('animationsToggle');
    if (animationsToggleEl) animationsToggleEl.checked = settings.animationsEnabled;
    
    const notifyDeviceOnlineEl = document.getElementById('notifyDeviceOnline');
    if (notifyDeviceOnlineEl) notifyDeviceOnlineEl.checked = settings.notifyDeviceOnline;
    
    const notifyDeviceOfflineEl = document.getElementById('notifyDeviceOffline');
    if (notifyDeviceOfflineEl) notifyDeviceOfflineEl.checked = settings.notifyDeviceOffline;
    
    const notifyCommandResultEl = document.getElementById('notifyCommandResult');
    if (notifyCommandResultEl) notifyCommandResultEl.checked = settings.notifyCommandResult;
    
    const notifyPendingDeviceEl = document.getElementById('notifyPendingDevice');
    if (notifyPendingDeviceEl) notifyPendingDeviceEl.checked = settings.notifyPendingDevice;
    
    const historyLimitEl = document.getElementById('historyLimit');
    if (historyLimitEl) historyLimitEl.value = settings.historyLimit;
    
    // Apply theme
    if (settings.theme === 'auto') {
        const darkModeMedia = window.matchMedia('(prefers-color-scheme: dark)');
        currentTheme = darkModeMedia.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', currentTheme);
        darkModeMedia.addEventListener('change', (e) => {
            if (settings.theme === 'auto') {
                currentTheme = e.matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', currentTheme);
            }
        });
    } else {
        currentTheme = settings.theme;
        document.documentElement.setAttribute('data-theme', currentTheme);
    }
    
    // Apply default view
    if (settings.defaultView !== 'dashboard') {
        setTimeout(() => {
            switchView(settings.defaultView);
            document.querySelectorAll('.nav-item').forEach(nav => {
                nav.classList.remove('active');
                if (nav.dataset.view === settings.defaultView) {
                    nav.classList.add('active');
                }
            });
        }, 100);
    }
    
    // Apply display mode
    currentViewMode = settings.defaultDisplayMode;
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === settings.defaultDisplayMode) {
            btn.classList.add('active');
        }
    });
    
    // Apply animations
    if (!settings.animationsEnabled) {
        document.body.classList.add('no-animations');
    }
}

function saveSettings() {
    const wsAddressEl = document.getElementById('wsAddress');
    if (wsAddressEl) settings.wsAddress = wsAddressEl.value;
    
    const autoReconnectEl = document.getElementById('autoReconnectToggle');
    if (autoReconnectEl) settings.autoReconnect = autoReconnectEl.checked;
    
    const reconnectDelayEl = document.getElementById('reconnectDelay');
    if (reconnectDelayEl) settings.reconnectDelay = parseInt(reconnectDelayEl.value);
    
    const maxReconnectAttemptsEl = document.getElementById('maxReconnectAttempts');
    if (maxReconnectAttemptsEl) settings.maxReconnectAttempts = parseInt(maxReconnectAttemptsEl.value);
    
    const themeSelectEl = document.getElementById('themeSelect');
    if (themeSelectEl) settings.theme = themeSelectEl.value;
    
    const defaultViewEl = document.getElementById('defaultView');
    if (defaultViewEl) settings.defaultView = defaultViewEl.value;
    
    const defaultDisplayModeEl = document.getElementById('defaultDisplayMode');
    if (defaultDisplayModeEl) settings.defaultDisplayMode = defaultDisplayModeEl.value;
    
    const animationsToggleEl = document.getElementById('animationsToggle');
    if (animationsToggleEl) settings.animationsEnabled = animationsToggleEl.checked;
    
    const notifyDeviceOnlineEl = document.getElementById('notifyDeviceOnline');
    if (notifyDeviceOnlineEl) settings.notifyDeviceOnline = notifyDeviceOnlineEl.checked;
    
    const notifyDeviceOfflineEl = document.getElementById('notifyDeviceOffline');
    if (notifyDeviceOfflineEl) settings.notifyDeviceOffline = notifyDeviceOfflineEl.checked;
    
    const notifyCommandResultEl = document.getElementById('notifyCommandResult');
    if (notifyCommandResultEl) settings.notifyCommandResult = notifyCommandResultEl.checked;
    
    const notifyPendingDeviceEl = document.getElementById('notifyPendingDevice');
    if (notifyPendingDeviceEl) settings.notifyPendingDevice = notifyPendingDeviceEl.checked;
    
    const historyLimitEl = document.getElementById('historyLimit');
    if (historyLimitEl) settings.historyLimit = parseInt(historyLimitEl.value);
    
    localStorage.setItem('yuki_settings', JSON.stringify(settings));
    
    // Apply animations
    if (settings.animationsEnabled) {
        document.body.classList.remove('no-animations');
    } else {
        document.body.classList.add('no-animations');
    }
    
    showToast('Settings saved', 'success');
}

function exportSettings() {
    const exportData = {
        version: '2.0',
        timestamp: new Date().toISOString(),
        settings: settings,
        devices: devices,
        commandHistory: commandHistory.slice(0, 50)
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `yuki_backup_${new Date().toISOString().slice(0,19)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    showToast('Settings exported', 'success');
}

function importSettings(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.settings) {
                settings = { ...settings, ...data.settings };
                saveSettings();
                loadSettings();
            }
            if (data.commandHistory) {
                commandHistory = data.commandHistory.slice(0, settings.historyLimit);
                saveStoredData();
                renderHistory();
            }
            showToast('Settings imported successfully', 'success');
        } catch (err) {
            showToast('Invalid backup file', 'error');
        }
    };
    reader.readAsText(file);
}

function resetSettings() {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
        localStorage.removeItem('yuki_settings');
        localStorage.removeItem('commandHistory');
        location.reload();
    }
}

function clearAllData() {
    if (confirm('Clear ALL data (settings, history, logs)? This cannot be undone.')) {
        localStorage.clear();
        location.reload();
    }
}

async function testConnection() {
    const address = document.getElementById('wsAddress').value;
    const testWs = new WebSocket(address);
    
    const timeout = setTimeout(() => {
        testWs.close();
        updateServerStatus(false, 'Timeout');
        showToast('Connection timeout', 'error');
    }, 5000);
    
    testWs.onopen = () => {
        clearTimeout(timeout);
        updateServerStatus(true, 'Connected');
        showToast('Connection successful!', 'success');
        testWs.close();
    };
    
    testWs.onerror = () => {
        clearTimeout(timeout);
        updateServerStatus(false, 'Failed');
        showToast('Connection failed', 'error');
    };
}

function updateServerStatus(connected, message) {
    const statusEl = document.getElementById('coreServerStatus');
    if (statusEl) {
        statusEl.textContent = message || (connected ? 'Connected' : 'Disconnected');
        statusEl.className = `status-badge ${connected ? 'online' : 'offline'}`;
    }
}

function updateServerInfo() {
    // Update connected devices count
    const devicesCount = Object.keys(devices).length;
    const devicesCountEl = document.getElementById('connectedDevicesCount');
    if (devicesCountEl) devicesCountEl.textContent = devicesCount;
    
    // Update browser info
    const browserInfoEl = document.getElementById('browserInfo');
    if (browserInfoEl) {
        browserInfoEl.textContent = navigator.userAgent.split(' ').slice(-2).join(' ').substring(0, 50);
    }
    
    const languageInfoEl = document.getElementById('languageInfo');
    if (languageInfoEl) languageInfoEl.textContent = navigator.language;
    
    const timezoneInfoEl = document.getElementById('timezoneInfo');
    if (timezoneInfoEl) timezoneInfoEl.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Calculate uptime (mock - would need server API)
    const startTime = localStorage.getItem('yuki_start_time');
    const uptimeEl = document.getElementById('serverUptime');
    if (uptimeEl) {
        if (startTime) {
            const uptime = Math.floor((Date.now() - parseInt(startTime)) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            uptimeEl.textContent = `${hours}h ${minutes}m`;
        } else {
            localStorage.setItem('yuki_start_time', Date.now().toString());
            uptimeEl.textContent = 'Just started';
        }
    }
}

function initSettingsListeners() {
    const applyConnectionBtn = document.getElementById('applyConnectionBtn');
    if (applyConnectionBtn) {
        applyConnectionBtn.addEventListener('click', () => {
            saveSettings();
            manualDisconnect = false;
            if (ws) {
                ws.close();
            }
            setTimeout(() => connectWebSocket(), 500);
        });
    }
    
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    if (testConnectionBtn) testConnectionBtn.addEventListener('click', testConnection);
    
    const exportSettingsBtn = document.getElementById('exportSettingsBtn');
    if (exportSettingsBtn) exportSettingsBtn.addEventListener('click', exportSettings);
    
    const importSettingsBtn = document.getElementById('importSettingsBtn');
    const importSettingsFile = document.getElementById('importSettingsFile');
    if (importSettingsBtn && importSettingsFile) {
        importSettingsBtn.addEventListener('click', () => {
            importSettingsFile.click();
        });
        importSettingsFile.addEventListener('change', (e) => {
            if (e.target.files[0]) importSettings(e.target.files[0]);
            e.target.value = '';
        });
    }
    
    const resetSettingsBtn = document.getElementById('resetSettingsBtn');
    if (resetSettingsBtn) resetSettingsBtn.addEventListener('click', resetSettings);
    
    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    if (clearAllDataBtn) clearAllDataBtn.addEventListener('click', clearAllData);
    
    // Auto-save on input change
    const autoSaveInputs = ['wsAddress', 'autoReconnectToggle', 'reconnectDelay', 'maxReconnectAttempts', 
                            'themeSelect', 'defaultView', 'defaultDisplayMode', 'animationsToggle',
                            'notifyDeviceOnline', 'notifyDeviceOffline', 'notifyCommandResult', 
                            'notifyPendingDevice', 'historyLimit'];
    
    autoSaveInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => saveSettings());
            if (el.type !== 'checkbox' && el.type !== 'select-one') {
                el.addEventListener('input', () => saveSettings());
            }
        }
    });
    
    // GitHub link
    const githubLink = document.getElementById('githubLink');
    if (githubLink) {
        githubLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('https://github.com/yuki-system/dashboard', '_blank');
        });
    }
}

// ==================== THEME ====================

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

// ==================== EVENT LISTENERS ====================

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
    const commandModal = document.getElementById('commandModal');
    const confirmModal = document.getElementById('confirmModal');
    const authModal = document.getElementById('authModal');
    
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            if (commandModal) commandModal.style.display = 'none';
            if (confirmModal) confirmModal.style.display = 'none';
            if (authModal) authModal.style.display = 'none';
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
        if (commandModal) commandModal.style.display = 'none';
    });
    
    document.getElementById('confirmYesBtn')?.addEventListener('click', () => {
        if (pendingConfirmation && ws && ws.readyState === WebSocket.OPEN) {
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
        if (confirmModal) confirmModal.style.display = 'none';
        pendingConfirmation = null;
    });
    
    document.getElementById('confirmNoBtn')?.addEventListener('click', () => {
        if (confirmModal) confirmModal.style.display = 'none';
        pendingConfirmation = null;
    });
    
    document.getElementById('authApproveBtn')?.addEventListener('click', () => {
        if (pendingAuthRequest) {
            approveDevice(pendingAuthRequest.device_id, true);
        }
        if (authModal) authModal.style.display = 'none';
    });
    
    document.getElementById('authDenyBtn')?.addEventListener('click', () => {
        if (pendingAuthRequest) {
            approveDevice(pendingAuthRequest.device_id, false);
        }
        if (authModal) authModal.style.display = 'none';
    });
    
    window.onclick = (e) => {
        if (commandModal && e.target === commandModal) commandModal.style.display = 'none';
        if (confirmModal && e.target === confirmModal) confirmModal.style.display = 'none';
        if (authModal && e.target === authModal) authModal.style.display = 'none';
    };
}

// ==================== WEBSOCKET ====================

function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    
    const address = settings.wsAddress;
    ws = new WebSocket(address);
    
    ws.onopen = () => {
        settings.reconnectAttempts = 0;
        updateConnectionStatus(true);
        addLogEntry('system', 'Connected to Core');
        if (reconnectTimer) clearTimeout(reconnectTimer);
        ws.send(JSON.stringify({ type: 'get_token_info' }));
        ws.send(JSON.stringify({ type: 'get_devices' }));
        updateServerStatus(true, 'Connected');
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
        updateServerStatus(false, 'Disconnected');
        if (!manualDisconnect) {
            scheduleReconnect();
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error', error);
        addLogEntry('error', 'WebSocket connection error');
        updateServerStatus(false, 'Error');
    };
}

function scheduleReconnect() {
    if (!settings.autoReconnect || manualDisconnect) return;
    
    if (reconnectTimer) clearTimeout(reconnectTimer);
    
    settings.reconnectAttempts++;
    if (settings.maxReconnectAttempts > 0 && settings.reconnectAttempts > settings.maxReconnectAttempts) {
        addLogEntry('system', 'Max reconnect attempts reached');
        return;
    }
    
    reconnectTimer = setTimeout(() => {
        addLogEntry('system', `Reconnecting... (Attempt ${settings.reconnectAttempts})`);
        connectWebSocket();
    }, settings.reconnectDelay * 1000);
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        statusEl.classList.toggle('connected', connected);
        statusEl.classList.toggle('disconnected', !connected);
        const span = statusEl.querySelector('span');
        if (span) span.textContent = connected ? 'Connected' : 'Disconnected';
    }
}

// ==================== MESSAGE HANDLING ====================

function handleMessage(data) {
    switch (data.type) {
        case 'devices_list':
        case 'devices_update':
            if (data.payload?.devices) {
                const oldDevices = { ...devices };
                devices = data.payload.devices;
                updateDashboardStats();
                renderDevices();
                checkAndNotifyPending();
                
                // Check for device status changes
                Object.entries(devices).forEach(([id, device]) => {
                    const oldDevice = oldDevices[id];
                    if (oldDevice && oldDevice.status !== device.status) {
                        if (device.status === 'online' && settings.notifyDeviceOnline) {
                            showToast(`${id} is now online`, 'success');
                        } else if (device.status === 'offline' && settings.notifyDeviceOffline) {
                            showToast(`${id} went offline`, 'warning');
                        }
                    }
                });
            }
            break;
            
        case 'confirm_command':
            pendingConfirmation = {
                id: data.id,
                device_id: data.payload.device_id,
                command: data.payload.command,
                params: data.payload.params
            };
            const confirmText = document.getElementById('confirmText');
            if (confirmText) {
                confirmText.textContent = `Execute "${data.payload.command}" on ${data.payload.device_id}?`;
            }
            const confirmModal = document.getElementById('confirmModal');
            if (confirmModal) confirmModal.style.display = 'block';
            break;
            
        case 'device_auth_request':
            pendingAuthRequest = {
                id: data.id,
                device_id: data.payload.device_id,
                device_type: data.payload.device_type,
                capabilities: data.payload.capabilities
            };
            const authDeviceId = document.getElementById('authDeviceId');
            if (authDeviceId) authDeviceId.textContent = data.payload.device_id;
            const authDeviceType = document.getElementById('authDeviceType');
            if (authDeviceType) authDeviceType.textContent = data.payload.device_type;
            const capsContainer = document.getElementById('authCapabilitiesList');
            if (capsContainer) {
                capsContainer.innerHTML = data.payload.capabilities.map(cap => 
                    `<span class="capability-chip">${escapeHtml(cap)}</span>`
                ).join('');
            }
            const authModal = document.getElementById('authModal');
            if (authModal) authModal.style.display = 'block';
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
        addLogEntry('command_result', `✅ Command succeeded on ${device_id}`);
        if (settings.notifyCommandResult) {
            new Notification('Command Success', {
                body: `Command on ${device_id} completed successfully`,
                icon: '/static/favicon.ico'
            });
        }
    } else {
        showToast(`Command failed on ${device_id}: ${error}`, 'error');
        addLogEntry('command_result', `❌ Command failed on ${device_id}: ${error}`);
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

// ==================== DASHBOARD STATS ====================

function updateDashboardStats() {
    const total = Object.keys(devices).length;
    const online = Object.values(devices).filter(d => d.status === 'online').length;
    const pending = Object.values(devices).filter(d => d.status === 'pending').length;
    const offline = Object.values(devices).filter(d => d.status === 'offline').length;
    
    const totalEl = document.getElementById('totalDevices');
    if (totalEl) totalEl.textContent = total;
    const onlineEl = document.getElementById('onlineDevices');
    if (onlineEl) onlineEl.textContent = online;
    const pendingEl = document.getElementById('pendingDevices');
    if (pendingEl) pendingEl.textContent = pending;
    const offlineEl = document.getElementById('offlineDevices');
    if (offlineEl) offlineEl.textContent = offline;
    const badgeEl = document.getElementById('deviceCountBadge');
    if (badgeEl) badgeEl.textContent = total;
    
    // Recent commands preview
    const recentContainer = document.getElementById('recentCommands');
    if (recentContainer) {
        if (commandHistory.length > 0) {
            const recent = commandHistory.slice(0, 5);
            recentContainer.innerHTML = recent.map(cmd => `
                <div class="history-item" style="padding: 10px;">
                    <span class="history-time">${new Date(cmd.timestamp).toLocaleTimeString()}</span>
                    <span class="history-status ${cmd.status}">${cmd.status}</span>
                    <span class="history-device">${escapeHtml(cmd.deviceId)}</span>
                    <span class="history-command">${escapeHtml(cmd.command)}</span>
                </div>
            `).join('');
        } else {
            recentContainer.innerHTML = '<div class="loading-placeholder">No recent commands</div>';
        }
    }
}

// ==================== RENDER DEVICES ====================

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
    
    attachDeviceEventListeners();
}

function renderDeviceCard(id, device) {
    const lastSeen = device.last_seen ? new Date(device.last_seen * 1000).toLocaleString() : 'Never';
    const capabilities = device.capabilities || [];
    const isOnline = device.status === 'online';
    
    return `
        <div class="device-card ${device.status}" data-device-id="${id}">
            <div class="card-header">
                <div class="device-icon">
                    <i class="fas ${getDeviceIcon(device.type)}"></i>
                </div>
                <span class="status-badge ${device.status}">${device.status}</span>
            </div>
            <div class="device-id"><code>${escapeHtml(id)}</code></div>
            <div class="device-type">${escapeHtml(device.type)}</div>
            <div class="device-last-seen"><i class="fas fa-clock"></i> Last seen: ${lastSeen}</div>
            
            <div class="card-actions">
                <button class="btn-primary send-cmd" data-id="${id}" ${!isOnline ? 'disabled' : ''}>
                    <i class="fas fa-paper-plane"></i> Send Command
                </button>
                <button class="btn-secondary json-cmd" data-id="${id}">
                    <i class="fas fa-code"></i> JSON
                </button>
                ${isOnline ? `
                    <button class="btn-secondary disconnect-device" data-id="${id}">
                        <i class="fas fa-plug"></i> Disconnect
                    </button>
                ` : ''}
                <button class="btn-danger remove-device" data-id="${id}">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
            
            <div class="quick-commands-panel" id="quick-panel-${id}" style="display: none;">
                <div class="quick-commands-header">
                    <span><i class="fas fa-bolt"></i> Quick Commands</span>
                    <button class="close-quick-panel" data-id="${id}">&times;</button>
                </div>
                <div class="quick-commands-grid">
                    ${capabilities.length > 0 ? 
                        capabilities.map(cmd => `
                            <button class="quick-cmd-btn" data-id="${id}" data-cmd="${cmd}">
                                <i class="fas fa-terminal"></i> ${escapeHtml(cmd)}
                            </button>
                        `).join('') : 
                        '<div class="no-commands">No quick commands available</div>'
                    }
                </div>
                <div class="custom-command-input">
                    <input type="text" placeholder="Custom command..." id="custom-cmd-${id}" class="custom-cmd-input">
                    <button class="send-custom-cmd" data-id="${id}">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderDeviceListItem(id, device) {
    const lastSeen = device.last_seen ? new Date(device.last_seen * 1000).toLocaleString() : 'Never';
    const isOnline = device.status === 'online';
    
    return `
        <div class="device-list-item" data-device-id="${id}">
            <div>
                <strong>${escapeHtml(id)}</strong>
                <br>
                <span style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(device.type)}</span>
            </div>
            <div><span class="status-badge ${device.status}">${device.status}</span></div>
            <div style="font-size:0.75rem">${lastSeen}</div>
            <div>
                <button class="btn-primary send-cmd small" data-id="${id}" ${!isOnline ? 'disabled' : ''}>
                    <i class="fas fa-paper-plane"></i> Command
                </button>
                <button class="btn-secondary json-cmd small" data-id="${id}">
                    <i class="fas fa-code"></i> JSON
                </button>
                ${isOnline ? `
                    <button class="btn-secondary disconnect-device small" data-id="${id}">
                        <i class="fas fa-plug"></i>
                    </button>
                ` : ''}
                <button class="btn-danger remove-device small" data-id="${id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function attachDeviceEventListeners() {
    // Send Command - opens quick commands panel
    document.querySelectorAll('.send-cmd').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = btn.dataset.id;
            const device = devices[deviceId];
            
            if (!device || device.status !== 'online') {
                showToast('Device is offline', 'warning');
                return;
            }
            
            // Close all other panels
            document.querySelectorAll('.quick-commands-panel').forEach(panel => {
                if (panel.id !== `quick-panel-${deviceId}`) {
                    panel.style.display = 'none';
                }
            });
            
            // Toggle current panel
            const panel = document.getElementById(`quick-panel-${deviceId}`);
            if (panel) {
                panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
            }
        });
    });
    
    // JSON Command - opens modal
    document.querySelectorAll('.json-cmd').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = btn.dataset.id;
            showCommandModal(deviceId);
        });
    });
    
    // Close quick panel buttons
    document.querySelectorAll('.close-quick-panel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = btn.dataset.id;
            const panel = document.getElementById(`quick-panel-${deviceId}`);
            if (panel) panel.style.display = 'none';
        });
    });
    
    // Quick command buttons
    document.querySelectorAll('.quick-cmd-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = btn.dataset.id;
            const command = btn.dataset.cmd;
            
            const panel = document.getElementById(`quick-panel-${deviceId}`);
            if (panel) panel.style.display = 'none';
            
            sendCommand(deviceId, command, {});
        });
    });
    
    // Send custom command
    document.querySelectorAll('.send-custom-cmd').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = btn.dataset.id;
            const input = document.getElementById(`custom-cmd-${deviceId}`);
            const command = input?.value.trim();
            
            if (!command) {
                showToast('Enter a command name', 'warning');
                return;
            }
            
            const panel = document.getElementById(`quick-panel-${deviceId}`);
            if (panel) panel.style.display = 'none';
            
            sendCommand(deviceId, command, {});
            if (input) input.value = '';
        });
    });
    
    // Enter key in custom command input
    document.querySelectorAll('.custom-cmd-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                const deviceId = input.id.replace('custom-cmd-', '');
                const command = input.value.trim();
                if (command) {
                    const panel = document.getElementById(`quick-panel-${deviceId}`);
                    if (panel) panel.style.display = 'none';
                    sendCommand(deviceId, command, {});
                    input.value = '';
                }
            }
        });
    });
    
    // Disconnect device
    document.querySelectorAll('.disconnect-device').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            disconnectDevice(btn.dataset.id);
        });
    });
    
    // Remove device
    document.querySelectorAll('.remove-device').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Remove device ${btn.dataset.id}?`)) {
                removeDevice(btn.dataset.id);
            }
        });
    });
    
    // Click outside closes panel
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.quick-commands-panel') && !e.target.closest('.send-cmd')) {
            document.querySelectorAll('.quick-commands-panel').forEach(panel => {
                panel.style.display = 'none';
            });
        }
    });
}

function getDeviceIcon(deviceType) {
    const icons = {
        'pc': 'fa-desktop',
        'laptop': 'fa-laptop',
        'server': 'fa-server',
        'phone': 'fa-mobile-alt',
        'tablet': 'fa-tablet-alt',
        'raspberry': 'fa-microchip',
        'arduino': 'fa-microchip',
        'smartphone': 'fa-mobile-alt',
        'router': 'fa-wifi',
        'switch': 'fa-exchange-alt',
        'camera': 'fa-video',
        'speaker': 'fa-music'
    };
    return icons[deviceType?.toLowerCase()] || 'fa-microchip';
}

// ==================== COMMANDS ====================

function showCommandModal(deviceId) {
    const modalDeviceId = document.getElementById('modalDeviceId');
    if (modalDeviceId) modalDeviceId.value = deviceId;
    const modalCommand = document.getElementById('modalCommand');
    if (modalCommand) modalCommand.value = '';
    const modalPayload = document.getElementById('modalPayload');
    if (modalPayload) modalPayload.value = '{}';
    const commandModal = document.getElementById('commandModal');
    if (commandModal) commandModal.style.display = 'block';
}

function sendCommand(deviceId, command, payload, callback) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast('Not connected to Core', 'error');
        if (callback) callback(false);
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
    
    // Trim history
    while (commandHistory.length > settings.historyLimit) {
        commandHistory.pop();
    }
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

// ==================== EXPORT ====================

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

// ==================== HISTORY & LOGS ====================

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
}

// ==================== NOTIFICATIONS ====================

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
    if (!settings.notifyPendingDevice) return;
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

// ==================== STORAGE ====================

function saveStoredData() {
    localStorage.setItem('commandHistory', JSON.stringify(commandHistory.slice(0, settings.historyLimit)));
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