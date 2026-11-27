import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const skillSourceSchema = z.enum(["workspace", "user", "system", "admin", "plugin"]);
export type SkillSource = z.infer<typeof skillSourceSchema>;

export const skillSourcesRpc = defineRpc({
  name: "skills.sources",
  input: z.object({ agentId: z.string().min(1), workspaceId: z.string().min(1) }),
  output: z.array(z.object({
    name: z.string(),
    description: z.string(),
    source: skillSourceSchema,
  })),
});

export type SkillSourceEntry = z.output<typeof skillSourcesRpc.output>[number];
