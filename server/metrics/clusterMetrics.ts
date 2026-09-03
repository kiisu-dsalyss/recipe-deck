import type { HostAccelMetrics } from "../../types/index.js";
import { isLocalHost, localIpv4Addresses, hostLabel } from "./clusterHosts.js";
import { sampleRemoteHostAccel } from "./remoteHostMetrics.js";
import { hostCpuSnapshot, nvidiaGpuSnapshot } from "./hostMetrics.js";

export interface ClusterSampleOpts {
  /** SSH user override (takes priority over cluster YAML `user:`). */
  sshUser?: string;
  /** SSH connect timeout in ms (default 4000). */
  sshTimeoutMs?: number;
}

async function sampleLocalHost(id: string): Promise<HostAccelMetrics> {
  const [cpu, gpu] = await Promise.all([hostCpuSnapshot(), nvidiaGpuSnapshot()]);
  return {
    id,
    label: hostLabel(id),
    local: true,
    cpu,
    gpu,
    updatedAt: new Date().toISOString(),
  };
}

async function sampleRemoteHost(
  id: string,
  opts: ClusterSampleOpts,
): Promise<HostAccelMetrics> {
  try {
    const result = await sampleRemoteHostAccel(id, {
      user: opts.sshUser,
      timeoutMs: opts.sshTimeoutMs,
    });
    if (!result) {
      return {
        id,
        label: hostLabel(id),
        local: false,
        cpu: null,
        gpu: null,
        updatedAt: null,
        error: "SSH sample returned null",
      };
    }
    return {
      id,
      label: hostLabel(id),
      local: false,
      cpu: result.cpu,
      gpu: result.gpu,
      updatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      id,
      label: hostLabel(id),
      local: false,
      cpu: null,
      gpu: null,
      updatedAt: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Sample all cluster hosts in parallel. Local hosts use `/proc/stat` +
 * `nvidia-smi` directly; remote hosts use SSH BatchMode.
 *
 * @param hosts      Host ids from the cluster YAML.
 * @param clusterUser  `user:` field from the cluster YAML (fallback).
 * @param opts       SSH user override + timeout.
 */
export async function buildClusterHostMetrics(
  hosts: string[],
  clusterUser: string | undefined,
  opts: ClusterSampleOpts,
): Promise<HostAccelMetrics[]> {
  const localAddrs = localIpv4Addresses();
  const sshUser = opts.sshUser ?? clusterUser;

  const tasks = hosts.map((host) => {
    if (isLocalHost(host, localAddrs)) {
      return sampleLocalHost(host);
    }
    return sampleRemoteHost(host, { ...opts, sshUser });
  });

  return Promise.all(tasks);
}
