import type { RecipeRunOverrides } from "../types/index.js";

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
  probe: { model: string | null; container: string | null; gpuMemDefault: string | null },
  ro: RecipeRunOverrides | undefined,
  exe: string,
  args: string[],
): { hintParts: string[]; argvDisplay: string; argvShort: string; recipeLaunchHint: string } {
  const hintParts: string[] = [
    `yaml model=${probe.model ?? "?"}`,
    `container=${probe.container ?? "?"}`,
    `yaml_gpu_mem=${probe.gpuMemDefault ?? "?"}`,
  ];
  if (ro?.gpu_memory_utilization !== undefined && Number.isFinite(ro.gpu_memory_utilization)) {
    hintParts.push(`cli --gpu-mem ${ro.gpu_memory_utilization}`);
  }
  if (ro?.tensor_parallel !== undefined && Number.isFinite(ro.tensor_parallel)) {
    hintParts.push(`cli --tensor-parallel ${Math.round(ro.tensor_parallel)}`);
  }
  if (ro?.max_model_len !== undefined && Number.isFinite(ro.max_model_len)) {
    hintParts.push(`cli --max-model-len ${Math.round(ro.max_model_len)}`);
  }
  const cudaHint = ro?.cuda_visible_devices?.trim();
  if (cudaHint) {
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
