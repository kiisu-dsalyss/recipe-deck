import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export interface ClusterInfo {
  name: string;
  user?: string;
  hosts: string[];
}

/**
 * Parse a cluster YAML string into a `ClusterInfo`.
 * Exported for unit tests; `loadClusterHosts` uses this internally.
 */
export function parseClusterYaml(raw: string, name: string): ClusterInfo | null {
  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;

  const hosts: string[] = [];
  if (Array.isArray(d.hosts)) {
    for (const h of d.hosts) {
      if (typeof h === "string" && h.trim()) {
        hosts.push(h.trim());
      }
    }
  }
  if (hosts.length === 0) return null;

  const user =
    typeof d.user === "string" && d.user.trim() ? d.user.trim() : undefined;
  return { name, user, hosts };
}

/**
 * Load cluster info from sparkrun config directory.
 * Returns null when the directory or cluster YAML does not exist.
 */
export async function loadClusterHosts(
  configDir: string,
  clusterName?: string,
): Promise<ClusterInfo | null> {
  let name = clusterName?.trim();
  if (!name) {
    try {
      const raw = await fs.readFile(
        path.join(configDir, "clusters", ".default"),
        "utf8",
      );
      name = raw.trim();
    } catch {
      return null;
    }
  }
  if (!name) return null;

  const yamlPath = path.join(configDir, "clusters", `${name}.yaml`);
  let raw: string;
  try {
    raw = await fs.readFile(yamlPath, "utf8");
  } catch {
    return null;
  }

  return parseClusterYaml(raw, name);
}

/** Collect all IPv4 addresses currently assigned to local network interfaces. */
export function localIpv4Addresses(): Set<string> {
  const addrs = new Set<string>();
  for (const ifaces of Object.values(os.networkInterfaces())) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === "IPv4") addrs.add(iface.address);
    }
  }
  return addrs;
}

/** True when `host` resolves to the local machine. */
export function isLocalHost(host: string, localAddrs: Set<string>): boolean {
  if (host === "127.0.0.1" || host === "localhost") return true;
  return localAddrs.has(host);
}

/**
 * Short UI label for a host id.
 * IPv4: last octet with dot prefix, e.g. `192.168.1.100` → `.100`
 * Hostname: first label, e.g. `node1.local` → `node1`
 */
export function hostLabel(id: string): string {
  const ipv4 = /^(?:\d{1,3}\.){3}(\d{1,3})$/.exec(id);
  if (ipv4 && ipv4[1]) return `.${ipv4[1]}`;
  return id.split(".")[0] ?? id;
}
