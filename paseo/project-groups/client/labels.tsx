import { useRpc, type PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { labelCatalogRpc } from "../shared/rpc";

type Theme = PluginSidebarViewProps["theme"];

export interface LabelDefinition {
  name: string;
  color: string;
}

/** The app's label colors: text per scheme, ground at 10% of the fill color. */
const FILL: Record<string, string> = {
  violet: "#7a6aa8",
  sky: "#3d7ea6",
  emerald: "#388068",
  orange: "#a4673a",
  pink: "#b05c80",
  indigo: "#6a70b8",
  teal: "#368080",
  red: "#b06260",
  amber: "#8f7838",
  blue: "#5179b0",
};
const TEXT_LIGHT: Record<string, string> = {
  violet: "#6d49b5",
  sky: "#3d6985",
  emerald: "#3e6e5d",
  orange: "#845838",
  pink: "#974168",
  indigo: "#5251c2",
  teal: "#3e6d6c",
  red: "#9c4243",
  amber: "#716239",
  blue: "#39649e",
};
const TEXT_DARK: Record<string, string> = {
  violet: "#a392d5",
  sky: "#6aa6ce",
  emerald: "#6cae96",
  orange: "#cc8f64",
  pink: "#d87da3",
  indigo: "#9299d5",
  teal: "#6cacab",
  red: "#d88381",
  amber: "#b29d64",
  blue: "#7ba1d5",
};

/** The app's label key: names match ignoring case and extra spaces. */
export function labelKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** The plugin theme has no scheme flag; a light foreground means a dark theme. */
export function isDark(theme: Theme): boolean {
  const match = /^#?([0-9a-f]{6})/i.exec(theme.colors.foreground.trim());
  if (!match) return true;
  const value = parseInt(match[1], 16);
  const luminance = 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
  return luminance > 128;
}

/** Text and ground for a label; a name missing from the catalog uses the muted text color. */
export function labelColors(color: string | undefined, theme: Theme): { text: string; ground: string } {
  if (!color || !FILL[color]) return { text: theme.colors.foregroundMuted, ground: theme.colors.surface2 };
  return { text: (isDark(theme) ? TEXT_DARK : TEXT_LIGHT)[color], ground: `${FILL[color]}1a` };
}

/**
 * A host's labels with colors. `labels` is null until known, or when this host's daemon does not
 * answer for it; callers then fall back to the names on the workspaces.
 */
export function useLabelCatalog(hostId: string) {
  const read = useRpc(labelCatalogRpc);
  const client = useQueryClient();
  const queryKey = ["project-groups", "labels", hostId];
  const query = useQuery({
    queryKey,
    queryFn: () => read({ hostId }),
    staleTime: 30_000,
    retry: 1,
  });
  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey: ["project-groups", "labels", hostId] }),
    [client, hostId],
  );
  return { labels: query.data?.labels ?? null, refresh };
}

export function LabelChip({
  name,
  color,
  theme,
  fontSize,
  lineHeight,
}: {
  name: string;
  color: string | undefined;
  theme: Theme;
  fontSize: number;
  lineHeight: number;
}) {
  const colors = labelColors(color, theme);
  return (
    <View style={{ flexShrink: 1, minWidth: 0, paddingHorizontal: 6, borderRadius: 999, backgroundColor: colors.ground }}>
      <Text selectable={false} numberOfLines={1} style={{ color: colors.text, fontSize, lineHeight }}>
        {name}
      </Text>
    </View>
  );
}
