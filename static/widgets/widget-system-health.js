// widget-system-health.js - System Health Widget

if (typeof widgetManager !== 'undefined') {
    widgetManager.register('system_health', {
        name: 'System Health',
        icon: 'fa-heartbeat',
        description: 'Shows CPU, RAM and Disk usage of Core server',
        defaultWidth: 2,
        defaultHeight: 2,
        
        updater: (widgetId) => {
            const container = document.getElementById(`widget-${widgetId}`);
            if (!container) return;
            
            container.innerHTML = `
                <div class="system-health-widget">
                    <div class="health-metric">
                        <div class="health-label"><i class="fas fa-microchip"></i> CPU</div>
                        <div class="health-value" id="health-cpu-${widgetId}">--%</div>
                        <div class="health-bar"><div class="health-progress" id="health-cpu-bar-${widgetId}" style="width: 0%"></div></div>
                    </div>
                    <div class="health-metric">
                        <div class="health-label"><i class="fas fa-memory"></i> RAM</div>
                        <div class="health-value" id="health-ram-${widgetId}">--%</div>
                        <div class="health-bar"><div class="health-progress" id="health-ram-bar-${widgetId}" style="width: 0%"></div></div>
                    </div>
                    <div class="health-metric">
                        <div class="health-label"><i class="fas fa-hdd"></i> Disk</div>
                        <div class="health-value" id="health-disk-${widgetId}">--%</div>
                        <div class="health-bar"><div class="health-progress" id="health-disk-bar-${widgetId}" style="width: 0%"></div></div>
                    </div>
                </div>
            `;
            
            loadSystemHealthForWidget(widgetId);
        },
        
        onInit: (widgetId) => {
            if (!window.systemHealthWidgets) window.systemHealthWidgets = [];
            if (!window.systemHealthWidgets.includes(widgetId)) {
                window.systemHealthWidgets.push(widgetId);
            }
        },
        
        onRemove: (widgetId) => {
            if (window.systemHealthWidgets) {
                window.systemHealthWidgets = window.systemHealthWidgets.filter(id => id !== widgetId);
            }
        }
    });
}

// Загрузка данных для виджета
async function loadSystemHealthForWidget(widgetId) {
    try {
        const response = await fetch('/api/system/metrics');
        const data = await response.json();
        
        if (data.error) return;
        
        const cpu = Math.round(data.cpu_percent);
        const ram = Math.round(data.memory_percent);
        const disk = Math.round(data.disk_percent);
        
        const cpuEl = document.getElementById(`health-cpu-${widgetId}`);
        const ramEl = document.getElementById(`health-ram-${widgetId}`);
        const diskEl = document.getElementById(`health-disk-${widgetId}`);
        const cpuBar = document.getElementById(`health-cpu-bar-${widgetId}`);
        const ramBar = document.getElementById(`health-ram-bar-${widgetId}`);
        const diskBar = document.getElementById(`health-disk-bar-${widgetId}`);
        
        if (cpuEl) cpuEl.textContent = `${cpu}%`;
        if (ramEl) ramEl.textContent = `${ram}%`;
        if (diskEl) diskEl.textContent = `${disk}%`;
        if (cpuBar) cpuBar.style.width = `${cpu}%`;
        if (ramBar) ramBar.style.width = `${ram}%`;
        if (diskBar) diskBar.style.width = `${disk}%`;
        
        const setBarColor = (bar, value) => {
            if (bar) {
                if (value > 80) bar.style.background = 'var(--danger)';
                else if (value > 60) bar.style.background = 'var(--warning)';
                else bar.style.background = 'var(--success)';
            }
        };
        
        setBarColor(cpuBar, cpu);
        setBarColor(ramBar, ram);
        setBarColor(diskBar, disk);
        
    } catch (e) {
        console.error('Failed to load system health:', e);
    }
}

window.updateAllSystemHealthWidgets = function() {
    if (window.systemHealthWidgets) {
        window.systemHealthWidgets.forEach(id => loadSystemHealthForWidget(id));
    }
};