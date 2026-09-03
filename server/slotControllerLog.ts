import type { LogRingBuffer } from "./logRing.js";
import type { RollingLogWriter } from "./rollingLog.js";

/**
 * Detect spark-vllm-docker "already running" / "Skipping launch" warnings so the
 * UI can surface a "second recipe may exec into the wrong container" hint.
 * Returns a warning message or null when the line does not indicate reuse.
 */
export function detectSparkContainerReuseInLine(
  line: string,
): string | null {
  const skipLaunch =
    line.includes("Cluster containers are already running") &&
    line.includes("Skipping launch");
  const headReuse =
    /Container ['"][^'"]+['"] is already running on head node/i.test(line);
  if (!skipLaunch && !headReuse) {
    return null;
  }
  return "Spark reused an existing container (log: container already running / Skipping launch). Stop the current run and try again so this recipe gets a fresh container; otherwise exec may run the wrong model or hit VRAM errors.";
}

/**
 * Append a full line (with newline) to the ring buffer + rolling file + WS broadcast.
 */
export function pushLogLine(opts: {
  line: string;
  ring: LogRingBuffer;
  rolling: RollingLogWriter;
  onLine: (full: string) => void;
}): void {
  const full = `${opts.line}\n`;
  opts.ring.push(full);
  opts.rolling.append(full);
  opts.onLine(full);
}
