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
