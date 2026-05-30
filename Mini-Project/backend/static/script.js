let editor = null,
  currentLang = "c",
  isDark = !0,
  appMode = null,
  editorReady = !1,
  isRunning = !1,
  startTime = null,
  socket = null,
  authToken = null,
  currentUser = null,
  authMode = "login",
  files = [],
  activeFileId = null,
  renameTargetId = null,
  _termSpan = null,
  _termKind = null,
  _termCursor = null,
  langExtMap = { c: "c", cpp: "cpp", java: "java", python: "py" },
  monacoLangMap = { c: "c", cpp: "cpp", java: "java", python: "python" },
  langDisplayMap = { c: "C", cpp: "C++", java: "Java", python: "Python" },
  extToMonaco = {
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    java: "java",
    py: "python",
    txt: "plaintext",
    md: "markdown",
    json: "json",
    xml: "xml",
    html: "html",
    css: "css",
    js: "javascript",
  },
  templates = {
    c: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
    cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
    java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
    python: `# Hello World
print("Hello, World!")
`,
  };
function _initSocket() {
  try {
    let e;
    ((e =
      "file:" === window.location.protocol
        ? "http://127.0.0.1:5000"
        : window.location.origin),
      (socket = io(e, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        reconnection: !0,
        reconnectionDelay: 1e3,
        reconnectionDelayMax: 5e3,
        reconnectionAttempts: 10,
        timeout: 2e4,
      })));
  } catch (e) {
    return (
      console.error("Socket.IO init failed:", e),
      setStatus("error", "Offline"),
      void showToast("Socket.IO init failed. Make sure backend is running.")
    );
  }
  (socket.on("connect", () => {
    (console.log("Socket.IO connected"), setStatus("ready", "Ready"));
  }),
    socket.on("connect_error", (e) => {
      (console.error("Socket.IO connection error:", e),
        setStatus("error", "Connection Error"),
        showToast(
          "Unable to connect to backend. Check server is running and refresh.",
        ));
    }),
    socket.on("connect_timeout", (e) => {
      (console.error("Socket.IO connect timeout:", e),
        setStatus("error", "Timeout"),
        showToast(
          "Connection timed out. Ensure backend at localhost:5000 and refresh.",
        ));
    }),
    socket.on("reconnect_attempt", (e) => {
      (console.log("Socket.IO reconnect attempt", e),
        setStatus("error", "Reconnecting..."));
    }),
    socket.on("reconnect_failed", () => {
      (console.error("Socket.IO reconnect failed"),
        setStatus("error", "Reconnect Failed"),
        showToast(
          "Socket reconnect failed after max attempts. Restart server then refresh.",
        ));
    }),
    socket.on("error", (e) => {
      (console.error("Socket.IO error:", e),
        setStatus("error", "Server Error"));
    }),
    socket.on("disconnect", () => {
      (console.log("Socket.IO disconnected"),
        setStatus("error", "Disconnected"),
        isRunning && _endRun({}));
    }),
    socket.on("terminal_clear", () => _clearTerminalContent()),
    socket.on("run_started", () => {
      ((isRunning = !0),
        (startTime = Date.now()),
        _showLoadingOverlay(!0),
        _showInputBar(!1),
        (document.getElementById("terminalPlaceholder").style.display =
          "none"));
    }),
    socket.on("process_alive", () => {
      (_showLoadingOverlay(!1),
        _showInputBar(!0),
        _addCursor(),
        document.getElementById("terminalInput").focus());
    }),
    socket.on("terminal_output", (e) => {
      (_showLoadingOverlay(!1),
        _removeCursor(),
        _appendTerminal(e.text, e.kind || "output"),
        _addCursor());
    }),
    socket.on("run_done", (e) => {
      (_removeCursor(), _endRun(e));
    }));
}
function runCode() {
  if (editor && appMode) {
    if (!isRunning)
      if (socket && (socket.connected || socket.connecting)) {
        (_rippleBtn(document.getElementById("runBtn")),
          _clearTerminalContent(),
          (document.getElementById("terminalPlaceholder").style.display =
            "none"),
          (document.getElementById("execTime").textContent = ""));
        var e = { language: currentLang, mode: appMode };
        if ("single" === appMode) {
          var t = editor.getValue().trim();
          if (!t) return void showToast("Please write some code first!");
          e.code = t;
        } else {
          t = files.find((e) => e.isMain);
          if (!t || !t.model.getValue().trim())
            return void showToast("Main file is empty!");
          ((e.code = t.model.getValue()),
            (e.files = files.map((e) => ({
              name: e.name,
              content: e.model.getValue(),
              isMain: e.isMain,
            }))));
        }
        (setStatus("running", "Running..."),
          _setRunBtn(!0),
          socket.emit("run_code", e),
          saveHistory(e).catch((e) => console.warn("History save failed", e)));
      } else
        showToast(
          "Not connected to server. Ensure backend is running at http://localhost:5000 and refresh.",
        );
  } else (showToast("Please select a workspace mode first!"), openModeModal());
}
function stopRun() {
  (socket && socket.emit("stop_run"), _endRun({ stopped: !0 }));
}
function sendTerminalInput() {
  var e = document.getElementById("terminalInput"),
    t = e.value;
  ((e.value = ""),
    _removeCursor(),
    _appendTerminal(t + "\n", "input_echo"),
    _addCursor(),
    socket && socket.emit("send_input", { text: t }),
    e.focus());
}
function _endRun(e) {
  (_showLoadingOverlay((isRunning = !1)),
    _showInputBar(!1),
    _setRunBtn(!1),
    startTime &&
      ((t = ((Date.now() - startTime) / 1e3).toFixed(2)),
      (document.getElementById("execTime").textContent = t + "s"),
      (startTime = null)));
  var t = e && 0 === e.exit_code;
  (e &&
    e.stopped &&
    _appendTerminal("\n[Execution stopped by user]\n", "system"),
    setStatus(
      t ? "ready" : "error",
      t || (e && e.stopped) ? "Ready" : "Error",
    ));
}
function _appendTerminal(e, t) {
  var n = document.getElementById("terminalOutput");
  ((_termSpan && _termKind === t) ||
    (((_termSpan = document.createElement("span")).className = "term-" + t),
    n.appendChild(_termSpan),
    (_termKind = t)),
    (_termSpan.textContent += e),
    (n.scrollTop = n.scrollHeight));
}
function _addCursor() {
  var e;
  _termCursor ||
    ((e = document.getElementById("terminalOutput")),
    ((_termCursor = document.createElement("span")).className = "term-cursor"),
    e.appendChild(_termCursor),
    (e.scrollTop = e.scrollHeight));
}
function _removeCursor() {
  (_termCursor && (_termCursor.remove(), (_termCursor = null)),
    (_termSpan = null),
    (_termKind = null));
}
function _clearTerminalContent() {
  (document
    .getElementById("terminalOutput")
    .querySelectorAll("span")
    .forEach((e) => e.remove()),
    (_termSpan = null),
    (_termKind = null),
    (_termCursor = null));
}
function clearTerminal() {
  (_clearTerminalContent(),
    (document.getElementById("execTime").textContent = ""),
    (document.getElementById("terminalPlaceholder").style.display = "flex"));
}
function _showInputBar(e) {
  var t = document.getElementById("terminalInputBar"),
    n = document.getElementById("stopBtn");
  (t.classList.toggle("active", e),
    n && (n.style.display = e ? "" : "none"),
    e &&
      setTimeout(() => document.getElementById("terminalInput").focus(), 50));
}
function _setRunBtn(e) {
  var t = document.getElementById("runBtn"),
    n = document.getElementById("runBtnIcon"),
    o = document.getElementById("runBtnLabel");
  e
    ? (t.classList.add("running"),
      (n.innerHTML = '<rect x="4" y="4" width="16" height="16" rx="2"></rect>'),
      (o.textContent = "Running"),
      (t.onclick = stopRun))
    : (t.classList.remove("running"),
      (n.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>'),
      (o.textContent = "Run"),
      (t.onclick = runCode));
}
function _rippleBtn(e) {
  let t = document.createElement("span");
  (Object.assign(t.style, {
    position: "absolute",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.3)",
    pointerEvents: "none",
    width: "100px",
    height: "100px",
    marginTop: "-50px",
    marginLeft: "-50px",
    top: "50%",
    left: "50%",
    transform: "scale(0)",
    transition: "transform 0.5s ease, opacity 0.5s ease",
    opacity: "0.7",
  }),
    (e.style.position = "relative"),
    (e.style.overflow = "hidden"),
    e.appendChild(t),
    requestAnimationFrame(() => {
      ((t.style.transform = "scale(2.5)"), (t.style.opacity = "0"));
    }),
    setTimeout(() => t.remove(), 600));
}
function _showLoadingOverlay(e) {
  var t = document.getElementById("loadingOverlay"),
    n = t.querySelector(".loading-text"),
    o = document.getElementById("loadingLang"),
    a = ["c", "cpp", "java"].includes(currentLang);
  (n &&
    (n.innerHTML =
      (a ? "Compiling" : "Running") + '<span class="dots"></span>'),
    o &&
      (o.textContent =
        "multi" === appMode
          ? "Compiling project..."
          : `Executing ${langDisplayMap[currentLang]} code...`),
    t.classList.toggle("active", e));
}
function openModeModal() {
  var e = document.getElementById("modeOverlay");
  ((e.style.display = "flex"), e.classList.remove("hiding"));
}
function setMode(e) {
  appMode = e;
  let t = document.getElementById("modeOverlay");
  (t.classList.add("hiding"),
    setTimeout(() => {
      ((t.style.display = "none"), t.classList.remove("hiding"));
    }, 250),
    updateModeToggleBtn(),
    ("single" === e ? enableSingleFileMode : enableMultiFileMode)());
}
function updateModeToggleBtn() {
  var e = document.getElementById("modeToggleBtn"),
    t = document.getElementById("modeToggleLabel"),
    n = document.getElementById("modeToggleIcon");
  "single" === appMode
    ? ((t.textContent = "Single File"),
      e.classList.remove("multi-active"),
      (n.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'))
    : ((t.textContent = "Multi-File"),
      e.classList.add("multi-active"),
      (n.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>'));
}
function enableSingleFileMode() {
  var e;
  ((document.getElementById("fileTabsBar").style.display = "none"),
    (document.getElementById("editorPanelTitle").textContent = "Source Code"),
    (document.getElementById("resetBtn").style.display = ""),
    editor &&
      ((e = monaco.editor.createModel(
        templates[currentLang],
        monacoLangMap[currentLang],
      )),
      editor.setModel(e),
      editor.focus()),
    files.forEach((e) => {
      try {
        e.model.dispose();
      } catch (e) {}
    }),
    (files = []),
    (activeFileId = null),
    renderTabs());
}
function enableMultiFileMode() {
  ((document.getElementById("fileTabsBar").style.display = "flex"),
    (document.getElementById("editorPanelTitle").textContent = "Project Files"),
    (document.getElementById("resetBtn").style.display = "none"),
    (files = []));
  var e = monaco.editor.createModel(
      templates[currentLang],
      monacoLangMap[currentLang],
    ),
    t = generateId();
  (files.push({ id: t, name: getMainFileName(), model: e, isMain: !0 }),
    setActiveFile(t),
    renderTabs());
}
function getMainFileName() {
  return "java" === currentLang
    ? "Main.java"
    : "main." + langExtMap[currentLang];
}
function addNewFile() {
  var e = langExtMap[currentLang];
  let t = files.length,
    n = `file${t}.` + e;
  for (; files.some((e) => e.name === n); ) (t++, (n = `file${t}.` + e));
  var o = monaco.editor.createModel(
    "",
    monacoLangMap[currentLang] || "plaintext",
  );
  let a = generateId();
  (files.push({ id: a, name: n, model: o, isMain: !1 }),
    setActiveFile(a),
    renderTabs(),
    showToast(`✓ Added "${n}"`),
    setTimeout(() => startRename(a), 100));
}
function deleteFile(t) {
  var e,
    n = files.find((e) => e.id === t);
  if (!n || n.isMain) showToast("Cannot delete the main file");
  else {
    activeFileId === t &&
      0 < (e = files.filter((e) => e.id !== t)).length &&
      setActiveFile(e[0].id);
    try {
      n.model.dispose();
    } catch (e) {}
    ((files = files.filter((e) => e.id !== t)),
      renderTabs(),
      showToast(`Deleted "${n.name}"`));
  }
}
function setActiveFile(t) {
  activeFileId = t;
  var e,
    n = files.find((e) => e.id === t);
  n &&
    editor &&
    (editor.setModel(n.model),
    (e = n.name.split(".").pop().toLowerCase()),
    monaco.editor.setModelLanguage(n.model, extToMonaco[e] || "plaintext"),
    renderTabs(),
    editor.focus());
}
function renderTabs() {
  let o = document.getElementById("fileTabsScroll");
  var e;
  o &&
    ((o.innerHTML = ""),
    files.forEach((t) => {
      var e = document.createElement("button"),
        n =
          ((e.className =
            "file-tab" + (t.id === activeFileId ? " active" : "")),
          t.name.split(".").pop().toLowerCase());
      ((e.innerHTML =
        `
            <span class="file-tab-icon">${{ c: "🔵", h: "📋", cpp: "🔷", java: "☕", py: "🐍", js: "🟨", html: "🌐", css: "🎨", txt: "📄", md: "📝", json: "📦" }[n] || "📄"}</span>
            <span class="file-tab-name" title="${t.name}">${t.name}</span>
            ${t.isMain ? '<span class="file-tab-main-badge">MAIN</span>' : ""}
            ` +
        (t.isMain
          ? ""
          : `<button class="file-tab-close" onclick="event.stopPropagation();deleteFile('${t.id}')" title="Delete">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>`)),
        e.addEventListener("click", () => setActiveFile(t.id)),
        e.addEventListener("dblclick", (e) => {
          (e.stopPropagation(), startRename(t.id));
        }),
        o.appendChild(e));
    }),
    (e = o.querySelector(".file-tab.active"))) &&
    e.scrollIntoView({ behavior: "smooth", inline: "nearest" });
}
function startRename(t) {
  renameTargetId = t;
  var e,
    n,
    o = files.find((e) => e.id === t);
  o &&
    ((e = document.getElementById("renameOverlay")),
    (n = document.getElementById("renameInput")),
    (e.style.display = "flex"),
    (n.value = o.name),
    n.focus(),
    n.select());
}
function cancelRename() {
  ((document.getElementById("renameOverlay").style.display = "none"),
    (renameTargetId = null));
}
function confirmRename() {
  var e, t, n;
  let o = document.getElementById("renameInput").value.trim();
  o
    ? files.some((e) => e.id !== renameTargetId && e.name === o)
      ? showToast("Name already exists")
      : ((e = files.find((e) => e.id === renameTargetId)) &&
          ((t = e.name),
          (n = (e.name = o).split(".").pop().toLowerCase()),
          monaco.editor.setModelLanguage(
            e.model,
            extToMonaco[n] || "plaintext",
          ),
          renderTabs(),
          showToast(`Renamed "${t}" → "${o}"`)),
        cancelRename())
    : showToast("File name cannot be empty");
}
function selectLanguage(e, t) {
  e !== currentLang &&
    ((currentLang = e),
    document
      .querySelectorAll(".lang-pill")
      .forEach((e) => e.classList.remove("active")),
    t.classList.add("active"),
    (document.getElementById("langBadge").textContent = langDisplayMap[e]),
    "single" === appMode && editor
      ? editor.setModel(
          monaco.editor.createModel(templates[e], monacoLangMap[e]),
        )
      : "multi" === appMode &&
        (files.forEach((e) => {
          try {
            e.model.dispose();
          } catch (e) {}
        }),
        (files = []),
        (t = monaco.editor.createModel(templates[e], monacoLangMap[e])),
        (e = generateId()),
        files.push({ id: e, name: getMainFileName(), model: t, isMain: !0 }),
        setActiveFile(e),
        renderTabs()),
    clearTerminal());
}
function setStatus(e, t) {
  var n = document.getElementById("statusBadge"),
    o = document.getElementById("statusText");
  ((n.className = "status-badge " + ("ready" !== e ? e : "")),
    (o.textContent = t));
}
function showToast(e) {
  let t = document.getElementById("toast");
  ((t.textContent = e),
    t.classList.add("show"),
    setTimeout(() => t.classList.remove("show"), 2500));
}
function copyCode() {
  editor &&
    navigator.clipboard
      .writeText(editor.getValue())
      .then(() => showToast("✓ Code copied!"));
}
function resetCode() {
  editor &&
    "single" === appMode &&
    (editor.setModel(
      monaco.editor.createModel(
        templates[currentLang],
        monacoLangMap[currentLang],
      ),
    ),
    showToast("↺ Reset to template"));
}
function clearAll() {
  ("single" === appMode && editor
    ? editor.setValue("")
    : "multi" === appMode && files.forEach((e) => e.model.setValue("")),
    clearTerminal(),
    (document.getElementById("execTime").textContent = ""),
    showToast("Cleared"));
}
function setAuthState(e, t) {
  ((currentUser = e),
    (authToken = t)
      ? (localStorage.setItem("syntaxiaAuthToken", t),
        localStorage.setItem("syntaxiaUser", e),
        (document.getElementById("loginBtn").title = "Logout"),
        (document.getElementById("loginBtn").textContent = e))
      : (localStorage.removeItem("syntaxiaAuthToken"),
        localStorage.removeItem("syntaxiaUser"),
        (document.getElementById("loginBtn").title = "Login"),
        (document.getElementById("loginBtn").innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path></svg>')));
}
function openLoginModal() {
  currentUser
    ? logout()
    : ((document.getElementById("authOverlay").style.display = "flex"),
      (document.getElementById("authTitle").textContent =
        "login" === authMode ? "Sign In" : "Register"),
      (document.getElementById("authSubmitBtn").textContent =
        "login" === authMode ? "Login" : "Register"),
      (document.getElementById("authMessage").textContent = ""));
}
function closeAuthModal() {
  ((document.getElementById("authOverlay").style.display = "none"),
    (document.getElementById("authUsername").value = ""),
    (document.getElementById("authPassword").value = ""));
}
function switchAuthMode() {
  ((authMode = "login" === authMode ? "register" : "login"),
    (document.getElementById("authTitle").textContent =
      "login" === authMode ? "Sign In" : "Register"),
    (document.getElementById("authSubmitBtn").textContent =
      "login" === authMode ? "Login" : "Register"),
    (document.getElementById("authSwitchBtn").textContent =
      "login" === authMode ? "Need an account?" : "Already have an account?"));
}
async function submitAuth() {
  var e,
    t = document.getElementById("authUsername").value.trim(),
    n = document.getElementById("authPassword").value,
    o = document.getElementById("authMessage");
  t && n
    ? ((e = "login" === authMode ? "/api/login" : "/api/register"),
      (t = await (e = await fetch(e, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: t, password: n }),
      })).json()),
      e.ok && t.ok
        ? ("register" === authMode
            ? ((o.textContent = "Registered. You can login now."),
              (authMode = "login"),
              switchAuthMode)
            : (setAuthState(t.username, t.token),
              (o.textContent = ""),
              closeAuthModal(),
              showToast(`Welcome ${t.username}!`),
              loadHistory))()
        : (o.textContent = t.error || "Authentication failed"))
    : (o.textContent = "Enter both username and password.");
}
async function logout() {
  (await fetch("/api/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": authToken || "",
    },
    body: JSON.stringify({ token: authToken }),
  }),
    setAuthState(null, null),
    (currentUser = null),
    showToast("Logged out"));
}
async function checkAuthToken() {
  var e,
    t,
    n = localStorage.getItem("syntaxiaAuthToken"),
    o = localStorage.getItem("syntaxiaUser");
  n &&
    o &&
    ((t = await (e = await fetch("/api/me", {
      headers: { "X-Auth-Token": n },
    })).json()),
    e.ok && t.ok && t.username === o
      ? (setAuthState(o, n), loadHistory())
      : setAuthState(null, null));
}
async function saveHistory(e) {
  currentUser &&
    authToken &&
    (await fetch("/api/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": authToken,
      },
      body: JSON.stringify(e),
    }),
    loadHistory());
}
async function loadHistory() {
  if (currentUser && authToken) {
    var e = await fetch("/api/history", {
        headers: { "X-Auth-Token": authToken },
      }),
      t = await e.json();
    let o = document.getElementById("historyList");
    e.ok && t.ok
      ? t.history.length
        ? ((o.innerHTML = ""),
          (window.cachedHistory = t.history),
          t.history.forEach((e, t) => {
            var n = document.createElement("div");
            ((n.className = "history-card-item"),
              (n.style.cursor = "pointer"),
              (n.onclick = () => openCodeViewer(t)),
              (n.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h4 style="margin:0; font-size:0.95rem; font-weight:600;">${e.language.toUpperCase()} (${e.mode})</h4>
                <span style="font-size:0.8rem; color:var(--text-muted);">${new Date(e.timestamp).toLocaleString()}</span>
            </div>
            <p style="margin:0; font-size:0.85rem; font-family:'JetBrains Mono', monospace; color:var(--text-secondary); opacity:0.8; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">
                ${(e.code || "").slice(0, 280)}
            </p>
        `),
              o.appendChild(n));
          }))
        : (o.innerHTML =
            "<p>No history yet. Run some code to record your sessions.</p>")
      : (o.innerHTML = "<p>Unable to load history.</p>");
  }
}
function toggleHistoryModal() {
  var e = document.getElementById("historyOverlay"),
    t = "flex" === e.style.display;
  ((e.style.display = t ? "none" : "flex"), t || loadHistory());
}
function toggleTheme() {
  ((isDark = !isDark),
    (document.getElementById("body").className = isDark ? "dark" : "light"),
    editor &&
      monaco.editor.setTheme(isDark ? "syntaxia-dark" : "syntaxia-light"));
  var e = document.getElementById("themeIcon");
  isDark
    ? (e.innerHTML =
        '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>')
    : (e.innerHTML = `<circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`);
}
function generateId() {
  return Math.random().toString(36).slice(2, 10);
}
function downloadFile() {
  if (editor) {
    let e = "",
      t = "";
    if ("single" === appMode)
      ((e = editor.getValue()), (t = "main." + langExtMap[currentLang]));
    else {
      var a = files.find((e) => e.id === activeFileId);
      if (!a) return;
      ((e = a.model.getValue()), (t = a.name));
    }
    a = new Blob([e], { type: "text/plain" });
    let n = URL.createObjectURL(a),
      o = document.createElement("a");
    ((o.href = n),
      (o.download = t),
      document.body.appendChild(o),
      o.click(),
      setTimeout(() => {
        (document.body.removeChild(o), window.URL.revokeObjectURL(n));
      }, 0),
      showToast("✓ Downloaded " + t));
  }
}
function saveWorkspace() {
  if (editorReady && appMode) {
    let e = {};
    try {
      e = JSON.parse(localStorage.getItem("syntaxiaWorkspace") || "{}");
    } catch (e) {}
    (e.singleCodeMap || (e.singleCodeMap = {}),
      e.multiFilesMap || (e.multiFilesMap = {}),
      (e.mode = appMode),
      (e.lang = currentLang),
      "single" === appMode
        ? (e.singleCodeMap[currentLang] = editor.getValue())
        : (e.multiFilesMap[currentLang] = files.map((e) => ({
            name: e.name,
            content: e.model.getValue(),
            isMain: e.isMain,
          }))),
      localStorage.setItem("syntaxiaWorkspace", JSON.stringify(e)));
  }
}
function loadWorkspace() {
  var e = localStorage.getItem("syntaxiaWorkspace");
  if (e)
    try {
      var t,
        n = JSON.parse(e);
      "single" === appMode
        ? n.singleCodeMap &&
          n.singleCodeMap[currentLang] &&
          editor.setValue(n.singleCodeMap[currentLang])
        : "multi" === appMode &&
          n.multiFilesMap &&
          n.multiFilesMap[currentLang] &&
          n.multiFilesMap[currentLang].length &&
          (files.forEach((e) => {
            try {
              e.model.dispose();
            } catch (e) {}
          }),
          (files = []),
          n.multiFilesMap[currentLang].forEach((e) => {
            var t = monaco.editor.createModel(
              e.content,
              extToMonaco[e.name.split(".").pop().toLowerCase()] || "plaintext",
            );
            files.push({
              id: generateId(),
              name: e.name,
              model: t,
              isMain: e.isMain,
            });
          }),
          (t = files.find((e) => e.isMain) || files[0]) && setActiveFile(t.id),
          renderTabs());
    } catch (e) {
      console.error("Failed to load workspace", e);
    }
}
(require.config({
  paths: {
    vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs",
  },
}),
  require(["vs/editor/editor.main"], function () {
    (monaco.editor.defineTheme("syntaxia-dark", {
      base: "vs-dark",
      inherit: !0,
      rules: [
        { token: "comment", foreground: "4a5568", fontStyle: "italic" },
        { token: "keyword", foreground: "38bdf8", fontStyle: "bold" },
        { token: "string", foreground: "34d399" },
        { token: "number", foreground: "fbbf24" },
        { token: "type", foreground: "a78bfa" },
      ],
      colors: {
        "editor.background": "#0a0a0f",
        "editor.foreground": "#e2e8f0",
        "editor.lineHighlightBackground": "#0d1524",
        "editor.selectionBackground": "#1e40af55",
        "editorLineNumber.foreground": "#2d3748",
        "editorLineNumber.activeForeground": "#38bdf8",
        "editorCursor.foreground": "#38bdf8",
        "editorGutter.background": "#0a0a0f",
      },
    }),
      monaco.editor.defineTheme("syntaxia-light", {
        base: "vs",
        inherit: !0,
        rules: [],
        colors: {
          "editor.background": "#f8fafc",
          "editor.foreground": "#0f172a",
          "editor.lineHighlightBackground": "#f1f5f9",
          "editorLineNumber.foreground": "#cbd5e1",
          "editorLineNumber.activeForeground": "#2563eb",
          "editorCursor.foreground": "#2563eb",
          "editorGutter.background": "#f8fafc",
        },
      }),
      (editor = monaco.editor.create(document.getElementById("editor"), {
        value: templates.c,
        language: "c",
        theme: "syntaxia-dark",
        automaticLayout: !0,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        fontLigatures: !0,
        minimap: { enabled: !1 },
        scrollBeyondLastLine: !1,
        lineNumbers: "on",
        glyphMargin: !1,
        folding: !0,
        renderWhitespace: "none",
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        smoothScrolling: !0,
        padding: { top: 14, bottom: 14 },
        overviewRulerLanes: 0,
        scrollbar: {
          vertical: "auto",
          horizontal: "auto",
          verticalScrollbarSize: 5,
          horizontalScrollbarSize: 5,
        },
      })),
      (editorReady = !0),
      "undefined" != typeof io
        ? _initSocket()
        : (console.error("Socket.IO library not loaded!"),
          setStatus("error", "Library load failed"),
          setTimeout(() => {
            "undefined" == typeof io
              ? (console.error("Socket.IO library still not available"),
                setStatus("error", "Offline"))
              : _initSocket();
          }, 1e3)),
      (document.getElementById("modeOverlay").style.display = "flex"));
  }),
  document.addEventListener("DOMContentLoaded", () => {
    var e = document.getElementById("renameInput"),
      e =
        (e &&
          e.addEventListener("keydown", (e) => {
            ("Enter" === e.key && confirmRename(),
              "Escape" === e.key && cancelRename());
          }),
        document.getElementById("terminalInput"));
    e &&
      e.addEventListener("keydown", (e) => {
        "Enter" === e.key && (e.preventDefault(), sendTerminalInput());
      });
  }),
  window.addEventListener("load", checkAuthToken),
  document.addEventListener("keydown", function (e) {
    ((e.ctrlKey || e.metaKey) &&
      "Enter" === e.key &&
      (e.preventDefault(), runCode()),
      "Escape" === e.key && (_showLoadingOverlay(!1), cancelRename()));
  }),
  (() => {
    let a = document.getElementById("particles"),
      i = a.getContext("2d");
    function e() {
      ((a.width = window.innerWidth), (a.height = window.innerHeight));
    }
    (e(), window.addEventListener("resize", e));
    class t {
      constructor() {
        this.init();
      }
      init(e = !1) {
        ((this.x = Math.random() * a.width),
          (this.y = e ? -2 : Math.random() * a.height),
          (this.r = 1.4 * Math.random() + 0.2),
          (this.base = 0.65 * Math.random() + 0.25),
          (this.alpha = this.base),
          (this.phase = Math.random() * Math.PI * 2),
          (this.speed = 0.012 * Math.random() + 0.003));
      }
      update(e) {
        ((this.alpha =
          this.base + 0.28 * Math.sin(e * this.speed * 60 + this.phase)),
          (this.alpha = Math.max(0.05, Math.min(1, this.alpha))));
      }
      draw() {
        (i.beginPath(),
          i.arc(this.x, this.y, this.r, 0, 2 * Math.PI),
          (i.fillStyle = `rgba(255,255,255,${this.alpha})`),
          i.fill(),
          0.9 < this.r &&
            (i.beginPath(),
            i.arc(this.x, this.y, 3 * this.r, 0, 2 * Math.PI),
            (i.fillStyle = `rgba(200,220,255,${0.12 * this.alpha})`),
            i.fill()));
      }
    }
    class n {
      constructor() {
        ((this.active = !1), (this.delay = 300 * Math.random() + 80));
      }
      update() {
        this.active
          ? ((this.x += this.vx),
            (this.y += this.vy),
            this.life--,
            (this.life <= 0 || this.y > a.height || this.x > a.width) &&
              ((this.active = !1), (this.delay = 500 * Math.random() + 200)))
          : --this.delay <= 0 && this._spawn();
      }
      _spawn() {
        ((this.x = Math.random() * a.width * 0.75),
          (this.y = Math.random() * a.height * 0.35));
        var e = 9 * Math.random() + 7,
          t = ((20 * Math.random() + 18) * Math.PI) / 180;
        ((this.vx = Math.cos(t) * e),
          (this.vy = Math.sin(t) * e),
          (this.life = this.maxLife = 28 * Math.random() + 18),
          (this.active = !0));
      }
      draw() {
        var e, t;
        this.active &&
          ((e = this.life / this.maxLife),
          (t = i.createLinearGradient(
            this.x - 12 * this.vx,
            this.y - 12 * this.vy,
            this.x,
            this.y,
          )).addColorStop(0, "rgba(255,255,255,0)"),
          t.addColorStop(1, `rgba(255,255,255,${0.9 * e})`),
          i.beginPath(),
          i.moveTo(this.x - 12 * this.vx, this.y - 12 * this.vy),
          i.lineTo(this.x, this.y),
          (i.strokeStyle = t),
          (i.lineWidth = 1.8),
          i.stroke(),
          i.beginPath(),
          i.arc(this.x, this.y, 1.5, 0, 2 * Math.PI),
          (i.fillStyle = `rgba(255,255,255,${e})`),
          i.fill());
      }
    }
    class o {
      constructor() {
        this._reset();
      }
      _reset() {
        ((this.x = Math.random() * a.width),
          (this.y = Math.random() * a.height),
          (this.vx = 0.45 * (Math.random() - 0.5)),
          (this.vy = 0.45 * (Math.random() - 0.5)),
          (this.r = 2 * Math.random() + 0.5),
          (this.a = 0.25 * Math.random() + 0.08));
      }
      move() {
        ((this.x += this.vx),
          (this.y += this.vy),
          (this.x < 0 || this.x > a.width) && (this.vx *= -1),
          (this.y < 0 || this.y > a.height) && (this.vy *= -1));
      }
      draw() {
        (i.beginPath(),
          i.arc(this.x, this.y, this.r, 0, 2 * Math.PI),
          (i.fillStyle = `rgba(15,23,80,${this.a})`),
          i.fill());
      }
    }
    let r = Array.from({ length: 200 }, () => new t()),
      l = Array.from({ length: 3 }, () => new n()),
      s = Array.from({ length: 70 }, () => new o()),
      d = 0;
    !(function e() {
      if ((i.clearRect(0, 0, a.width, a.height), d++, isDark))
        (r.forEach((e) => {
          (e.update(d), e.draw());
        }),
          l.forEach((e) => {
            (e.update(), e.draw());
          }));
      else {
        for (let t = 0; t < s.length; t++)
          for (let e = t + 1; e < s.length; e++) {
            var n = s[t].x - s[e].x,
              o = s[t].y - s[e].y;
            (n = Math.sqrt(n * n + o * o)) < 120 &&
              (i.beginPath(),
              i.moveTo(s[t].x, s[t].y),
              i.lineTo(s[e].x, s[e].y),
              (i.strokeStyle = `rgba(15,23,80,${0.07 * (1 - n / 120)})`),
              (i.lineWidth = 0.5),
              i.stroke());
          }
        s.forEach((e) => {
          (e.move(), e.draw());
        });
      }
      requestAnimationFrame(e);
    })();
  })(),
  setInterval(saveWorkspace, 3e3));
let commands = [
  { name: "Run Code", action: runCode, icon: "▶" },
  { name: "Clear Terminal", action: clearTerminal, icon: "🧹" },
  {
    name: "Switch to Single File Mode",
    action: () => setMode("single"),
    icon: "📄",
  },
  {
    name: "Switch to Multi-File Mode",
    action: () => setMode("multi"),
    icon: "📂",
  },
  {
    name: "Switch Language: C",
    action: () => document.querySelector('.lang-pill[data-lang="c"]').click(),
    icon: "⚙",
  },
  {
    name: "Switch Language: C++",
    action: () => document.querySelector('.lang-pill[data-lang="cpp"]').click(),
    icon: "⚙",
  },
  {
    name: "Switch Language: Java",
    action: () =>
      document.querySelector('.lang-pill[data-lang="java"]').click(),
    icon: "☕",
  },
  {
    name: "Switch Language: Python",
    action: () =>
      document.querySelector('.lang-pill[data-lang="python"]').click(),
    icon: "🐍",
  },
  { name: "Toggle Theme", action: toggleTheme, icon: "🌓" },
  { name: "Download Code", action: downloadFile, icon: "⬇" },
  {
    name: "Back to Dashboard",
    action: () => (window.location.href = "/"),
    icon: "🏠",
  },
];
function togglePalette() {
  var e,
    t = document.getElementById("paletteOverlay");
  t &&
    ("none" === t.style.display
      ? ((t.style.display = "flex"),
        renderPalette(
          ((e = document.getElementById("paletteInput")).value = ""),
        ),
        e.focus())
      : ((t.style.display = "none"), editor && editor.focus()));
}
function renderPalette(e) {
  let o = document.getElementById("paletteResults");
  if (o) {
    o.innerHTML = "";
    let t = e.toLowerCase();
    e = commands.filter((e) => e.name.toLowerCase().includes(t));
    0 === e.length
      ? (o.innerHTML =
          '<div style="padding: 1rem; color: var(--text-muted); text-align: center;">No matching commands found.</div>')
      : e.forEach((e, t) => {
          let n = document.createElement("div");
          ((n.className = "palette-item" + (0 === t ? " focused" : "")),
            (n.innerHTML = `<span style="margin-right:0.75rem">${e.icon}</span><span>${e.name}</span>`),
            (n.onclick = () => {
              (togglePalette(), e.action());
            }),
            (n.onmouseover = () => {
              (o
                .querySelectorAll(".palette-item")
                .forEach((e) => e.classList.remove("focused")),
                n.classList.add("focused"));
            }),
            o.appendChild(n));
        });
  }
}
document.addEventListener("keydown", (e) => {
  (e.ctrlKey || e.metaKey) &&
    "k" === e.key.toLowerCase() &&
    (e.preventDefault(), togglePalette());
});
let pInput = document.getElementById("paletteInput"),
  pOverlay =
    (pInput &&
      (pInput.addEventListener("input", (e) => renderPalette(e.target.value)),
      pInput.addEventListener("keydown", (e) => {
        var t, n;
        ("Escape" === e.key && togglePalette(),
          "Enter" === e.key &&
            (t = document.querySelector(".palette-item.focused")) &&
            t.click(),
          "ArrowDown" === e.key &&
            (e.preventDefault(),
            (n = (t = Array.from(
              document.querySelectorAll(".palette-item"),
            )).findIndex((e) => e.classList.contains("focused"))) <
              t.length - 1) &&
            (0 <= n && t[n].classList.remove("focused"),
            t[n + 1].classList.add("focused"),
            t[n + 1].scrollIntoView({ block: "nearest" })),
          "ArrowUp" === e.key &&
            (e.preventDefault(),
            0 <
              (n = (t = Array.from(
                document.querySelectorAll(".palette-item"),
              )).findIndex((e) => e.classList.contains("focused")))) &&
            (t[n].classList.remove("focused"),
            t[n - 1].classList.add("focused"),
            t[n - 1].scrollIntoView({ block: "nearest" })));
      })),
    document.getElementById("paletteOverlay")),
  updateFromUrl =
    (pOverlay &&
      pOverlay.addEventListener("click", (e) => {
        "paletteOverlay" === e.target.id && togglePalette();
      }),
    () => {
      let o = new URLSearchParams(window.location.search);
      o.has("mode") || o.has("lang")
        ? setTimeout(() => {
            var e = o.get("mode") || "single",
              t = o.get("lang") || "python",
              n = document.querySelector(`.lang-pill[data-lang="${t}"]`),
              t =
                (n && selectLanguage(t, n),
                setMode(e),
                document.getElementById("modeOverlay"));
            (t && (t.style.display = "none"), setTimeout(loadWorkspace, 100));
          }, 500)
        : setTimeout(loadWorkspace, 500);
    });
function openProfileModal() {
  ((document.getElementById("profileOverlay").style.display = "flex"),
    (document.getElementById("profileUsername").value = currentUser || ""),
    (document.getElementById("profileMessage").textContent = ""),
    (document.getElementById("profileDropdown").style.display = "none"));
}
function closeProfileModal() {
  document.getElementById("profileOverlay").style.display = "none";
}
async function updateUsername() {
  var e,
    t,
    n = document.getElementById("profileUsername").value.trim();
  n &&
    ((e = document.getElementById("profileMessage")),
    (t = await (n = await fetch("/api/update_username", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": authToken,
      },
      body: JSON.stringify({ new_username: n }),
    })).json()),
    n.ok && t.ok
      ? (setAuthState(t.username, authToken),
        closeProfileModal(),
        showToast("Username updated successfully!"))
      : (e.textContent = t.error || "Failed to update"));
}
function openCodeViewer(e) {
  window.cachedHistory &&
    (e = window.cachedHistory[e]) &&
    ((document.getElementById("codeViewerBody").textContent = e.code || ""),
    (document.getElementById("codeViewerOverlay").style.display = "flex"));
}
function closeCodeViewer() {
  document.getElementById("codeViewerOverlay").style.display = "none";
}
function copyCodeViewerContent() {
  var e = document.getElementById("codeViewerBody").textContent;
  navigator.clipboard
    .writeText(e)
    .then(() => {
      showToast("Code copied to clipboard!");
    })
    .catch((e) => {
      showToast("Failed to copy");
    });
}
(window.addEventListener("load", updateFromUrl), (window.cachedHistory = []));
