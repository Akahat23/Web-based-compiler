let currentUser = null,
  authToken = null,
  authMode = "login",
  isDark = !0;
function showToast(e) {
  let t = document.getElementById("toast");
  ((t.textContent = e),
    t.classList.add("show"),
    setTimeout(() => t.classList.remove("show"), 2500));
}
function setAuthState(e, t, n = "") {
  ((currentUser = e), (authToken = t));
  var o = document.getElementById("loginBtn"),
    a = document.getElementById("userProfileWidget"),
    i = document.getElementById("welcomeTitle"),
    l = document.getElementById("historySection");
  t
    ? (localStorage.setItem("syntaxiaAuthToken", t),
      localStorage.setItem("syntaxiaUser", e),
      n
        ? localStorage.setItem("syntaxiaFullName", n)
        : localStorage.removeItem("syntaxiaFullName"),
      (o.style.display = "none"),
      (a.style.display = "flex"),
      (t = n || e.split("@")[0]),
      (document.getElementById("usernameText").textContent = t),
      (document.getElementById("userAvatar").textContent = t
        .charAt(0)
        .toUpperCase()),
      i && (i.textContent = "Welcome back, " + t),
      (l.style.display = "block"),
      loadDashboardHistory())
    : (localStorage.removeItem("syntaxiaAuthToken"),
      localStorage.removeItem("syntaxiaUser"),
      localStorage.removeItem("syntaxiaFullName"),
      (o.style.display = "flex"),
      (a.style.display = "none"),
      i && (i.textContent = "Welcome to Syntaxia"),
      (l.style.display = "none"));
}
function toggleProfileMenu() {
  var e = document.getElementById("profileDropdown");
  e.style.display = "none" === e.style.display ? "flex" : "none";
}
function openLoginModal() {
  ((document.getElementById("authOverlay").style.display = "flex"),
    (document.getElementById("authTitle").textContent =
      "login" === authMode ? "Sign In" : "Register"),
    (document.getElementById("authSubmitBtn").textContent =
      "login" === authMode ? "Login" : "Register"),
    (document.getElementById("authMessage").textContent = ""));
}
function closeAuthModal() {
  ((document.getElementById("authOverlay").style.display = "none"),
    (document.getElementById("authUsername").value = ""),
    (document.getElementById("authPassword").value = ""),
    document.getElementById("authEmail") &&
      (document.getElementById("authEmail").value = ""),
    document.getElementById("authFullName") &&
      (document.getElementById("authFullName").value = ""));
}
function switchAuthMode() {
  ((authMode = "login" === authMode ? "register" : "login"),
    (document.getElementById("authTitle").textContent =
      "login" === authMode ? "Sign In" : "Register"),
    (document.getElementById("authSubmitBtn").textContent =
      "login" === authMode ? "Login" : "Register"),
    (document.getElementById("authSwitchBtn").textContent =
      "login" === authMode ? "Need an account?" : "Already have an account?"),
    document.getElementById("authEmail") &&
      (document.getElementById("authEmail").style.display =
        "login" === authMode ? "none" : "block"),
    document.getElementById("authFullName") &&
      (document.getElementById("authFullName").style.display =
        "login" === authMode ? "none" : "block"),
    (document.getElementById("authUsername").placeholder =
      "login" === authMode ? "Email or Username" : "Username"));
}
async function submitAuth() {
  var e,
    t = document.getElementById("authUsername").value.trim(),
    n = document.getElementById("authPassword").value,
    o = document.getElementById("authEmail")
      ? document.getElementById("authEmail").value.trim()
      : "",
    a = document.getElementById("authFullName")
      ? document.getElementById("authFullName").value.trim()
      : "",
    i = document.getElementById("authMessage");
  t && n
    ? "register" !== authMode || (o && a)
      ? ((e = "login" === authMode ? "/api/login" : "/api/register"),
        (t =
          "login" === authMode
            ? { username: t, password: n }
            : { username: t, password: n, email: o, full_name: a }),
        (o = await (n = await fetch(e, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        })).json()),
        n.ok && o.ok
          ? "register" === authMode
            ? ((i.textContent = "Registered. You can login now."),
              (authMode = "login"),
              switchAuthMode())
            : (setAuthState(o.username, o.token, o.full_name),
              (i.textContent = ""),
              closeAuthModal(),
              showToast(`Welcome ${o.username}!`))
          : (i.textContent = o.error || "Authentication failed"))
      : (i.textContent = "Enter email and full name to register.")
    : (i.textContent = "Enter both username and password.");
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
    showToast("Logged out"),
    (document.getElementById("profileDropdown").style.display = "none"));
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
      ? setAuthState(o, n, t.full_name)
      : setAuthState(null, null));
}
async function loadDashboardHistory() {
  if (currentUser && authToken) {
    var e = await fetch("/api/history", {
        headers: { "X-Auth-Token": authToken },
      }),
      t = await e.json();
    let i = document.getElementById("dashboardHistoryList");
    e.ok && t.ok
      ? t.history.length
        ? ((i.innerHTML = ""),
          (e = t.history.slice(0, 6)),
          (window.cachedDashboardHistory = e).forEach((e, t) => {
            var n = document.createElement("div"),
              o =
                ((n.className = "dashboard-history-card"),
                new Date(e.timestamp)),
              a = Math.floor((new Date() - o) / 6e4),
              a =
                a < 60
                  ? a + "m ago"
                  : a < 1440
                    ? Math.floor(a / 60) + "h ago"
                    : o.toLocaleDateString();
            ((n.innerHTML = `
            <div class="hist-card-header">
                <span class="hist-lang badge-${e.language}">${e.language.toUpperCase()}</span>
                <span class="hist-mode">${"multi" === e.mode ? "Workspace" : "Single"}</span>
            </div>
            <p class="hist-code" style="cursor:pointer;" onclick="openCodeViewer(${t})" title="Click to view full code">${(e.code || "").replace(/</g, "&lt;").slice(0, 60)}...</p>
            <div class="hist-meta">
                <span>${a}</span>
                <div class="hist-card-actions">
                    <button class="mini-btn" onclick="openCodeViewer(${t})">View</button>
                    <button class="mini-btn" onclick="window.location.href='/compiler?lang=${e.language}&mode=${e.mode}'">Open</button>
                </div>
            </div>
        `),
              i.appendChild(n));
          }))
        : (i.innerHTML =
            '<p class="text-muted">No history yet. Start coding below!</p>')
      : (i.innerHTML = '<p class="text-error">Unable to load history.</p>');
  }
}
function openCodeViewer(e) {
  window.cachedDashboardHistory &&
    (e = window.cachedDashboardHistory[e]) &&
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
function toggleTheme() {
  ((isDark = !isDark),
    (document.getElementById("body").className = isDark ? "dark" : "light"));
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
(document.addEventListener("click", (e) => {
  var t = document.getElementById("userProfileWidget"),
    n = document.getElementById("profileDropdown");
  t &&
    n &&
    !t.contains(e.target) &&
    !n.contains(e.target) &&
    (n.style.display = "none");
}),
  (window.cachedDashboardHistory = []),
  window.addEventListener("load", checkAuthToken),
  (() => {
    let i = document.getElementById("particles");
    if (i) {
      let t = i.getContext("2d"),
        o = -1e3,
        a = -1e3;
      (window.addEventListener("mousemove", (e) => {
        ((o = e.clientX), (a = e.clientY));
      }),
        window.addEventListener("mouseout", () => {
          ((o = -1e3), (a = -1e3));
        }),
        e(),
        window.addEventListener("resize", e));
      class l {
        constructor() {
          this.init(!0);
        }
        init(e = !1) {
          ((this.x = Math.random() * i.width),
            (this.y = e ? Math.random() * i.height : -10),
            (this.r = 1.5 * Math.random() + 0.5),
            (this.baseAlpha = 0.6 * Math.random() + 0.2),
            (this.alpha = this.baseAlpha),
            (this.vx = 0),
            (this.vy = 0.5 * Math.random() + 0.2));
        }
        update() {
          var e = o - this.x,
            t = a - this.y,
            n = Math.sqrt(e * e + t * t);
          (n < 150 && 40 < n
            ? ((this.vx += (e / n) * 0.02),
              (this.vy += (t / n) * 0.02),
              (this.alpha = Math.min(1, this.baseAlpha + 0.4)))
            : n <= 40
              ? ((this.vx -= (e / n) * 0.2),
                (this.vy -= (t / n) * 0.2),
                (this.alpha = 1))
              : (this.alpha = this.baseAlpha),
            (this.vx *= 0.96),
            (this.vy = 0.98 * this.vy + 0.01),
            (this.x += this.vx),
            (this.y += this.vy),
            (this.y > i.height + 10 || this.x < -10 || this.x > i.width + 10) &&
              this.init());
        }
        draw() {
          (t.beginPath(),
            t.arc(this.x, this.y, this.r, 0, 2 * Math.PI),
            (t.fillStyle = `rgba(255,255,255,${this.alpha})`),
            t.fill());
        }
      }
      let n = Array.from({ length: 150 }, () => new l());
      function e() {
        ((i.width = window.innerWidth), (i.height = window.innerHeight));
      }
      !(function e() {
        (t.clearRect(0, 0, i.width, i.height),
          n.forEach((e) => {
            (e.update(), e.draw());
          }),
          requestAnimationFrame(e));
      })();
    }
  })());
let tips = [
  "Use the Ctrl+K shortcut in the editor to summon the Command Palette instantly!",
  "Switching languages won't lose your code—we save your progress autonomously behind the scenes.",
  "Click on any of your History cards to instantly view and copy old snippets.",
  "Hover over elements with a 3D effect to see the gradient light perfectly track your mouse.",
  "Writing in C or Java? The multi-file workspace automatically links to your main file!",
];
function nextTip() {
  let n = document.getElementById("tipContent");
  ((n.style.opacity = "0"),
    setTimeout(() => {
      var e = n.textContent;
      let t;
      for (; (t = tips[Math.floor(Math.random() * tips.length)]) === e; );
      ((n.textContent = t), (n.style.opacity = "1"));
    }, 250));
}
function tilt(e, t) {
  var n = t.getBoundingClientRect(),
    o = e.clientX - n.left,
    e = e.clientY - n.top,
    a =
      (t.style.setProperty("--mouse-x", o + "px"),
      t.style.setProperty("--mouse-y", e + "px"),
      n.width / 2),
    n = n.height / 2;
  t.style.transform = `perspective(1000px) rotateX(${((e - n) / n) * -8}deg) rotateY(${((o - a) / a) * 8}deg) scale3d(1.02, 1.02, 1.02)`;
}
function resetTilt(e) {
  e.style.transform =
    "perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)";
}
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".stat-num").forEach((o) => {
    let a = +o.getAttribute("data-target");
    if (a) {
      let e = a / 60,
        t = 0,
        n = () => {
          (t += e) < a
            ? ((o.innerText = Math.ceil(t).toLocaleString()),
              requestAnimationFrame(n))
            : (o.innerText = a.toLocaleString());
        };
      n();
    }
  });
});
