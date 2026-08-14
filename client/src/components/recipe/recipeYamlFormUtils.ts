/** Strip trailing ` · v…` suffix we add when syncing display name to recipe_version. */
const RECIPE_NAME_VERSION_SUFFIX = /\s*·\s*v[\w.+-]+$/i;

export function stripRecipeVersionSuffix(name: string): string {
  return name.replace(RECIPE_NAME_VERSION_SUFFIX, "").trimEnd();
}

/** vLLM `--max-model-len` style lengths (discrete presets; unknown values get an extra option). */
export const MAX_MODEL_LEN_OPTIONS = [
  2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144,
] as const;
/** Common `max_num_batched_tokens` presets for scheduler batching. */
export const MAX_NUM_BATCHED_TOKENS_OPTIONS = [
  2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144,
] as const;

export function optionsWithCurrent(presets: readonly number[], current: number | undefined): number[] {
  if (current == null || !Number.isFinite(current)) {
    return [...presets];
  }
  const n = Math.round(current);
  if (presets.includes(n)) {
    return [...presets];
  }
  return [...presets, n].sort((a, b) => a - b);
}

export function getNumericDefault(def: Record<string, unknown>, key: string): number | undefined {
  const v = def[key];
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

export function getStr(d: Record<string, unknown>, k: string): string {
  const v = d[k];
  if (v === undefined || v === null) {
    return "";
  }
  return String(v);
}

export function getBool(d: Record<string, unknown>, k: string): boolean {
  return Boolean(d[k]);
}

/** One row per mod line + trailing empty row for “add another”. */
export function initModLinesFromDoc(mods: unknown): string[] {
  if (!Array.isArray(mods) || mods.length === 0) {
    return [""];
  }
  return [...mods.map(String), ""];
}
