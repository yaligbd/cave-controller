(function () {
  const TOKEN_KEY = "cavebat_token";

  const authSection = document.getElementById("auth-section");
  const appSection = document.getElementById("app-section");

  const authTitle = document.getElementById("auth-title");
  const authToggle = document.getElementById("auth-toggle");
  const authForm = document.getElementById("auth-form");
  const authSubmit = document.getElementById("auth-submit");
  const authError = document.getElementById("auth-error");

  const versionValue = document.getElementById("version-value");
  const releaseNotes = document.getElementById("release-notes");
  const downloadBtn = document.getElementById("download-btn");
  const downloadError = document.getElementById("download-error");
  const logoutBtn = document.getElementById("logout-btn");

  let mode = "login"; // or "signup"

  function setMode(next) {
    mode = next;
    authError.hidden = true;
    if (mode === "login") {
      authTitle.textContent = "LOG IN";
      authSubmit.textContent = "LOG IN";
      authToggle.textContent = "need an account?";
    } else {
      authTitle.textContent = "SIGN UP";
      authSubmit.textContent = "SIGN UP";
      authToggle.textContent = "have an account?";
    }
  }

  authToggle.addEventListener("click", () => {
    setMode(mode === "login" ? "signup" : "login");
  });

  function showError(el, message) {
    el.textContent = message;
    el.hidden = false;
  }

  function hideError(el) {
    el.hidden = true;
  }

  async function loadVersion() {
    try {
      const res = await fetch("/api/version");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load version info");
      versionValue.textContent = data.version;
      releaseNotes.textContent = data.releaseNotes;
    } catch (err) {
      versionValue.textContent = "unavailable";
      releaseNotes.textContent = err.message;
    }
  }

  function showApp() {
    authSection.hidden = true;
    appSection.hidden = false;
    hideError(downloadError);
    loadVersion();
  }

  function showAuth() {
    appSection.hidden = true;
    authSection.hidden = false;
  }

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError(authError);
    authSubmit.disabled = true;

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const endpoint = mode === "login" ? "/api/login" : "/api/register";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      localStorage.setItem(TOKEN_KEY, data.token);
      authForm.reset();
      showApp();
    } catch (err) {
      showError(authError, err.message);
    } finally {
      authSubmit.disabled = false;
    }
  });

  downloadBtn.addEventListener("click", async () => {
    hideError(downloadError);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      showAuth();
      return;
    }

    try {
      const res = await fetch("/api/download", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          showAuth();
        }
        throw new Error(data.error || "Download failed");
      }
      window.location.href = data.apkUrl;
    } catch (err) {
      showError(downloadError, err.message);
    }
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    setMode("login");
    showAuth();
  });

  // Initial state
  setMode("login");
  if (localStorage.getItem(TOKEN_KEY)) {
    showApp();
  } else {
    showAuth();
  }
})();
