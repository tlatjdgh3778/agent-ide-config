import { createContext, useContext, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Modal, TextInput } from "@getpaseo/plugin/client/ui";

const FontContext = createContext<string | undefined>(undefined);
const useFont = () => {
  const fontFamily = useContext(FontContext);
  return fontFamily ? { fontFamily } : null;
};

export interface Action {
  readonly label: string;
  readonly onPress: () => void;
  readonly danger?: boolean;
}

/** What the `⋯` buttons open: a list of actions, or a name to type. */
export type Dialog =
  | { kind: "actions"; title: string; actions: readonly Action[] }
  | {
      kind: "name";
      title: string;
      initial: string;
      /** Why the name can't be used, or null. */
      problem: (name: string) => string | null;
      submit: (name: string) => void;
    };

export function DialogHost({
  dialog,
  close,
  theme,
  font,
}: {
  dialog: Dialog | null;
  close: () => void;
  theme: PluginTheme;
  /** The app's interface font, when known. */
  font?: string;
}) {
  return (
    <FontContext.Provider value={font}>
    <Modal
      title={dialog?.title ?? ""}
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Content>
        {dialog?.kind === "actions" ? (
          <Actions actions={dialog.actions} close={close} theme={theme} />
        ) : null}
        {dialog?.kind === "name" ? (
          <NameForm key={dialog.title} dialog={dialog} close={close} theme={theme} />
        ) : null}
      </Modal.Content>
    </Modal>
    </FontContext.Provider>
  );
}

function Actions({
  actions,
  close,
  theme,
}: {
  actions: readonly Action[];
  close: () => void;
  theme: PluginTheme;
}) {
  return (
    <View style={{ gap: 2 }}>
      {actions.map((action) => (
        <ActionRow key={action.label} action={action} close={close} theme={theme} />
      ))}
    </View>
  );
}

function ActionRow({ action, close, theme }: { action: Action; close: () => void; theme: PluginTheme }) {
  const [hovered, setHovered] = useState(false);
  const font = useFont();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        close();
        action.onPress();
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 6,
        backgroundColor: hovered ? theme.colors.surface2 : undefined,
      }}
    >
      <Text
        style={[font, {
          fontSize: 13,
          color: action.danger ? theme.colors.statusDanger : theme.colors.foreground,
        }]}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}

function NameForm({
  dialog,
  close,
  theme,
}: {
  dialog: Extract<Dialog, { kind: "name" }>;
  close: () => void;
  theme: PluginTheme;
}) {
  const [name, setName] = useState(dialog.initial);
  const [touched, setTouched] = useState(false);
  const font = useFont();
  const problem = dialog.problem(name);
  const submit = () => {
    setTouched(true);
    if (problem) return;
    close();
    dialog.submit(name);
  };
  const input = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
      color: theme.colors.foreground,
    }),
    [theme],
  );
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        autoFocus
        value={name}
        placeholder="그룹 이름"
        placeholderTextColor={theme.colors.foregroundMuted}
        onChangeText={(text) => {
          setName(text);
          setTouched(true);
        }}
        onSubmitEditing={submit}
        style={[font, input]}
      />
      {touched && problem ? (
        <Text style={[font, { fontSize: 12, color: theme.colors.statusDanger }]}>{problem}</Text>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={close} style={{ padding: 8 }}>
          <Text style={[font, { fontSize: 13, color: theme.colors.foregroundMuted }]}>취소</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={submit}
          disabled={touched && !!problem}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 6,
            backgroundColor: theme.colors.accent,
            opacity: touched && problem ? 0.5 : 1,
          }}
        >
          <Text style={[font, { fontSize: 13, color: theme.colors.accentForeground }]}>저장</Text>
        </Pressable>
      </View>
    </View>
  );
}
