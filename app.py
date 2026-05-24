import os
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import json
import time
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'yuki-dev-secret-key-change-in-production')

WEBUI_USER = os.environ.get('WEBUI_USER')
WEBUI_PASS = os.environ.get('WEBUI_PASS')

if not WEBUI_USER or not WEBUI_PASS:
    cred_file = os.path.join(os.path.dirname(__file__), '.credentials')
    if os.path.exists(cred_file):
        with open(cred_file, 'r') as f:
            lines = f.read().strip().split('\n')
            if len(lines) >= 2:
                WEBUI_USER = lines[0].strip()
                WEBUI_PASS = lines[1].strip()

AUTH_ENABLED = bool(WEBUI_USER and WEBUI_PASS)

# Хранилище данных
metrics_store = {}
device_groups = {}  # group_id -> {name, devices: []}
device_tags = {}    # device_id -> [tags]
device_uptime = {}  # device_id -> {online_history: [], last_seen: timestamp}
widget_layout = []  # Сохранение layout виджетов
MAX_METRICS_POINTS = 50

# Загрузка сохраненных данных
DATA_FILE = os.path.join(os.path.dirname(__file__), 'dashboard_data.json')

def load_dashboard_data():
    global device_groups, device_tags, widget_layout
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                data = json.load(f)
                device_groups = data.get('groups', {})
                device_tags = data.get('tags', {})
                widget_layout = data.get('widgets', [])
        except Exception as e:
            print(f"Error loading dashboard data: {e}")

def save_dashboard_data():
    try:
        with open(DATA_FILE, 'w') as f:
            json.dump({
                'groups': device_groups,
                'tags': device_tags,
                'widgets': widget_layout
            }, f, indent=2)
    except Exception as e:
        print(f"Error saving dashboard data: {e}")

def save_metric(device_id, metric_type, value):
    key = f"{device_id}_{metric_type}"
    if key not in metrics_store:
        metrics_store[key] = []
    metrics_store[key].append({
        "timestamp": time.time(),
        "value": value
    })
    if len(metrics_store[key]) > MAX_METRICS_POINTS:
        metrics_store[key] = metrics_store[key][-MAX_METRICS_POINTS:]

def get_metrics(device_id, metric_type, hours=1):
    key = f"{device_id}_{metric_type}"
    if key not in metrics_store:
        return []
    cutoff = time.time() - (hours * 3600)
    return [m for m in metrics_store[key] if m["timestamp"] > cutoff]

def update_device_uptime(device_id, status):
    now = time.time()
    if device_id not in device_uptime:
        device_uptime[device_id] = {'history': [], 'last_change': now, 'current_status': status}
    
    record = device_uptime[device_id]
    if record['current_status'] != status:
        # Записываем период
        record['history'].append({
            'start': record['last_change'],
            'end': now,
            'status': record['current_status']
        })
        # Оставляем только последние 30 дней
        cutoff = now - (30 * 24 * 3600)
        record['history'] = [h for h in record['history'] if h['end'] > cutoff]
        record['last_change'] = now
        record['current_status'] = status

def get_device_uptime_stats(device_id, days=7):
    if device_id not in device_uptime:
        return {'online_percent': 100, 'total_online': 0, 'total_offline': 0}
    
    cutoff = time.time() - (days * 24 * 3600)
    record = device_uptime[device_id]
    
    total_online = 0
    total_offline = 0
    
    for period in record['history']:
        if period['end'] < cutoff:
            continue
        start = max(period['start'], cutoff)
        duration = period['end'] - start
        if period['status'] == 'online':
            total_online += duration
        else:
            total_offline += duration
    
    # Добавляем текущий период
    current_duration = time.time() - max(record['last_change'], cutoff)
    if record['current_status'] == 'online':
        total_online += current_duration
    else:
        total_offline += current_duration
    
    total = total_online + total_offline
    online_percent = (total_online / total * 100) if total > 0 else 100
    
    return {
        'online_percent': round(online_percent, 1),
        'total_online': round(total_online / 3600, 1),
        'total_offline': round(total_offline / 3600, 1)
    }

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if AUTH_ENABLED and not session.get('logged_in'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Загружаем данные при старте
load_dashboard_data()

@app.route('/login', methods=['GET', 'POST'])
def login():
    if not AUTH_ENABLED:
        session['logged_in'] = True
        return redirect(url_for('index'))

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if username == WEBUI_USER and password == WEBUI_PASS:
            session['logged_in'] = True
            session['username'] = username
            flash('Login successful', 'success')
            return redirect(url_for('index'))
        else:
            flash('Invalid credentials', 'error')
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    flash('Logged out', 'info')
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    return render_template('index.html', auth_enabled=AUTH_ENABLED)

# API endpoints
@app.route('/api/metrics/<device_id>')
def get_device_metrics(device_id):
    metric_type = request.args.get('type', 'cpu')
    hours = int(request.args.get('hours', 1))
    data = get_metrics(device_id, metric_type, hours)
    return jsonify({
        "device_id": device_id,
        "metric_type": metric_type,
        "data": data
    })

@app.route('/api/groups', methods=['GET', 'POST', 'DELETE'])
def groups_api():
    global device_groups
    
    if request.method == 'GET':
        return jsonify(device_groups)
    
    elif request.method == 'POST':
        data = request.json
        group_id = data.get('id') or str(int(time.time()))
        device_groups[group_id] = {
            'name': data.get('name', 'New Group'),
            'devices': data.get('devices', [])
        }
        save_dashboard_data()
        return jsonify({'success': True, 'group_id': group_id})
    
    elif request.method == 'DELETE':
        group_id = request.json.get('group_id')
        if group_id in device_groups:
            del device_groups[group_id]
            save_dashboard_data()
        return jsonify({'success': True})

@app.route('/api/groups/<group_id>/devices', methods=['POST', 'DELETE'])
def group_devices_api(group_id):
    global device_groups
    
    if request.method == 'POST':
        device_id = request.json.get('device_id')
        if group_id in device_groups:
            if device_id not in device_groups[group_id]['devices']:
                device_groups[group_id]['devices'].append(device_id)
            save_dashboard_data()
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        device_id = request.json.get('device_id')
        if group_id in device_groups and device_id in device_groups[group_id]['devices']:
            device_groups[group_id]['devices'].remove(device_id)
            save_dashboard_data()
        return jsonify({'success': True})

@app.route('/api/tags', methods=['GET', 'POST'])
def tags_api():
    global device_tags
    
    if request.method == 'GET':
        return jsonify(device_tags)
    
    elif request.method == 'POST':
        data = request.json
        device_id = data.get('device_id')
        tags = data.get('tags', [])
        device_tags[device_id] = tags
        save_dashboard_data()
        return jsonify({'success': True})

@app.route('/api/tags/<device_id>', methods=['DELETE'])
def delete_device_tags(device_id):
    global device_tags
    if device_id in device_tags:
        del device_tags[device_id]
        save_dashboard_data()
    return jsonify({'success': True})

@app.route('/api/widgets', methods=['GET', 'POST'])
def widgets_api():
    global widget_layout
    
    if request.method == 'GET':
        # Если есть сохраненные виджеты (даже пустой массив) - возвращаем их
        if widget_layout is not None:
            return jsonify(widget_layout)
        else:
            # Только если нет сохраненных данных, возвращаем дефолтные
            default_widgets = [
                {'id': 'stats', 'type': 'stats', 'w': 2, 'h': 1},
                {'id': 'token', 'type': 'token', 'w': 2, 'h': 1},
                {'id': 'recent', 'type': 'recent_commands', 'w': 2, 'h': 2}
            ]
            return jsonify(default_widgets)
    
    elif request.method == 'POST':
        widget_layout = request.json
        save_dashboard_data()
        return jsonify({'success': True})

@app.route('/api/uptime/<device_id>')
def uptime_api(device_id):
    days = int(request.args.get('days', 7))
    stats = get_device_uptime_stats(device_id, days)
    return jsonify(stats)

@app.route('/api/device/status', methods=['POST'])
def device_status_update():
    data = request.json
    device_id = data.get('device_id')
    status = data.get('status')
    if device_id and status:
        update_device_uptime(device_id, status)
    return jsonify({'success': True})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)