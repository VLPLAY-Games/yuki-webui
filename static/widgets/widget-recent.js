// widget-recent.js - Recent Commands Widget

if (typeof widgetManager !== 'undefined') {
    widgetManager.register('recent_commands', {
        name: 'Recent Commands',
        icon: 'fa-history',
        description: 'Shows last 5 executed commands',
        defaultWidth: 2,
        defaultHeight: 2,
        
        updater: (widgetId) => {
            const container = document.getElementById(`widget-${widgetId}`);
            if (!container) return;
            
            if (!window.commandHistory || window.commandHistory.length === 0) {
                container.innerHTML = '<div class="loading-placeholder">No commands</div>';
                return;
            }
            
            const recent = window.commandHistory.slice(0, 5);
            container.innerHTML = recent.map(cmd => `
                <div class="history-item" style="padding: 8px; font-size:0.75rem;">
                    <span class="history-time">${new Date(cmd.timestamp).toLocaleTimeString()}</span>
                    <span class="history-status ${cmd.status}">${cmd.status === 'pending' ? 'pending' : (cmd.status === 'success' ? 'success' : 'error')}</span>
                    <span class="history-device" style="min-width: 100px;">${escapeHtml(cmd.deviceId)}</span>
                    <span class="history-command">${escapeHtml(cmd.command)}</span>
                </div>
            `).join('');
        }
    });
}
// escapeHtml is defined globally by script.js (loaded before this file) - don't shadow it with a weaker copy here.