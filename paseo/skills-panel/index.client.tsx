import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SkillsPanel } from "./client/skills-panel";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addWorkspacePanel({
    id: "skills",
    title: "스킬",
    icon: "BookOpen",
    locations: ["explorer"],
    Component: SkillsPanel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-skills",
    title: "스킬 패널 열기",
    icon: "BookOpen",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("skills", { location: "explorer" });
    },
  });

  return () => {
    removeCommand();
    removePanel();
  };
}
