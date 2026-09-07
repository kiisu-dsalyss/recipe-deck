import fs from "node:fs";
import path from "node:path";

const WEIGHT_EXTS = new Set([".safetensors", ".bin", ".pt", ".gguf"]);

export type ModelCacheSource = "nvme" | "archive" | "huggingface";

export function repoIdToHubFolderName(repoId: string): string {
  return `models--${repoId.trim().replace(/\//g, "--")}`;
}

export function parseHotList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function isHotRepo(repoId: string, hotList: readonly string[]): boolean {
  return hotList.includes(repoId.trim());
}

export function modelDir(hfHome: string, repoId: string): string {
  return path.join(hfHome, "hub", repoIdToHubFolderName(repoId));
}

function hasWeightFile(dir: string): boolean {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return false;
  }
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (hasWeightFile(p)) return true;
      continue;
    }
    if (WEIGHT_EXTS.has(path.extname(name).toLowerCase())) {
      return true;
    }
  }
  return false;
}

/** True when a snapshot dir contains real weights (same idea as sparkrun). */
export function isModelCached(hfHome: string, repoId: string): boolean {
  const snaps = path.join(modelDir(hfHome, repoId), "snapshots");
  if (!fs.existsSync(snaps) || !fs.statSync(snaps).isDirectory()) {
    return false;
  }
  for (const name of fs.readdirSync(snaps)) {
    const snap = path.join(snaps, name);
    try {
      if (fs.statSync(snap).isDirectory() && hasWeightFile(snap)) {
        return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

export function decideEnsureSource(opts: {
  repoId: string;
  liveHome: string;
  archiveHome?: string;
}): ModelCacheSource {
  if (isModelCached(opts.liveHome, opts.repoId)) {
    return "nvme";
  }
  const archive = opts.archiveHome?.trim();
  if (archive && isModelCached(archive, opts.repoId)) {
    return "archive";
  }
  return "huggingface";
}

/** Active archive root, or undefined when the feature is off / path empty. */
export function resolveActiveArchiveDir(
  enabledRaw?: string,
  dirRaw?: string,
): string | undefined {
  const dir = dirRaw?.trim() ?? "";
  if (!dir) {
    return undefined;
  }
  if (enabledRaw !== undefined && enabledRaw !== "") {
    const on =
      enabledRaw === "1" ||
      enabledRaw.toLowerCase() === "true" ||
      enabledRaw.toLowerCase() === "yes";
    if (!on) {
      return undefined;
    }
  }
  return path.resolve(dir);
}
