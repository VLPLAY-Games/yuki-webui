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

// Хранилище расширенных статусов и метрик
let extendedStatuses = {};
let deviceMetricsHistory = {};
let metricsCharts = {};

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

    loadWidgets();
    loadGroups();
    loadTags();

    addAddWidgetButton();
    requestTokenInfo();
    setInterval(requestTokenInfo, 300000);

    initAdminListeners();
    
    // Start periodic updates
    setInterval(updateDashboardStats, 1000);
    setInterval(updateServerInfo, 5000);
    setInterval(loadSystemMetrics, 10000);
    
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

    // Загрузка расширенных статусов при старте
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'get_extended_statuses' }));
        }
    }, 30000); // Каждые 30 секунд
    
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
    
    if (view === 'admin') {
        // Загружаем данные при открытии админ-панели
        loadSystemMetrics();      // Системные метрики
        loadBlacklist();          // Черный список
        loadAuditLog();           // Audit лог
        loadCommandStats(currentStatPeriod || 'day');  // Статистика команд
        showToast('Admin panel data loaded', 'info');
    }
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
        requestTokenInfo(); // вместо прямого ws.send
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
                updateAllWidgets();
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
            updateRecentCommandsWidget();
            break;
            
        case 'status':
            if (data.payload?.device_id && devices[data.payload.device_id]) {
                devices[data.payload.device_id].status = data.payload.status;
                updateDashboardStats();
                renderDevices();
            }
            break;
        case 'system_metrics':
            updateSystemMetrics(data.payload);
            break;
        case 'blacklist':
            updateBlacklist(data.devices);
            break;
        case 'audit_log':
            updateAuditLog(data.logs);
            break;
        case 'broadcast_result':
            showToast(`Broadcast sent to ${data.sent} devices`, 'success');
            break;
        case 'extended_status':
            updateExtendedStatus(data.device_id, data.substatus, data.details);
            break;

        case 'metrics_update':
            updateDeviceMetrics(data.device_id, data.metrics, data.timestamp);
            // Также обновляем данные в devices объекте
            if (devices[data.device_id]) {
                devices[data.device_id].last_metrics = data.metrics;
            }
            break;

        case 'extended_statuses':
            extendedStatuses = data.statuses;
            renderDevices(); // Перерендериваем
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

function formatTime(seconds) {
    if (seconds <= 0) return 'Expired';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}


function updateTokenInfo(payload) {
    const infoDiv = document.getElementById('tokenInfo');
    if (infoDiv) {
        const created = payload.created_at ? new Date(payload.created_at * 1000).toLocaleString() : 'N/A';
        const expiresIn = payload.expires_in ? formatTime(payload.expires_in) : 'Never';
        infoDiv.innerHTML = `<strong>Created:</strong> ${created}<br><strong>Expires:</strong> ${expiresIn}`;
    }
    
    // Update all token widgets
    document.querySelectorAll('[id^="widgetTokenInfo"]').forEach(widget => {
        const created = payload.created_at ? new Date(payload.created_at * 1000).toLocaleString() : 'N/A';
        const expiresIn = payload.expires_in ? formatTime(payload.expires_in) : 'Never';
        widget.innerHTML = `<strong>Created:</strong> ${created}<br><strong>Expires:</strong> ${expiresIn}`;
    });
}

// ==================== DASHBOARD STATS ====================

function updateDashboardStats() {
    const total = Object.keys(devices).length;
    const online = Object.values(devices).filter(d => d.status === 'online').length;
    const pending = Object.values(devices).filter(d => d.status === 'pending').length;
    const offline = Object.values(devices).filter(d => d.status === 'offline').length;
    
    // Обновляем цифры в карточках статистики
    const totalEl = document.getElementById('totalDevices');
    if (totalEl) totalEl.textContent = total;
    const onlineEl = document.getElementById('onlineDevices');
    if (onlineEl) onlineEl.textContent = online;
    const pendingEl = document.getElementById('pendingDevices');
    if (pendingEl) pendingEl.textContent = pending;
    const offlineEl = document.getElementById('offlineDevices');
    if (offlineEl) offlineEl.textContent = offline;
    
    // ОБНОВЛЯЕМ БЕЙДЖ В САЙДБАРЕ
    const badge = document.getElementById('deviceCountBadge');
    if (badge) {
        // Определяем основной статус для отображения (приоритет: онлайн > pending > оффлайн)
        let mainStatus = 'offline';
        let displayCount = offline;
        
        if (online > 0) {
            mainStatus = 'online';
            displayCount = online;
        } else if (pending > 0) {
            mainStatus = 'pending';
            displayCount = pending;
        } else {
            mainStatus = 'offline';
            displayCount = offline;
        }
        
        // Меняем текст и классы
        badge.textContent = displayCount;
        
        // Убираем старые классы статусов
        badge.classList.remove('online', 'pending', 'offline');
        // Добавляем новый класс
        badge.classList.add(mainStatus);
    }
    
    // Recent commands preview (оставляем как было)
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
    const metrics = device.last_metrics || {};
    const extended = extendedStatuses[id] || {};
    const substatus = extended.substatus || device.substatus || '';

    // Формируем HTML метрик
    let metricsHtml = '';
    if (isOnline && Object.keys(metrics).length > 0) {
        metricsHtml = '<div class="device-metrics"><div class="metrics-row">';
        if (metrics.cpu !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-microchip"></i> CPU: ${metrics.cpu}%</span>`;
        if (metrics.memory_percent !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-memory"></i> RAM: ${metrics.memory_percent}%</span>`;
        if (metrics.disk_percent !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-hdd"></i> Disk: ${metrics.disk_percent}%</span>`;
        if (metrics.temperature !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-thermometer-half"></i> ${metrics.temperature}°C</span>`;
        if (metrics.humidity !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-tint"></i> ${metrics.humidity}%</span>`;
        if (metrics.battery !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-battery-${metrics.battery > 75 ? 'full' : (metrics.battery > 50 ? 'half' : 'quarter')}"></i> ${metrics.battery}%</span>`;
        metricsHtml += '</div></div>';
    }
    
    return `
        <div class="device-card ${device.status}" data-device-id="${id}">
            <div class="card-header">
                <div class="device-icon">
                    <i class="fas ${getDeviceIcon(device.type)}"></i>
                </div>
                <div class="device-status-container">
                    <span class="status-badge ${device.status}">${device.status}</span>
                    ${substatus && substatus !== device.status ? `<span class="substatus-badge" style="background: ${getSubstatusColor(substatus)}20; color: ${getSubstatusColor(substatus)}">
                        <i class="fas ${getSubstatusIcon(substatus)}"></i> ${substatus}
                    </span>` : ''}
                </div>
            </div>
            <div class="device-id"><code>${escapeHtml(id)}</code></div>
            <div class="device-type">${escapeHtml(device.type)}</div>
            ${metricsHtml}
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
    
    // Локально удаляем устройство из списка
    if (devices[deviceId]) {
        delete devices[deviceId];
        renderDevices();           // Обновляем отображение
        updateDashboardStats();    // Обновляем статистику
        updateMiniStats();         // Обновляем виджеты
    }
    
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

// ==================== WIDGETS SYSTEM ====================
let widgets = [];
let draggedWidget = null;
let availableWidgets = ['stats', 'token', 'recent_commands'];

async function loadWidgets() {
    try {
        const response = await fetch('/api/widgets');
        widgets = await response.json();
        if (!widgets || widgets.length === 0) {
            widgets = [
                { id: 'stats', type: 'stats', w: 2, h: 1 },
                { id: 'token', type: 'token', w: 2, h: 1 },
                { id: 'recent', type: 'recent_commands', w: 2, h: 2 }
            ];
            await saveWidgets();
        }
        renderWidgets();
    } catch (e) {
        console.error('Failed to load widgets', e);
        widgets = [
            { id: 'stats', type: 'stats', w: 2, h: 1 },
            { id: 'token', type: 'token', w: 2, h: 1 },
            { id: 'recent', type: 'recent_commands', w: 2, h: 2 }
        ];
        renderWidgets();
    }
}

async function saveWidgets() {
    try {
        await fetch('/api/widgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(widgets)
        });
    } catch (e) {
        console.error('Failed to save widgets', e);
    }
}


function renderWidgets() {
    const container = document.getElementById('widgetGrid');
    if (!container) return;
    
    if (!widgets || widgets.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No widgets. Click "Add Widget" to get started.</div>';
        return;
    }
    
    container.innerHTML = widgets.map(widget => renderWidget(widget)).join('');
    
    // Add drag and drop
    document.querySelectorAll('.dashboard-widget').forEach(el => {
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', handleDragStart);
        el.addEventListener('dragend', handleDragEnd);
        el.addEventListener('dragover', handleDragOver);
        el.addEventListener('drop', handleDrop);
    });
    
    // Add widget controls
    document.querySelectorAll('.refresh-widget').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const widgetId = btn.dataset.id;
            const widget = widgets.find(w => w.id === widgetId);
            if (widget) loadWidgetContent(widget);
            showToast('Widget refreshed', 'info');
        });
    });
    
    document.querySelectorAll('.remove-widget').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const widgetId = btn.dataset.id;
            removeWidget(widgetId);
        });
    });
    
    // Load widget content
    widgets.forEach(widget => {
        loadWidgetContent(widget);
    });
}

function renderWidget(widget) {
    const icons = {
        stats: 'fa-chart-pie',
        token: 'fa-key',
        recent_commands: 'fa-history'
    };
    
    const titles = {
        stats: 'Statistics',
        token: 'Token Info',
        recent_commands: 'Recent Commands'
    };
    
    return `
        <div class="dashboard-widget" data-widget-id="${widget.id}" style="grid-column: span ${widget.w || 2};">
            <div class="widget-header">
                <h3><i class="fas ${icons[widget.type]}"></i> ${titles[widget.type] || widget.type}</h3>
                <div class="widget-controls">
                    <button class="refresh-widget" data-id="${widget.id}" title="Refresh">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="remove-widget" data-id="${widget.id}" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="widget-content" id="widget-${widget.id}">
                <div class="loading-placeholder">Loading...</div>
            </div>
        </div>
    `;
}

async function removeWidget(widgetId) {
    if (confirm('Remove this widget?')) {
        widgets = widgets.filter(w => w.id !== widgetId);
        await saveWidgets();
        renderWidgets();
        showToast('Widget removed', 'success');
    }
}

function showAddWidgetModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'addWidgetModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h3><i class="fas fa-plus"></i> Add Widget</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Widget Type</label>
                    <select id="newWidgetType" class="form-control">
                        <option value="stats">📊 Statistics (Total/Online/Pending)</option>
                        <option value="token">🔑 Token Info</option>
                        <option value="recent_commands">📜 Recent Commands</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button id="confirmAddWidgetBtn" class="btn-primary">Add Widget</button>
                <button class="btn-secondary modal-cancel">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    modal.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
    
    document.getElementById('confirmAddWidgetBtn')?.addEventListener('click', async () => {
        const type = document.getElementById('newWidgetType').value;
        const newId = `${type}_${Date.now()}`;
        widgets.push({
            id: newId,
            type: type,
            w: 2,
            h: type === 'recent_commands' ? 2 : 1
        });
        await saveWidgets();
        renderWidgets();
        modal.remove();
        showToast('Widget added', 'success');
    });
}

async function resetWidgets() {
    if (confirm('Reset all widgets to default? This will remove all custom widgets.')) {
        widgets = [
            { id: 'stats', type: 'stats', w: 2, h: 1 },
            { id: 'token', type: 'token', w: 2, h: 1 },
            { id: 'recent', type: 'recent_commands', w: 2, h: 2 }
        ];
        await saveWidgets();
        renderWidgets();
        showToast('Widgets reset to default', 'success');
    }
}

function addAddWidgetButton() {
    const sectionHeader = document.querySelector('#dashboardView .section-header:first-of-type');
    if (sectionHeader && !document.getElementById('addWidgetBtn')) {
        const addBtn = document.createElement('button');
        addBtn.id = 'addWidgetBtn';
        addBtn.className = 'btn-secondary small';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Widget';
        addBtn.style.marginLeft = '10px';
        addBtn.addEventListener('click', showAddWidgetModal);
        sectionHeader.appendChild(addBtn);
    }
}

function getWidgetTitle(type) {
    const titles = {
        stats: 'Statistics',
        token: 'Token Info',
        recent_commands: 'Recent Commands'
    };
    return titles[type] || type;
}

function loadWidgetContent(widget) {
    const container = document.getElementById(`widget-${widget.id}`);
    if (!container) return;
    
    switch (widget.type) {
        case 'stats':
            container.innerHTML = `
                <div class="stats-mini">
                    <div class="stat-mini"><h4 id="widgetTotal">0</h4><span>Total</span></div>
                    <div class="stat-mini"><h4 id="widgetOnline">0</h4><span>Online</span></div>
                    <div class="stat-mini"><h4 id="widgetPending">0</h4><span>Pending</span></div>
                </div>
            `;
            updateMiniStats();
            break;
        case 'token':
            container.innerHTML = `<div id="widgetTokenInfo" class="loading-placeholder">Loading token info...</div>`;
            // Запрашиваем токен сразу
            requestTokenInfo();
            break;
        case 'recent_commands':
            container.innerHTML = `<div id="widgetRecentCommands" class="recent-commands-list"></div>`;
            updateRecentCommandsWidget();
            break;
    }
}

function requestTokenInfo() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'get_token_info' }));
    }
}

function updateAllWidgets() {
    updateMiniStats();
    updateRecentCommandsWidget();
    // Update token widget from main token info
    const tokenInfoDiv = document.getElementById('tokenInfo');
    const widgetTokenInfo = document.getElementById('widgetTokenInfo');
    if (widgetTokenInfo && tokenInfoDiv) {
        widgetTokenInfo.innerHTML = tokenInfoDiv.innerHTML;
    }
}

function updateMiniStats() {
    const total = Object.keys(devices).length;
    const online = Object.values(devices).filter(d => d.status === 'online').length;
    const pending = Object.values(devices).filter(d => d.status === 'pending').length;
    
    const widgetTotal = document.getElementById('widgetTotal');
    if (widgetTotal) widgetTotal.textContent = total;
    const widgetOnline = document.getElementById('widgetOnline');
    if (widgetOnline) widgetOnline.textContent = online;
    const widgetPending = document.getElementById('widgetPending');
    if (widgetPending) widgetPending.textContent = pending;
}

function updateRecentCommandsWidget() {
    const container = document.getElementById('widgetRecentCommands');
    if (!container) return;
    
    if (commandHistory.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No commands</div>';
        return;
    }
    
    const recent = commandHistory.slice(0, 5);
    container.innerHTML = recent.map(cmd => `
        <div class="history-item" style="padding: 8px; font-size:0.75rem;">
            <span class="history-time">${new Date(cmd.timestamp).toLocaleTimeString()}</span>
            <span class="history-status ${cmd.status}">${cmd.status === 'pending' ? 'pending' : (cmd.status === 'success' ? 'success' : 'error')}</span>
            <span class="history-device" style="min-width: 100px;">${escapeHtml(cmd.deviceId)}</span>
            <span class="history-command">${escapeHtml(cmd.command)}</span>
        </div>
    `).join('');
}

function handleDragStart(e) {
    draggedWidget = e.target.closest('.dashboard-widget');
    e.dataTransfer.setData('text/plain', draggedWidget.dataset.widgetId);
    draggedWidget.classList.add('dragging');
}

function handleDragEnd(e) {
    if (draggedWidget) draggedWidget.classList.remove('dragging');
    draggedWidget = null;
}

function handleDragOver(e) {
    e.preventDefault();
}

async function handleDrop(e) {
    e.preventDefault();
    const targetWidget = e.target.closest('.dashboard-widget');
    if (!targetWidget || targetWidget === draggedWidget) return;
    
    const fromId = draggedWidget.dataset.widgetId;
    const toId = targetWidget.dataset.widgetId;
    
    const fromIndex = widgets.findIndex(w => w.id === fromId);
    const toIndex = widgets.findIndex(w => w.id === toId);
    
    if (fromIndex !== -1 && toIndex !== -1) {
        const temp = { ...widgets[fromIndex] };
        widgets[fromIndex] = { ...widgets[toIndex] };
        widgets[toIndex] = temp;
        
        await fetch('/api/widgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(widgets)
        });
        
        renderWidgets();
    }
}

// ==================== GROUPS SYSTEM ====================
let groups = {};
let groupsSidebarOpen = false;

async function loadGroups() {
    try {
        const response = await fetch('/api/groups');
        groups = await response.json();
        renderGroupsList();
    } catch (e) {
        console.error('Failed to load groups', e);
    }
}

function renderGroupsList() {
    const container = document.getElementById('groupsList');
    if (!container) return;
    
    if (Object.keys(groups).length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No groups created</div>';
        return;
    }
    
    container.innerHTML = Object.entries(groups).map(([id, group]) => `
        <div class="group-item" data-group-id="${id}">
            <div class="group-header" onclick="toggleGroup('${id}')">
                <span class="group-name">
                    <i class="fas fa-folder"></i>
                    ${escapeHtml(group.name)}
                    <span class="group-badge">${group.devices.length}</span>
                </span>
                <button class="delete-group" data-id="${id}" onclick="event.stopPropagation(); deleteGroup('${id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="group-devices">
                ${group.devices.map(deviceId => {
                    const device = devices[deviceId];
                    return `
                        <div class="group-device-item">
                            <span>${escapeHtml(deviceId)}</span>
                            <span class="status-badge ${device?.status || 'offline'}">${device?.status || 'unknown'}</span>
                            <button class="remove-from-group" data-group="${id}" data-device="${deviceId}">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                }).join('')}
                <div class="add-device-to-group">
                    <select class="add-device-select" data-group="${id}">
                        <option value="">-- Add device --</option>
                        ${Object.keys(devices).filter(d => !group.devices.includes(d)).map(d => 
                            `<option value="${d}">${escapeHtml(d)}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
        </div>
    `).join('');
    
    // Attach event listeners
    document.querySelectorAll('.remove-from-group').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const groupId = btn.dataset.group;
            const deviceId = btn.dataset.device;
            removeDeviceFromGroup(groupId, deviceId);
        });
    });
    
    document.querySelectorAll('.add-device-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const groupId = select.dataset.group;
            const deviceId = select.value;
            if (deviceId) {
                addDeviceToGroup(groupId, deviceId);
                select.value = '';
            }
        });
    });
}

function toggleGroup(groupId) {
    const groupEl = document.querySelector(`.group-item[data-group-id="${groupId}"]`);
    if (groupEl) groupEl.classList.toggle('expanded');
}

async function createGroup(name) {
    try {
        const response = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (response.ok) {
            await loadGroups();
            showToast(`Group "${name}" created`, 'success');
        }
    } catch (e) {
        showToast('Failed to create group', 'error');
    }
}

async function deleteGroup(groupId) {
    if (!confirm('Delete this group? Devices will not be affected.')) return;
    
    try {
        await fetch('/api/groups', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: groupId })
        });
        await loadGroups();
        showToast('Group deleted', 'success');
    } catch (e) {
        showToast('Failed to delete group', 'error');
    }
}

async function addDeviceToGroup(groupId, deviceId) {
    try {
        await fetch(`/api/groups/${groupId}/devices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId })
        });
        await loadGroups();
        showToast(`Device added to group`, 'success');
    } catch (e) {
        showToast('Failed to add device', 'error');
    }
}

async function removeDeviceFromGroup(groupId, deviceId) {
    try {
        await fetch(`/api/groups/${groupId}/devices`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId })
        });
        await loadGroups();
        showToast(`Device removed from group`, 'success');
    } catch (e) {
        showToast('Failed to remove device', 'error');
    }
}

// ==================== TAGS SYSTEM ====================
let tags = {};

async function loadTags() {
    try {
        const response = await fetch('/api/tags');
        tags = await response.json();
        renderDeviceTags();
    } catch (e) {
        console.error('Failed to load tags', e);
    }
}

function renderDeviceTags() {
    document.querySelectorAll('.device-card').forEach(card => {
        const deviceId = card.dataset.deviceId;
        const deviceTags = tags[deviceId] || [];
        
        let tagsContainer = card.querySelector('.device-tags');
        if (!tagsContainer) {
            tagsContainer = document.createElement('div');
            tagsContainer.className = 'device-tags';
            card.querySelector('.device-type')?.after(tagsContainer);
        }
        
        tagsContainer.innerHTML = `
            <div class="tags-container">
                ${deviceTags.map(tag => `
                    <span class="tag">
                        ${escapeHtml(tag)}
                        <button class="tag-remove" data-device="${deviceId}" data-tag="${tag}">&times;</button>
                    </span>
                `).join('')}
                <div class="add-tag-input">
                    <input type="text" placeholder="Add tag..." class="tag-input" data-device="${deviceId}">
                    <button class="add-tag-btn" data-device="${deviceId}">+</button>
                </div>
            </div>
        `;
    });
    
    // Attach tag event listeners
    document.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = btn.dataset.device;
            const tag = btn.dataset.tag;
            removeTag(deviceId, tag);
        });
    });
    
    document.querySelectorAll('.add-tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = btn.dataset.device;
            const input = btn.parentElement.querySelector('.tag-input');
            const tag = input.value.trim();
            if (tag) {
                addTag(deviceId, tag);
                input.value = '';
            }
        });
    });
    
    document.querySelectorAll('.tag-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                const deviceId = input.dataset.device;
                const tag = input.value.trim();
                if (tag) {
                    addTag(deviceId, tag);
                    input.value = '';
                }
            }
        });
    });
}

async function addTag(deviceId, tag) {
    const currentTags = tags[deviceId] || [];
    if (currentTags.includes(tag)) return;
    
    const newTags = [...currentTags, tag];
    try {
        await fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId, tags: newTags })
        });
        tags[deviceId] = newTags;
        renderDeviceTags();
        showToast(`Tag "${tag}" added`, 'success');
    } catch (e) {
        showToast('Failed to add tag', 'error');
    }
}

async function removeTag(deviceId, tag) {
    const currentTags = tags[deviceId] || [];
    const newTags = currentTags.filter(t => t !== tag);
    try {
        await fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId, tags: newTags })
        });
        tags[deviceId] = newTags;
        renderDeviceTags();
        showToast(`Tag "${tag}" removed`, 'success');
    } catch (e) {
        showToast('Failed to remove tag', 'error');
    }
}

// ==================== MASS SELECTION ====================
let selectedDevices = new Set();

function toggleDeviceSelection(deviceId, event) {
    if (event) event.stopPropagation();
    
    if (selectedDevices.has(deviceId)) {
        selectedDevices.delete(deviceId);
    } else {
        selectedDevices.add(deviceId);
    }
    
    updateMassSelectionUI();
}

function updateMassSelectionUI() {
    const massBar = document.getElementById('massSelectBar');
    const selectedCount = document.getElementById('selectedCount');
    
    if (selectedDevices.size > 0) {
        massBar.classList.add('active');
        selectedCount.textContent = selectedDevices.size;
    } else {
        massBar.classList.remove('active');
    }
    
    // Highlight selected cards
    document.querySelectorAll('.device-card').forEach(card => {
        const deviceId = card.dataset.deviceId;
        if (selectedDevices.has(deviceId)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

function clearSelection() {
    selectedDevices.clear();
    updateMassSelectionUI();
}

async function sendMassCommand() {
    if (selectedDevices.size === 0) return;
    
    document.getElementById('massDeviceCount').textContent = selectedDevices.size;
    document.getElementById('massCommandModal').style.display = 'block';
}

async function executeMassCommand() {
    const command = document.getElementById('massCommand').value.trim();
    let payload = {};
    try {
        payload = JSON.parse(document.getElementById('massPayload').value);
    } catch (e) {
        showToast('Invalid JSON payload', 'error');
        return;
    }
    
    if (!command) {
        showToast('Enter a command', 'error');
        return;
    }
    
    let successCount = 0;
    for (const deviceId of selectedDevices) {
        const device = devices[deviceId];
        if (device && device.status === 'online') {
            sendCommand(deviceId, command, payload);
            successCount++;
            await new Promise(r => setTimeout(r, 100)); // small delay
        }
    }
    
    showToast(`Command sent to ${successCount} devices`, 'success');
    document.getElementById('massCommandModal').style.display = 'none';
    clearSelection();
}

async function addSelectedToGroup() {
    if (selectedDevices.size === 0) return;
    
    const select = document.getElementById('groupSelect');
    select.innerHTML = '<option value="">-- Select Group --</option>' + 
        Object.entries(groups).map(([id, group]) => 
            `<option value="${id}">${escapeHtml(group.name)}</option>`
        ).join('');
    
    document.getElementById('groupDevicesList').textContent = `${selectedDevices.size} devices`;
    document.getElementById('addToGroupModal').style.display = 'block';
}

async function confirmAddToGroup() {
    const groupId = document.getElementById('groupSelect').value;
    if (!groupId) {
        showToast('Select a group', 'warning');
        return;
    }
    
    for (const deviceId of selectedDevices) {
        await addDeviceToGroup(groupId, deviceId);
    }
    
    showToast(`Added ${selectedDevices.size} devices to group`, 'success');
    document.getElementById('addToGroupModal').style.display = 'none';
    clearSelection();
}

async function massDisconnect() {
    if (selectedDevices.size === 0) return;
    
    if (confirm(`Disconnect ${selectedDevices.size} devices?`)) {
        for (const deviceId of selectedDevices) {
            disconnectDevice(deviceId);
            await new Promise(r => setTimeout(r, 100));
        }
        showToast(`Disconnected ${selectedDevices.size} devices`, 'warning');
        clearSelection();
    }
}

// ==================== UPTIME REPORTS ====================
let currentUptimeDevice = null;
let uptimeChart = null;

async function showUptimeReport(deviceId) {
    currentUptimeDevice = deviceId;
    document.getElementById('uptimeModal').style.display = 'block';
    await loadUptimeData(7);
}

async function loadUptimeData(days) {
    if (!currentUptimeDevice) return;
    
    try {
        const response = await fetch(`/api/uptime/${currentUptimeDevice}?days=${days}`);
        const stats = await response.json();
        
        document.getElementById('uptimePercent').textContent = `${stats.online_percent}%`;
        document.getElementById('onlineHours').textContent = `${stats.total_online}h`;
        document.getElementById('offlineHours').textContent = `${stats.total_offline}h`;
        
        // Update chart (simplified - would need real historical data from API)
        if (uptimeChart) uptimeChart.destroy();
        const ctx = document.getElementById('uptimeChart').getContext('2d');
        uptimeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Online', 'Offline'],
                datasets: [{
                    data: [stats.online_percent, 100 - stats.online_percent],
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    } catch (e) {
        console.error('Failed to load uptime data', e);
    }
}

// ==================== ADD TO DEVICE CARD ====================
// Add selection checkbox to device card
function addCheckboxToCard(card, deviceId) {
    const existingCheckbox = card.querySelector('.device-checkbox');
    if (existingCheckbox) return;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'device-checkbox';
    checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDeviceSelection(deviceId, e);
    });
    card.insertBefore(checkbox, card.firstChild);
}

// Add uptime button
function addUptimeButton(card, deviceId) {
    const actionsDiv = card.querySelector('.card-actions');
    if (!actionsDiv || actionsDiv.querySelector('.uptime-btn')) return;
    
    const uptimeBtn = document.createElement('button');
    uptimeBtn.className = 'btn-secondary';
    uptimeBtn.innerHTML = '<i class="fas fa-chart-line"></i> Uptime';
    uptimeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showUptimeReport(deviceId);
    });
    actionsDiv.appendChild(uptimeBtn);
}


// Add sidebar toggle for groups
document.getElementById('groupsSidebarBtn')?.addEventListener('click', () => {
    groupsSidebarOpen = !groupsSidebarOpen;
    document.getElementById('groupsSidebar').classList.toggle('open');
});

// Add mass selection event listeners
document.getElementById('massCommandBtn')?.addEventListener('click', sendMassCommand);
document.getElementById('massGroupBtn')?.addEventListener('click', addSelectedToGroup);
document.getElementById('massDisconnectBtn')?.addEventListener('click', massDisconnect);
document.getElementById('massClearBtn')?.addEventListener('click', clearSelection);
document.getElementById('massCommandSendBtn')?.addEventListener('click', executeMassCommand);
document.getElementById('confirmAddToGroupBtn')?.addEventListener('click', confirmAddToGroup);
document.getElementById('createGroupBtn')?.addEventListener('click', () => {
    document.getElementById('createGroupModal').style.display = 'block';
});
document.getElementById('createGroupConfirmBtn')?.addEventListener('click', () => {
    const name = document.getElementById('newGroupName').value.trim();
    if (name) {
        createGroup(name);
        document.getElementById('createGroupModal').style.display = 'none';
        document.getElementById('newGroupName').value = '';
    }
});
document.getElementById('resetWidgetsBtn')?.addEventListener('click', resetWidgets);

// Uptime period buttons
document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadUptimeData(parseInt(btn.dataset.days));
    });
});

// ==================== BROADCAST ====================
async function sendBroadcastCommand() {
    const command = document.getElementById('broadcastCommand').value.trim();
    let payload = {};
    try {
        payload = JSON.parse(document.getElementById('broadcastPayload').value);
    } catch (e) {
        showToast('Invalid JSON payload', 'error');
        return;
    }
    
    if (!command) {
        showToast('Enter a command', 'error');
        return;
    }
    
    if (confirm(`Send "${command}" to ALL online devices?`)) {
        ws.send(JSON.stringify({
            type: 'broadcast_command',
            command: command,
            payload: payload
        }));
        showToast(`Broadcasting "${command}" to all devices...`, 'info');
        document.getElementById('broadcastModal').style.display = 'none';
        document.getElementById('broadcastCommand').value = '';
        document.getElementById('broadcastPayload').value = '{}';
    }
}

// ==================== SYSTEM METRICS ====================
async function loadSystemMetrics() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'get_system_metrics' }));
    }
}

function updateSystemMetrics(metrics) {
    const cpu = Math.round(metrics.cpu_percent);
    const ram = Math.round(metrics.memory_percent);
    const disk = Math.round(metrics.disk_percent);
    const network = metrics.network_rx_mbps + metrics.network_tx_mbps;
    
    document.getElementById('cpuValue').textContent = `${cpu}%`;
    document.getElementById('ramValue').textContent = `${ram}%`;
    document.getElementById('diskValue').textContent = `${disk}%`;
    document.getElementById('networkValue').textContent = `${network.toFixed(1)} Mbps`;
    
    document.getElementById('cpuBar').style.width = `${cpu}%`;
    document.getElementById('ramBar').style.width = `${ram}%`;
    document.getElementById('diskBar').style.width = `${disk}%`;
    
    // Color coding
    const cpuBar = document.getElementById('cpuBar');
    if (cpu > 80) cpuBar.style.background = 'var(--danger)';
    else if (cpu > 60) cpuBar.style.background = 'var(--warning)';
    else cpuBar.style.background = 'var(--success)';
}

// ==================== BLACKLIST ====================
async function loadBlacklist() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'get_blacklist' }));
    }
}

function updateBlacklist(devices) {
    const container = document.getElementById('blacklistContainer');
    if (!container) return;
    
    if (devices.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No blacklisted devices</div>';
        return;
    }
    
    container.innerHTML = devices.map(deviceId => `
        <div class="blacklist-item">
            <code>${escapeHtml(deviceId)}</code>
            <button class="remove-from-blacklist btn-danger small" data-device="${deviceId}">
                <i class="fas fa-trash"></i> Remove
            </button>
        </div>
    `).join('');
    
    document.querySelectorAll('.remove-from-blacklist').forEach(btn => {
        btn.addEventListener('click', () => {
            const deviceId = btn.dataset.device;
            ws.send(JSON.stringify({ type: 'blacklist_remove', device_id: deviceId }));
        });
    });
}

async function addToBlacklist() {
    const deviceId = document.getElementById('blacklistDeviceId').value.trim();
    if (!deviceId) {
        showToast('Enter device ID', 'warning');
        return;
    }
    
    ws.send(JSON.stringify({ type: 'blacklist_add', device_id: deviceId }));
    document.getElementById('blacklistDeviceId').value = '';
    showToast(`Device ${deviceId} added to blacklist`, 'warning');
}

// ==================== AUDIT LOG ====================
let auditLogData = []; // Храним все логи
let auditCurrentPage = 1;
let auditItemsPerPage = 25;

async function loadAuditLog(resetPage = true) {
    if (resetPage) {
        auditCurrentPage = 1;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'get_audit_log', limit: 500 })); // Запрашиваем больше логов
    }
}

function updateAuditLog(logs) {
    const container = document.getElementById('auditContainer');
    const filter = document.getElementById('auditEventFilter')?.value || 'all';
    const search = document.getElementById('auditSearch')?.value.toLowerCase() || '';
    
    if (!container) return;
    
    // Сохраняем все логи
    auditLogData = logs;
    
    let filteredLogs = logs;
    if (filter !== 'all') {
        filteredLogs = filteredLogs.filter(log => log.event_type === filter);
    }
    if (search) {
        filteredLogs = filteredLogs.filter(log => 
            (log.device_id && log.device_id.toLowerCase().includes(search)) ||
            (log.details && log.details.toLowerCase().includes(search))
        );
    }
    
    if (filteredLogs.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No audit logs</div>';
        return;
    }
    
    // Пагинация
    const totalPages = Math.ceil(filteredLogs.length / auditItemsPerPage);
    const start = (auditCurrentPage - 1) * auditItemsPerPage;
    const end = start + auditItemsPerPage;
    const pageLogs = filteredLogs.slice(start, end);
    
    // Отображаем логи
    let html = pageLogs.map(log => `
        <div class="audit-item">
            <span class="audit-time">${new Date(log.timestamp * 1000).toLocaleString()}</span>
            <span class="audit-event ${log.event_type}">${log.event_type}</span>
            <span class="audit-device">${log.device_id ? escapeHtml(log.device_id) : '-'}</span>
            <span class="audit-details">${escapeHtml(log.details || '-')}</span>
            ${log.ip_address ? `<span class="audit-ip">${escapeHtml(log.ip_address)}</span>` : ''}
        </div>
    `).join('');
    
    // Добавляем пагинацию
    if (totalPages > 1) {
        html += `
            <div class="audit-pagination">
                <button class="pagination-btn" onclick="changeAuditPage(-1)" ${auditCurrentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Previous
                </button>
                <span class="pagination-info">Page ${auditCurrentPage} of ${totalPages} (${filteredLogs.length} items)</span>
                <button class="pagination-btn" onclick="changeAuditPage(1)" ${auditCurrentPage === totalPages ? 'disabled' : ''}>
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function changeAuditPage(direction) {
    auditCurrentPage += direction;
    // Не обновляем фильтры, просто перерисовываем с текущими данными
    const filter = document.getElementById('auditEventFilter')?.value || 'all';
    const search = document.getElementById('auditSearch')?.value.toLowerCase() || '';
    
    let filteredLogs = auditLogData;
    if (filter !== 'all') {
        filteredLogs = filteredLogs.filter(log => log.event_type === filter);
    }
    if (search) {
        filteredLogs = filteredLogs.filter(log => 
            (log.device_id && log.device_id.toLowerCase().includes(search)) ||
            (log.details && log.details.toLowerCase().includes(search))
        );
    }
    
    const totalPages = Math.ceil(filteredLogs.length / auditItemsPerPage);
    if (auditCurrentPage < 1) auditCurrentPage = 1;
    if (auditCurrentPage > totalPages) auditCurrentPage = totalPages;
    
    updateAuditLog(auditLogData);
}


// ==================== COMMAND STATS ====================
let commandsChart = null;
let currentStatPeriod = 'day';

async function loadCommandStats(period = 'day') {
    // Stats from localStorage commandHistory
    const now = Date.now();
    let cutoff;
    if (period === 'day') cutoff = now - 24 * 3600 * 1000;
    else if (period === 'week') cutoff = now - 7 * 24 * 3600 * 1000;
    else cutoff = now - 30 * 24 * 3600 * 1000;
    
    const filtered = commandHistory.filter(cmd => cmd.timestamp > cutoff);
    const total = filtered.length;
    const success = filtered.filter(cmd => cmd.status === 'success').length;
    const successRate = total > 0 ? Math.round(success / total * 100) : 0;
    
    // Average response time (mock - would need from server)
    const avgResponse = Math.round(Math.random() * 200 + 50);
    
    document.getElementById('totalCommands').textContent = total;
    document.getElementById('successRate').textContent = `${successRate}%`;
    document.getElementById('avgResponse').textContent = `${avgResponse}ms`;
    
    // Group by hour/day
    const grouped = {};
    filtered.forEach(cmd => {
        const date = new Date(cmd.timestamp);
        let key;
        if (period === 'day') key = `${date.getHours()}:00`;
        else key = date.toLocaleDateString();
        grouped[key] = (grouped[key] || 0) + 1;
    });
    
    const labels = Object.keys(grouped).slice(-24);
    const data = labels.map(l => grouped[l]);
    
    if (commandsChart) commandsChart.destroy();
    const ctx = document.getElementById('commandsChart')?.getContext('2d');
    if (ctx) {
        commandsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Commands',
                    data: data,
                    borderColor: 'var(--accent-primary)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true, grid: { color: 'var(--border-color)' } } }
            }
        });
    }
}


// ==================== INIT ADMIN LISTENERS ====================
function initAdminListeners() {
    // Broadcast button in header
    const broadcastHeaderBtn = document.createElement('button');
    broadcastHeaderBtn.className = 'btn-secondary broadcast-btn';
    broadcastHeaderBtn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Broadcast';
    broadcastHeaderBtn.title = 'Send command to all devices';
    broadcastHeaderBtn.addEventListener('click', () => {
        document.getElementById('broadcastModal').style.display = 'block';
    });
    document.querySelector('.header-actions')?.prepend(broadcastHeaderBtn);
    
    document.getElementById('sendBroadcastBtn')?.addEventListener('click', sendBroadcastCommand);
    document.getElementById('refreshMetricsBtn')?.addEventListener('click', loadSystemMetrics);
    document.getElementById('refreshBlacklistBtn')?.addEventListener('click', loadBlacklist);
    document.getElementById('refreshAuditBtn')?.addEventListener('click', loadAuditLog);
    document.getElementById('addToBlacklistBtn')?.addEventListener('click', addToBlacklist);
    document.getElementById('auditEventFilter')?.addEventListener('change', () => {
        auditCurrentPage = 1;
        loadAuditLog();
    });
    document.getElementById('auditSearch')?.addEventListener('input', () => {
        auditCurrentPage = 1;
        loadAuditLog();
    });
    
    document.querySelectorAll('.stats-period .period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stats-period .period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStatPeriod = btn.dataset.period;
            loadCommandStats(currentStatPeriod);
        });
    });

    const auditPerPage = document.getElementById('auditPerPage');
    if (auditPerPage) {
        auditPerPage.addEventListener('change', (e) => {
            auditItemsPerPage = parseInt(e.target.value);
            auditCurrentPage = 1;
            updateAuditLog(auditLogData);
        });
    }
}

// ==================== НОВЫЕ ФУНКЦИИ ДЛЯ РАСШИРЕННОГО СТАТУСА ====================

function updateExtendedStatus(deviceId, substatus, details) {
    if (!extendedStatuses[deviceId]) {
        extendedStatuses[deviceId] = {};
    }
    extendedStatuses[deviceId] = {
        substatus: substatus,
        details: details,
        lastUpdate: Date.now()
    };
    
    // Обновляем отображение устройства
    const card = document.querySelector(`.device-card[data-device-id="${deviceId}"]`);
    if (card) {
        updateDeviceStatusDisplay(card, deviceId);
    }
}

function getSubstatusIcon(substatus) {
    const icons = {
        'idle': 'fa-bed',
        'working': 'fa-cogs',
        'sleeping': 'fa-moon',
        'charging': 'fa-battery-full',
        'error': 'fa-exclamation-triangle',
        'updating': 'fa-sync-alt',
        'maintenance': 'fa-wrench'
    };
    return icons[substatus] || 'fa-info-circle';
}

function getSubstatusColor(substatus) {
    const colors = {
        'idle': 'var(--text-muted)',
        'working': 'var(--success)',
        'sleeping': 'var(--info)',
        'charging': 'var(--success)',
        'error': 'var(--danger)',
        'updating': 'var(--warning)'
    };
    return colors[substatus] || 'var(--text-secondary)';
}

// ==================== НОВЫЕ ФУНКЦИИ ДЛЯ МЕТРИК ====================

function updateDeviceMetrics(deviceId, metrics, timestamp) {
    // Сохраняем метрики в глобальном объекте devices
    if (devices[deviceId]) {
        devices[deviceId].last_metrics = metrics;
        devices[deviceId].last_metrics_time = timestamp;
        
        // Обновляем карточку устройства
        const card = document.querySelector(`.device-card[data-device-id="${deviceId}"]`);
        if (card) {
            // Обновляем отображение метрик
            let metricsDiv = card.querySelector('.device-metrics');
            if (!metricsDiv) {
                const deviceTypeDiv = card.querySelector('.device-type');
                metricsDiv = document.createElement('div');
                metricsDiv.className = 'device-metrics';
                deviceTypeDiv.after(metricsDiv);
            }
            
            let metricsHtml = '<div class="metrics-row">';
            if (metrics.cpu !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-microchip"></i> CPU: ${metrics.cpu}%</span>`;
            if (metrics.memory_percent !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-memory"></i> RAM: ${metrics.memory_percent}%</span>`;
            if (metrics.disk_percent !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-hdd"></i> Disk: ${metrics.disk_percent}%</span>`;
            if (metrics.temperature !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-thermometer-half"></i> ${metrics.temperature}°C</span>`;
            if (metrics.humidity !== undefined) metricsHtml += `<span class="metric-badge"><i class="fas fa-tint"></i> ${metrics.humidity}%</span>`;
            metricsHtml += '</div>';
            
            metricsDiv.innerHTML = metricsHtml || '<span class="metric-badge">No metrics yet</span>';
        }
    }
}

function updateMetricsDisplay(card, deviceId, metrics) {
    let metricsDiv = card.querySelector('.device-metrics');
    if (!metricsDiv) {
        metricsDiv = document.createElement('div');
        metricsDiv.className = 'device-metrics';
        card.querySelector('.device-type').after(metricsDiv);
    }
    
    let html = '<div class="metrics-row">';
    
    // CPU
    if (metrics.cpu !== undefined) {
        html += `<span class="metric-badge"><i class="fas fa-microchip"></i> ${metrics.cpu}%</span>`;
    }
    
    // Температура
    if (metrics.temperature !== undefined) {
        html += `<span class="metric-badge"><i class="fas fa-thermometer-half"></i> ${metrics.temperature}°C</span>`;
    }
    
    // Влажность
    if (metrics.humidity !== undefined) {
        html += `<span class="metric-badge"><i class="fas fa-tint"></i> ${metrics.humidity}%</span>`;
    }
    
    // Батарея
    if (metrics.battery !== undefined) {
        const batteryColor = metrics.battery < 20 ? 'danger' : (metrics.battery < 50 ? 'warning' : 'success');
        html += `<span class="metric-badge ${batteryColor}"><i class="fas fa-battery-${metrics.battery > 75 ? 'full' : (metrics.battery > 50 ? 'half' : 'quarter')}"></i> ${metrics.battery}%</span>`;
    }
    
    // Уровень воды (для увлажнителя)
    if (metrics.water_level !== undefined) {
        html += `<span class="metric-badge"><i class="fas fa-water"></i> ${metrics.water_level}%</span>`;
    }
    
    // Память
    if (metrics.memory_percent !== undefined) {
        html += `<span class="metric-badge"><i class="fas fa-memory"></i> ${metrics.memory_percent}%</span>`;
    }
    
    html += '</div>';
    metricsDiv.innerHTML = html;
}

// ==================== ФУНКЦИИ ДЛЯ СВЯЗИ УСТРОЙСТВО->УСТРОЙСТВО ====================

function sendDeviceToDevice(fromDeviceId, toDeviceId, command, payload, requireResponse = false) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast('Not connected to Core', 'error');
        return;
    }
    
    const msgId = generateUUID();
    const msg = {
        type: 'device_to_device',
        from_device_id: fromDeviceId,
        to_device_id: toDeviceId,
        command: command,
        payload: payload,
        require_response: requireResponse,
        id: msgId
    };
    
    ws.send(JSON.stringify(msg));
    addLogEntry('device_to_device', `${fromDeviceId} → ${toDeviceId}: ${command}`);
    showToast(`Command sent to ${toDeviceId}`, 'info');
    
    return msgId;
}

function showDeviceToDeviceModal(deviceId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'd2dModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i class="fas fa-exchange-alt"></i> Send to Device</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>From Device</label>
                    <input type="text" id="d2dFromDevice" readonly value="${deviceId}">
                </div>
                <div class="form-group">
                    <label>Target Device</label>
                    <select id="d2dTargetDevice" class="form-control">
                        ${Object.entries(devices)
                            .filter(([id, d]) => id !== deviceId && d.status === 'online')
                            .map(([id, d]) => `<option value="${id}">${id} (${d.type})</option>`)
                            .join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Command</label>
                    <input type="text" id="d2dCommand" placeholder="e.g., get_status, reboot">
                </div>
                <div class="form-group">
                    <label>Payload (JSON)</label>
                    <textarea id="d2dPayload" rows="3" placeholder="{}"></textarea>
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="d2dRequireResponse">
                        <span>Require response</span>
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button id="sendD2DBtn" class="btn-primary">Send</button>
                <button class="btn-secondary modal-cancel">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    modal.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
    
    document.getElementById('sendD2DBtn').addEventListener('click', () => {
        const targetDevice = document.getElementById('d2dTargetDevice').value;
        const command = document.getElementById('d2dCommand').value.trim();
        let payload = {};
        try {
            payload = JSON.parse(document.getElementById('d2dPayload').value);
        } catch (e) {
            showToast('Invalid JSON payload', 'error');
            return;
        }
        const requireResponse = document.getElementById('d2dRequireResponse').checked;
        
        if (!targetDevice || !command) {
            showToast('Target device and command are required', 'warning');
            return;
        }
        
        sendDeviceToDevice(deviceId, targetDevice, command, payload, requireResponse);
        modal.remove();
    });
}

// ==================== МОДАЛЬНОЕ ОКНО МЕТРИК ====================

function showMetricsModal(deviceId) {
    const modal = document.createElement('div');
    modal.className = 'modal metrics-modal';
    modal.id = 'metricsModal';
    modal.dataset.deviceId = deviceId;
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3><i class="fas fa-chart-line"></i> Metrics: ${deviceId}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="metrics-period-selector">
                    <button class="period-btn active" data-hours="1">Last Hour</button>
                    <button class="period-btn" data-hours="6">6 Hours</button>
                    <button class="period-btn" data-hours="24">24 Hours</button>
                </div>
                <div class="metrics-selector">
                    <label class="checkbox-label">
                        <input type="checkbox" class="metric-toggle" data-metric="cpu"> CPU
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" class="metric-toggle" data-metric="temperature"> Temperature
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" class="metric-toggle" data-metric="humidity"> Humidity
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" class="metric-toggle" data-metric="battery"> Battery
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" class="metric-toggle" data-metric="memory_percent"> Memory
                    </label>
                </div>
                <div class="metrics-chart-container">
                    <canvas id="metricsChart"></canvas>
                </div>
                <div class="current-metrics" id="currentMetrics"></div>
            </div>
            <div class="modal-footer">
                <button id="refreshMetricsBtn" class="btn-secondary">
                    <i class="fas fa-sync-alt"></i> Request Fresh Metrics
                </button>
                <button class="btn-secondary modal-cancel">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    modal.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            if (metricsCharts[deviceId]) {
                metricsCharts[deviceId].destroy();
                delete metricsCharts[deviceId];
            }
            modal.remove();
        });
    });
    
    // Загружаем метрики
    loadMetricsHistory(deviceId, 1);
    
    // Периоды
    modal.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const hours = parseInt(btn.dataset.hours);
            loadMetricsHistory(deviceId, hours);
        });
    });
    
    // Toggle метрик
    modal.querySelectorAll('.metric-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
            loadMetricsHistory(deviceId, parseInt(modal.querySelector('.period-btn.active').dataset.hours));
        });
    });
    
    // Запрос свежих метрик
    document.getElementById('refreshMetricsBtn').addEventListener('click', () => {
        requestDeviceMetrics(deviceId);
        setTimeout(() => {
            loadMetricsHistory(deviceId, parseInt(modal.querySelector('.period-btn.active').dataset.hours));
        }, 2000);
    });
}

function loadMetricsHistory(deviceId, hours) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const activeMetrics = Array.from(document.querySelectorAll('.metric-toggle:checked'))
        .map(cb => cb.dataset.metric);
    
    ws.send(JSON.stringify({
        type: 'get_device_metrics',
        device_id: deviceId,
        hours: hours,
        metrics: activeMetrics
    }));
    
    // Временный обработчик
    const handler = (data) => {
        if (data.type === 'device_metrics' && data.device_id === deviceId) {
            updateMetricsChart(deviceId, data.metrics);
            ws.removeEventListener('message', handler);
        }
    };
    ws.addEventListener('message', handler);
    
    // Таймаут
    setTimeout(() => ws.removeEventListener('message', handler), 5000);
}

function updateMetricsChart(deviceId, metricsData) {
    const chartCanvas = document.getElementById('metricsChart');
    if (!chartCanvas) return;
    
    if (metricsCharts[deviceId]) {
        metricsCharts[deviceId].destroy();
    }
    
    const activeMetrics = Array.from(document.querySelectorAll('.metric-toggle:checked'))
        .map(cb => cb.dataset.metric);
    
    if (activeMetrics.length === 0 || !metricsData || metricsData.length === 0) {
        chartCanvas.getContext('2d').clearRect(0, 0, chartCanvas.width, chartCanvas.height);
        return;
    }
    
    const timestamps = metricsData.map(m => new Date(m.timestamp * 1000).toLocaleTimeString());
    const datasets = [];
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    
    activeMetrics.forEach((metric, idx) => {
        const values = metricsData.map(m => m.metrics[metric]);
        if (values.some(v => v !== undefined)) {
            datasets.push({
                label: metric.replace('_', ' ').toUpperCase(),
                data: values,
                borderColor: colors[idx % colors.length],
                backgroundColor: 'transparent',
                tension: 0.4,
                fill: false
            });
        }
    });
    
    const ctx = chartCanvas.getContext('2d');
    metricsCharts[deviceId] = new Chart(ctx, {
        type: 'line',
        data: { labels: timestamps, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: { y: { beginAtZero: true } }
        }
    });
    
    // Показываем последние метрики
    const lastMetrics = metricsData[metricsData.length - 1];
    if (lastMetrics) {
        const container = document.getElementById('currentMetrics');
        if (container) {
            container.innerHTML = `
                <div class="current-metrics-header">Latest Metrics (${new Date(lastMetrics.timestamp * 1000).toLocaleString()}):</div>
                <div class="current-metrics-values">
                    ${Object.entries(lastMetrics.metrics).map(([k, v]) => 
                        `<span class="metric-value-badge">${k}: ${typeof v === 'number' ? v.toFixed(1) : v}</span>`
                    ).join('')}
                </div>
            `;
        }
    }
}

function requestDeviceMetrics(deviceId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'request_device_metrics',
        device_id: deviceId,
        metric_types: null
    }));
    showToast(`Metrics requested from ${deviceId}`, 'info');
}

// ==================== ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ КАРТОЧКИ УСТРОЙСТВА ====================

function updateDeviceStatusDisplay(card, deviceId) {
    const device = devices[deviceId];
    const extended = extendedStatuses[deviceId];
    
    let statusHtml = `<span class="status-badge ${device?.status || 'offline'}">${device?.status || 'offline'}</span>`;
    
    if (extended && extended.substatus) {
        statusHtml += `<span class="substatus-badge" style="background: ${getSubstatusColor(extended.substatus)}20; color: ${getSubstatusColor(extended.substatus)}">
            <i class="fas ${getSubstatusIcon(extended.substatus)}"></i> ${extended.substatus}
        </span>`;
    }
    
    const header = card.querySelector('.card-header');
    if (header) {
        let statusDiv = header.querySelector('.device-status-container');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.className = 'device-status-container';
            header.appendChild(statusDiv);
        }
        statusDiv.innerHTML = statusHtml;
    }
}

// ==================== ДОБАВЛЕНИЕ КНОПОК В КАРТОЧКИ УСТРОЙСТВ ====================

function addDeviceActionButtons(card, deviceId) {
    const actionsDiv = card.querySelector('.card-actions');
    if (!actionsDiv) return;
    
    // Кнопка отправки другому устройству
    if (!actionsDiv.querySelector('.d2d-btn')) {
        const d2dBtn = document.createElement('button');
        d2dBtn.className = 'btn-secondary d2d-btn';
        d2dBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Send to Device';
        d2dBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDeviceToDeviceModal(deviceId);
        });
        actionsDiv.appendChild(d2dBtn);
    }
    
    // Кнопка метрик
    if (!actionsDiv.querySelector('.metrics-btn')) {
        const metricsBtn = document.createElement('button');
        metricsBtn.className = 'btn-secondary metrics-btn';
        metricsBtn.innerHTML = '<i class="fas fa-chart-line"></i> Metrics';
        metricsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showMetricsModal(deviceId);
        });
        actionsDiv.appendChild(metricsBtn);
    }
}