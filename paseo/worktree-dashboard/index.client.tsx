import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Board } from "./client/board";

const screenId = "worktree-board";
const title = "워크트리 보드";

function BoardItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="GitBranch"
      active={currentScreen?.screenId === screenId}
      onPress={() => openScreen({ screenId })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  const removeScreen = client.addScreen({ id: screenId, title, Component: Board });
  const removeItem = client.addSidebarHeaderItem({
    id: screenId,
    title,
    Component: BoardItem,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-worktree-board",
    title,
    context: "global",
    icon: "GitBranch",
    keywords: ["worktree", "agents", "dashboard", "에이전트"],
    onSelect({ openScreen }) {
      openScreen({ screenId });
    },
  });
  return () => {
    removeCommand();
    removeItem();
    removeScreen();
  };
}
