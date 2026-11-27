import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const favoriteSettings = defineSettings({
  id: "favorites",
  scope: "host",
  version: 1,
  schema: z.object({ names: z.array(z.string()).default([]) }),
});

export const groupViewSchema = z.object({
  expanded: z.record(z.string(), z.boolean()),
});
