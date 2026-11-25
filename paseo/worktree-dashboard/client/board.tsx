import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import {
  type AgentRef,
  type PluginScreenProps,
  type WorkspaceRef,
  useAgent,
  useAgents,
  useWorkspace,
  useWorkspaces,
} from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { CatSprite } from "./cat-sprite";
import {
  type AgentNode,
  type AgentState,
  type Filter,
  agentState,
  agentStateLabel,
  buildTree,
  compareAgents,
  compareWorkspaces,
  providerName,
  statusLabels,
  workspaceState,
} from "./state";

const filters: readonly Filter[] = ["all", "needs", "work", "ready", "failed", "idle"];
const noAgents: readonly AgentRef[] = [];
const mono = Platform.OS === "ios" ? "Menlo" : "monospace";

type Theme = PluginScreenProps["theme"]["colors"];
type Navigation = PluginScreenProps["navigation"];
type Visual = {
  colors: Theme;
  mode: "dark" | "light";
  tones: Record<AgentState, string>;
};

const statusTones = {
  dark: { needs: "#fbc17c", work: "#9bbffa", ready: "#a0d5a7", failed: "#f3a2ab" },
  light: { needs: "#945000", work: "#285ca9", ready: "#267245", failed: "#a43648" },
};
const kinds = {
  worktree: "워크트리", directory: "폴더", checkout: "체크아웃", local_checkout: "원본 체크아웃",
};
const agentWorkspaceKey = (key: string) => `workspace:${key}`;
const withinWorkspaceKey = (key: string, state: AgentState) => `within:${state}:${key}`;
const stateKey = (state: AgentState) => `state:${state}`;

function isDark(color: string, fallback: boolean) {
  if (!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color)) return fallback;
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 128;
}

export function Board(props: PluginScreenProps) {
  return <HostBoard key={props.host.id} {...props} />;
}

function HostBoard({ host, layout, navigation, theme }: PluginScreenProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [onlyWorktrees, setOnlyWorktrees] = useState(false);
  const [width, setWidth] = useState(0);
  const darkSystem = useColorScheme() === "dark";
  const colors = theme.colors;
  const mode = isDark(colors.surface0, darkSystem) ? "dark" : "light";
  const visual: Visual = { colors, mode, tones: { ...statusTones[mode], idle: colors.foregroundMuted } };

  const allProjects = useWorkspaces({
    hosts: [host.id],
    where: workspace => !workspace.background && !workspace.archivingAt,
    orderBy: compareWorkspaces,
    groupBy: workspace => ({ key: workspace.project.key, title: workspace.projectDisplayName }),
  });
  const worktreeRefs = useWorkspaces({
    hosts: [host.id],
    where: workspace => !workspace.background && !workspace.archivingAt && workspace.kind === "worktree",
  });
  const worktreeKeys = useMemo(() => new Set(worktreeRefs.map(ref => ref.key)), [worktreeRefs]);
  const selectedProject = allProjects.find(project => project.key === projectKey);
  const projectTabs = useMemo(() => allProjects.map(project => ({
    key: project.key,
    title: project.title ?? project.key,
    workspaces: project.items.length,
    worktrees: project.items.filter(ref => worktreeKeys.has(ref.key)).length,
  })), [allProjects, worktreeKeys]);
  const scopedWorktreeCount = selectedProject
    ? projectTabs.find(tab => tab.key === selectedProject.key)?.worktrees ?? 0
    : worktreeRefs.length;
  const projects = useMemo(() => {
    const scoped = selectedProject ? [selectedProject] : allProjects;
    if (!onlyWorktrees) return scoped;
    return scoped.flatMap(project => {
      const items = project.items.filter(ref => worktreeKeys.has(ref.key));
      return items.length ? [{ ...project, items }] : [];
    });
  }, [allProjects, selectedProject, onlyWorktrees, worktreeKeys]);
  const workspaceKeys = useMemo(() => new Set(
    projects.flatMap(project => project.items.map(workspace => workspace.key)),
  ), [projects]);
  const agentGroups = useAgents({
    hosts: [host.id],
    where: agent => !agent.background && workspaceKeys.has(agent.workspace.key),
    orderBy: compareAgents,
    groupBy: agent => {
      const state = agentState(agent);
      return [agentWorkspaceKey(agent.workspace.key), stateKey(state), withinWorkspaceKey(agent.workspace.key, state)];
    },
  });
  const agents = useMemo(() => new Map(agentGroups.map(group => [group.key, group.items])), [agentGroups]);
  const supplementalGroups = useWorkspaces({
    hosts: [host.id],
    where: workspace => {
      const state = workspaceState(workspace);
      return state !== null && workspaceKeys.has(workspace.ref.key) &&
        !agents.has(withinWorkspaceKey(workspace.ref.key, state));
    },
    groupBy: workspace => workspaceState(workspace) ?? "idle",
  });
  const supplemental = useMemo(() => new Map(
    supplementalGroups.map(group => [group.key, new Set(group.items.map(ref => ref.key))]),
  ), [supplementalGroups]);

  const shownProjects = filter === "all" ? projects : projects.flatMap(project => {
    const items = project.items.filter(ref => agents.has(withinWorkspaceKey(ref.key, filter)) ||
      supplemental.get(filter)?.has(ref.key));
    return items.length ? [{ ...project, items }] : [];
  });
  const visibleWorkspaces = shownProjects.flatMap(project => project.items);
  const selected = visibleWorkspaces.find(ref => ref.key === selectedKey) ??
    visibleWorkspaces.find(ref => agents.has(agentWorkspaceKey(ref.key))) ??
    visibleWorkspaces[0];
  const agentTotal = filters.reduce((count, key) =>
    key === "all" ? count : count + (agents.get(stateKey(key))?.length ?? 0), 0);
  const wide = !layout.compact && width >= 800;
  const twoColumns = width >= 540;
  const detail = selected && (
    <Inspector
      reference={selected}
      agents={agents.get(agentWorkspaceKey(selected.key)) ?? noAgents}
      visual={visual}
      navigation={navigation}
    />
  );

  return (
    <View style={[styles.page, { backgroundColor: colors.surface0 }]}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.body, { padding: layout.compact ? 14 : 23 }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>워크트리 보드</Text>
          <View style={styles.summary}>
            <Text style={[styles.caption, { color: colors.foregroundMuted }]}>
              프로젝트 {projects.length}개 · 작업 공간 {workspaceKeys.size}개 · 에이전트 {agentTotal}개
            </Text>
            {(scopedWorktreeCount > 0 || onlyWorktrees) && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: onlyWorktrees }}
                onPress={() => { setOnlyWorktrees(value => !value); setFilter("all"); }}
                style={[styles.scope, {
                  borderColor: onlyWorktrees ? colors.accent : colors.border,
                  backgroundColor: onlyWorktrees ? colors.surface2 : colors.surface1,
                }]}
              >
                <Icon name="GitBranch" size={12} color={colors.accent} />
                <Text style={[styles.small, { color: colors.foreground }]}>워크트리만 {scopedWorktreeCount}개</Text>
              </Pressable>
            )}
          </View>
          {projectTabs.length > 0 && (
            <ScrollView
              horizontal
              accessibilityLabel="프로젝트 폴더"
              style={[styles.projectTabs, { borderBottomColor: colors.border }]}
              contentContainerStyle={styles.projectTabsContent}
              keyboardShouldPersistTaps="handled"
            >
              {[
                { key: null, title: "전체", count: onlyWorktrees ? worktreeRefs.length :
                  projectTabs.reduce((sum, tab) => sum + tab.workspaces, 0) },
                ...projectTabs.map(tab => ({
                  key: tab.key,
                  title: tab.title,
                  count: onlyWorktrees ? tab.worktrees : tab.workspaces,
                })),
              ].map(tab => {
                const active = tab.key === (selectedProject?.key ?? null);
                return (
                  <Pressable
                    key={tab.key ?? "all-projects"}
                    accessibilityRole="button"
                    accessibilityLabel={`${tab.title} 폴더 탭, ${tab.count}개 ${onlyWorktrees ? "워크트리" : "작업 공간"}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => setProjectKey(tab.key)}
                    style={({ pressed }) => [styles.projectTab, layout.compact && styles.touchFilter, {
                      borderBottomColor: active ? colors.accent : "transparent",
                      backgroundColor: pressed ? colors.surface2 : "transparent",
                    }]}
                  >
                    <Icon
                      name={tab.key === null ? "Layers" : active ? "FolderOpen" : "Folder"}
                      size={14}
                      color={active ? colors.accent : colors.foregroundMuted}
                    />
                    <Text style={[styles.projectTabName, {
                      color: active ? colors.foreground : colors.foregroundMuted,
                    }]} numberOfLines={1}>{tab.title}</Text>
                    <Text style={[styles.number, { color: colors.foregroundMuted }]}>{tab.count}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View style={[styles.filters, { borderBottomColor: colors.border }]}>
            {filters.map(key => {
              const count = key === "all" ? workspaceKeys.size : agents.get(stateKey(key))?.length ?? 0;
              const extra = key === "all" ? 0 : supplemental.get(key)?.size ?? 0;
              const label = key === "all" ? (onlyWorktrees ? "전체 워크트리" : "전체 작업 공간") : statusLabels[key];
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === key }}
                  accessibilityLabel={`${label} ${count}개${extra ? `, 작업 공간 ${extra}곳` : ""}`}
                  onPress={() => setFilter(key)}
                  style={({ pressed }) => [styles.filter, layout.compact && styles.touchFilter, {
                    borderColor: filter === key ? colors.accent : colors.border,
                    backgroundColor: pressed || filter === key ? colors.surface2 : colors.surface1,
                  }]}
                >
                  {key === "all"
                    ? <Icon name="Layers" size={15} color={colors.accent} />
                    : <Cat state={key} visual={visual} scale={1} />}
                  <Text style={[styles.caption, { color: colors.foreground }]}>{label}</Text>
                  <Text style={[styles.number, { color: colors.foregroundMuted }]}>{count}</Text>
                  {extra > 0 && <Text style={[styles.small, { color: colors.foregroundMuted }]}>· {extra}곳</Text>}
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.board, wide && styles.boardWide]}>
            <View style={styles.projects}>
              {!shownProjects.length && (
                <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.foregroundMuted }]}>
                  {filter !== "all" ? "이 상태의 에이전트나 작업 공간이 없습니다." :
                    onlyWorktrees ? "이 범위에 열린 워크트리가 없습니다." : "이 호스트에 열린 작업 공간이 없습니다."}
                </Text>
              )}
              {shownProjects.map(project => (
                <View key={project.key} style={styles.project}>
                  <View style={styles.projectHeader}>
                    <Text accessibilityRole="header" style={[styles.projectTitle, { color: colors.foreground }]}>
                      {project.title}
                    </Text>
                    <Text style={[styles.small, { color: colors.foregroundMuted }]}>
                      {project.items.length}개 {onlyWorktrees ? "워크트리" : "작업 공간"}
                    </Text>
                  </View>
                  {Array.from({ length: Math.ceil(project.items.length / (twoColumns ? 2 : 1)) }, (_, index) => {
                    const columns = twoColumns ? 2 : 1;
                    const row = project.items.slice(index * columns, (index + 1) * columns);
                    return (
                      <View key={row[0].key} style={styles.tileGroup}>
                        <View style={styles.tileRow}>
                          {row.map(reference => (
                            <WorkspaceCard
                              key={reference.key}
                              reference={reference}
                              agents={agents.get(agentWorkspaceKey(reference.key)) ?? noAgents}
                              agentGroups={agents}
                              selected={selected?.key === reference.key}
                              onSelect={() => setSelectedKey(reference.key)}
                              visual={visual}
                            />
                          ))}
                          {twoColumns && row.length === 1 && <View style={styles.column} aria-hidden />}
                        </View>
                        {!wide && row.some(ref => ref.key === selected?.key) && detail}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
            {wide && detail && <View style={styles.side}>{detail}</View>}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Cat({ state, visual, scale }: { state: AgentState; visual: Visual; scale?: 1 | 2 }) {
  return <CatSprite state={state} mode={visual.mode} markColor={visual.tones[state]} scale={scale} />;
}

function WorkspaceCard({ reference, agents, agentGroups, selected, onSelect, visual }: {
  reference: WorkspaceRef;
  agents: readonly AgentRef[];
  agentGroups: ReadonlyMap<string, readonly AgentRef[]>;
  selected: boolean;
  onSelect(): void;
  visual: Visual;
}) {
  const workspace = useWorkspace(reference);
  if (!workspace) return <View style={styles.column} aria-hidden />;
  const { colors } = visual;
  const title = workspace.title ?? workspace.name;
  const state = workspaceState(workspace);
  const showWorkspaceState = state !== null && !agentGroups.has(withinWorkspaceKey(reference.key, state));
  const statusSummary = filters.flatMap(key => {
    if (key === "all") return [];
    const count = agentGroups.get(withinWorkspaceKey(reference.key, key))?.length ?? 0;
    return count ? [`${statusLabels[key]} ${count}개`] : [];
  });
  if (showWorkspaceState) statusSummary.push(`작업 공간 ${statusLabels[state]}`);
  const branch = workspace.kind === "worktree" ? workspace.branch ?? kinds.worktree :
    [kinds[workspace.kind], workspace.branch].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[`${title}, ${branch}, 에이전트 ${agents.length}개`, ...statusSummary].join(", ")}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [styles.tile, {
        backgroundColor: pressed ? colors.surface2 : colors.surface1,
        borderColor: selected ? colors.accent : colors.border,
      }]}
    >
      <View style={styles.tileHeader}>
        <View style={[styles.branchIcon, { backgroundColor: colors.surface2 }]}>
          <Icon name={workspace.kind === "directory" ? "Folder" : "GitBranch"} color={colors.accent} size={14} />
        </View>
        <View style={styles.tileText}>
          <Text style={[styles.tileTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.branch, { color: colors.foregroundMuted }]}>{branch}</Text>
        </View>
        <Text style={[styles.small, { color: colors.foregroundMuted }]}>{agents.length}개</Text>
      </View>
      <View style={[styles.agentList, { borderTopColor: colors.border }]}>
        {agents.map(ref => <AgentLine key={ref.key} reference={ref} visual={visual} />)}
        {showWorkspaceState && (
          <View style={styles.agentRow}>
            <Cat state={state} visual={visual} />
            <Text style={[styles.agentName, { color: colors.foregroundMuted }]}>작업 공간 상태</Text>
            <Text style={[styles.small, { color: visual.tones[state] }]}>{statusLabels[state]}</Text>
          </View>
        )}
        {agents.length === 0 && !showWorkspaceState && (
          <Text style={[styles.emptyAgents, { color: colors.foregroundMuted }]}>에이전트 없음</Text>
        )}
      </View>
    </Pressable>
  );
}

function AgentLine({ reference, visual }: { reference: AgentRef; visual: Visual }) {
  const agent = useAgent(reference);
  if (!agent) return null;
  const state = agentState(agent);
  return (
    <View style={styles.agentRow}>
      <Cat state={state} visual={visual} />
      <Text style={[styles.agentName, { color: visual.colors.foreground }]}>{agent.title ?? providerName(agent.provider)}</Text>
      <Text style={[styles.small, { color: visual.tones[state] }]}>{statusLabels[state]}</Text>
    </View>
  );
}

function Inspector({ reference, agents, navigation, visual }: {
  reference: WorkspaceRef;
  agents: readonly AgentRef[];
  navigation: Navigation;
  visual: Visual;
}) {
  const { colors } = visual;
  const workspace = useWorkspace(reference);
  const parentGroups = useAgents({
    hosts: [reference.hostId],
    where: agent => !agent.background && agent.workspace.key === reference.key,
    orderBy: compareAgents,
    groupBy: agent => agent.parentAgent?.key ?? "root",
  });
  const tree = useMemo(() => buildTree(agents, parentGroups), [agents, parentGroups]);
  if (!workspace) return null;

  return (
    <View accessibilityLabel="선택한 워크트리 상세" style={[styles.inspector, {
      borderColor: colors.border,
      backgroundColor: colors.surface1,
    }]}>
      <View style={[styles.inspectorTop, { backgroundColor: colors.surface2 }]}>
        <Text style={[styles.small, { color: colors.foregroundMuted }]}>{workspace.projectDisplayName}</Text>
        <Text accessibilityRole="header" style={[styles.inspectorTitle, { color: colors.foreground }]}>
          {workspace.title ?? workspace.name}
        </Text>
        <Text style={[styles.branch, { color: colors.foregroundMuted }]}>{workspace.branch ?? kinds[workspace.kind]}</Text>
      </View>
      <View style={styles.inspectorBody}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>에이전트 관계</Text>
        {tree.length ? tree.map(node => (
          <TreeNode key={node.ref.key} node={node} navigation={navigation} visual={visual} />
        )) : <Text style={[styles.caption, { color: colors.foregroundMuted }]}>연결된 에이전트가 없습니다.</Text>}
        {navigation && (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.openWorkspace({ workspaceId: reference.id, serverId: reference.hostId })}
            style={({ pressed }) => [styles.openWorkspace, {
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surface2 : colors.surface1,
            }]}
          >
            <Text style={[styles.caption, { color: colors.foreground }]}>작업 공간 열기</Text>
            <Icon name="ArrowUpRight" size={13} color={colors.foregroundMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function TreeNode({ node, navigation, visual, depth = 0 }: {
  node: AgentNode;
  navigation: Navigation;
  visual: Visual;
  depth?: number;
}) {
  const agent = useAgent(node.ref);
  const { colors } = visual;
  if (!agent) return null;
  const state = agentState(agent);
  const title = agent.title ?? providerName(agent.provider);
  const label = agentStateLabel(agent, state);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${label}, 에이전트 열기`}
        disabled={!navigation}
        onPress={() => navigation?.openAgent({ agentId: node.ref.id, serverId: node.ref.hostId })}
        style={({ pressed }) => [styles.treeRow, pressed && { backgroundColor: colors.surface2 }]}
      >
        <Cat state={state} visual={visual} />
        <View style={styles.tileText}>
          <Text style={[styles.treeTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.small, { color: colors.foregroundMuted }]}>
            {providerName(agent.provider)} · <Text style={{ color: visual.tones[state] }}>{label}</Text>
          </Text>
        </View>
        {navigation && <Icon name="ArrowUpRight" size={12} color={colors.foregroundMuted} />}
      </Pressable>
      {node.children.length > 0 && (
        <View style={[styles.treeChildren, { borderColor: colors.border },
          depth >= 3 && { marginLeft: 0, paddingLeft: 0, borderLeftWidth: 0 }]}>
          {node.children.map(child => (
            <TreeNode key={child.ref.key} node={child} navigation={navigation} visual={visual} depth={depth + 1} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: { width: "100%", maxWidth: 1390, alignSelf: "center" },
  title: { fontSize: 24, fontWeight: "600", letterSpacing: -0.45 },
  summary: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 },
  caption: { fontSize: 12, lineHeight: 17 },
  small: { fontSize: 11, lineHeight: 16 },
  number: { fontSize: 11, fontFamily: mono, fontVariant: ["tabular-nums"] },
  scope: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4 },
  projectTabs: { flexGrow: 0, marginTop: 10, borderBottomWidth: 1 },
  projectTabsContent: { gap: 2, alignItems: "stretch" },
  projectTab: {
    flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36,
    paddingHorizontal: 9, borderBottomWidth: 2, maxWidth: 220,
  },
  projectTabName: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  filters: {
    flexDirection: "row", flexWrap: "wrap", gap: 7,
    paddingBottom: 15, marginTop: 13, marginBottom: 16, borderBottomWidth: 1,
  },
  filter: {
    minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderRadius: 6,
  },
  touchFilter: { minHeight: 44 },
  board: { gap: 18 },
  boardWide: { flexDirection: "row", alignItems: "flex-start" },
  projects: { flex: 1, minWidth: 0, gap: 16 },
  side: { width: "26%", minWidth: 225, maxWidth: 315, marginTop: 26 },
  project: { gap: 8 },
  projectHeader: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  projectTitle: { fontSize: 13, lineHeight: 19, fontWeight: "600", fontFamily: mono },
  tileGroup: { gap: 8 },
  tileRow: { flexDirection: "row", gap: 9, alignItems: "stretch" },
  column: { flex: 1, minWidth: 0 },
  tile: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 8, padding: 13 },
  tileHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  branchIcon: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  tileText: { flex: 1, minWidth: 0, gap: 2 },
  tileTitle: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  branch: { fontSize: 11, lineHeight: 16, fontFamily: mono },
  agentList: { marginTop: 9, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 3 },
  agentRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 42, paddingVertical: 3 },
  agentName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17 },
  emptyAgents: { fontSize: 12, paddingTop: 9 },
  inspector: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  inspectorTop: { padding: 13, gap: 4 },
  inspectorTitle: { fontSize: 15, fontWeight: "600", lineHeight: 20 },
  inspectorBody: { padding: 13, gap: 5 },
  sectionTitle: { fontSize: 12, fontWeight: "600", marginBottom: 3 },
  treeRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 4, borderRadius: 5 },
  treeTitle: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  treeChildren: { marginLeft: 12, paddingLeft: 9, borderLeftWidth: 1 },
  openWorkspace: {
    minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6,
    marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderRadius: 6,
  },
});
