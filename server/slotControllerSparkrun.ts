import { spawn } from "node:child_process";

/**
 * Best-effort `sparkrun stop <recipe>` to tear down cluster containers.
 * Streams stdout/stderr into `onLine` and always resolves (never rejects) — the
 * caller still SIGTERMs / SIGKILLs the parent process.
 * Enforces a hard 60s cap so a hung sparkrun never blocks stopGraceful.
 */
export function sparkrunStop(opts: {
  sparkrunBin: string;
  sparkrunExtraArgs: string[];
  cwd: string;
  recipeAbsPath: string;
  onLine: (line: string) => void;
}): Promise<void> {
  const args = [...opts.sparkrunExtraArgs, "stop", opts.recipeAbsPath];
  opts.onLine(
    `[recipe-deck] sparkrun stop: ${[opts.sparkrunBin, ...args].join(" ")}`,
  );
  return new Promise<void>((resolve) => {
    const child = spawn(opts.sparkrunBin, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d: Buffer) => opts.onLine(d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => opts.onLine(d.toString("utf8")));
    child.on("close", () => resolve());
    child.on("error", (err) => {
      opts.onLine(`[recipe-deck] sparkrun stop error: ${err.message}`);
      resolve();
    });
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve();
    }, 60_000);
  });
}
