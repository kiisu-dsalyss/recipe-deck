import { readHfTokenFromFile } from "./envMerge.js";
import { decideEnsureSource } from "./llmArchive.js";
import { computeModelCacheProgress } from "./modelCacheProgress.js";
import type { ModelCacheProgress, SlotPhase } from "../types/index.js";

export async function pollBootingModelCache(opts: {
  phase: SlotPhase;
  recipeModelId: string | null;
  hfHubCacheDir: string | undefined;
  hfArchiveDir?: string;
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
  const liveHome = opts.hfHubCacheDir
    ? opts.hfHubCacheDir.replace(/\/hub\/?$/, "")
    : `${process.env.HOME ?? ""}/.cache/huggingface`;
  const source = opts.hfArchiveDir
    ? decideEnsureSource({
        repoId: bootModelId,
        liveHome,
        archiveHome: opts.hfArchiveDir,
      })
    : undefined;
  return {
    modelId: snap.modelId,
    bytesOnDisk: snap.bytesOnDisk,
    bytesExpected: snap.bytesExpected,
    percent: snap.percent,
    source,
  };
}
