window.ROOC_CONFIG = (() => {
  const DEFAULT_ENVIRONMENT_ID = "production";
  const ENVIRONMENT_STORAGE_KEY = "rooc_database_environment";
  const ENVIRONMENT_ALIASES = {
    prod: "production",
    formal: "production",
    live: "production",
    main: "production",
    rooc: "production",
    test: "rooc_test",
    testing: "rooc_test",
    staging: "rooc_test",
    rooc_test: "rooc_test"
  };
  const DEFAULT_LABELS = {
    production: "正式資料庫",
    rooc_test: "測試資料庫 rooc_test"
  };

  function cleanString(value) {
    return String(value || "").trim();
  }

  function normalizeEnvironmentId(value) {
    const normalized = cleanString(value)
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/-/g, "_");

    return ENVIRONMENT_ALIASES[normalized] || normalized;
  }

  function makeEnvironment(id, config = {}) {
    const environmentId = normalizeEnvironmentId(id) || DEFAULT_ENVIRONMENT_ID;
    const source = config && typeof config === "object" ? config : {};

    return {
      id: environmentId,
      label: cleanString(source.label) || DEFAULT_LABELS[environmentId] || environmentId,
      url: cleanString(source.url),
      anonKey: cleanString(source.anonKey)
    };
  }

  function upsertEnvironment(environments, environment) {
    const existingIndex = environments.findIndex((item) => item.id === environment.id);
    if (existingIndex === -1) {
      environments.push(environment);
      return;
    }

    environments[existingIndex] = {
      ...environments[existingIndex],
      ...environment,
      label: environment.label || environments[existingIndex].label
    };
  }

  function normalizeSupabaseConfig(runtime = window.ROOC_SUPABASE_CONFIG || {}) {
    const source = runtime && typeof runtime === "object" ? runtime : {};
    const environments = [];
    const explicitEnvironments = source.environments && typeof source.environments === "object"
      ? source.environments
      : {};

    if (source.url || source.anonKey || !explicitEnvironments.production) {
      upsertEnvironment(environments, makeEnvironment(DEFAULT_ENVIRONMENT_ID, {
        label: source.label || source.environmentLabel || DEFAULT_LABELS.production,
        url: source.url,
        anonKey: source.anonKey
      }));
    }

    Object.entries(explicitEnvironments).forEach(([id, config]) => {
      upsertEnvironment(environments, makeEnvironment(id, config));
    });

    if (source.testUrl || source.testAnonKey) {
      upsertEnvironment(environments, makeEnvironment("rooc_test", {
        label: source.testLabel || DEFAULT_LABELS.rooc_test,
        url: source.testUrl,
        anonKey: source.testAnonKey
      }));
    }

    let defaultEnvironment = normalizeEnvironmentId(source.defaultEnvironment) || DEFAULT_ENVIRONMENT_ID;
    if (!environments.some((environment) => environment.id === defaultEnvironment)) {
      defaultEnvironment = environments[0]?.id || DEFAULT_ENVIRONMENT_ID;
    }

    return {
      defaultEnvironment,
      environments
    };
  }

  function hasConfiguredEnvironment(runtime = window.ROOC_SUPABASE_CONFIG || {}) {
    return normalizeSupabaseConfig(runtime).environments.some((environment) => environment.url && environment.anonKey);
  }

  async function loadOptionalLocalConfig(src = "config.local.js") {
    const config = normalizeSupabaseConfig();
    const params = new URLSearchParams(window.location.search);
    const requestedId = normalizeEnvironmentId(params.get("env") || params.get("database") || params.get("db"));
    const requestedEnvironmentMissing = requestedId
      && !config.environments.some((environment) => environment.id === requestedId);
    const shouldLoadLocalConfig = !hasConfiguredEnvironment()
      || isLocalSurface()
      || requestedEnvironmentMissing;

    if (!shouldLoadLocalConfig) return;

    try {
      await loadScript(src);
    } catch {
      // Local config is optional. Deployment config is generated into config.js.
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function isLocalSurface() {
    const hostname = window.location.hostname;
    return window.location.protocol === "file:"
      || hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1";
  }

  function readStoredEnvironment() {
    try {
      return window.localStorage.getItem(ENVIRONMENT_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function writeStoredEnvironment(environmentId) {
    try {
      window.localStorage.setItem(ENVIRONMENT_STORAGE_KEY, environmentId);
    } catch {
      // Browser storage can be unavailable in private or locked-down contexts.
    }
  }

  function resolveSupabaseEnvironment() {
    const config = normalizeSupabaseConfig();
    const params = new URLSearchParams(window.location.search);
    const requestedEnvironment = cleanString(params.get("env") || params.get("database") || params.get("db"));
    const requestedId = normalizeEnvironmentId(requestedEnvironment);
    const storedId = normalizeEnvironmentId(readStoredEnvironment());
    const environmentIds = config.environments.map((environment) => environment.id);
    const hasExplicitEnvironment = Boolean(requestedEnvironment);
    const requestedEnvironmentMissing = requestedId && !environmentIds.includes(requestedId)
      ? requestedEnvironment
      : "";

    let selectedId = config.defaultEnvironment;
    if (requestedId && environmentIds.includes(requestedId)) {
      selectedId = requestedId;
      writeStoredEnvironment(selectedId);
    } else if (isLocalSurface() && storedId && environmentIds.includes(storedId)) {
      selectedId = storedId;
    } else if (!environmentIds.includes(selectedId) && environmentIds.length > 0) {
      selectedId = environmentIds[0];
    }

    const current = config.environments.find((environment) => environment.id === selectedId)
      || makeEnvironment(selectedId);

    const state = {
      ...config,
      current,
      isDefault: current.id === config.defaultEnvironment,
      isLocalSurface: isLocalSurface(),
      hasExplicitEnvironment,
      requestedEnvironment,
      requestedEnvironmentMissing
    };

    setBodyEnvironment(state);
    return state;
  }

  function setBodyEnvironment(environmentState) {
    if (!document.body) return;

    document.body.dataset.environment = environmentState.current.id;
    document.body.classList.toggle("is-test-environment", !environmentState.isDefault);
  }

  function mountEnvironmentSwitcher(environmentState, options = {}) {
    window.ROOC_ENVIRONMENT_SWITCHER_STATE = { environmentState, options };

    if (window.ROOC_VUE_ENVIRONMENT_SWITCHER?.mount?.(environmentState, options)) {
      syncEnvironmentLinks(environmentState);
      return;
    }

    window.dispatchEvent(new CustomEvent("rooc:environment-switcher", {
      detail: { environmentState, options }
    }));
    syncEnvironmentLinks(environmentState);
  }

  function navigateToEnvironment(environmentId) {
    const config = normalizeSupabaseConfig();
    const selectedId = normalizeEnvironmentId(environmentId) || config.defaultEnvironment;
    const nextUrl = new URL(window.location.href);

    writeStoredEnvironment(selectedId);
    nextUrl.searchParams.delete("database");
    nextUrl.searchParams.delete("db");
    if (selectedId === config.defaultEnvironment) {
      nextUrl.searchParams.delete("env");
    } else {
      nextUrl.searchParams.set("env", selectedId);
    }

    window.location.assign(nextUrl.href);
  }

  function syncEnvironmentLinks(environmentState) {
    const shouldCarryEnvironment = !environmentState.isDefault || environmentState.hasExplicitEnvironment;
    document.querySelectorAll("[data-environment-link]").forEach((link) => {
      const baseHref = link.dataset.baseHref || link.getAttribute("href") || "";
      if (!link.dataset.baseHref) {
        link.dataset.baseHref = baseHref;
      }

      const url = new URL(baseHref, window.location.href);
      if (shouldCarryEnvironment) {
        url.searchParams.set("env", environmentState.current.id);
      } else {
        url.searchParams.delete("env");
      }

      const filename = url.pathname.split("/").pop() || baseHref;
      link.setAttribute("href", `${filename}${url.search}${url.hash}`);
    });
  }

  return {
    loadOptionalLocalConfig,
    mountEnvironmentSwitcher,
    navigateToEnvironment,
    normalizeSupabaseConfig,
    resolveSupabaseEnvironment
  };
})();

window.ROOC_DRAW_ANIMATION = (() => {
  const VISUAL_MODES = [
    "fireworks",
    "classic",
    "spotlight",
    "starlight",
    "ripple",
    "aurora",
    "runes",
    "confetti",
    "curtain"
  ];
  const REVEAL_MODES = ["roller", "flip"];
  const DENSE_FLIP_CARD_THRESHOLD = 24;

  function cleanString(value) {
    return String(value || "").trim();
  }

  function hashSeed(seed) {
    const text = cleanString(seed) || `${Date.now()}:${Math.random()}`;
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  function pickFrom(list, seed) {
    return list[hashSeed(seed) % list.length];
  }

  function resolveChoice(seed) {
    const source = cleanString(seed);
    return {
      visualMode: pickFrom(VISUAL_MODES, `${source}:visual`),
      revealMode: pickFrom(REVEAL_MODES, `${source}:reveal`)
    };
  }

  function clearVisualModeClasses(target) {
    if (!target) return;
    VISUAL_MODES.forEach((mode) => target.classList.remove(`mode-${mode}`));
  }

  function clearRevealModeClasses(target) {
    if (!target) return;
    REVEAL_MODES.forEach((mode) => target.classList.remove(`reveal-${mode}`));
  }

  function phaseText(visualMode, drawCount, revealMode = "roller") {
    if (revealMode === "flip") {
      return drawCount > 1 ? `翻牌洗牌中 / ${drawCount} 位` : "翻牌抽選中";
    }

    const prefix = {
      fireworks: "煙火升空中",
      classic: "跑燈抽選中",
      spotlight: "聚光抽選中",
      starlight: "星幕抽選中",
      ripple: "能量聚集中",
      aurora: "極光流轉中",
      runes: "符紋輪轉中",
      confetti: "花火飄落中",
      curtain: "舞台揭幕中"
    }[visualMode] || "抽選中";

    return drawCount > 1 ? `${prefix} / ${drawCount} 位` : prefix;
  }

  function normalizeResultItem(row = {}, context = {}) {
    const roleName = cleanString(
      row.role_name
      || row.drawn_role_name
      || row.final_role_name
      || row.member_name
      || row.name
      || row.member_no
      || row.drawn_member_no
      || row.final_member_no
      || context.prizeName
      || "幸運得主"
    );
    const memberNo = cleanString(row.member_no || row.drawn_member_no || row.final_member_no);

    return { roleName, memberNo };
  }

  function resultLabel(row, context = {}) {
    if (!row) return "";

    const item = normalizeResultItem(row, context);
    const memberNo = item.memberNo && item.memberNo !== item.roleName ? `（${item.memberNo}）` : "";
    return `${item.roleName}${memberNo}`;
  }

  function renderFlipCards(rows, context = {}, escapeHtmlFn = escapeHtml) {
    const escape = typeof escapeHtmlFn === "function" ? escapeHtmlFn : escapeHtml;
    const cards = Array.isArray(rows) && rows.length > 0
      ? rows
      : [{ role_name: context.prizeName, member_no: "" }];

    return cards
      .map((row, index) => {
        const item = normalizeResultItem(row, context);
        const memberNo = item.memberNo && item.memberNo !== item.roleName ? item.memberNo : "";
        return `
          <div class="draw-flip-card" style="--flip-delay: ${flipDelay(index, cards.length)}s">
            <div class="draw-flip-card-inner">
              <div class="draw-flip-card-face draw-flip-card-front">
                <strong>${escape(item.roleName)}</strong>
                ${memberNo ? `<small>${escape(memberNo)}</small>` : ""}
              </div>
              <div class="draw-flip-card-face draw-flip-card-back">
                <span>ROOC</span>
                <strong>?</strong>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderFlipPlaceholders(drawCount, escapeHtmlFn = escapeHtml) {
    const escape = typeof escapeHtmlFn === "function" ? escapeHtmlFn : escapeHtml;
    const count = Math.max(1, Math.trunc(Number(drawCount) || 1));

    return Array.from({ length: count }, (_, index) => `
      <div class="draw-flip-card is-waiting" style="--flip-delay: ${flipDelay(index, count)}s">
        <div class="draw-flip-card-inner">
          <div class="draw-flip-card-face draw-flip-card-front">
            <span>WAIT</span>
            <strong>${escape("待揭曉")}</strong>
          </div>
          <div class="draw-flip-card-face draw-flip-card-back">
            <span>ROOC</span>
            <strong>?</strong>
          </div>
        </div>
      </div>
    `).join("");
  }

  function flipDelay(index, total) {
    if (total <= 10) return Number((index * 0.12).toFixed(2));
    if (total <= 30) return Number((index * 0.06).toFixed(2));
    return Number((index * 0.025).toFixed(3));
  }

  function revealWaitTime(count, revealMode) {
    if (revealMode === "flip") {
      return Math.min(3400, 900 + count * 140);
    }
    return 1450;
  }

  function isDenseFlip(count) {
    return Number(count || 0) > DENSE_FLIP_CARD_THRESHOLD;
  }

  function launchConfetti(resultCount) {
    if (typeof window.confetti !== "function") return;

    const count = Math.min(Math.max(resultCount || 1, 1), 8);
    const baseOptions = {
      particleCount: 30 + count * 7,
      spread: 58,
      startVelocity: 38,
      ticks: 130,
      scalar: 0.82,
      colors: ["#087f8c", "#d95d39", "#f4b942", "#2f855a", "#ffffff"],
      zIndex: 2000,
      disableForReducedMotion: true
    };

    window.confetti({
      ...baseOptions,
      angle: 60,
      origin: { x: 0.18, y: 0.74 }
    });
    window.confetti({
      ...baseOptions,
      angle: 120,
      origin: { x: 0.82, y: 0.74 }
    });
  }

  function createFireworks(container) {
    const FireworksConstructor = window.Fireworks?.default || window.Fireworks?.Fireworks || window.Fireworks || null;
    if (!container || typeof FireworksConstructor !== "function") return null;

    return new FireworksConstructor(container, {
      autoresize: true,
      opacity: 0.38,
      acceleration: 1.04,
      friction: 0.97,
      gravity: 1.35,
      particles: 24,
      traceLength: 2,
      traceSpeed: 7,
      explosion: 3,
      intensity: 10,
      flickering: 42,
      hue: { min: 22, max: 190 },
      delay: { min: 60, max: 110 },
      rocketsPoint: { min: 28, max: 72 },
      brightness: { min: 54, max: 88 },
      decay: { min: 0.015, max: 0.03 },
      mouse: { click: false, move: false, max: 1 }
    });
  }

  function launchFireworks(fireworks, resultCount) {
    if (!fireworks?.launch) return;

    const count = Math.min(Math.max(resultCount || 1, 2), 8);
    fireworks.launch(count);
  }

  function stopFireworks(fireworks, container) {
    if (fireworks?.stop) {
      try {
        fireworks.stop(true);
      } catch {
        // Animation cleanup should never block the raffle flow.
      }
    }

    if (container) {
      container.innerHTML = "";
    }
  }

  function escapeHtml(value) {
    return cleanString(value).replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };
      return map[char];
    });
  }

  return {
    DENSE_FLIP_CARD_THRESHOLD,
    REVEAL_MODES,
    VISUAL_MODES,
    clearRevealModeClasses,
    clearVisualModeClasses,
    createFireworks,
    isDenseFlip,
    launchConfetti,
    launchFireworks,
    phaseText,
    renderFlipCards,
    renderFlipPlaceholders,
    resolveChoice,
    resultLabel,
    revealWaitTime,
    stopFireworks
  };
})();
