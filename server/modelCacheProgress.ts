import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { loadEnvKeyValue } from "./envMerge.js";
import type { ModelCacheProgress } from "../types/api.js";

const execFileAsync = promisify(execFile);

/** Hugging Face Hub cache folder name for a repo id (e.g. `google/gemma-4-26B-A4B-it` → `models--google--gemma-4-26B-A4B-it`). */
export function repoIdToHubFolderName(repoId: string): string {
  const trimmed = repoId.trim();
  return `models--${trimmed.replace(/\//g, "--")}`;
}

function resolveHubRoot(explicit?: string): string {
  if (explicit && explicit.trim() !== "") {
    return path.resolve(explicit.trim());
  }
  const hfHome = process.env.HF_HOME?.trim();
  if (hfHome) {
    return path.join(path.resolve(hfHome), "hub");
  }
  const home = process.env.HOME ?? process.cwd();
  return path.join(home, ".cache", "huggingface", "hub");
}

/**
 * Hub roots to try for on-disk size. Includes config + `$SPARK_VLLM_ROOT/.env` when provided,
 * so we match `run-recipe.py` even if systemd / Node missed `HF_HOME` (interactive shell only).
 */
/** If the path is not already `.../hub`, also try `.../hub` (handles `HF_HUB_CACHE=.../huggingface`). */
function expandHubParentToHubIfNeeded(p: string): string[] {
  const r = path.resolve(p.trim());
  if (path.basename(r) === "hub") {
    return [r];
  }
  return [r, path.join(r, "hub")];
}

async function hubRootsToTry(
  configHubRoot: string,
  envFile?: string | null,
): Promise<string[]> {
  const seen = new Set<string>();
  const add = (p: string) => {
    for (const x of expandHubParentToHubIfNeeded(p)) {
      const n = path.resolve(x.trim());
      if (n.length > 0) {
        seen.add(n);
      }
    }
  };

  add(configHubRoot);
  add(resolveHubRoot(undefined));

  if (envFile?.trim()) {
    const fromFile = await loadEnvKeyValue(envFile.trim());
    const hubCache = fromFile.HF_HUB_CACHE?.trim();
    const hfHome = fromFile.HF_HOME?.trim();
    /** Same idea as `launch-cluster.sh` `HF_CACHE_DIR` → mount host dir that contains `hub/`. */
    const hfCacheDir = fromFile.HF_CACHE_DIR?.trim();
    if (hubCache) {
      add(hubCache);
    }
    if (hfHome) {
      add(path.join(path.resolve(hfHome), "hub"));
      add(path.resolve(hfHome));
    }
    if (hfCacheDir) {
      add(path.join(path.resolve(hfCacheDir), "hub"));
      add(hfCacheDir);
    }
  }

  return Array.from(seen);
}

async function duDirBytes(dir: string): Promise<number | null> {
  try {
    await fs.access(dir);
  } catch {
    return null;
  }
  try {
    const { stdout } = await execFileAsync("du", ["-sb", dir], {
      maxBuffer: 1024 * 1024,
    });
    const n = Number.parseInt(String(stdout).trim().split(/\s+/)[0] ?? "", 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    try {
      const { stdout } = await execFileAsync("du", ["-sk", dir], {
        maxBuffer: 1024 * 1024,
      });
      const n = Number.parseInt(String(stdout).trim().split(/\s+/)[0] ?? "", 10);
      return Number.isFinite(n) ? n * 1024 : null;
    } catch {
      return null;
    }
  }
}

/** Largest on-disk usage among repo cache dirs under each hub root (handles HF path mismatch). */
async function duRepoFolderBytesBest(
  repoFolderName: string,
  hubRoots: string[],
): Promise<number | null> {
  let best: number | null = null;
  for (const root of hubRoots) {
    const n = await duDirBytes(path.join(root, repoFolderName));
    if (n != null && (best == null || n > best)) {
      best = n;
    }
  }
  return best;
}

interface HfSibling {
  rfilename?: string;
  size?: number;
}

interface HfModelApi {
  sha?: string;
  siblings?: HfSibling[];
  safetensors?: { total?: number };
  gguf?: { total?: number };
}

/** One row from `GET /api/models/{repo}/tree/{rev}?recursive=true` */
interface HfTreeEntry {
  type?: string;
  path?: string;
  size?: number;
}

const expectedBytesCache = new Map<string, { bytes: number; at: number }>();
const EXPECTED_TTL_MS = 60 * 60 * 1000;

function hfAuthHeaders(hfToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const t = hfToken?.trim();
  if (t) {
    headers.Authorization = `Bearer ${t}`;
  }
  return headers;
}

/** RFC 5988 Link header: `<url>; rel="next"` */
function parseNextUrlFromLinkHeader(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const part of linkHeader.split(",")) {
    const m = part.trim().match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (m) {
      return m[1] ?? null;
    }
  }
  return null;
}

/**
 * Total byte size of all files in the repo snapshot from the Hub **tree** API
 * (includes LFS sizes). The lightweight `/api/models/{id}` response lists siblings
 * but does **not** include `size`, so the bar never moved; the tree endpoint does.
 */
async function fetchHfModelApiJson(
  repoId: string,
  hfToken?: string | null,
): Promise<HfModelApi | null> {
  const trimmed = repoId.trim();
  const url = `https://huggingface.co/api/models/${encodeURIComponent(trimmed)}`;
  try {
    const r = await fetch(url, {
      headers: hfAuthHeaders(hfToken),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) {
      return null;
    }
    return (await r.json()) as HfModelApi;
  } catch {
    return null;
  }
}

function expectedBytesFromModelApi(j: HfModelApi | null): number | null {
  if (!j) {
    return null;
  }
  const st = j.safetensors?.total;
  if (typeof st === "number" && Number.isFinite(st) && st > 0) {
    return Math.round(st);
  }
  const gg = j.gguf?.total;
  if (typeof gg === "number" && Number.isFinite(gg) && gg > 0) {
    return Math.round(gg);
  }
  return null;
}

function expectedBytesFromSiblingsJson(j: HfModelApi | null): number | null {
  if (!j) {
    return null;
  }
  const siblings = j.siblings;
  if (!Array.isArray(siblings)) {
    return null;
  }
  let sum = 0;
  let weightish = 0;
  for (const s of siblings) {
    const sz = s.size;
    const name = s.rfilename ?? "";
    if (typeof sz !== "number" || !Number.isFinite(sz)) {
      continue;
    }
    sum += sz;
    if (
      /\.(safetensors|bin|gguf|pt|pth)$/i.test(name) ||
      /model-\d+-of-\d+/i.test(name)
    ) {
      weightish += sz;
    }
  }
  const bytes = weightish > 0 ? weightish : sum;
  return bytes > 0 ? bytes : null;
}

async function fetchHfRepoExpectedBytesFromTree(
  repoId: string,
  hfToken?: string | null,
  extraRevisions: string[] = [],
): Promise<number | null> {
  const trimmed = repoId.trim();
  const headers = hfAuthHeaders(hfToken);
  const revisions = [
    ...extraRevisions.map((r) => r.trim()).filter(Boolean),
    "main",
    "master",
  ];
  const seen = new Set<string>();

  for (const rev of revisions) {
    if (seen.has(rev)) {
      continue;
    }
    seen.add(rev);
    let url: string | null =
      `https://huggingface.co/api/models/${encodeURIComponent(trimmed)}/tree/${encodeURIComponent(rev)}?recursive=true`;
    let total = 0;
    let sawFile = false;
    let treeComplete = true;

    try {
      while (url) {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
        if (!r.ok) {
          treeComplete = false;
          break;
        }
        const data = (await r.json()) as unknown;
        if (!Array.isArray(data)) {
          treeComplete = false;
          break;
        }
        for (const raw of data) {
          if (!raw || typeof raw !== "object") {
            continue;
          }
          const e = raw as HfTreeEntry;
          if (e.type !== "file") {
            continue;
          }
          if (typeof e.size !== "number" || !Number.isFinite(e.size) || e.size < 0) {
            continue;
          }
          total += e.size;
          sawFile = true;
        }
        url = parseNextUrlFromLinkHeader(r.headers.get("link"));
      }
      if (treeComplete && sawFile && total > 0) {
        return total;
      }
    } catch {
      /* try next revision */
    }
  }
  return null;
}

/**
 * Total expected bytes for the repo (Hub tree listing, with sibling fallback).
 */
export async function fetchHfRepoExpectedBytes(
  repoId: string,
  hfToken?: string | null,
): Promise<number | null> {
  const trimmed = repoId.trim();
  if (!/^[^\s/]+\/[^\s/]+$/.test(trimmed)) {
    return null;
  }
  const cached = expectedBytesCache.get(trimmed);
  if (cached && Date.now() - cached.at < EXPECTED_TTL_MS) {
    return cached.bytes;
  }

  const bytes: number | null = await fetchHfRepoExpectedBytesWithModelInfo(
    trimmed,
    hfToken,
  );
  if (bytes == null || bytes <= 0) {
    return null;
  }
  expectedBytesCache.set(trimmed, { bytes, at: Date.now() });
  return bytes;
}

async function fetchHfRepoExpectedBytesWithModelInfo(
  repoId: string,
  hfToken?: string | null,
): Promise<number | null> {
  const trimmed = repoId.trim();
  const card = await fetchHfModelApiJson(trimmed, hfToken);
  const extraRevs: string[] = [];
  if (card?.sha) {
    extraRevs.push(card.sha);
  }

  let bytes = await fetchHfRepoExpectedBytesFromTree(trimmed, hfToken, extraRevs);
  if (bytes == null || bytes <= 0) {
    bytes = expectedBytesFromSiblingsJson(card);
  }
  if (bytes == null || bytes <= 0) {
    bytes = expectedBytesFromModelApi(card);
  }
  return bytes;
}

export type { ModelCacheProgress as ModelCacheProgressSnapshot };

export async function computeModelCacheProgress(
  modelId: string,
  opts: { hfHubCacheDir?: string; hfToken?: string | null; envFile?: string | null },
): Promise<ModelCacheProgress> {
  const repoId = modelId.trim();
  const hubRoot = resolveHubRoot(opts.hfHubCacheDir);
  const hubRoots = await hubRootsToTry(hubRoot, opts.envFile ?? undefined);
  const folderName = repoIdToHubFolderName(repoId);
  const [bytesOnDisk, bytesExpected] = await Promise.all([
    duRepoFolderBytesBest(folderName, hubRoots),
    fetchHfRepoExpectedBytes(repoId, opts.hfToken),
  ]);
  const onDisk = bytesOnDisk ?? 0;
  let percent: number | null = null;
  if (bytesExpected != null && bytesExpected > 0) {
    percent = Math.min(100, Math.round((onDisk / bytesExpected) * 1000) / 10);
  }
  return {
    modelId: repoId,
    bytesOnDisk: onDisk,
    bytesExpected,
    percent,
    expectedSizeError:
      bytesExpected != null && bytesExpected > 0 ? null : "HF size unavailable",
  };
}
