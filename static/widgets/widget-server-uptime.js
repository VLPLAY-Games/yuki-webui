// widget-server-uptime.js - Server Uptime Widget

if (typeof widgetManager !== 'undefined') {
    widgetManager.register('server_uptime', {
        name: 'Server Uptime',
        icon: 'fa-server',
        description: 'Shows system uptime and start time',
        defaultWidth: 2,
        defaultHeight: 1,
        
        updater: (widgetId) => {
            const container = document.getElementById(`widget-${widgetId}`);
            if (!container) return;
            
            container.innerHTML = `
                <div class="server-uptime-widget">
                    <div class="uptime-icon"><i class="fas fa-server"></i></div>
                    <div class="uptime-info">
                        <div class="uptime-label">System Uptime</div>
                        <div class="uptime-value" id="server-uptime-value-${widgetId}">--d --h --m</div>
                    </div>
                    <div class="uptime-detail">
                        <div class="uptime-stat"><span>Started:</span> <span id="server-start-time-${widgetId}">--</span></div>
                    </div>
                </div>
            `;
            
            loadServerUptimeForWidget(widgetId);
        },
        
        onInit: (widgetId) => {
            if (!window.uptimeWidgets) window.uptimeWidgets = [];
            if (!window.uptimeWidgets.includes(widgetId)) {
                window.uptimeWidgets.push(widgetId);
            }
            
            if (!window.uptimeWidgetsInterval) {
                window.uptimeWidgetsInterval = setInterval(() => {
                    if (window.uptimeWidgets) {
                        window.uptimeWidgets.forEach(id => loadServerUptimeForWidget(id));
                    }
                }, 60000);
            }
        },
        
        onRemove: (widgetId) => {
            if (window.uptimeWidgets) {
                window.uptimeWidgets = window.uptimeWidgets.filter(id => id !== widgetId);
            }
            if (window.uptimeWidgets && window.uptimeWidgets.length === 0 && window.uptimeWidgetsInterval) {
                clearInterval(window.uptimeWidgetsInterval);
                window.uptimeWidgetsInterval = null;
            }
        }
    });
}

async function loadServerUptimeForWidget(widgetId) {
    try {
        const response = await fetch('/api/system/metrics');
        const data = await response.json();
        
        if (data.error) {
            const uptimeEl = document.getElementById(`server-uptime-value-${widgetId}`);
            if (uptimeEl) uptimeEl.textContent = 'N/A';
            return;
        }
        
        const uptimeSeconds = data.uptime;
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        
        const uptimeEl = document.getElementById(`server-uptime-value-${widgetId}`);
        if (uptimeEl) {
            if (days > 0) uptimeEl.textContent = `${days}d ${hours}h ${minutes}m`;
            else if (hours > 0) uptimeEl.textContent = `${hours}h ${minutes}m`;
            else uptimeEl.textContent = `${minutes}m`;
        }
        
        const startTime = new Date(Date.now() - uptimeSeconds * 1000);
        const startTimeEl = document.getElementById(`server-start-time-${widgetId}`);
        if (startTimeEl) startTimeEl.textContent = startTime.toLocaleString();
        
    } catch (e) {
        console.error('Failed to load server uptime:', e);
    }
}