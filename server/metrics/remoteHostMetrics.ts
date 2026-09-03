import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CpuMetrics, GpuMetrics } from "../../types/index.js";

const execFileAsync = promisify(execFile);

/** Per-host previous `/proc/stat` sample for CPU utilization delta. */
const prevCpuSamples = new Map<string, { idle: number; total: number }>();

const SSH_CANDIDATES = ["/usr/bin/ssh", "ssh"];

/**
 * Remote command: print one CPU line then nvidia-smi CSV.
 * `[N/A]` on unified-memory hosts is handled by treating non-finite values as null.
 */
const REMOTE_CMD =
  "printf 'CPU %s\\n' \"$(awk '/^cpu /{print $0}' /proc/stat)\";" +
  " nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw" +
  " --format=csv,noheader,nounits 2>/dev/null || true";

export interface RemoteSshOpts {
  user?: string;
  timeoutMs?: number;
  /** Override SSH binary (default: try /usr/bin/ssh then ssh). */
  sshBin?: string;
}

function finiteOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n;
}

/**
 * Parse the combined stdout of the remote SSH command into CPU + GPU metrics.
 *
 * @param stdout  Raw output from the remote command.
 * @param prev    Previous `/proc/stat` idle/total from the last sample (null on first call).
 * @returns Parsed metrics and the new CPU sample to persist between calls.
 *
 * Exported for unit tests via `parseRemoteAccelStdout`.
 */
export function parseRemoteAccelStdout(
  stdout: string,
  prev: { idle: number; total: number } | null,
): {
  cpu: CpuMetrics | null;
  gpu: GpuMetrics | null;
  newCpuSample: { idle: number; total: number } | null;
} {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);

  let cpu: CpuMetrics | null = null;
  let newCpuSample: { idle: number; total: number } | null = null;
  const gpuLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("CPU cpu")) {
      const nums = line
        .replace(/^CPU cpu\s*/, "")
        .trim()
        .split(/\s+/)
        .map(Number);
      if (nums.length >= 4 && nums.every(Number.isFinite)) {
        const idle = (nums[3] ?? 0) + (nums[4] ?? 0);
        const total = nums.reduce((a, b) => a + b, 0);
        newCpuSample = { idle, total };
        if (prev && total > prev.total) {
          const idleDelta = idle - prev.idle;
          const totalDelta = total - prev.total;
          const busy = totalDelta > 0 ? 1 - idleDelta / totalDelta : 0;
          cpu = {
            utilizationPct:
              Math.round(Math.min(100, Math.max(0, busy * 100)) * 10) / 10,
          };
        } else {
          cpu = { utilizationPct: null };
        }
      }
    } else {
      gpuLines.push(line);
    }
  }

  const validLines = gpuLines.filter(Boolean);
  if (validLines.length === 0) {
    return { cpu, gpu: null, newCpuSample };
  }

  const perGpuMem: { usedMiB: number; totalMiB: number }[] = [];
  for (const line of validLines) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 5) continue;
    const u = parts[2] ? Number.parseFloat(parts[2]) : NaN;
    const t = parts[3] ? Number.parseFloat(parts[3]) : NaN;
    if (Number.isFinite(u) && Number.isFinite(t)) {
      perGpuMem.push({ usedMiB: u, totalMiB: t });
    }
  }

  const first = validLines[0].split(",").map((p) => p.trim());
  const [tempS, utilS, memUsedS, memTotalS, powerS] = first;

  const temperatureC = finiteOrNull(tempS ? Number.parseFloat(tempS) : null);
  const utilizationPct = finiteOrNull(utilS ? Number.parseFloat(utilS) : null);
  let memUsedMiB = finiteOrNull(memUsedS ? Number.parseFloat(memUsedS) : null);
  let memTotalMiB = finiteOrNull(memTotalS ? Number.parseFloat(memTotalS) : null);
  const powerW = finiteOrNull(powerS ? Number.parseFloat(powerS) : null);

  if (perGpuMem.length > 0 && perGpuMem[0]) {
    memUsedMiB = perGpuMem[0].usedMiB;
    memTotalMiB = perGpuMem[0].totalMiB;
  }

  let perGpuMemOut: { usedMiB: number; totalMiB: number }[] | null =
    perGpuMem.length > 0 ? perGpuMem : null;
  if (perGpuMemOut == null && memUsedMiB != null && memTotalMiB != null) {
    perGpuMemOut = [{ usedMiB: memUsedMiB, totalMiB: memTotalMiB }];
  }

  const gpu: GpuMetrics = {
    temperatureC,
    utilizationPct,
    memUsedMiB,
    memTotalMiB,
    powerW,
    gpuCount: validLines.length,
    perGpuMem: perGpuMemOut,
  };
  return { cpu, gpu, newCpuSample };
}

/**
 * Sample CPU and GPU on a remote host via SSH.
 * Returns null on connection failure or timeout — never throws to the caller.
 */
export async function sampleRemoteHostAccel(
  host: string,
  opts: RemoteSshOpts = {},
): Promise<{ cpu: CpuMetrics | null; gpu: GpuMetrics | null } | null> {
  const { user, timeoutMs = 4000, sshBin } = opts;
  const target = user ? `${user}@${host}` : host;
  const connectTimeout = Math.max(1, Math.ceil(timeoutMs / 1000));

  const args = [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", `ConnectTimeout=${connectTimeout}`,
    target,
    REMOTE_CMD,
  ];

  const candidates = sshBin ? [sshBin] : SSH_CANDIDATES;
  for (const exe of candidates) {
    try {
      const { stdout } = await execFileAsync(exe, args, {
        timeout: timeoutMs + 1000,
        maxBuffer: 64 * 1024,
        env: { ...process.env, LC_ALL: "C", LANG: "C" },
      });
      const prev = prevCpuSamples.get(host) ?? null;
      const result = parseRemoteAccelStdout(stdout, prev);
      if (result.newCpuSample) {
        prevCpuSamples.set(host, result.newCpuSample);
      }
      return { cpu: result.cpu, gpu: result.gpu };
    } catch {
      continue;
    }
  }
  return null;
}
