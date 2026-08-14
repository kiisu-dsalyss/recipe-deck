import {
  RUNNER_API_SLOT,
  type DockerListRow,
  type RecipeRunOverrides,
  type SlotId,
  type AppSettingsPayload,
  type AppSettingsSaveBody,
  type FullStatePayload,
  type HfTokenPayload,
  type AutoStartState,
} from "../../../types/index.js";

export type {
  AppSettingsEffective,
  AppSettingsPayload,
  AppSettingsSaveBody,
  AutoStartState as AutoStartApiResponse,
  FullStatePayload,
  HfTokenPayload,
} from "../../../types/index.js";

export async function fetchState(): Promise<FullStatePayload> {
  const r = await fetch("/api/state");
  if (!r.ok) throw new Error(`state ${r.status}`);
  return r.json() as Promise<FullStatePayload>;
}

export async function postRun(body: {
  slot: SlotId;
  recipeStem: string;
  solo: boolean;
  useBuffer?: boolean;
  yamlBuffer?: string;
  recipeOverrides?: RecipeRunOverrides;
}): Promise<void> {
  const r = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 409) {
    const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
    const err = new Error(j.message ?? "Run blocked") as Error & { code?: string };
    err.code = j.error ?? "CONFLICT";
    throw err;
  }
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `run ${r.status}`);
  }
}

export async function postStop(): Promise<void> {
  const r = await fetch("/api/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot: RUNNER_API_SLOT }),
  });
  if (!r.ok) throw new Error(`stop ${r.status}`);
}

export async function postForceKill(): Promise<void> {
  const r = await fetch("/api/force-kill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot: RUNNER_API_SLOT }),
  });
  if (!r.ok) throw new Error(`force-kill ${r.status}`);
}

export async function fetchDockerContainers(): Promise<{ containers: DockerListRow[] }> {
  const r = await fetch("/api/docker/containers");
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `docker list ${r.status}`);
  }
  return r.json() as Promise<{ containers: DockerListRow[] }>;
}

/** Merged image names for recipe `container:` (running + `docker images`). */
export async function fetchDockerImageOptions(): Promise<{ images: string[] }> {
  const r = await fetch("/api/docker/image-options");
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `docker image-options ${r.status}`);
  }
  return r.json() as Promise<{ images: string[] }>;
}

export async function postDockerStop(id: string): Promise<void> {
  const r = await fetch("/api/docker/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `docker stop ${r.status}`);
  }
}

export async function fetchRecipe(name: string): Promise<{ stem: string; content: string }> {
  const r = await fetch(`/api/recipe?name=${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(`recipe ${r.status}`);
  return r.json() as Promise<{ stem: string; content: string }>;
}

export async function saveRecipe(stem: string, content: string): Promise<void> {
  const r = await fetch("/api/recipe/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stem, content }),
  });
  if (!r.ok) throw new Error(`save ${r.status}`);
}

/** Each entry is one line; checked under `$SPARK_VLLM_ROOT/mods/<path>` like run-recipe.py. */
export async function postRecipeModsStatus(
  mods: string[],
): Promise<{ ok: true; exists: boolean[] }> {
  const r = await fetch("/api/recipe/mods-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mods }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `mods-status ${r.status}`);
  }
  return r.json() as Promise<{ ok: true; exists: boolean[] }>;
}

/** Removes the recipe file on the server (usage stats cleared for that stem). */
export async function deleteRecipe(stem: string): Promise<void> {
  const r = await fetch(`/api/recipe?name=${encodeURIComponent(stem)}`, {
    method: "DELETE",
  });
  if (r.status === 409) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(j.message ?? "Stop the run before deleting this recipe.");
  }
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `delete ${r.status}`);
  }
}

/** Persists `recipe_deck.broken` in the YAML on disk. */
export async function postRecipeBroken(stem: string, broken: boolean): Promise<void> {
  const r = await fetch("/api/recipe/broken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stem, broken }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `broken ${r.status}`);
  }
}

export async function fetchHfToken(): Promise<HfTokenPayload> {
  const r = await fetch("/api/settings/hf-token");
  if (!r.ok) throw new Error(`hf ${r.status}`);
  return r.json() as Promise<HfTokenPayload>;
}

/** Save token, or pass `""` to remove it from the env file. */
export async function saveHfToken(token: string): Promise<void> {
  const r = await fetch("/api/settings/hf-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!r.ok) throw new Error(`hf save ${r.status}`);
}

export async function fetchAppSettings(): Promise<AppSettingsPayload> {
  const r = await fetch("/api/settings/app");
  if (!r.ok) throw new Error(`app settings ${r.status}`);
  return r.json() as Promise<AppSettingsPayload>;
}

export async function saveAppSettings(
  body: AppSettingsSaveBody,
): Promise<AppSettingsPayload & { ok: true }> {
  const r = await fetch("/api/settings/app", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as { error?: string } & Partial<AppSettingsPayload>;
  if (!r.ok) {
    throw new Error(j.error ?? `app settings save ${r.status}`);
  }
  return j as AppSettingsPayload & { ok: true };
}

/** Ask the server to `systemctl --user restart` the Recipe Deck unit (production). */
export async function postRestartRecipeDeck(): Promise<void> {
  const r = await fetch("/api/service/restart", { method: "POST" });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `restart ${r.status}`);
  }
}

/** Read auto-start state. */
export async function fetchAutoStart(): Promise<AutoStartState> {
  const r = await fetch("/api/settings/auto-start");
  if (!r.ok) throw new Error(`auto-start fetch ${r.status}`);
  return r.json() as Promise<AutoStartState>;
}

/** Save auto-start state (recipe stem + enabled flag). */
export async function saveAutoStart(
  stem: string,
  autoStart: boolean,
): Promise<void> {
  const r = await fetch("/api/settings/auto-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stem, autoStart }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `auto-start save ${r.status}`);
  }
}

/** Toggle only the auto-start flag for the current recipe. */
export async function toggleAutoStart(autoStart: boolean): Promise<void> {
  const r = await fetch("/api/settings/auto-start/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autoStart }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `auto-start toggle ${r.status}`);
  }
}
