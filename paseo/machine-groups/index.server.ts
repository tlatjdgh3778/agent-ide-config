import type { PluginServerContext } from "@getpaseo/plugin/server";
import { groupSettings } from "./shared/settings";

// Host-scoped settings are served by the daemon, so they are registered here.
// The device-scoped view settings stay on each client and need nothing on the server.
export default function contribute(server: PluginServerContext) {
  server.registerSettings(groupSettings);
  return () => {};
}
