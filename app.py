import os
import stat
import secrets
import hmac
import json
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.security import generate_password_hash, check_password_hash as _wz_check_password_hash

def check_password_hash(pwhash, password):
    try:
        return _wz_check_password_hash(pwhash, password)
    except ValueError:
        # A malformed/legacy hash string must fail closed, not crash the request.
        return False

app = Flask(__name__)

# --- Secret key: a random key generated once and persisted, never a shared hardcoded default ---
SECRET_KEY_FILE = os.path.join(os.path.dirname(__file__), '.flask_secret')

def _load_or_create_secret_key():
    env_key = os.environ.get('SECRET_KEY')
    if env_key:
        return env_key
    if os.path.exists(SECRET_KEY_FILE):
        with open(SECRET_KEY_FILE, 'r') as f:
            existing = f.read().strip()
        if existing:
            return existing
    new_key = secrets.token_hex(32)
    with open(SECRET_KEY_FILE, 'w') as f:
        f.write(new_key)
    os.chmod(SECRET_KEY_FILE, stat.S_IRUSR | stat.S_IWUSR)
    return new_key

app.secret_key = _load_or_create_secret_key()

# --- TLS is opt-in; cookie Secure flag follows whether it's actually on ---
TLS_ENABLED = os.environ.get('YUKI_WEBUI_TLS_ENABLED', '').strip().lower() in ('1', 'true', 'yes', 'on')
TLS_CERT = os.environ.get('YUKI_WEBUI_TLS_CERT')
TLS_KEY = os.environ.get('YUKI_WEBUI_TLS_KEY')

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = TLS_ENABLED

# --- Credentials: hashed at rest, loaded from env or the .credentials file ---
CRED_FILE = os.path.join(os.path.dirname(__file__), '.credentials')

WEBUI_USER = os.environ.get('WEBUI_USER')
WEBUI_PASS_HASH = generate_password_hash(os.environ['WEBUI_PASS']) if os.environ.get('WEBUI_PASS') else None

def _looks_hashed(value):
    return '$' in value  # werkzeug hashes are "method$salt$hash"; the shipped plaintext default has no "$"

def _write_credentials(username, password_hash):
    with open(CRED_FILE, 'w') as f:
        f.write(f"{username}\n{password_hash}\n")
    os.chmod(CRED_FILE, stat.S_IRUSR | stat.S_IWUSR)

def _load_credentials():
    global WEBUI_USER, WEBUI_PASS_HASH
    if WEBUI_USER and WEBUI_PASS_HASH:
        return
    if not os.path.exists(CRED_FILE):
        return
    try:
        with open(CRED_FILE, 'r') as f:
            lines = f.read().strip().split('\n')
        if len(lines) < 2:
            return
        user, stored = lines[0].strip(), lines[1].strip()
        if not _looks_hashed(stored):
            # First run against the shipped plaintext default - hash it in place so it never stays plaintext on disk.
            stored = generate_password_hash(stored)
            _write_credentials(user, stored)
        WEBUI_USER = user
        WEBUI_PASS_HASH = stored
    except Exception as e:
        print(f"Error loading credentials: {e}")

_load_credentials()

AUTH_ENABLED = bool(WEBUI_USER and WEBUI_PASS_HASH)

# --- Core WebSocket auth token (read-only passthrough to the browser, item B) ---
CORE_TOKEN_FILE = os.environ.get(
    'YUKI_CORE_TOKEN_FILE',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'yuki-core', '.token')
)

# --- Login rate limiting (in-memory, per source IP) ---
_login_failures = {}  # ip -> [timestamps]
RATE_LIMIT_WINDOW = 300      # look-back window for counting failures, seconds
RATE_LIMIT_THRESHOLD = 5     # failures allowed before backoff kicks in

def _rate_limit_status(ip):
    now = time.time()
    attempts = [t for t in _login_failures.get(ip, []) if now - t < RATE_LIMIT_WINDOW]
    _login_failures[ip] = attempts
    if len(attempts) < RATE_LIMIT_THRESHOLD:
        return False, 0
    backoff = min(300, 5 * (2 ** (len(attempts) - RATE_LIMIT_THRESHOLD)))  # 5s, 10s, 20s... capped at 5m
    retry_after = backoff - (now - attempts[-1])
    return (retry_after > 0), max(0, retry_after)

def _record_login_failure(ip):
    _login_failures.setdefault(ip, []).append(time.time())

def _record_login_success(ip):
    _login_failures.pop(ip, None)

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

def _ensure_csrf_token():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_hex(32)
    return session['csrf_token']

@app.before_request
def _csrf_protect():
    if request.method in ('POST', 'DELETE') and request.path.startswith('/api/'):
        token = session.get('csrf_token')
        header_token = request.headers.get('X-CSRF-Token', '')
        if not token or not hmac.compare_digest(token, header_token):
            return jsonify({'error': 'CSRF token missing or invalid'}), 403

# Загружаем данные при старте
load_dashboard_data()

@app.route('/login', methods=['GET', 'POST'])
def login():
    if not AUTH_ENABLED:
        session['logged_in'] = True
        _ensure_csrf_token()
        return redirect(url_for('index'))

    if request.method == 'POST':
        ip = request.remote_addr or 'unknown'
        limited, retry_after = _rate_limit_status(ip)
        if limited:
            flash(f'Too many failed attempts. Try again in {int(retry_after) + 1}s.', 'error')
            _ensure_csrf_token()
            return render_template('login.html'), 429

        username = request.form.get('username', '')
        password = request.form.get('password', '')
        valid_user = hmac.compare_digest(username, WEBUI_USER)
        valid_pass = check_password_hash(WEBUI_PASS_HASH, password)
        if valid_user and valid_pass:
            _record_login_success(ip)
            session.clear()
            session['logged_in'] = True
            session['username'] = username
            _ensure_csrf_token()
            flash('Login successful', 'success')
            return redirect(url_for('index'))
        else:
            _record_login_failure(ip)
            flash('Invalid credentials', 'error')
    _ensure_csrf_token()
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    flash('Logged out', 'info')
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    csrf_token = _ensure_csrf_token()
    return render_template('index.html', auth_enabled=AUTH_ENABLED, csrf_token=csrf_token)

# API endpoints
@app.route('/api/metrics/<device_id>')
@login_required
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
@login_required
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
@login_required
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
@login_required
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
@login_required
def delete_device_tags(device_id):
    global device_tags
    if device_id in device_tags:
        del device_tags[device_id]
        save_dashboard_data()
    return jsonify({'success': True})

@app.route('/api/widgets', methods=['GET', 'POST'])
@login_required
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
@login_required
def uptime_api(device_id):
    days = int(request.args.get('days', 7))
    stats = get_device_uptime_stats(device_id, days)
    return jsonify(stats)

@app.route('/api/device/status', methods=['POST'])
@login_required
def device_status_update():
    data = request.json
    device_id = data.get('device_id')
    status = data.get('status')
    if device_id and status:
        update_device_uptime(device_id, status)
    return jsonify({'success': True})

@app.route('/api/system/metrics')
@login_required
def system_metrics_api():
    """API для получения системных метрик"""
    import psutil
    try:
        metrics = {
            'cpu_percent': psutil.cpu_percent(interval=1),
            'memory_percent': psutil.virtual_memory().percent,
            'memory_used': psutil.virtual_memory().used,
            'memory_total': psutil.virtual_memory().total,
            'disk_percent': psutil.disk_usage('/').percent,
            'disk_used': psutil.disk_usage('/').used,
            'disk_total': psutil.disk_usage('/').total,
            'uptime': time.time() - psutil.boot_time(),
            'timestamp': time.time()
        }
        return jsonify(metrics)
    except ImportError:
        return jsonify({'error': 'psutil not installed'}), 500

@app.route('/api/settings/credentials', methods=['POST'])
@login_required
def update_credentials():
    global WEBUI_USER, WEBUI_PASS_HASH
    data = request.json or {}
    current_password = data.get('current_password', '')
    new_username = (data.get('new_username') or '').strip()
    new_password = data.get('new_password', '')

    if not WEBUI_PASS_HASH or not check_password_hash(WEBUI_PASS_HASH, current_password):
        return jsonify({'success': False, 'error': 'Current password is incorrect'}), 403
    if not new_username or not new_password:
        return jsonify({'success': False, 'error': 'New username and password are required'}), 400
    if len(new_password) < 4:
        return jsonify({'success': False, 'error': 'Password must be at least 4 characters long'}), 400

    new_hash = generate_password_hash(new_password)
    _write_credentials(new_username, new_hash)
    # Only updates the running process; a WEBUI_USER/WEBUI_PASS env var would still win on next restart.
    WEBUI_USER = new_username
    WEBUI_PASS_HASH = new_hash
    session['username'] = new_username
    return jsonify({'success': True})

@app.route('/api/core-token')
@login_required
def core_token():
    try:
        with open(CORE_TOKEN_FILE, 'r') as f:
            token = f.read().strip()
    except OSError:
        return jsonify({'error': f'Core token file not found at {CORE_TOKEN_FILE}'}), 503
    if not token:
        return jsonify({'error': 'Core token file is empty'}), 503
    return jsonify({'token': token})

if __name__ == "__main__":
    debug_mode = os.environ.get('YUKI_WEBUI_DEBUG', '').strip().lower() in ('1', 'true', 'yes', 'on')
    host = os.environ.get('YUKI_WEBUI_HOST', '127.0.0.1')

    ssl_context = None
    if TLS_ENABLED:
        if TLS_CERT and TLS_KEY:
            ssl_context = (TLS_CERT, TLS_KEY)
        else:
            print("YUKI_WEBUI_TLS_ENABLED is set but YUKI_WEBUI_TLS_CERT/YUKI_WEBUI_TLS_KEY are missing - starting without TLS")

    app.run(host=host, port=5000, debug=debug_mode, ssl_context=ssl_context)
