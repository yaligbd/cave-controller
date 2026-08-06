(function () {
  const TOKEN_KEY = "cavebat_token";
  const STEP_KEY = "cavebat_onboarding_step";
  const TOTAL_STEPS = 5;

  const authSection = document.getElementById("auth-section");
  const onboardingSection = document.getElementById("onboarding-section");

  const authTitle = document.getElementById("auth-title");
  const authToggle = document.getElementById("auth-toggle");
  const authForm = document.getElementById("auth-form");
  const authSubmit = document.getElementById("auth-submit");
  const authError = document.getElementById("auth-error");

  const logoutBtn = document.getElementById("logout-btn");
  const progressLabel = document.getElementById("progress-label");
  const progressDots = document.querySelectorAll("#progress-dots .dot");
  const skipLink = document.getElementById("skip-link");
  const wizardSteps = document.querySelectorAll(".wizard-step");
  const backBtn = document.getElementById("back-btn");
  const nextBtn = document.getElementById("next-btn");

  const versionValue = document.getElementById("version-value");
  const releaseNotes = document.getElementById("release-notes");
  const downloadBtn = document.getElementById("download-btn");
  const downloadError = document.getElementById("download-error");

  const firmwareDownloadBtn = document.getElementById("firmware-download-btn");
  const firmwareError = document.getElementById("firmware-error");
  const copyCfloaderBtn = document.getElementById("copy-cfloader-btn");
  const cfloaderCmd = document.getElementById("cfloader-cmd");

  let mode = "login"; // or "signup"
  let currentStep = 1;

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

  function clamp(step) {
    return Math.min(Math.max(step, 1), TOTAL_STEPS);
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

  async function patchOnboardingStep(step) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ step }),
      });
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        showAuth();
      }
    } catch (err) {
      // best-effort; localStorage already has the current step
    }
  }

  function renderStep() {
    wizardSteps.forEach((el) => {
      el.hidden = Number(el.dataset.step) !== currentStep;
    });

    progressLabel.textContent = `STEP ${currentStep} OF ${TOTAL_STEPS}`;
    progressDots.forEach((dot) => {
      dot.classList.toggle("filled", Number(dot.dataset.dot) <= currentStep);
    });

    backBtn.disabled = currentStep === 1;
    skipLink.hidden = currentStep === TOTAL_STEPS;
    nextBtn.hidden = currentStep === TOTAL_STEPS;

    if (currentStep === TOTAL_STEPS) {
      hideError(downloadError);
      loadVersion();
    }
  }

  function goToStep(step) {
    currentStep = clamp(step);
    localStorage.setItem(STEP_KEY, String(currentStep));
    renderStep();
    patchOnboardingStep(currentStep);
  }

  backBtn.addEventListener("click", () => goToStep(currentStep - 1));
  nextBtn.addEventListener("click", () => goToStep(currentStep + 1));
  skipLink.addEventListener("click", () => goToStep(TOTAL_STEPS));

  function showOnboarding(startStep) {
    authSection.hidden = true;
    onboardingSection.hidden = false;
    currentStep = clamp(startStep || Number(localStorage.getItem(STEP_KEY)) || 1);
    renderStep();
  }

  function showAuth() {
    onboardingSection.hidden = true;
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
      const resumeStep = data.onboardingStep > 0 ? data.onboardingStep : 1;
      localStorage.setItem(STEP_KEY, String(clamp(resumeStep)));
      authForm.reset();
      showOnboarding(resumeStep);
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

  firmwareDownloadBtn.addEventListener("click", async () => {
    hideError(firmwareError);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      showAuth();
      return;
    }

    try {
      const res = await fetch("/api/firmware", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          showAuth();
        }
        throw new Error(data.error || "Firmware download failed");
      }
      window.location.href = data.url;
    } catch (err) {
      showError(firmwareError, err.message);
    }
  });

  copyCfloaderBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(cfloaderCmd.textContent);
      const original = copyCfloaderBtn.textContent;
      copyCfloaderBtn.textContent = "copied";
      setTimeout(() => {
        copyCfloaderBtn.textContent = original;
      }, 1500);
    } catch (err) {
      // clipboard API unavailable; nothing more we can do
    }
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(STEP_KEY);
    setMode("login");
    showAuth();
  });

  // Initial state
  setMode("login");
  if (localStorage.getItem(TOKEN_KEY)) {
    showOnboarding();
  } else {
    showAuth();
  }
})();
