/// <reference types="node" />
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { labelCatalogRpc, markWorkspaceRpc } from "../shared/rpc";
import { connectLocalDaemon, type LocalDaemon } from "./project-icon";

const TIMEOUT_MS = 10_000;

/** Label colors and read state through one local connection; released when the plugin unloads. */
export function createWorkspaceActions(
  connect: () => Promise<LocalDaemon> = () => connectLocalDaemon("cid_project_groups_workspaces"),
) {
  let connection: Promise<LocalDaemon> | null = null;
  let stopped = false;
  const drop = async (pending: Promise<LocalDaemon>) => {
    if (connection === pending) connection = null;
    await pending.then((daemon) => daemon.close()).catch(() => {});
  };
  /** Runs `call` on this host's daemon; null when `hostId` is another host. */
  async function onHost<T>(hostId: string, call: (daemon: LocalDaemon) => Promise<T>): Promise<T | null> {
    if (stopped) return null;
    const pending = (connection ??= connect());
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending.then((daemon) =>
          // Never interpret another host's ids on this daemon.
          stopped || daemon.getLastServerInfoMessage()?.serverId !== hostId ? null : call(daemon),
        ),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Paseo daemon request timed out")), TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      await drop(pending);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    async labels({ hostId }: RpcInput<typeof labelCatalogRpc>): Promise<RpcOutput<typeof labelCatalogRpc>> {
      const result = await onHost(hostId, (daemon) => daemon.listWorkspaceLabels());
      return { labels: result ? result.labels.map(({ name, color }) => ({ name, color })) : null };
    },
    async mark({ hostId, workspaceId, read }: RpcInput<typeof markWorkspaceRpc>): Promise<RpcOutput<typeof markWorkspaceRpc>> {
      const done = await onHost(hostId, async (daemon) => {
        await (read ? daemon.clearWorkspaceAttention(workspaceId) : daemon.markWorkspaceUnread(workspaceId));
        return true;
      });
      return { done: done === true };
    },
    async close() {
      stopped = true;
      if (connection) await drop(connection);
    },
  };
}
