import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type TextStyle } from "react-native";
import {
  useHosts,
  useWorkspace,
  useWorkspaces,
  type PluginHostSummary,
  type PluginSidebarViewProps,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import type { PluginTheme, WorkspaceIndicator } from "@getpaseo/plugin";
import {
  addGroup,
  assign,
  deleteGroup,
  groupOf,
  machineOf,
  nameProblem,
  newGroupId,
  renameGroup,
  type Machine,
} from "../shared/groups";
import { DialogHost, type Action, type Dialog } from "./dialogs";
import { useAppFont } from "./font";
import { useCollapsed, useGroups, type Change } from "./use-groups";

// Sizes follow Paseo's default workspace list so switching views doesn't jump.
const ROW_HEIGHT = 34;
const AVATAR = 18;
const LABEL = 14;
const SMALL = 12;

interface Ctx {
  view: PluginSidebarViewProps;
  theme: PluginTheme;
  collapsed: readonly string[];
  toggle: (key: string) => void;
  open: (dialog: Dialog) => void;
  change: (edit: Change) => void;
  /** Groups are unavailable (settings unreadable); show workspaces without them. */
  groupsBroken: boolean;
}

const FontContext = createContext<string | undefined>(undefined);

/** Text in the app's interface font. */
function T({ style, ...props }: React.ComponentProps<typeof Text> & { style?: TextStyle }) {
  const fontFamily = useContext(FontContext);
  return <Text {...props} style={[fontFamily ? { fontFamily } : null, style]} />;
}

export function MachineGroups(view: PluginSidebarViewProps) {
  const hosts = useHosts();
  const { settings, change } = useGroups();
  const { collapsed, toggle } = useCollapsed();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const font = useAppFont();
  const theme = view.theme;
  const machines = settings.status === "ready" ? settings.values.machines : {};
  const ctx: Ctx = {
    view,
    theme,
    collapsed,
    toggle,
    open: setDialog,
    change,
    groupsBroken: settings.status === "invalid" || settings.status === "error",
  };
  return (
    <FontContext.Provider value={font}>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: 14 }}>
          {ctx.groupsBroken ? (
            <Note theme={theme} tone="danger">
              그룹 설정을 읽을 수 없어 그룹 없이 표시합니다.
              {"error" in settings ? ` (${settings.error})` : ""}
            </Note>
          ) : null}
          {hosts.map((host) => (
            <MachineSection
              key={host.serverId}
              host={host}
              machine={machineOf(machines, host.serverId)}
              ctx={ctx}
            />
          ))}
        </ScrollView>
        <DialogHost dialog={dialog} close={() => setDialog(null)} theme={theme} font={font} />
      </View>
    </FontContext.Provider>
  );
}

function MachineSection({
  host,
  machine,
  ctx,
}: {
  host: PluginHostSummary;
  machine: Machine;
  ctx: Ctx;
}) {
  const key = `machine:${host.serverId}`;
  const folded = ctx.collapsed.includes(key);
  const online = host.status === "online";
  const refs = useWorkspaces({ hosts: [host.serverId], orderBy: "name" });
  const groups = ctx.groupsBroken ? [] : machine.groups;
  const members = useMemo(() => {
    const byGroup = new Map<string | null, WorkspaceRef[]>();
    for (const ref of refs) {
      const group = ctx.groupsBroken ? null : groupOf(machine, ref.id);
      byGroup.set(group, [...(byGroup.get(group) ?? []), ref]);
    }
    return byGroup;
  }, [refs, machine, ctx.groupsBroken]);

  const newGroup = useCallback(
    (then?: (groupId: string) => Change) =>
      ctx.open({
        kind: "name",
        title: `새 그룹 · ${host.label}`,
        initial: "",
        problem: (name) => nameProblem(machine, name),
        submit: (name) => {
          const id = newGroupId();
          ctx.change((all) => {
            const added = addGroup(all, host.serverId, name, id);
            return then ? then(id)(added) : added;
          });
        },
      }),
    [ctx, host, machine],
  );

  const status =
    host.status === "online"
      ? null
      : host.status === "connecting" || host.status === "idle"
        ? "연결 중…"
        : "오프라인";

  return (
    <View style={{ marginTop: 6 }}>
      <Header
        ctx={ctx}
        title={host.label}
        detail={status}
        folded={folded}
        dim={!online}
        onPress={() => ctx.toggle(key)}
        level="machine"
        action={online && !ctx.groupsBroken ? { icon: "FolderPlus", label: "새 그룹", onPress: () => newGroup() } : undefined}
      />
      {folded || !online ? null : (
        <View>
          {groups.map((group) => (
            <GroupSection
              key={group.id}
              hostId={host.serverId}
              group={group}
              machine={machine}
              refs={members.get(group.id) ?? []}
              ctx={ctx}
              newGroup={newGroup}
            />
          ))}
          {(members.get(null) ?? []).map((ref) => (
            <WorkspaceRow
              key={ref.key}
              reference={ref}
              hostId={host.serverId}
              machine={machine}
              ctx={ctx}
              newGroup={newGroup}
              indent={0}
            />
          ))}
          {refs.length === 0 ? <Note theme={ctx.theme}>작업 공간 없음</Note> : null}
        </View>
      )}
    </View>
  );
}

function GroupSection({
  hostId,
  group,
  machine,
  refs,
  ctx,
  newGroup,
}: {
  hostId: string;
  group: { id: string; name: string };
  machine: Machine;
  refs: readonly WorkspaceRef[];
  ctx: Ctx;
  newGroup: (then?: (groupId: string) => Change) => void;
}) {
  const key = `group:${hostId}:${group.id}`;
  const folded = ctx.collapsed.includes(key);
  const menu = () =>
    ctx.open({
      kind: "actions",
      title: group.name,
      actions: [
        {
          label: "이름 변경",
          onPress: () =>
            ctx.open({
              kind: "name",
              title: `이름 변경 · ${group.name}`,
              initial: group.name,
              problem: (name) => nameProblem(machine, name, group.id),
              submit: (name) => ctx.change((all) => renameGroup(all, hostId, group.id, name)),
            }),
        },
        {
          label: "삭제",
          danger: true,
          onPress: () => ctx.change((all) => deleteGroup(all, hostId, group.id)),
        },
      ],
    });
  return (
    <View>
      <Header
        ctx={ctx}
        title={group.name}
        detail={refs.length ? String(refs.length) : null}
        folded={folded}
        onPress={() => ctx.toggle(key)}
        level="group"
        action={{ icon: "Ellipsis", label: "그룹 메뉴", onPress: menu }}
      />
      {folded
        ? null
        : refs.map((ref) => (
            <WorkspaceRow
              key={ref.key}
              reference={ref}
              hostId={hostId}
              machine={machine}
              ctx={ctx}
              newGroup={newGroup}
              indent={1}
            />
          ))}
    </View>
  );
}

function Header({
  ctx,
  title,
  detail,
  folded,
  dim,
  onPress,
  action,
  level,
}: {
  ctx: Ctx;
  title: string;
  detail: string | null;
  folded: boolean;
  dim?: boolean;
  onPress: () => void;
  action?: { icon: string; label: string; onPress: () => void };
  level: "machine" | "group";
}) {
  const [hovered, setHovered] = useState(false);
  const { theme } = ctx;
  const machine = level === "machine";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folded ? "펼치기" : "접기"} ${title}`}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        height: machine ? 30 : ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingLeft: machine ? 14 : 12,
        paddingRight: 8,
        marginHorizontal: machine ? 0 : 6,
        borderRadius: 6,
        backgroundColor: !machine && hovered ? theme.colors.surface1 : undefined,
        opacity: dim ? 0.55 : 1,
      }}
    >
      {machine ? null : (
        <View style={{ width: AVATAR, alignItems: "center" }}>
          <Icon
            name={folded ? "Folder" : "FolderOpen"}
            size={15}
            color={theme.colors.foregroundMuted}
          />
        </View>
      )}
      <T
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: machine ? SMALL : LABEL,
          fontWeight: machine ? "500" : "400",
          color: machine ? theme.colors.foregroundMuted : theme.colors.foreground,
        }}
      >
        {title}
      </T>
      {machine && (hovered || folded) ? (
        <Icon
          name={folded ? "ChevronRight" : "ChevronDown"}
          size={12}
          color={theme.colors.foregroundMuted}
        />
      ) : null}
      {detail ? (
        <T style={{ fontSize: SMALL, color: theme.colors.foregroundMuted }}>{detail}</T>
      ) : null}
      <View style={{ flex: 1 }} />
      {action ? (
        <IconButton
          icon={action.icon}
          label={action.label}
          visible={hovered || ctx.view.layout.compact}
          onPress={action.onPress}
          theme={theme}
        />
      ) : null}
    </Pressable>
  );
}

function WorkspaceRow({
  reference,
  hostId,
  machine,
  ctx,
  newGroup,
  indent,
}: {
  reference: WorkspaceRef;
  hostId: string;
  machine: Machine;
  ctx: Ctx;
  newGroup: (then?: (groupId: string) => Change) => void;
  indent: number;
}) {
  const workspace = useWorkspace(reference);
  const [hovered, setHovered] = useState(false);
  const { theme, view } = ctx;
  if (!workspace) return null;
  // A checkout's own name is its branch ("main"), which says little on its own; lead
  // with the project and keep the branch as the dimmer tail.
  const name = workspace.title ?? workspace.projectDisplayName;
  const branch = workspace.branch && workspace.branch !== name ? workspace.branch : null;
  const active = view.active.workspace?.key === reference.key;
  const current = groupOf(machine, reference.id);
  const menu = () => {
    const actions: Action[] = machine.groups
      .filter((g) => g.id !== current)
      .map((g) => ({
        label: `${g.name}(으)로 이동`,
        onPress: () => ctx.change((all) => assign(all, hostId, reference.id, g.id)),
      }));
    if (current)
      actions.push({
        label: "그룹에서 빼기",
        onPress: () => ctx.change((all) => assign(all, hostId, reference.id, null)),
      });
    actions.push({
      label: "새 그룹 만들어 넣기",
      onPress: () => newGroup((id) => (all) => assign(all, hostId, reference.id, id)),
    });
    ctx.open({ kind: "actions", title: name, actions });
  };
  const dot = indicatorColor(theme, workspace.indicator);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`열기 ${name}`}
      onPress={() => view.navigation.openWorkspace(reference)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        height: ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: 12 + indent * 16,
        paddingRight: 8,
        marginHorizontal: 6,
        borderRadius: 6,
        backgroundColor: active ? theme.colors.surface2 : hovered ? theme.colors.surface1 : undefined,
      }}
    >
      <Avatar name={workspace.projectDisplayName} theme={theme} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        {/* The branch gives way first; the name only truncates once the branch is gone. */}
        <T
          numberOfLines={1}
          style={{ flexShrink: 0, maxWidth: "100%", fontSize: LABEL, color: theme.colors.foreground }}
        >
          {name}
        </T>
        {branch ? (
          <T
            numberOfLines={1}
            style={{ flexShrink: 1, minWidth: 0, fontSize: SMALL, color: theme.colors.foregroundMuted }}
          >
            {branch}
          </T>
        ) : null}
      </View>
      {ctx.groupsBroken ? null : (
        <IconButton
          icon="Ellipsis"
          label="작업 공간 메뉴"
          visible={hovered || view.layout.compact}
          onPress={menu}
          theme={theme}
        />
      )}
      {dot ? (
        <View
          accessibilityLabel={workspace.indicatorLabel ?? workspace.indicator}
          style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }}
        />
      ) : null}
    </Pressable>
  );
}

// Project letter tiles, in the spirit of the default list's project icons.
const TILE_COLORS = ["#4f7bd9", "#c7932f", "#3d8fb8", "#c4524f", "#7b62c9", "#3f9d6b", "#c2618f"];

function tileColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

function Avatar({ name, theme }: { name: string; theme: PluginTheme }) {
  const letter = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <View
      style={{
        width: AVATAR,
        height: AVATAR,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tileColor(name),
      }}
    >
      <T style={{ fontSize: 11, fontWeight: "600", color: theme.colors.accentForeground }}>{letter}</T>
    </View>
  );
}

function indicatorColor(theme: PluginTheme, indicator: WorkspaceIndicator): string | null {
  switch (indicator) {
    case "needs_input":
    case "attention":
      return theme.colors.statusWarning;
    case "failed":
      return theme.colors.statusDanger;
    case "running":
      return theme.colors.accent;
    default:
      return null;
  }
}

function IconButton({
  icon,
  label,
  visible,
  onPress,
  theme,
}: {
  icon: string;
  label: string;
  visible: boolean;
  onPress: () => void;
  theme: PluginTheme;
}) {
  const [hovered, setHovered] = useState(false);
  // Hidden buttons take no room, so a narrow sidebar spends it on the name.
  if (!visible) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(event) => {
        event.stopPropagation?.();
        onPress();
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        width: 22,
        height: 22,
        borderRadius: 5,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hovered ? theme.colors.surface2 : undefined,
      }}
    >
      <Icon
        name={icon}
        size={14}
        color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
      />
    </Pressable>
  );
}

function Note({
  theme,
  tone,
  children,
}: {
  theme: PluginTheme;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <T
      style={{
        fontSize: SMALL,
        paddingHorizontal: 14,
        paddingVertical: 6,
        color: tone === "danger" ? theme.colors.statusDanger : theme.colors.foregroundMuted,
      }}
    >
      {children}
    </T>
  );
}
