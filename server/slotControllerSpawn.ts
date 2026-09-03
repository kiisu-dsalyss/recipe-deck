import type { RecipeLaunchKind, RecipeRunOverrides } from "../types/index.js";

export function pushRecipeOverrideArgs(
  args: string[],
  ro: RecipeRunOverrides | undefined,
): void {
  if (!ro) {
    return;
  }
  if (
    ro.gpu_memory_utilization !== undefined &&
    Number.isFinite(ro.gpu_memory_utilization)
  ) {
    args.push("--gpu-mem", String(ro.gpu_memory_utilization));
  }
  if (ro.tensor_parallel !== undefined && Number.isFinite(ro.tensor_parallel)) {
    args.push("--tensor-parallel", String(Math.round(ro.tensor_parallel)));
  }
  if (ro.max_model_len !== undefined && Number.isFinite(ro.max_model_len)) {
    args.push("--max-model-len", String(Math.round(ro.max_model_len)));
  }
  const cuda = ro.cuda_visible_devices?.trim();
  if (cuda) {
    args.push("-e", `CUDA_VISIBLE_DEVICES=${cuda}`);
  }
}

export function buildLaunchHint(
  probe: {
    model: string | null;
    container: string | null;
    gpuMemDefault: string | null;
  },
  ro: RecipeRunOverrides | undefined,
  exe: string,
  args: string[],
  extras?: { kind?: RecipeLaunchKind; port?: number | null },
): { hintParts: string[]; argvDisplay: string; argvShort: string; recipeLaunchHint: string } {
  const hintParts: string[] = [];
  if (extras?.kind) {
    hintParts.push(`kind=${extras.kind}`);
  }
  hintParts.push(
    `yaml model=${probe.model ?? "?"}`,
    `container=${probe.container ?? "?"}`,
    `yaml_gpu_mem=${probe.gpuMemDefault ?? "?"}`,
  );
  if (extras?.port != null) {
    hintParts.push(`port=${extras.port}`);
  }
  const includeOverrides = extras?.kind !== "sparkrun-cluster";
  if (
    includeOverrides &&
    ro?.gpu_memory_utilization !== undefined &&
    Number.isFinite(ro.gpu_memory_utilization)
  ) {
    hintParts.push(`cli --gpu-mem ${ro.gpu_memory_utilization}`);
  }
  if (
    includeOverrides &&
    ro?.tensor_parallel !== undefined &&
    Number.isFinite(ro.tensor_parallel)
  ) {
    hintParts.push(`cli --tensor-parallel ${Math.round(ro.tensor_parallel)}`);
  }
  if (
    includeOverrides &&
    ro?.max_model_len !== undefined &&
    Number.isFinite(ro.max_model_len)
  ) {
    hintParts.push(`cli --max-model-len ${Math.round(ro.max_model_len)}`);
  }
  const cudaHint = ro?.cuda_visible_devices?.trim();
  if (includeOverrides && cudaHint) {
    hintParts.push(`cli -e CUDA_VISIBLE_DEVICES=${cudaHint}`);
  }

  const argvDisplay = [exe, ...args]
    .map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
    .join(" ");
  const argvShort =
    argvDisplay.length > 280 ? `${argvDisplay.slice(0, 280)}…` : argvDisplay;
  return {
    hintParts,
    argvDisplay,
    argvShort,
    recipeLaunchHint: `${hintParts.join(" · ")} · ${argvShort}`,
  };
}
