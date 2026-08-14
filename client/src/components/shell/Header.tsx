import type { ReactElement } from "react";
import { formatListenDisplay } from "../../../../shared/formatListenDisplay";
import { formatBytes } from "../../lib/formatBytes";
import type { HeaderProps } from "./Header.types";
import { HeaderCacheStrip } from "./HeaderCacheStrip";
import { IconGear, IconMoon, IconSun } from "./HeaderIcons";
import styles from "./Header.module.css";

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

export function Header(props: HeaderProps): ReactElement {
  const {
    listenHost,
    listenPort,
    metrics,
    modelCacheProgress,
    theme,
    onToggleTheme,
    onOpenServerSettings,
    onOpenHelp,
  } = props;
  const disk = metrics?.disk;
  const gpu = metrics?.gpu;
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.titleRow}>
          <span className={styles.title}>Recipe Deck</span>
          <span className={styles.appVersion} title="Recipe Deck UI version">
            v{APP_VERSION}
          </span>
        </div>
        <span className={styles.port} title="HTTP bind (SWITCHER_HOST:SWITCHER_PORT)">
          UI · {formatListenDisplay(listenHost ?? "0.0.0.0", listenPort)}
        </span>
      </div>
      <HeaderCacheStrip cache={modelCacheProgress} />
      <div className={styles.strip}>
        <button
          type="button"
          className={styles.gearBtn}
          onClick={onOpenServerSettings}
          title="Settings"
          aria-label="Settings"
        >
          <IconGear />
        </button>
        <button
          type="button"
          className={styles.helpBtn}
          onClick={onOpenHelp}
          title="About & help"
          aria-label="About and help"
        >
          ?
        </button>
        <button
          type="button"
          className={styles.themeBtn}
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
        {disk ? (
          <span className={styles.chip} title={disk.path}>
            Disk {formatBytes(disk.freeBytes)} free / {formatBytes(disk.totalBytes)}
          </span>
        ) : (
          <span className={styles.chipMuted}>Disk —</span>
        )}
        {gpu ? (
          <span className={styles.chip}>
            GPU
            {gpu.gpuCount != null && gpu.gpuCount > 1 ? ` ×${gpu.gpuCount}` : ""}{" "}
            {gpu.temperatureC != null ? `${gpu.temperatureC}°C` : "—"}
            {gpu.utilizationPct != null ? ` · ${gpu.utilizationPct}%` : ""}
            {gpu.memUsedMiB != null && gpu.memTotalMiB != null
              ? ` · VRAM ${Math.round(gpu.memUsedMiB)}/${Math.round(gpu.memTotalMiB)} MiB`
              : ""}
          </span>
        ) : (
          <span className={styles.chipMuted}>GPU n/a</span>
        )}
      </div>
    </header>
  );
}
