import type { PluginClientContext, PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { ViewActionsContext, type ViewActions } from "./client/look";
import { messages } from "./client/messages";
import { AppearanceSettings } from "./client/settings-screen";
import { GroupsView } from "./client/view";

const APPEARANCE_SETTINGS_ID = "appearance";

export default function contribute(client: PluginClientContext) {
  const actions: ViewActions = {
    openAppearanceSettings: () => client.openSettings(APPEARANCE_SETTINGS_ID),
  };

  // The sidebar view props carry no client context, so actions arrive through React context.
  function SidebarView(props: PluginSidebarViewProps) {
    return (
      <ViewActionsContext.Provider value={actions}>
        <GroupsView {...props} />
      </ViewActionsContext.Provider>
    );
  }

  const cleanups = [
    client.addSettingsScreen({
      id: APPEARANCE_SETTINGS_ID,
      title: messages.message("plugin.settingsTitle"),
      icon: "SlidersHorizontal",
      Component: AppearanceSettings,
    }),
    client.addSidebarView({
      id: "project-groups",
      title: messages.message("plugin.viewTitle"),
      description: messages.message("plugin.viewDescription"),
      Component: SidebarView,
    }),
  ];
  return async () => {
    for (const cleanup of cleanups) await cleanup();
  };
}
