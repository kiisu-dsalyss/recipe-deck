import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettingsPayload, AppSettingsSaveBody, FullStatePayload } from "../api/client";
import { runnerPhase } from "../lib/runnerState";
import * as api from "../api/client";

const SIMPLE_UI_LS = "recipe-deck-simple-ui";

function coerceSimpleUi(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "true" || t === "1" || t === "yes";
  }
  return false;
}

function readSimpleUiFromLocalStorage(): boolean {
  try {
    return localStorage.getItem(SIMPLE_UI_LS) === "1";
  } catch {
    return false;
  }
}

function syncSimpleUiLocalStorage(s: AppSettingsPayload): void {
  try {
    const v = s.effective.simpleUi;
    if (typeof v !== "boolean") {
      return;
    }
    localStorage.setItem(SIMPLE_UI_LS, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws`;
}

export interface DeckUiState {
  payload: FullStatePayload | null;
  /** Log stream for the single managed runner. */
  logs: { a: string };
  error: string | null;
  /** `undefined` until first load; then current token from server (empty string if none). */
  hfToken: string | undefined;
  /** `null` if settings could not be loaded. */
  appSettings: AppSettingsPayload | null;
  /** True = hide dots + header aurora (from server + localStorage fallback). */
  simpleUi: boolean;
  /** Auto-start state: recipe stem and enabled flag. `null` until first fetch. */
  autoStart: { recipeStem: string | null; autoStart: boolean } | null;
}

export function useRecipeDeck(): DeckUiState & {
  refresh: () => Promise<void>;
  run: (args: Parameters<typeof api.postRun>[0] & { autoStart?: boolean }) => Promise<void>;
  stop: () => Promise<void>;
  forceKill: () => Promise<void>;
  saveRecipe: (stem: string, content: string) => Promise<void>;
  setRecipeBroken: (stem: string, broken: boolean) => Promise<void>;
  deleteRecipe: (stem: string) => Promise<void>;
  saveHf: (token: string) => Promise<void>;
  saveAppSettings: (body: AppSettingsSaveBody) => Promise<void>;
  saveAutoStart: (stem: string, enabled: boolean) => Promise<void>;
  toggleAutoStart: (enabled: boolean) => Promise<void>;
  clearRunLog: () => void;
} {
  const [payload, setPayload] = useState<FullStatePayload | null>(null);
  const [logs, setLogs] = useState<{ a: string }>({ a: "" });
  const [error, setError] = useState<string | null>(null);
  const [hfToken, setHfToken] = useState<string | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<AppSettingsPayload | null>(null);
  const [autoStart, setAutoStart] = useState<{
    recipeStem: string | null;
    autoStart: boolean;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  /** When true, the next socket `close` is intentional (e.g. tab visible) — do not schedule backoff reconnect. */
  const skipCloseReconnectRef = useRef(false);

  const refreshStateOnly = useCallback(async () => {
    try {
      const p = await api.fetchState();
      setPayload(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshHf = useCallback(async () => {
    try {
      const h = await api.fetchHfToken();
      setHfToken(h.stored && h.token != null ? h.token : "");
    } catch {
      setHfToken(undefined);
    }
  }, []);

  const refreshAppSettings = useCallback(async () => {
    try {
      const s = await api.fetchAppSettings();
      setAppSettings(s);
      syncSimpleUiLocalStorage(s);
    } catch {
      setAppSettings(null);
    }
  }, []);

  const refreshAutoStart = useCallback(async () => {
    try {
      const a = await api.fetchAutoStart();
      setAutoStart(a);
    } catch {
      setAutoStart({ recipeStem: null, autoStart: false });
    }
  }, []);

  /** Full refresh: deck state + HF token + app settings + auto-start (initial load, manual refresh). */
  const refresh = useCallback(async () => {
    await refreshStateOnly();
    await refreshHf();
    await refreshAppSettings();
    await refreshAutoStart();
  }, [refreshStateOnly, refreshHf, refreshAppSettings, refreshAutoStart]);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => ({
      a: (prev.a + line).slice(-500_000),
    }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runnerPhaseVal = runnerPhase(payload);
  useEffect(() => {
    const booting = runnerPhaseVal === "BOOTING";
    const healthy = runnerPhaseVal === "HEALTHY";
    const ms = booting
      ? (payload?.modelCachePollIntervalMs ?? 2000)
      : healthy
        ? 2000
        : 5000;
    const id = window.setInterval(() => {
      void refreshStateOnly();
    }, ms);
    return () => window.clearInterval(id);
  }, [runnerPhaseVal, payload?.modelCachePollIntervalMs, refreshStateOnly]);

  useEffect(() => {
    let stopped = false;
    let retryTimer: number | undefined;
    let attempt = 0;

    const handleMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type: string;
          slot?: string;
          line?: string;
          text?: string;
          payload?: FullStatePayload;
        };
        if (msg.type === "log_snapshot" && msg.text !== undefined && msg.slot === "a") {
          setLogs({ a: msg.text.slice(-500_000) });
          return;
        }
        if (msg.type === "log" && msg.line !== undefined) {
          appendLog(msg.line);
        }
        if (msg.type === "state" && msg.payload) {
          setPayload(msg.payload as FullStatePayload);
        }
      } catch {
        /* ignore */
      }
    };

    const connect = () => {
      if (stopped) {
        return;
      }
      retryTimer = undefined;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onmessage = handleMessage;
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (stopped) {
          return;
        }
        if (skipCloseReconnectRef.current) {
          skipCloseReconnectRef.current = false;
          return;
        }
        const delay = Math.min(30_000, 800 * 2 ** attempt);
        attempt += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    const bumpReconnect = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const w = wsRef.current;
      if (w && w.readyState === WebSocket.OPEN) {
        return;
      }
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      attempt = 0;
      if (w !== null && w.readyState !== WebSocket.CLOSED) {
        skipCloseReconnectRef.current = true;
        w.close();
      } else {
        wsRef.current = null;
      }
      connect();
    };

    document.addEventListener("visibilitychange", bumpReconnect);
    window.addEventListener("online", bumpReconnect);

    return () => {
      stopped = true;
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
      }
      document.removeEventListener("visibilitychange", bumpReconnect);
      window.removeEventListener("online", bumpReconnect);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [appendLog]);

  const run = useCallback(
    async (args: Parameters<typeof api.postRun>[0]) => {
      await api.postRun(args);
      await refreshStateOnly();
    },
    [refreshStateOnly],
  );

  const stop = useCallback(async () => {
    await api.postStop();
    await refreshStateOnly();
  }, [refreshStateOnly]);

  const forceKill = useCallback(async () => {
    await api.postForceKill();
    await refreshStateOnly();
  }, [refreshStateOnly]);

  const saveRecipe = useCallback(
    async (stem: string, content: string) => {
      await api.saveRecipe(stem, content);
      await refreshStateOnly();
    },
    [refreshStateOnly],
  );

  const setRecipeBroken = useCallback(
    async (stem: string, broken: boolean) => {
      await api.postRecipeBroken(stem, broken);
      await refreshStateOnly();
    },
    [refreshStateOnly],
  );

  const deleteRecipe = useCallback(
    async (stem: string) => {
      await api.deleteRecipe(stem);
      await refreshStateOnly();
    },
    [refreshStateOnly],
  );

  const saveHf = useCallback(
    async (token: string) => {
      await api.saveHfToken(token);
      await refreshHf();
    },
    [refreshHf],
  );

  const saveAppSettings = useCallback(async (body: AppSettingsSaveBody) => {
    const s = await api.saveAppSettings(body);
    setAppSettings(s);
    syncSimpleUiLocalStorage(s);
  }, []);

  /** Save auto-start config: which recipe stem and whether it should auto-start. */
  const saveAutoStart = useCallback(
    async (stem: string, enabled: boolean) => {
      await api.saveAutoStart(stem, enabled);
      setAutoStart({ recipeStem: stem, autoStart: enabled });
      await refreshStateOnly();
    },
    [refreshStateOnly],
  );

  /** Toggle auto-start flag for the current recipe. */
  const toggleAutoStart = useCallback(
    async (enabled: boolean) => {
      await api.toggleAutoStart(enabled);
      setAutoStart((prev) =>
        prev ? { recipeStem: prev.recipeStem, autoStart: enabled } : prev,
      );
    },
    [],
  );

  const simpleUi = useMemo(() => {
    const e = appSettings?.effective;
    if (e && typeof e.simpleUi === "boolean") {
      return e.simpleUi;
    }
    if (e && e.simpleUi !== undefined && e.simpleUi !== null) {
      return coerceSimpleUi(e.simpleUi);
    }
    return readSimpleUiFromLocalStorage();
  }, [appSettings]);

  const clearRunLog = useCallback(() => {
    setLogs({ a: "" });
  }, []);

  return {
    payload,
    logs,
    error,
    hfToken,
    appSettings,
    simpleUi,
    autoStart,
    refresh,
    run,
    stop,
    forceKill,
    saveRecipe,
    setRecipeBroken,
    deleteRecipe,
    saveHf,
    saveAppSettings,
    saveAutoStart,
    toggleAutoStart,
    clearRunLog,
  };
}
