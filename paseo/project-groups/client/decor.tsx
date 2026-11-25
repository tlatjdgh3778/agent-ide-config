import type { PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { Decoration, DecorationKind, DecorationsValues } from "../shared/settings";
import { useT } from "./i18n";
import { searchIcons } from "./lucide-names";
import { firstGraphemes } from "./text";

type Theme = PluginSidebarViewProps["theme"];

/** Mid-tone colors that stay readable as text on both light and dark sidebars. */
export const PALETTE = [
  { color: "#E5484D", name: "red" },
  { color: "#F76B15", name: "orange" },
  { color: "#D6A100", name: "yellow" },
  { color: "#30A46C", name: "green" },
  { color: "#12A594", name: "teal" },
  { color: "#0090FF", name: "blue" },
  { color: "#3E63DD", name: "indigo" },
  { color: "#8E4EC6", name: "purple" },
  { color: "#D6409F", name: "pink" },
  { color: "#AD7F58", name: "brown" },
  { color: "#8B8D98", name: "gray" },
] as const;

/** Lucide names offered in the picker. Search reaches the rest; any emoji works as well. */
export const ICONS: readonly string[] = [
  "Folder",
  "FolderGit2",
  "Code",
  "Terminal",
  "Globe",
  "Server",
  "Database",
  "Smartphone",
  "Monitor",
  "Package",
  "Rocket",
  "FlaskConical",
  "BookOpen",
  "FileText",
  "PenTool",
  "Palette",
  "Briefcase",
  "Building2",
  "House",
  "Users",
  "Heart",
  "Star",
  "Zap",
  "Bot",
  "Brain",
  "GraduationCap",
  "Shield",
  "Cloud",
  "Gamepad2",
  "Music",
  "Camera",
  "Leaf",
  "Anchor",
  "Waves",
  "Flag",
  "Lightbulb",
];

/** Five rows of 36px icon cells with 4px gaps, so typing a search never resizes the dialog. */
const ICON_GRID_HEIGHT = 5 * 36 + 4 * 4;

export const EMPTY_DECORATION: Decoration = { color: null, icon: null };

export function isEmptyDecoration(decoration: Decoration): boolean {
  return decoration.color === null && decoration.icon === null;
}

/** Draws a stored icon (`lucide:` or `emoji:`), else the fallback Lucide icon, else nothing. */
export function DecorIcon({
  icon,
  fallback,
  color,
  size,
}: {
  icon: string | null;
  fallback: string | null;
  color: string;
  size: number;
}) {
  if (icon?.startsWith("emoji:")) {
    return (
      <Text
        selectable={false}
        // Older versions stored up to 8 characters; keep those on one line instead of wrapping.
        numberOfLines={1}
        style={{ fontSize: size - 1, lineHeight: size + 3, width: size + 2, textAlign: "center" }}
      >
        {icon.slice("emoji:".length)}
      </Text>
    );
  }
  const name = icon?.startsWith("lucide:") ? icon.slice("lucide:".length) : fallback;
  return name ? <Icon name={name} size={size} color={color} /> : null;
}

export interface DecorateTarget {
  kind: DecorationKind;
  key: string;
  name: string;
}

export interface Decorations {
  values: DecorationsValues;
  get(kind: DecorationKind, key: string): Decoration;
  open(target: DecorateTarget): void;
}

const EMPTY_VALUES: DecorationsValues = { groups: {}, projects: {}, workspaces: {} };

export const DecorationsContext = createContext<Decorations>({
  values: EMPTY_VALUES,
  get: () => EMPTY_DECORATION,
  open: () => {},
});
export const useDecorations = () => useContext(DecorationsContext);

function Swatch({
  color,
  label,
  selected,
  theme,
  onPress,
}: {
  color: string | null;
  label: string;
  selected: boolean;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: selected ? theme.colors.foreground : "transparent",
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: color ?? "transparent",
          borderWidth: color ? 0 : 1,
          borderColor: theme.colors.border,
        }}
      >
        {color ? null : <Icon name="Ban" size={13} color={theme.colors.foregroundMuted} />}
      </View>
    </Pressable>
  );
}

function IconCell({
  label,
  selected,
  theme,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  theme: Theme;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: selected ? theme.colors.accent : "transparent",
        backgroundColor: selected ? theme.colors.surface2 : undefined,
      }}
    >
      {children}
    </Pressable>
  );
}

function SectionTitle({ title, theme }: { title: string; theme: Theme }) {
  return <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{title}</Text>;
}

/**
 * Picks a color, and for groups and projects an icon. Changes preview in the dialog and are
 * saved once with Done, so quick taps never race each other.
 */
export function DecorateDialog({
  target,
  initial,
  theme,
  onSave,
  onClose,
}: {
  target: DecorateTarget;
  initial: Decoration;
  theme: Theme;
  onSave: (decoration: Decoration) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Decoration>(initial);
  // The emoji field is uncontrolled so phone keyboards can compose text undisturbed. Picking a
  // listed icon clears it by remounting it with an empty seed.
  const [emojiSeed, setEmojiSeed] = useState(
    initial.icon?.startsWith("emoji:") ? initial.icon.slice(6) : "",
  );
  const [emojiField, setEmojiField] = useState(0);
  const clearEmojiField = () => {
    setEmojiSeed("");
    setEmojiField((field) => field + 1);
  };
  // Uncontrolled like the emoji field; the state only mirrors what was typed.
  const [query, setQuery] = useState("");
  const withIcon = target.kind !== "workspaces";
  const fallback = target.kind === "projects" ? "Folder" : null;
  const iconColor = draft.color ?? theme.colors.foregroundMuted;
  // Keep an icon picked from search in view when the dialog opens again.
  const picked = initial.icon?.startsWith("lucide:") ? initial.icon.slice("lucide:".length) : null;
  const listed = picked && !ICONS.includes(picked) ? [picked, ...ICONS] : ICONS;
  const shown = query.trim() ? searchIcons(query, 48) : listed.filter((name) => name !== fallback);
  const title =
    target.kind === "workspaces"
      ? t("decorate.titleColor", { name: target.name })
      : t("decorate.titleWithIcon", { name: target.name });

  const setEmojiIcon = (text: string) => {
    // The icon slot holds one character, so keep the first whole emoji or letter.
    const value = firstGraphemes(text.trim(), 1);
    setDraft((current) => ({
      ...current,
      icon: value ? `emoji:${value}` : current.icon?.startsWith("emoji:") ? null : current.icon,
    }));
  };

  return (
    <Modal title={title} open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Modal.Content>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface1,
          }}
        >
          {withIcon ? <DecorIcon icon={draft.icon} fallback={fallback} color={iconColor} size={16} /> : null}
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontSize: 14, color: draft.color ?? theme.colors.foreground }}
          >
            {target.name}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle title={t("decorate.color")} theme={theme} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            <Swatch
              color={null}
              label={t("decorate.defaultColor")}
              selected={draft.color === null}
              theme={theme}
              onPress={() => setDraft((current) => ({ ...current, color: null }))}
            />
            {PALETTE.map((item) => (
              <Swatch
                key={item.color}
                color={item.color}
                label={t(`decorate.colors.${item.name}`)}
                selected={draft.color === item.color}
                theme={theme}
                onPress={() => setDraft((current) => ({ ...current, color: item.color }))}
              />
            ))}
          </View>
        </View>

        {withIcon ? (
          <View style={{ gap: 8 }}>
            <SectionTitle title={t("decorate.icon")} theme={theme} />
            <TextInput
              accessibilityLabel={t("decorate.iconSearchLabel")}
              onChangeText={setQuery}
              placeholder={t("decorate.iconSearchPlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                color: theme.colors.foreground,
                fontSize: 14,
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface1,
              }}
            />
            <ScrollView style={{ height: ICON_GRID_HEIGHT }} nestedScrollEnabled>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                <IconCell
                  label={fallback ? t("decorate.defaultIcon") : t("decorate.noIcon")}
                  selected={draft.icon === null}
                  theme={theme}
                  onPress={() => {
                    clearEmojiField();
                    setDraft((current) => ({ ...current, icon: null }));
                  }}
                >
                  {fallback ? (
                    <Icon name={fallback} size={17} color={iconColor} />
                  ) : (
                    <Icon name="Ban" size={15} color={theme.colors.foregroundMuted} />
                  )}
                </IconCell>
                {shown.map((name) => (
                  <IconCell
                    key={name}
                    label={name}
                    selected={draft.icon === `lucide:${name}`}
                    theme={theme}
                    onPress={() => {
                      clearEmojiField();
                      setDraft((current) => ({ ...current, icon: `lucide:${name}` }));
                    }}
                  >
                    <Icon name={name} size={17} color={iconColor} />
                  </IconCell>
                ))}
              </View>
              {shown.length === 0 ? (
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
                  {t("decorate.noIconMatch")}
                </Text>
              ) : null}
            </ScrollView>
            <TextInput
              key={emojiField}
              accessibilityLabel={t("decorate.emojiLabel")}
              defaultValue={emojiSeed}
              onChangeText={setEmojiIcon}
              placeholder={t("decorate.emojiPlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              style={{
                color: theme.colors.foreground,
                fontSize: 14,
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: draft.icon?.startsWith("emoji:") ? theme.colors.accent : theme.colors.border,
                backgroundColor: theme.colors.surface1,
              }}
            />
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("decorate.reset")}
            onPress={() => {
              clearEmojiField();
              setDraft({ color: null, icon: null });
            }}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginRight: "auto" }}
          >
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>{t("decorate.reset")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={onClose}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 6,
              backgroundColor: theme.colors.surface2,
            }}
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.done")}
            onPress={() => onSave(draft)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 6,
              backgroundColor: theme.colors.accent,
            }}
          >
            <Text style={{ color: theme.colors.accentForeground, fontSize: 13 }}>{t("common.done")}</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
