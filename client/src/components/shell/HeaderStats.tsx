import type { ReactElement } from "react";
import type { CpuMetrics, GpuMetrics, HostAccelMetrics } from "../../../../types/index.js";
import { diskUsedPct, formatBytes, formatBytesCompact } from "../../lib/formatBytes";
import { IconDrive } from "./HeaderIcons";
import styles from "./Header.module.css";

function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

export function UtilBar(props: { pct: number | null; label: string }): ReactElement {
  const { pct, label } = props;
  const width = pct == null ? 0 : clampPct(pct);
  return (
    <div
      className={styles.utilBar}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct == null ? undefined : Math.round(width)}
      aria-valuetext={pct == null ? "n/a" : `${Math.round(width)}%`}
    >
      <div className={styles.utilBarFill} style={{ width: `${width}%` }} />
    </div>
  );
}

export function UsedRing(props: {
  usedPct: number | null;
  label: string;
}): ReactElement {
  const { usedPct, label } = props;
  const size = 16;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = usedPct == null ? 0 : clampPct(usedPct) / 100;
  const offset = c * (1 - fill);
  return (
    <svg
      className={styles.usedRing}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
    >
      <circle
        className={styles.usedRingTrack}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className={styles.usedRingFill}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function gpuTooltip(gpu: GpuMetrics | null, prefix: string, errorTitle?: string): string {
  if (!gpu) {
    return errorTitle ? `${prefix}: ${errorTitle}` : `${prefix} n/a`;
  }
  const parts: string[] = [prefix];
  if (gpu.gpuCount != null && gpu.gpuCount > 1) {
    parts.push(`×${gpu.gpuCount}`);
  }
  if (gpu.utilizationPct != null) {
    parts.push(`${gpu.utilizationPct}%`);
  }
  if (gpu.temperatureC != null) {
    parts.push(`${gpu.temperatureC}°C`);
  }
  if (gpu.memUsedMiB != null && gpu.memTotalMiB != null) {
    parts.push(`VRAM ${Math.round(gpu.memUsedMiB)}/${Math.round(gpu.memTotalMiB)} MiB`);
  }
  if (gpu.powerW != null) {
    parts.push(`${Math.round(gpu.powerW)} W`);
  }
  return parts.join(" · ");
}

export function HostAccelStack(props: {
  cpu: CpuMetrics | null;
  gpu: GpuMetrics | null;
  cpuTitle: string;
  gpuTitle: string;
  /** Short remote label, e.g. `.100`. */
  hostLabel?: string;
}): ReactElement {
  const { cpu, gpu, cpuTitle, gpuTitle, hostLabel } = props;
  const cpuPct = cpu?.utilizationPct ?? null;
  const gpuPct = gpu?.utilizationPct ?? null;
  const cpuLabel = hostLabel ? `CPU ${hostLabel}` : "CPU";
  const gpuLabel = hostLabel ? `GPU ${hostLabel}` : "GPU";
  return (
    <div className={styles.accelStack}>
      <div className={styles.accelRow} title={cpuTitle}>
        <span className={styles.accelName}>{cpuLabel}</span>
        <UtilBar pct={cpuPct} label={`${cpuLabel} utilization`} />
      </div>
      <div className={styles.accelRow} title={gpuTitle}>
        <span className={styles.accelName}>{gpuLabel}</span>
        <UtilBar pct={gpuPct} label={`${gpuLabel} utilization`} />
        {gpu?.temperatureC != null ? (
          <span className={styles.accelTemp}>{gpu.temperatureC}°C</span>
        ) : null}
      </div>
    </div>
  );
}

export function LocalAccelStack(props: {
  cpu: CpuMetrics | null;
  gpu: GpuMetrics | null;
}): ReactElement {
  const { cpu, gpu } = props;
  return (
    <HostAccelStack
      cpu={cpu}
      gpu={gpu}
      cpuTitle="Host CPU utilization (/proc/stat)"
      gpuTitle={gpuTooltip(gpu, "GPU (nvidia-smi)")}
    />
  );
}

export function RemoteAccelStacks(props: { hosts: HostAccelMetrics[] }): ReactElement {
  const remotes = props.hosts.filter((h) => !h.local);
  return (
    <>
      {remotes.map((h) => {
        const err = h.error ?? "SSH sample failed";
        return (
          <HostAccelStack
            key={h.id}
            hostLabel={h.label}
            cpu={h.cpu}
            gpu={h.gpu}
            cpuTitle={
              h.cpu?.utilizationPct != null
                ? `CPU · ${h.id} (/proc/stat via SSH)`
                : `CPU · ${h.id}: ${err}`
            }
            gpuTitle={gpuTooltip(h.gpu, `GPU · ${h.id} (nvidia-smi via SSH)`, err)}
          />
        );
      })}
    </>
  );
}

export function DiskUsedStat(props: {
  disk: { path: string; freeBytes: number; totalBytes: number } | null;
}): ReactElement {
  const { disk } = props;
  if (!disk) {
    return (
      <span className={styles.diskStatMuted} title="Disk stats unavailable">
        <IconDrive />
        <UsedRing usedPct={null} label="Disk used n/a" />
        <span>—</span>
      </span>
    );
  }
  const used = diskUsedPct(disk.freeBytes, disk.totalBytes);
  const usedLabel =
    used == null ? "Disk used n/a" : `Disk ${Math.round(used)}% used`;
  const title = [
    disk.path,
    `${formatBytes(disk.freeBytes)} free / ${formatBytes(disk.totalBytes)}`,
    used == null ? null : `${used.toFixed(1)}% used`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className={styles.diskStat} title={title}>
      <IconDrive />
      <UsedRing usedPct={used} label={usedLabel} />
      <span>{formatBytesCompact(disk.totalBytes)}</span>
    </span>
  );
}
