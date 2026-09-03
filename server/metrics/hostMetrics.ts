import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import type { CpuMetrics, GpuMetrics } from "../../types/index.js";

const execFileAsync = promisify(execFile);

/** Prefer full paths: user systemd units sometimes have a minimal PATH. */
const NVIDIA_SMI_CANDIDATES = [
  "/usr/bin/nvidia-smi",
  "nvidia-smi",
  "/usr/local/cuda/bin/nvidia-smi",
];

function smiEnv(): NodeJS.ProcessEnv {
  return { ...process.env, LC_ALL: "C", LANG: "C" };
}

function finiteOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n;
}

export async function diskUsageForPath(
  targetPath: string,
): Promise<{ freeBytes: number; totalBytes: number } | null> {
  try {
    const s = await fs.statfs(targetPath);
    const freeBytes = Number(s.bfree) * Number(s.bsize);
    const totalBytes = Number(s.blocks) * Number(s.bsize);
    return { freeBytes, totalBytes };
  } catch {
    return null;
  }
}

/** Previous `/proc/stat` sample kept between calls to compute utilization delta. */
let prevCpuSample: { idle: number; total: number } | null = null;

/**
 * Host CPU utilization from Linux `/proc/stat` aggregate `cpu` line.
 * First call primes the sample and returns `utilizationPct: null` — Linux only
 * (macOS dev returns `null` when `/proc/stat` is missing).
 */
export async function hostCpuSnapshot(): Promise<CpuMetrics | null> {
  let raw: string;
  try {
    raw = await fs.readFile("/proc/stat", "utf8");
  } catch {
    return null;
  }
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("cpu "));
  if (!line) {
    return null;
  }
  const parts = line
    .trim()
    .split(/\s+/)
    .slice(1)
    .map((p) => Number.parseFloat(p));
  if (parts.length < 4 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
  const total = parts.reduce((a, b) => a + b, 0);
  const prev = prevCpuSample;
  prevCpuSample = { idle, total };
  if (!prev || total <= prev.total) {
    return { utilizationPct: null };
  }
  const idleDelta = idle - prev.idle;
  const totalDelta = total - prev.total;
  if (totalDelta <= 0) {
    return { utilizationPct: null };
  }
  const busy = 1 - idleDelta / totalDelta;
  const utilizationPct =
    Math.round(Math.min(100, Math.max(0, busy * 100)) * 10) / 10;
  return { utilizationPct };
}

/**
 * Same query as the original Recipe Deck (known-good on typical NVIDIA inference hosts): one CSV row per GPU,
 * five fields. Per-GPU memory columns support multi-GPU hosts.
 */
export async function nvidiaGpuSnapshot(): Promise<GpuMetrics | null> {
  const env = smiEnv();
  const args = [
    "--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw",
    "--format=csv,noheader,nounits",
  ];

  for (const exe of NVIDIA_SMI_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(exe, args, {
        timeout: 8000,
        maxBuffer: 512 * 1024,
        env,
      });
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) {
        continue;
      }

      const perGpuMem: { usedMiB: number; totalMiB: number }[] = [];
      for (const line of lines) {
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length < 5) continue;
        const memUsedS = parts[2];
        const memTotalS = parts[3];
        const u = memUsedS ? Number.parseFloat(memUsedS) : NaN;
        const t = memTotalS ? Number.parseFloat(memTotalS) : NaN;
        if (!Number.isFinite(u) || !Number.isFinite(t)) continue;
        perGpuMem.push({ usedMiB: u, totalMiB: t });
      }

      const first = lines[0].split(",").map((p) => p.trim());
      const [tempS, utilS, memUsedS, memTotalS, powerS] = first;

      const temperatureC = finiteOrNull(tempS ? Number.parseFloat(tempS) : null);
      const utilizationPct = finiteOrNull(utilS ? Number.parseFloat(utilS) : null);
      let memUsedMiB = finiteOrNull(memUsedS ? Number.parseFloat(memUsedS) : null);
      let memTotalMiB = finiteOrNull(memTotalS ? Number.parseFloat(memTotalS) : null);
      const powerW = finiteOrNull(powerS ? Number.parseFloat(powerS) : null);

      if (perGpuMem.length > 0) {
        memUsedMiB = perGpuMem[0].usedMiB;
        memTotalMiB = perGpuMem[0].totalMiB;
      }

      let perGpuMemOut: { usedMiB: number; totalMiB: number }[] | null =
        perGpuMem.length > 0 ? perGpuMem : null;
      if (
        perGpuMemOut == null &&
        memUsedMiB != null &&
        memTotalMiB != null
      ) {
        perGpuMemOut = [{ usedMiB: memUsedMiB, totalMiB: memTotalMiB }];
      }

      return {
        temperatureC,
        utilizationPct,
        memUsedMiB,
        memTotalMiB,
        powerW,
        gpuCount: lines.length,
        perGpuMem: perGpuMemOut,
      };
    } catch {
      continue;
    }
  }
  return null;
}
