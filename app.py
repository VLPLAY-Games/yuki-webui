import os
from flask import Flask, render_template, request, redirect, url_for, session, flash

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

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if AUTH_ENABLED and not session.get('logged_in'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)