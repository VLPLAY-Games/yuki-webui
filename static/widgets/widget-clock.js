// widget-clock.js - Clock & Calendar Widget

if (typeof widgetManager !== 'undefined') {
    widgetManager.register('clock_calendar', {
        name: 'Clock & Calendar',
        icon: 'fa-calendar-alt',
        description: 'Shows current time, date and monthly calendar',
        defaultWidth: 2,
        defaultHeight: 2,
        
        updater: (widgetId) => {
            const container = document.getElementById(`widget-${widgetId}`);
            if (!container) return;
            
            container.innerHTML = `
                <div class="clock-calendar-widget">
                    <div class="clock-time" id="clock-time-${widgetId}">--:--:--</div>
                    <div class="clock-date" id="clock-date-${widgetId}">--</div>
                    <div class="calendar-grid" id="calendar-grid-${widgetId}"></div>
                </div>
            `;
            
            updateClockForWidget(widgetId);
        },
        
        onInit: (widgetId) => {
            if (!window.clockWidgets) window.clockWidgets = [];
            if (!window.clockWidgets.includes(widgetId)) {
                window.clockWidgets.push(widgetId);
            }
            
            if (!window.clockWidgetsInterval) {
                window.clockWidgetsInterval = setInterval(() => {
                    if (window.clockWidgets) {
                        window.clockWidgets.forEach(id => updateClockForWidget(id));
                    }
                }, 1000);
            }
        },
        
        onRemove: (widgetId) => {
            if (window.clockWidgets) {
                window.clockWidgets = window.clockWidgets.filter(id => id !== widgetId);
            }
            if (window.clockWidgets && window.clockWidgets.length === 0 && window.clockWidgetsInterval) {
                clearInterval(window.clockWidgetsInterval);
                window.clockWidgetsInterval = null;
            }
        }
    });
}

function updateClockForWidget(widgetId) {
    const now = new Date();
    
    const timeEl = document.getElementById(`clock-time-${widgetId}`);
    const dateEl = document.getElementById(`clock-date-${widgetId}`);
    
    if (timeEl) {
        timeEl.textContent = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });
    }
    
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('en-US', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
    }
    
    const calendarGrid = document.getElementById(`calendar-grid-${widgetId}`);
    if (calendarGrid) {
        const year = now.getFullYear();
        const month = now.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = now.getDate();
        
        let html = '<div class="calendar-weekdays">';
        const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        weekdays.forEach(day => {
            html += `<span class="calendar-weekday">${day}</span>`;
        });
        html += '</div><div class="calendar-days">';
        
        for (let i = 0; i < firstDay; i++) {
            html += '<span class="calendar-day empty"></span>';
        }
        
        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = d === today;
            html += `<span class="calendar-day ${isToday ? 'today' : ''}">${d}</span>`;
        }
        
        html += '</div>';
        calendarGrid.innerHTML = html;
    }
}