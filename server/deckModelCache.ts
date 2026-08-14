import { readHfTokenFromFile } from "./envMerge.js";
import { computeModelCacheProgress } from "./modelCacheProgress.js";
import type { ModelCacheProgress, SlotPhase } from "../types/index.js";

export async function pollBootingModelCache(opts: {
  phase: SlotPhase;
  recipeModelId: string | null;
  hfHubCacheDir: string | undefined;
  envFile: string;
}): Promise<ModelCacheProgress | null> {
  const bootModelId =
    opts.phase === "BOOTING" && opts.recipeModelId ? opts.recipeModelId : null;
  if (!bootModelId) {
    return null;
  }
  let hfToken: string | null =
    process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN ?? null;
  if (!hfToken?.trim()) {
    hfToken = await readHfTokenFromFile(opts.envFile);
  }
  const tok = hfToken?.trim() || null;

  const snap = await computeModelCacheProgress(bootModelId, {
    hfHubCacheDir: opts.hfHubCacheDir,
    hfToken: tok,
    envFile: opts.envFile,
  });
  return {
    modelId: snap.modelId,
    bytesOnDisk: snap.bytesOnDisk,
    bytesExpected: snap.bytesExpected,
    percent: snap.percent,
  };
}
