import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MachineGroups } from "./client/sidebar";

export default function contribute(client: PluginClientContext) {
  return client.addSidebarView({
    id: "machine-groups",
    title: "Machine groups",
    description: "Workspaces by machine, in groups you make per machine.",
    Component: MachineGroups,
  });
}
