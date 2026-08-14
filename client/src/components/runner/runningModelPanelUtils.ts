import type { DockerListRow, RecipeListItem, SlotSnapshot } from "../../../../types/index.js";
import styles from "./RunningModelPanel.module.css";

/** Group by first path segment under `recipes/` (root files → "(root)"). */
export function recipeBookGroups(recipes: RecipeListItem[]): { label: string; items: RecipeListItem[] }[] {
  const map = new Map<string, RecipeListItem[]>();
  for (const r of recipes) {
    const label = r.group?.trim() ? r.group : "(root)";
    if (!map.has(label)) {
      map.set(label, []);
    }
    map.get(label)!.push(r);
  }
  const labels = Array.from(map.keys()).sort((a, b) => {
    if (a === "(root)") {
      return -1;
    }
    if (b === "(root)") {
      return 1;
    }
    return a.localeCompare(b);
  });
  return labels.map((label) => ({ label, items: map.get(label)! }));
}

export function pickPrimaryDockerRow(
  rows: DockerListRow[] | null,
  snapDocker: SlotSnapshot["docker"],
): DockerListRow | null {
  if (!rows?.length) {
    return null;
  }
  if (snapDocker) {
    const { containerName, image } = snapDocker;
    const byName = rows.find(
      (r) =>
        r.names.includes(containerName) ||
        r.image === image ||
        r.image.endsWith(`/${image}`),
    );
    if (byName) {
      return byName;
    }
  }
  return rows[0];
}

export function primaryDockerLine(
  snapDocker: SlotSnapshot["docker"],
  row: DockerListRow | null,
): { label: string; stopId: string | null } {
  if (row) {
    const name = row.names.split(",")[0]?.trim() || row.image;
    return { label: name, stopId: row.id };
  }
  if (snapDocker) {
    return {
      label: snapDocker.containerName || snapDocker.image,
      stopId: null,
    };
  }
  return { label: "—", stopId: null };
}

export function phaseClass(phase: string | undefined): string {
  switch (phase) {
    case "IDLE":
      return styles.badgeIdle;
    case "BOOTING":
      return styles.badgeBoot;
    case "HEALTHY":
      return styles.badgeOk;
    case "ERROR":
      return styles.badgeErr;
    default:
      return styles.badgeIdle;
  }
}
