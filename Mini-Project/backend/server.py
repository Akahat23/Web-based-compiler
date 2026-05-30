from flask import Flask, render_template, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from flask import request
import uuid, subprocess, os, sys, shutil, threading, json, hashlib, datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'syntaxia-secret-key'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

BASE_PATH     = os.path.dirname(__file__)
TEMP_DIR      = os.path.join(BASE_PATH, "temp")
DATA_DIR      = os.path.join(BASE_PATH, "data")
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

USERS_FILE    = os.path.join(DATA_DIR, "users.json")
HISTORY_FILE  = os.path.join(DATA_DIR, "history.json")

_sessions     = {}  # token -> username


COMPILE_TIMEOUT = 30
EXEC_TIMEOUT    = 60   # allow time for interactive programs

_active = {}
_lock   = threading.Lock()

_py_cmd = None
def get_python_cmd():
    global _py_cmd
    if _py_cmd:
        return _py_cmd
    for cmd in ["py", "python3", "python"]:
        try:
            r = subprocess.run([cmd, "--version"], capture_output=True, text=True, timeout=3)
            if r.returncode == 0:
                _py_cmd = cmd
                return cmd
        except Exception:
            continue
    _py_cmd = "py"
    return "py"

_WINLIBS_BIN = os.path.join(
    os.environ.get("LOCALAPPDATA", ""),
    "Microsoft", "WinGet", "Packages",
    "BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "mingw64", "bin"
)

def _resolve_compiler(name):
    candidate = os.path.join(_WINLIBS_BIN, name + ".exe")
    if sys.platform == "win32" and os.path.isfile(candidate):
        return candidate
    return name  # fall back to PATH

def _popen(cmd, cwd):
    kwargs = dict(
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, cwd=cwd, bufsize=0,
        env={**os.environ, "PYTHONUNBUFFERED": "1"}
    )
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    return subprocess.Popen(cmd, **kwargs)

@app.route("/")
def home():
    return render_template("home.html")

@app.route("/compiler")
def compiler():
    return render_template("index.html")

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@socketio.on("connect")
def on_connect():
    pass

@socketio.on("disconnect")
def on_disconnect():
    _kill_session(request.sid)

@socketio.on("run_code")
def on_run_code(data):
    sid = request.sid
    _kill_session(sid)

    run_id  = uuid.uuid4().hex
    sandbox = os.path.join(TEMP_DIR, run_id)
    os.makedirs(sandbox, exist_ok=True)

    emit("terminal_clear")
    emit("run_started", {"run_id": run_id})

    t = threading.Thread(
        target=_execute, args=(sid, data, sandbox, run_id), daemon=True
    )
    t.start()

@socketio.on("send_input")
def on_send_input(data):
    sid  = request.sid
    text = data.get("text", "")
    with _lock:
        info = _active.get(sid)
    if info:
        try:
            info["process"].stdin.write(text + "\n")
            info["process"].stdin.flush()
        except Exception:
            pass

@socketio.on("stop_run")
def on_stop_run():
    sid = request.sid
    _kill_session(sid)
    socketio.emit("run_done", {"exit_code": -1, "stopped": True}, room=sid)

def _emit_sys(sid, text, kind="system"):
    socketio.emit("terminal_output", {"text": text, "kind": kind}, room=sid)

def _execute(sid, data, sandbox, run_id):
    language    = data.get("language", "").lower().strip()
    main_code   = data.get("code", "").strip()
    mode        = data.get("mode", "single")
    extra_files = data.get("files", [])

    proc = None
    try:
        if mode == "multi":
            for f in extra_files:
                nm = os.path.basename(f.get("name", ""))
                if nm:
                    with open(os.path.join(sandbox, nm), "w", encoding="utf-8") as fh:
                        fh.write(f.get("content", ""))

        if language == "python":
            fpath = os.path.join(sandbox, "main.py")
            with open(fpath, "w", encoding="utf-8") as fh:
                fh.write(main_code)
            _emit_sys(sid, "▶ Running Python...\n")
            proc = _popen([get_python_cmd(), "-u", "main.py"], sandbox)

        elif language == "c":
            main_file = os.path.join(sandbox, f"{run_id}.c")
            exe_path  = os.path.join(sandbox, run_id + (".exe" if sys.platform == "win32" else ""))
            with open(main_file, "w", encoding="utf-8") as fh:
                fh.write(main_code)
            extra_srcs = [
                os.path.join(sandbox, os.path.basename(f.get("name", "")))
                for f in extra_files
                if f.get("name", "").endswith(".c") and not f.get("isMain")
            ]
            _emit_sys(sid, "⚙ Compiling C...\n")
            cr = subprocess.run(
                [_resolve_compiler("gcc"), main_file] + extra_srcs + ["-o", exe_path, "-std=c17", "-O2", "-Wall", "-lm", "-lpthread"],
                capture_output=True, text=True, timeout=COMPILE_TIMEOUT, cwd=sandbox
            )
            if cr.returncode != 0:
                err = cr.stderr.replace(sandbox + os.sep, "").replace(sandbox, "")
                _emit_sys(sid, f"Compilation failed:\n{err}", "error")
                socketio.emit("run_done", {"exit_code": 1}, room=sid)
                return
            if cr.stderr.strip():
                _emit_sys(sid, f"Warnings:\n{cr.stderr.replace(sandbox + os.sep, '')}\n", "warning")
            _emit_sys(sid, "▶ Running...\n")
            proc = _popen([exe_path], sandbox)

        elif language == "cpp":
            main_file = os.path.join(sandbox, f"{run_id}.cpp")
            exe_path  = os.path.join(sandbox, run_id + (".exe" if sys.platform == "win32" else ""))
            with open(main_file, "w", encoding="utf-8") as fh:
                fh.write(main_code)
            extra_srcs = [
                os.path.join(sandbox, os.path.basename(f.get("name", "")))
                for f in extra_files
                if any(f.get("name", "").endswith(e) for e in [".cpp", ".cc", ".cxx"]) and not f.get("isMain")
            ]
            _emit_sys(sid, "⚙ Compiling C++...\n")
            cr = subprocess.run(
                [_resolve_compiler("g++"), main_file] + extra_srcs + ["-o", exe_path, "-std=c++14", "-O2", "-Wall", "-lm", "-lpthread"],
                capture_output=True, text=True, timeout=COMPILE_TIMEOUT, cwd=sandbox
            )
            if cr.returncode != 0:
                err = cr.stderr.replace(sandbox + os.sep, "").replace(sandbox, "")
                _emit_sys(sid, f"Compilation failed:\n{err}", "error")
                socketio.emit("run_done", {"exit_code": 1}, room=sid)
                return
            if cr.stderr.strip():
                _emit_sys(sid, f"Warnings:\n{cr.stderr.replace(sandbox + os.sep, '')}\n", "warning")
            _emit_sys(sid, "▶ Running...\n")
            proc = _popen([exe_path], sandbox)

        elif language == "java":
            class_name = "Main" + run_id[:8]
            main_file  = os.path.join(sandbox, f"{class_name}.java")
            mod_code   = main_code.replace("public class Main", f"public class {class_name}", 1)
            with open(main_file, "w", encoding="utf-8") as fh:
                fh.write(mod_code)
            java_srcs = [main_file]
            for f in extra_files:
                nm = os.path.basename(f.get("name", ""))
                if nm.endswith(".java") and not f.get("isMain"):
                    java_srcs.append(os.path.join(sandbox, nm))
            _emit_sys(sid, "⚙ Compiling Java...\n")
            cr = subprocess.run(
                ["javac", "-encoding", "UTF-8"] + java_srcs,
                capture_output=True, text=True, timeout=COMPILE_TIMEOUT, cwd=sandbox
            )
            if cr.returncode != 0:
                err = cr.stderr.replace(sandbox + os.sep, "").replace(sandbox, "")
                _emit_sys(sid, f"Compilation failed:\n{err}", "error")
                socketio.emit("run_done", {"exit_code": 1}, room=sid)
                return
            if cr.stderr.strip():
                _emit_sys(sid, f"Warnings:\n{cr.stderr}\n", "warning")
            _emit_sys(sid, "▶ Running...\n")
            proc = _popen(["java", "-cp", sandbox, "-Xmx256m", "-Xss8m", class_name], sandbox)

        else:
            _emit_sys(sid, f"Unsupported language: {language}", "error")
            socketio.emit("run_done", {"exit_code": 1}, room=sid)
            return

        with _lock:
            _active[sid] = {"process": proc, "sandbox": sandbox}

        socketio.emit("process_alive", {}, room=sid)

        def _read(stream, kind):
            try:
                while True:
                    ch = stream.read(1)
                    if not ch:
                        break
                    socketio.emit("terminal_output", {"text": ch, "kind": kind}, room=sid)
            except Exception:
                pass

        t_out = threading.Thread(target=_read, args=(proc.stdout, "output"), daemon=True)
        t_err = threading.Thread(target=_read, args=(proc.stderr, "error"), daemon=True)
        t_out.start()
        t_err.start()
        t_out.join()
        t_err.join()
        proc.wait()

        code = proc.returncode
        if code == 0:
            _emit_sys(sid, f"\n\nProcess finished with exit code {code}", "system")
        else:
            _emit_sys(sid, f"\n\nProcess finished with exit code {code}", "system_error")

        socketio.emit("run_done", {"exit_code": code}, room=sid)

    except subprocess.TimeoutExpired:
        _emit_sys(sid, "\n⏱ Compilation timed out (30s limit)\n", "error")
        socketio.emit("run_done", {"exit_code": 1}, room=sid)
    except FileNotFoundError as e:
        cmd = str(e).split("'")[1] if "'" in str(e) else str(e)
        _emit_sys(sid, f"Not found: '{cmd}'\nMake sure it is installed and in PATH.\n", "error")
        socketio.emit("run_done", {"exit_code": 1}, room=sid)
    except Exception as e:
        _emit_sys(sid, f"Server error: {str(e)}\n", "error")
        socketio.emit("run_done", {"exit_code": 1}, room=sid)
    finally:
        with _lock:
            _active.pop(sid, None)
        _cleanup(sandbox)

def _kill_session(sid):
    with _lock:
        info = _active.pop(sid, None)
    if info:
        try:
            info["process"].kill()
        except Exception:
            pass

def _cleanup(path):
    try:
        if path and os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass

def _load_json(path, default):
    try:
        if not os.path.exists(path):
            return default
        with open(path, 'r', encoding='utf-8') as fh:
            return json.load(fh)
    except Exception:
        return default


def _save_json(path, data):
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)


def _hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def _register_user(username, password):
    users = _load_json(USERS_FILE, {})
    if username in users:
        return False
    users[username] = {
        'password_hash': _hash_password(password),
        'created_at': datetime.datetime.utcnow().isoformat() + 'Z'
    }
    _save_json(USERS_FILE, users)
    return True


def _authenticate_user(username, password):
    users = _load_json(USERS_FILE, {})
    if username not in users:
        return False
    return users[username].get('password_hash') == _hash_password(password)


def _create_session(username):
    token = uuid.uuid4().hex
    _sessions[token] = username
    return token


def _get_user_from_token(token):
    if not token:
        return None
    return _sessions.get(token)


def _save_history_entry(username, entry):
    history = _load_json(HISTORY_FILE, {})
    user_history = history.get(username, [])
    user_history.insert(0, entry)
    user_history = user_history[:50]
    history[username] = user_history
    _save_json(HISTORY_FILE, history)


@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return jsonify({'ok': False, 'error': 'Username and password are required.'}), 400
    if _register_user(username, password):
        return jsonify({'ok': True, 'message': 'Registered successfully.'})
    return jsonify({'ok': False, 'error': 'Username already exists.'}), 409


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return jsonify({'ok': False, 'error': 'Username and password are required.'}), 400
    if not _authenticate_user(username, password):
        return jsonify({'ok': False, 'error': 'Invalid credentials.'}), 401
    token = _create_session(username)
    return jsonify({'ok': True, 'username': username, 'token': token})


@app.route('/api/logout', methods=['POST'])
def logout():
    token = request.headers.get('X-Auth-Token') or request.json.get('token') if request.is_json else None
    if token:
        _sessions.pop(token, None)
    return jsonify({'ok': True})


@app.route('/api/me', methods=['GET'])
def me():
    token = request.headers.get('X-Auth-Token')
    username = _get_user_from_token(token)
    if not username:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401
    return jsonify({'ok': True, 'username': username})


@app.route('/api/history', methods=['GET', 'POST'])
def history():
    token = request.headers.get('X-Auth-Token')
    username = _get_user_from_token(token)
    if not username:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401
    if request.method == 'GET':
        history = _load_json(HISTORY_FILE, {})
        return jsonify({'ok': True, 'history': history.get(username, [])})

    data = request.get_json(force=True, silent=True) or {}
    entry = {
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
        'language': data.get('language'),
        'mode': data.get('mode'),
        'code': data.get('code'),
        'files': data.get('files', []),
        'label': data.get('label', 'Run')
    }
    _save_history_entry(username, entry)
    return jsonify({'ok': True, 'entry': entry})



@app.route('/api/update_username', methods=['POST'])
def update_username():
    token = request.headers.get('X-Auth-Token')
    old_username = _get_user_from_token(token)
    if not old_username:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401
    
    data = request.get_json(force=True, silent=True) or {}
    new_username = (data.get('new_username') or '').strip()
    
    if not new_username:
        return jsonify({'ok': False, 'error': 'New username cannot be empty.'}), 400
    
    users = _load_json(USERS_FILE, {})
    if new_username in users:
        return jsonify({'ok': False, 'error': 'Username already exists.'}), 409
        
    # Migrate users.json
    users[new_username] = users.pop(old_username)
    _save_json(USERS_FILE, users)
    
    # Migrate history.json
    history = _load_json(HISTORY_FILE, {})
    if old_username in history:
        history[new_username] = history.pop(old_username)
        _save_json(HISTORY_FILE, history)
        
    # Migrate active sessions mapping
    for session_token, u in _sessions.items():
        if u == old_username:
            _sessions[session_token] = new_username
            
    return jsonify({'ok': True, 'username': new_username})

if __name__ == "__main__":
    print("=" * 52)
    print("  Syntaxia — Interactive Terminal IDE")
    print("  Visit: http://127.0.0.1:5000")
    print("=" * 52)
    get_python_cmd()
    socketio.run(app, debug=True, host="0.0.0.0", port=5000, allow_unsafe_werkzeug=True)