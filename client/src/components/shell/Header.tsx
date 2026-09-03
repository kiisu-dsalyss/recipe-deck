import type { ReactElement } from "react";
import { formatListenDisplay } from "../../../../shared/formatListenDisplay";
import { formatBytes } from "../../lib/formatBytes";
import type { HostAccelMetrics } from "../../../../types/index.js";
import type { HeaderProps } from "./Header.types";
import { HeaderCacheStrip } from "./HeaderCacheStrip";
import { IconGear, IconMoon, IconSun } from "./HeaderIcons";
import styles from "./Header.module.css";

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

function RemoteHostChips({
  hosts,
}: {
  hosts: HostAccelMetrics[];
}): ReactElement {
  const remotes = hosts.filter((h) => !h.local);
  return (
    <>
      {remotes.map((h) => (
        <RemoteHostChipPair key={h.id} host={h} />
      ))}
    </>
  );
}

function RemoteHostChipPair({ host }: { host: HostAccelMetrics }): ReactElement {
  const errorTitle = host.error ?? "SSH sample failed";
  const cpuChip =
    host.cpu && host.cpu.utilizationPct != null ? (
      <span
        className={styles.chip}
        title={`CPU · ${host.id} (/proc/stat via SSH)`}
      >
        CPU {host.label} · {host.cpu.utilizationPct}%
      </span>
    ) : (
      <span className={styles.chipMuted} title={`CPU · ${host.id}: ${errorTitle}`}>
        CPU {host.label} n/a
      </span>
    );

  const gpuChip =
    host.gpu ? (
      <span className={styles.chip} title={`GPU · ${host.id} (nvidia-smi via SSH)`}>
        GPU {host.label}
        {host.gpu.gpuCount != null && host.gpu.gpuCount > 1
          ? ` ×${host.gpu.gpuCount}`
          : ""}
        {host.gpu.temperatureC != null ? ` ${host.gpu.temperatureC}°C` : ""}
        {host.gpu.utilizationPct != null ? ` · ${host.gpu.utilizationPct}%` : ""}
      </span>
    ) : (
      <span className={styles.chipMuted} title={`GPU · ${host.id}: ${errorTitle}`}>
        GPU {host.label} n/a
      </span>
    );

  return (
    <>
      {cpuChip}
      {gpuChip}
    </>
  );
}

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
  const cpu = metrics?.cpu;
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
        {cpu && cpu.utilizationPct != null ? (
          <span className={styles.chip} title="Host CPU utilization (/proc/stat)">
            CPU · {cpu.utilizationPct}%
          </span>
        ) : (
          <span className={styles.chipMuted}>CPU n/a</span>
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
        {metrics?.hosts && metrics.hosts.length > 1 && (
          <RemoteHostChips hosts={metrics.hosts} />
        )}
      </div>
    </header>
  );
}
