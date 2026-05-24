// widgets-core.js - Базовый класс для управления виджетами

class WidgetManager {
    constructor() {
        this.widgets = [];
        this.registeredWidgets = new Map();
        this.container = null;
        this.draggedWidget = null;
    }
    
    // Регистрация нового типа виджета
    register(widgetType, config) {
        this.registeredWidgets.set(widgetType, {
            name: config.name,
            icon: config.icon,
            description: config.description,
            defaultWidth: config.defaultWidth || 2,
            defaultHeight: config.defaultHeight || 1,
            renderer: config.renderer,
            updater: config.updater,
            onRemove: config.onRemove,
            onInit: config.onInit
        });
    }
    
    // Загрузка сохраненных виджетов
    async load() {
        try {
            const response = await fetch('/api/widgets');
            const savedWidgets = await response.json();
            
            if (savedWidgets && Array.isArray(savedWidgets) && savedWidgets.length > 0) {
                this.widgets = savedWidgets;
            } else {
                // Дефолтные виджеты
                this.widgets = [
                    { id: 'stats_default', type: 'stats', w: 2, h: 1 },
                    { id: 'token_default', type: 'token', w: 2, h: 1 },
                    { id: 'recent_default', type: 'recent_commands', w: 2, h: 2 }
                ];
                await this.save();
            }
        } catch (e) {
            console.error('Failed to load widgets', e);
            const localWidgets = localStorage.getItem('widgets_backup');
            if (localWidgets) {
                try {
                    this.widgets = JSON.parse(localWidgets);
                } catch(e2) {}
            }
            if (!this.widgets || this.widgets.length === 0) {
                this.widgets = [
                    { id: 'stats_default', type: 'stats', w: 2, h: 1 },
                    { id: 'token_default', type: 'token', w: 2, h: 1 },
                    { id: 'recent_default', type: 'recent_commands', w: 2, h: 2 }
                ];
            }
        }
        this.render();
        
        // Инициализация всех виджетов
        this.widgets.forEach(widget => {
            const registered = this.registeredWidgets.get(widget.type);
            if (registered && registered.onInit) {
                registered.onInit(widget.id);
            }
        });
    }
    
    // Сохранение виджетов
    async save() {
        try {
            await fetch('/api/widgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.widgets)
            });
            localStorage.setItem('widgets_backup', JSON.stringify(this.widgets));
        } catch (e) {
            console.error('Failed to save widgets', e);
            localStorage.setItem('widgets_backup', JSON.stringify(this.widgets));
        }
    }
    
    // Добавление виджета
    add(type, width = 2) {
        const widgetType = this.registeredWidgets.get(type);
        if (!widgetType) return false;
        
        const newId = `${type}_${Date.now()}`;
        this.widgets.push({
            id: newId,
            type: type,
            w: Math.min(Math.max(width, 1), 4),
            h: widgetType.defaultHeight
        });
        this.save();
        this.render();
        
        // Инициализируем новый виджет
        if (widgetType.onInit) {
            widgetType.onInit(newId);
        }
        
        return true;
    }
    
    // Удаление виджета
    remove(widgetId) {
        const widget = this.widgets.find(w => w.id === widgetId);
        if (widget) {
            const registered = this.registeredWidgets.get(widget.type);
            if (registered && registered.onRemove) {
                registered.onRemove(widget.id);
            }
        }
        this.widgets = this.widgets.filter(w => w.id !== widgetId);
        this.save();
        this.render();
    }
    
    // Обновление конкретного виджета
    updateWidget(widgetId) {
        const widget = this.widgets.find(w => w.id === widgetId);
        if (!widget) return;
        
        const wType = this.registeredWidgets.get(widget.type);
        if (wType && wType.updater) {
            wType.updater(widget.id);
        }
    }
    
    // Обновление всех виджетов
    updateAll() {
        this.widgets.forEach(widget => {
            this.updateWidget(widget.id);
        });
    }
    
    // Рендер всех виджетов
    render() {
        if (!this.container) return;
        
        if (this.widgets.length === 0) {
            this.container.innerHTML = `
                <div class="empty-widgets" style="grid-column: span 4; text-align: center; padding: 60px 40px; background: var(--bg-secondary); border-radius: 20px; border: 2px dashed var(--border-color);">
                    <i class="fas fa-th-large" style="font-size: 4rem; color: var(--text-muted); margin-bottom: 20px; display: block;"></i>
                    <h3 style="margin-bottom: 10px; color: var(--text-primary);">No Widgets</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 25px;">Click "Add Widget" to customize your dashboard</p>
                    <button class="btn-primary" id="emptyStateAddWidgetBtn" style="padding: 10px 24px;">
                        <i class="fas fa-plus"></i> Add Your First Widget
                    </button>
                </div>
            `;
            // Добавляем обработчик для кнопки в пустом состоянии
            const emptyBtn = document.getElementById('emptyStateAddWidgetBtn');
            if (emptyBtn) {
                emptyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showAddModal();
                });
            }
            return;
        }
        
        this.container.innerHTML = this.widgets.map(widget => {
            const wType = this.registeredWidgets.get(widget.type);
            const span = Math.min(Math.max(widget.w, 1), 4);
            return `
                <div class="dashboard-widget" data-widget-id="${widget.id}" style="grid-column: span ${span};">
                    <div class="widget-header">
                        <h3><i class="fas ${wType?.icon || 'fa-puzzle-piece'}"></i> ${wType?.name || widget.type}</h3>
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
        }).join('');
        
        // Привязываем обработчики
        document.querySelectorAll('.refresh-widget').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.updateWidget(btn.dataset.id);
            });
        });
        
        document.querySelectorAll('.remove-widget').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.remove(btn.dataset.id);
            });
        });
        
        // Drag and drop
        document.querySelectorAll('.dashboard-widget').forEach(el => {
            el.setAttribute('draggable', 'true');
            el.addEventListener('dragstart', this.handleDragStart.bind(this));
            el.addEventListener('dragend', this.handleDragEnd.bind(this));
            el.addEventListener('dragover', this.handleDragOver.bind(this));
            el.addEventListener('drop', this.handleDrop.bind(this));
        });
        
        // Загружаем контент виджетов
        this.widgets.forEach(widget => {
            this.updateWidget(widget.id);
        });
    }
    
    handleDragStart(e) {
        this.draggedWidget = e.target.closest('.dashboard-widget');
        e.dataTransfer.setData('text/plain', this.draggedWidget.dataset.widgetId);
        this.draggedWidget.classList.add('dragging');
    }
    
    handleDragEnd(e) {
        if (this.draggedWidget) this.draggedWidget.classList.remove('dragging');
        this.draggedWidget = null;
    }
    
    handleDragOver(e) {
        e.preventDefault();
    }
    
    async handleDrop(e) {
        e.preventDefault();
        const targetWidget = e.target.closest('.dashboard-widget');
        if (!targetWidget || targetWidget === this.draggedWidget) return;
        
        const fromId = this.draggedWidget.dataset.widgetId;
        const toId = targetWidget.dataset.widgetId;
        
        const fromIndex = this.widgets.findIndex(w => w.id === fromId);
        const toIndex = this.widgets.findIndex(w => w.id === toId);
        
        if (fromIndex !== -1 && toIndex !== -1) {
            const temp = { ...this.widgets[fromIndex] };
            this.widgets[fromIndex] = { ...this.widgets[toIndex] };
            this.widgets[toIndex] = temp;
            
            await fetch('/api/widgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.widgets)
            });
            
            this.render();
        }
    }
    
    // Показать модальное окно добавления
    showAddModal() {
        // Удаляем существующее модальное окно
        const existingModal = document.getElementById('addWidgetModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'addWidgetModal';
        
        const widgetTypes = Array.from(this.registeredWidgets.entries()).map(([type, config]) => `
            <label class="widget-option" data-type="${type}" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: 12px; cursor: pointer; transition: all 0.2s; border: 2px solid transparent;">
                <input type="radio" name="widgetType" value="${type}" style="width: 18px; height: 18px; cursor: pointer;">
                <i class="fas ${config.icon}" style="font-size: 1.5rem;"></i>
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${config.name}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${config.description}</div>
                </div>
            </label>
        `).join('');
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3><i class="fas fa-plus-circle" style="color: var(--accent-primary);"></i> Add Widget</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
                    <div class="form-group">
                        <label><i class="fas fa-chart-simple"></i> Widget Type</label>
                        <div class="widget-type-options" style="display: flex; flex-direction: column; gap: 10px;">
                            ${widgetTypes}
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-top: 20px;">
                        <label><i class="fas fa-arrows-left-right"></i> Widget Width (1-4 columns)</label>
                        
                        <div style="display: flex; gap: 8px; margin-bottom: 15px;">
                            <div class="width-indicator" data-width="1" style="flex: 1; text-align: center; cursor: pointer;">
                                <div style="height: 40px; background: var(--bg-tertiary); border-radius: 8px; border: 2px solid var(--border-color); transition: all 0.2s;">
                                    <div style="height: 100%; width: 25%; background: var(--accent-primary); border-radius: 6px;"></div>
                                </div>
                                <span style="font-size: 0.7rem; margin-top: 5px; display: block;">1 col (25%)</span>
                            </div>
                            <div class="width-indicator" data-width="2" style="flex: 1; text-align: center; cursor: pointer;">
                                <div style="height: 40px; background: var(--bg-tertiary); border-radius: 8px; border: 2px solid var(--accent-primary); transition: all 0.2s;">
                                    <div style="height: 100%; width: 50%; background: var(--accent-primary); border-radius: 6px;"></div>
                                </div>
                                <span style="font-size: 0.7rem; margin-top: 5px; display: block;">2 col (50%)</span>
                            </div>
                            <div class="width-indicator" data-width="3" style="flex: 1; text-align: center; cursor: pointer;">
                                <div style="height: 40px; background: var(--bg-tertiary); border-radius: 8px; border: 2px solid var(--border-color); transition: all 0.2s;">
                                    <div style="height: 100%; width: 75%; background: var(--accent-primary); border-radius: 6px;"></div>
                                </div>
                                <span style="font-size: 0.7rem; margin-top: 5px; display: block;">3 col (75%)</span>
                            </div>
                            <div class="width-indicator" data-width="4" style="flex: 1; text-align: center; cursor: pointer;">
                                <div style="height: 40px; background: var(--bg-tertiary); border-radius: 8px; border: 2px solid var(--border-color); transition: all 0.2s;">
                                    <div style="height: 100%; width: 100%; background: var(--accent-primary); border-radius: 6px;"></div>
                                </div>
                                <span style="font-size: 0.7rem; margin-top: 5px; display: block;">4 col (100%)</span>
                            </div>
                        </div>
                        
                        <input type="range" id="newWidgetWidth" min="1" max="4" value="2" step="1" style="width: 100%; margin-top: 5px;">
                        <div id="widthPreview" style="text-align: center; margin-top: 10px; padding: 5px; background: var(--accent-primary); border-radius: 20px; font-size: 0.8rem;">
                            Width: 2 columns (50%)
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-top: 15px; padding: 10px; background: var(--bg-tertiary); border-radius: 10px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); text-align: center;">
                            <i class="fas fa-info-circle"></i> Tip: Widgets can be reordered by dragging
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="confirmAddWidgetBtn" class="btn-primary">
                        <i class="fas fa-plus"></i> Add Widget
                    </button>
                    <button class="btn-secondary modal-cancel">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.style.display = 'block';
        
        // Добавляем hover эффекты для опций
        const options = modal.querySelectorAll('.widget-option');
        options.forEach(opt => {
            opt.addEventListener('mouseenter', () => {
                opt.style.background = 'var(--bg-secondary)';
                opt.style.borderColor = 'var(--accent-primary)';
            });
            opt.addEventListener('mouseleave', () => {
                opt.style.background = 'var(--bg-tertiary)';
                opt.style.borderColor = 'transparent';
            });
            opt.addEventListener('click', (e) => {
                if (e.target.type !== 'radio') {
                    const radio = opt.querySelector('input[type="radio"]');
                    if (radio) radio.checked = true;
                }
            });
        });
        
        // Функция обновления визуальных индикаторов
        const updateWidthIndicators = (value) => {
            const indicators = modal.querySelectorAll('.width-indicator');
            indicators.forEach(indicator => {
                const widthValue = parseInt(indicator.dataset.width);
                const borderDiv = indicator.querySelector('div');
                if (borderDiv) {
                    if (widthValue === value) {
                        borderDiv.style.borderColor = 'var(--accent-primary)';
                    } else {
                        borderDiv.style.borderColor = 'var(--border-color)';
                    }
                }
            });
            
            const preview = document.getElementById('widthPreview');
            if (preview) {
                let percent = value === 1 ? '25%' : value === 2 ? '50%' : value === 3 ? '75%' : '100%';
                preview.textContent = `Width: ${value} column${value > 1 ? 's' : ''} (${percent})`;
            }
        };
        
        // Обработчик для визуальных индикаторов
        const indicators = modal.querySelectorAll('.width-indicator');
        indicators.forEach(indicator => {
            indicator.addEventListener('click', () => {
                const width = parseInt(indicator.dataset.width);
                const slider = document.getElementById('newWidgetWidth');
                if (slider) {
                    slider.value = width;
                    updateWidthIndicators(width);
                }
            });
        });
        
        // Width slider
        const widthSlider = modal.querySelector('#newWidgetWidth');
        if (widthSlider) {
            widthSlider.value = 2;
            updateWidthIndicators(2);
            widthSlider.addEventListener('input', (e) => {
                updateWidthIndicators(parseInt(e.target.value));
            });
        }
        
        // Закрытие модала
        const closeModal = () => {
            if (modal && modal.remove) modal.remove();
        };
        
        modal.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // Добавление виджета
        const confirmBtn = document.getElementById('confirmAddWidgetBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const selectedRadio = modal.querySelector('input[name="widgetType"]:checked');
                let type = selectedRadio ? selectedRadio.value : 'stats';
                const width = parseInt(document.getElementById('newWidgetWidth')?.value || 2);
                
                this.add(type, width);
                closeModal();
                
                const typeNames = {
                    'stats': 'Statistics', 
                    'token': 'Token Info', 
                    'recent_commands': 'Recent Commands',
                    'system_health': 'System Health', 
                    'clock_calendar': 'Clock & Calendar', 
                    'server_uptime': 'Server Uptime'
                };
                
                if (window.showToast) {
                    window.showToast(`"${typeNames[type] || type}" widget added successfully`, 'success');
                }
            });
        }
    }
    
    resetToDefault() {
        if (confirm('Reset widgets to default? This will remove all current widgets and restore the default set.')) {
            // Создаем дефолтные виджеты
            this.widgets = [
                { id: 'stats_default', type: 'stats', w: 2, h: 1 },
                { id: 'token_default', type: 'token', w: 2, h: 1 },
                { id: 'recent_default', type: 'recent_commands', w: 2, h: 2 }
            ];
            this.save();
            this.render();
            
            // Инициализируем новые виджеты
            this.widgets.forEach(widget => {
                const registered = this.registeredWidgets.get(widget.type);
                if (registered && registered.onInit) {
                    registered.onInit(widget.id);
                }
            });
            
            if (window.showToast) {
                window.showToast('Widgets reset to default', 'success');
            }
        }
    }
    
    init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container with id "${containerId}" not found`);
        }
    }
}

// Глобальный экземпляр
window.widgetManager = new WidgetManager();