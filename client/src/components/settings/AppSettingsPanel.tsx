import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { AppSettingsEffective, AppSettingsSaveBody } from "../../api/client";
import { AppSettingsFormSections } from "./AppSettingsFormSections";
import type { AppSettingsPanelProps } from "./AppSettingsPanel.types";
import styles from "./AppSettingsPanel.module.css";

function toSaveBody(d: AppSettingsEffective): AppSettingsSaveBody {
  return {
    switcherPort: d.switcherPort,
    vllmPortA: d.vllmPortA,
    python: d.python,
    readyRegex: d.readyRegex,
    healthProbeTimeoutMs: d.healthProbeTimeoutMs,
    bootSigtermGraceMs: d.bootSigtermGraceMs,
    diskStatsIntervalMs: d.diskStatsIntervalMs,
    gpuStatsIntervalMs: d.gpuStatsIntervalMs,
    vllmMetricsIntervalMs: d.vllmMetricsIntervalMs,
    simpleUi: d.simpleUi,
  };
}

export function AppSettingsPanel(props: AppSettingsPanelProps): ReactElement {
  const {
    payload,
    recipePaths,
    onSave,
    onRestartService,
    variant = "panel",
    hfDraft,
    onHfDraftChange,
    onHfBlur,
    onSaveHf,
    hfTokenLoading,
    onRefreshRecipes,
    autoStartState,
    onAutoStartChange,
  } = props;
  const [draft, setDraft] = useState<AppSettingsEffective | null>(null);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (payload?.effective) {
      const e = payload.effective;
      setDraft({
        ...e,
        simpleUi: e.simpleUi ?? false,
      });
    }
  }, [payload]);

  const submit = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    try {
      await onSave(toSaveBody(draft));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  if (!payload || !draft) {
    return (
      <div>
        {variant === "panel" ? <h3 className={styles.h}>Server settings</h3> : null}
        <p className={styles.p}>Loading…</p>
      </div>
    );
  }

  const eff = payload.effective;

  return (
    <div className={styles.block}>
      {variant === "panel" ? <h3 className={styles.h}>Server settings</h3> : null}
      <p className={styles.p}>
        Values are written to <code className={styles.code}>.env</code> under{" "}
        <code className={styles.code}>SPARK_VLLM_ROOT</code>. Use{" "}
        <strong>Restart Recipe Deck</strong> (or{" "}
        <code className={styles.code}>systemctl --user restart recipe-deck.service</code>) so port
        and timeout changes apply to this process.
      </p>
      {payload.restartRequired ? (
        <div className={styles.warnRow}>
          <div className={styles.warn} role="status">
            Saved settings differ from the running process — restart to apply.
          </div>
          <button
            type="button"
            className={styles.btnRestart}
            disabled={restarting}
            onClick={() => {
              setRestarting(true);
              setErr(null);
              void onRestartService().catch((e) => {
                setErr(e instanceof Error ? e.message : String(e));
                setRestarting(false);
              });
            }}
          >
            {restarting ? "Restarting…" : "Restart Recipe Deck"}
          </button>
        </div>
      ) : null}
      {err ? <div className={styles.err}>{err}</div> : null}

      <AppSettingsFormSections
        draft={draft}
        setDraft={setDraft}
        recipePaths={recipePaths}
        sparkVllmRoot={eff.sparkVllmRoot}
        hfDraft={hfDraft}
        onHfDraftChange={onHfDraftChange}
        onHfBlur={onHfBlur}
        onSaveHf={onSaveHf}
        hfTokenLoading={hfTokenLoading}
        onRefreshRecipes={onRefreshRecipes}
        autoStartState={autoStartState}
        onAutoStartChange={onAutoStartChange}
      />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btn}
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          disabled={saving}
          onClick={() => {
            setDraft({ ...eff, simpleUi: eff.simpleUi ?? false });
            setErr(null);
          }}
        >
          Reset to running
        </button>
      </div>
    </div>
  );
}
