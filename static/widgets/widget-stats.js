// widget-stats.js - Statistics Widget

if (typeof widgetManager !== 'undefined') {
    widgetManager.register('stats', {
        name: 'Statistics',
        icon: 'fa-chart-pie',
        description: 'Shows total, online, pending and offline device counts',
        defaultWidth: 2,
        defaultHeight: 1,
        
        updater: (widgetId) => {
            const container = document.getElementById(`widget-${widgetId}`);
            if (!container) return;
            
            const total = Object.keys(window.devices || {}).length;
            const online = Object.values(window.devices || {}).filter(d => d.status === 'online').length;
            const pending = Object.values(window.devices || {}).filter(d => d.status === 'pending').length;
            const offline = Object.values(window.devices || {}).filter(d => d.status === 'offline').length;
            
            container.innerHTML = `
                <div class="stats-mini">
                    <div class="stat-mini"><h4>${total}</h4><span>Total</span></div>
                    <div class="stat-mini"><h4>${online}</h4><span>Online</span></div>
                    <div class="stat-mini"><h4>${pending}</h4><span>Pending</span></div>
                    <div class="stat-mini"><h4>${offline}</h4><span>Offline</span></div>
                </div>
            `;
        }
    });
}