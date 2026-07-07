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
    const root = document.querySelector(options.rootSelector || "#environment-switcher");
    const select = document.querySelector(options.selectSelector || "#environment-select");
    if (!root || !select) {
      syncEnvironmentLinks(environmentState);
      return;
    }

    const shouldShow = environmentState.environments.length > 1
      && (environmentState.isLocalSurface || environmentState.hasExplicitEnvironment || !environmentState.isDefault);

    root.hidden = !shouldShow;
    root.classList.toggle("is-test-environment", !environmentState.isDefault);
    select.innerHTML = "";

    environmentState.environments.forEach((environment) => {
      select.append(new Option(environment.label, environment.id));
    });
    select.value = environmentState.current.id;

    const activeLabel = root.querySelector("[data-environment-active-label]");
    if (activeLabel) {
      activeLabel.textContent = environmentState.current.label;
    }

    if (!select.dataset.environmentSwitcherBound) {
      select.dataset.environmentSwitcherBound = "true";
      select.addEventListener("change", () => navigateToEnvironment(select.value));
    }

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
    normalizeSupabaseConfig,
    resolveSupabaseEnvironment
  };
})();
