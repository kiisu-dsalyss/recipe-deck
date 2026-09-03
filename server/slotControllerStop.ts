import { once } from "node:events";
import type { ChildProcess } from "node:child_process";
import treeKill from "tree-kill";

export function treeKillAsync(pid: number, signal: string): Promise<void> {
  return new Promise((resolve, reject) => {
    treeKill(pid, signal, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function stopChildGraceful(opts: {
  child: ChildProcess;
  graceMs: number;
}): Promise<void> {
  const pid = opts.child.pid;
  if (!pid) {
    return;
  }
  const closeP = once(opts.child, "close");
  try {
    await treeKillAsync(pid, "SIGTERM");
  } catch {
    /* ignore */
  }
  await Promise.race([
    closeP,
    new Promise<void>((r) => setTimeout(r, opts.graceMs)),
  ]);
  try {
    await treeKillAsync(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
  await Promise.race([closeP, new Promise<void>((r) => setTimeout(r, 3000))]);
}

export async function stopChildForce(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid) {
    return;
  }
  try {
    await treeKillAsync(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
  await Promise.race([
    once(child, "close"),
    new Promise<void>((r) => setTimeout(r, 3000)),
  ]);
}

/**
 * Combined stop: cancels the sparkrun cluster (if any) with `sparkrun stop`,
 * then either graceful (SIGTERM → grace → SIGKILL) or force (SIGKILL immediately).
 * Also handles the "no active child" case (still tears down cluster containers).
 */
export async function stopControllerRun(opts: {
  child: ChildProcess | null;
  mode: "graceful" | "force";
  graceMs: number;
  wasCluster: boolean;
  clusterRecipeAbs: string | null;
  runSparkrunStop: (recipeAbs: string) => Promise<void>;
  markIntentionalStop: () => void;
  markIdle: () => void;
}): Promise<void> {
  const clusterAbs =
    opts.wasCluster && opts.clusterRecipeAbs ? opts.clusterRecipeAbs : null;
  if (!opts.child?.pid) {
    if (clusterAbs) {
      opts.markIntentionalStop();
      await opts.runSparkrunStop(clusterAbs);
    }
    opts.markIdle();
    return;
  }
  opts.markIntentionalStop();
  if (clusterAbs) {
    await opts.runSparkrunStop(clusterAbs);
  }
  if (opts.mode === "graceful") {
    await stopChildGraceful({ child: opts.child, graceMs: opts.graceMs });
  } else {
    await stopChildForce(opts.child);
  }
}
