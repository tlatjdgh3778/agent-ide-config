import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readCodexSkillSources } from "./server/codex-skills";
import { favoriteSettings } from "./shared/settings";
import { skillSourcesRpc } from "./shared/skill-sources";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(favoriteSettings);
  server.handle(skillSourcesRpc, async ({ agentId, workspaceId }, { paseo }) => {
    const agent = paseo.agents.ref(agentId);
    await agent.refresh();
    const snapshot = agent.current();
    if (snapshot?.provider !== "codex" || snapshot.workspaceId !== workspaceId || snapshot.archivedAt) {
      throw new Error("이 작업공간에서 Codex 세션을 찾을 수 없습니다.");
    }
    return readCodexSkillSources(snapshot.cwd);
  });
  return () => {};
}
