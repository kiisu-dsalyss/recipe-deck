import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveLlmArchiveBin(): string | null {
  const env = process.env.LLM_ARCHIVE_BIN?.trim();
  if (env && fs.existsSync(env)) {
    return env;
  }
  const homeBin = path.join(os.homedir(), ".local", "bin", "llm-archive");
  if (fs.existsSync(homeBin)) {
    return homeBin;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoScript = path.resolve(here, "..", "scripts", "llm-archive");
  if (fs.existsSync(repoScript)) {
    return repoScript;
  }
  return null;
}

/** Run `llm-archive ensure` before spawn. No-op when there is no model or binary. */
export function ensureRecipeModel(
  modelId: string | null,
  onLine: (line: string) => void,
): Promise<void> {
  const repo = modelId?.trim() ?? "";
  if (!repo) {
    return Promise.resolve();
  }
  const bin = resolveLlmArchiveBin();
  if (!bin) {
    onLine("[recipe-deck] llm-archive not installed; skipping ensure");
    return Promise.resolve();
  }
  onLine(`[recipe-deck] llm-archive ensure ${repo}`);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["ensure", repo], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const pump = (buf: Buffer) => {
      for (const line of buf.toString("utf8").split(/\r?\n/)) {
        if (line.trim()) onLine(line);
      }
    };
    child.stdout?.on("data", pump);
    child.stderr?.on("data", pump);
    child.on("error", (err) => {
      reject(new Error(`llm-archive spawn failed: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`llm-archive ensure exited ${code ?? "?"}`));
    });
  });
}
