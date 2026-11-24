import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const machine = z.object({
  groups: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  assignments: z.record(z.string(), z.string()).default({}),
});

/**
 * Groups for every machine, keyed by serverId. Stored on the host this plugin is
 * installed on (the "home" daemon) because a sidebar view can only read its own
 * installation's settings, not another daemon's. Clients of that host share it.
 */
export const groupSettings = defineSettings({
  id: "groups",
  scope: "host",
  version: 1,
  schema: z.object({ machines: z.record(z.string(), machine).default({}) }),
});

/** Which machine and group headers are folded. Per device. */
export const viewSettings = defineSettings({
  id: "view",
  scope: "device",
  version: 1,
  schema: z.object({ collapsed: z.array(z.string()).default([]) }),
});
