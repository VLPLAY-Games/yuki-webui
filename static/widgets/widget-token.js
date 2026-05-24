// widget-token.js - Token Info Widget

if (typeof widgetManager !== 'undefined') {
    widgetManager.register('token', {
        name: 'Token Info',
        icon: 'fa-key',
        description: 'Displays current token creation and expiration',
        defaultWidth: 2,
        defaultHeight: 1,
        
        updater: (widgetId) => {
            const container = document.getElementById(`widget-${widgetId}`);
            if (!container) return;
            
            // Пытаемся получить сохраненную информацию о токене
            const savedTokenInfo = localStorage.getItem('yuki_token_info');
            if (savedTokenInfo) {
                try {
                    const tokenInfo = JSON.parse(savedTokenInfo);
                    if (tokenInfo.created && tokenInfo.expiresIn) {
                        container.innerHTML = `<strong>Created:</strong> ${tokenInfo.created}<br><strong>Expires:</strong> ${tokenInfo.expiresIn}`;
                        return;
                    }
                } catch(e) {}
            }
            
            // Если нет сохраненной информации, показываем загрузку
            container.innerHTML = `<div class="loading-placeholder" style="font-size:0.8rem;">Waiting for token info...</div>`;
        },
        
        onInit: (widgetId) => {
            if (!window.tokenWidgets) window.tokenWidgets = [];
            if (!window.tokenWidgets.includes(widgetId)) {
                window.tokenWidgets.push(widgetId);
            }
            
            // Запрашиваем информацию о токене, если WebSocket открыт
            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(JSON.stringify({ type: 'get_token_info' }));
            }
        },
        
        onRemove: (widgetId) => {
            if (window.tokenWidgets) {
                window.tokenWidgets = window.tokenWidgets.filter(id => id !== widgetId);
            }
        }
    });
}

// Функция для обновления токен виджетов
window.updateTokenWidgets = function(created, expiresIn) {
    // Сохраняем информацию о токене в localStorage
    localStorage.setItem('yuki_token_info', JSON.stringify({
        created: created,
        expiresIn: expiresIn,
        updated: Date.now()
    }));
    
    // Обновляем все виджеты токена
    if (window.tokenWidgets) {
        window.tokenWidgets.forEach(widgetId => {
            const container = document.getElementById(`widget-${widgetId}`);
            if (container && container.closest('.dashboard-widget')) {
                container.innerHTML = `<strong>Created:</strong> ${created}<br><strong>Expires:</strong> ${expiresIn}`;
            } else {
                // Если контейнер не найден, виджет мог быть удален
                window.tokenWidgets = window.tokenWidgets.filter(id => id !== widgetId);
            }
        });
    }
};