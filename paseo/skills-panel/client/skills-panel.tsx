import {
  useComposers,
  usePaseo,
  useRpc,
  useSettings,
  useTabState,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";

import { favoriteSettings, groupViewSchema } from "../shared/settings";
import { skillSourcesRpc } from "../shared/skill-sources";
import { skillRows } from "./skill-groups";

const defaultGroupView = { expanded: {} };

// React Native Web supplies hover and focus alongside the native pressed state.
type InteractionState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

async function listCodexSessions(paseo: ReturnType<typeof usePaseo>, workspaceId: string) {
  const sessions = [];
  let cursor: string | undefined;

  do {
    const { entries, pageInfo } = await paseo.agents.list({
      filter: { statuses: ["idle", "running"] },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 200, cursor },
    });

    for (const { agent } of entries) {
      if (agent.workspaceId === workspaceId && agent.provider === "codex") {
        sessions.push({ id: agent.id, label: agent.title || agent.model || "Codex" });
      }
    }
    cursor = pageInfo.nextCursor ?? undefined;
  } while (cursor);

  return sessions;
}

export function SkillsPanel({ host, workspaceId, theme, tab, navigation }: PluginWorkspacePanelProps) {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const readSources = useRpc(skillSourcesRpc);
  const favorites = useSettings(favoriteSettings);
  const toast = useToast();
  const savingFavorite = useRef(false);
  const [groupView, setGroupView] = useTabState(tab, groupViewSchema, defaultGroupView);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [search, setSearch] = useState("");
  const workspaceKey = ["skills-panel", host.id, workspaceId] as const;
  const sessions = useQuery({
    queryKey: [...workspaceKey, "sessions"],
    queryFn: () => listCodexSessions(paseo, workspaceId),
    staleTime: 15_000,
    retry: false,
  });
  const session = sessions.data?.find((item) => item.id === selectedId) ?? sessions.data?.[0];
  const [composer] = useComposers({ agentId: session?.id ?? "" });
  const skills = useQuery({
    queryKey: [...workspaceKey, "skills", session?.id],
    enabled: Boolean(session),
    queryFn: async () => {
      if (!session) return [];
      const { commands, error } = await paseo.agents.ref(session.id).commands();
      if (error) throw new Error(error);

      return commands
        .filter(({ kind, name }) => kind === "skill" && !name.startsWith("bdk-"))
        .sort((first, second) => first.name.localeCompare(second.name));
    },
    staleTime: 30_000,
    retry: false,
  });

  const sources = useQuery({
    queryKey: [...workspaceKey, "sources", session?.id],
    enabled: Boolean(session),
    queryFn: () => session ? readSources({ agentId: session.id, workspaceId }) : [],
    staleTime: 60_000,
    retry: false,
  });
  const favoriteNames = new Set(favorites.status === "ready" ? favorites.values.names : []);
  const canSaveFavorite = favorites.status === "ready" && !favorites.saving;
  const preferencesFailed = favorites.status === "error" || favorites.status === "invalid";

  function selectSkill(name: string) {
    if (!session || !composer) return;
    const command = `/${name}`;
    const current = composer.prompt.trimStart();
    const existingSkill = /^\/(\S+)/.exec(current);
    const canReplace = existingSkill && skills.data?.some((skill) => skill.name === existingSkill[1]);
    const next = canReplace
      ? command + current.slice(existingSkill[0].length)
      : current ? `${command} ${current}` : command;

    try {
      composer.setPrompt(next);
    } catch {
      toast.error("채팅 초안에 스킬을 넣지 못했습니다.");
      return;
    }

    try {
      navigation?.openAgent({ agentId: session.id });
    } catch {
      toast.error("스킬을 초안에 넣었습니다. 해당 세션 탭에서 확인해 주세요.");
    }
  }

  async function toggleFavorite(name: string) {
    if (favorites.status !== "ready" || savingFavorite.current) return;
    savingFavorite.current = true;
    try {
      const names = favoriteNames.has(name)
        ? favorites.values.names.filter((favorite) => favorite !== name)
        : [...favorites.values.names, name];
      if (!(await favorites.save({ names }, favorites.revision))) {
        toast.error("즐겨찾기를 저장하지 못했습니다. 목록을 다시 불러옵니다.");
        await favorites.reload();
      }
    } finally {
      savingFavorite.current = false;
    }
  }

  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleSkills = (skills.data ?? []).filter(({ name, description }) => {
    const text = `${name} ${description}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const searching = terms.length > 0;
  const rows = skillRows(visibleSkills, favoriteNames, sources.data ?? [], groupView.expanded, searching);
  const isRefreshing = sessions.isFetching || skills.isFetching || sources.isFetching;
  const error = sessions.error ?? skills.error;
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
  const emptyMessage = error
    ? "목록을 불러오지 못했습니다. 새로고침해 주세요."
    : isRefreshing
      ? "스킬을 불러오는 중…"
      : !session
        ? "이 작업공간에서 Codex 세션을 시작하면 스킬이 표시됩니다."
        : terms.length > 0
          ? "검색 결과가 없습니다."
          : "사용 가능한 스킬이 없습니다.";

  return (
    <View style={styles.panel}>
      <View style={styles.controls}>
        <View style={styles.toolbar}>
          {session ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Codex 세션 선택, 현재 ${session.label}`}
              accessibilityState={{ expanded: showSessions }}
              disabled={(sessions.data?.length ?? 0) < 2}
              onPress={() => setShowSessions(!showSessions)}
              style={styles.session}
            >
              <Text numberOfLines={1} style={styles.primary}>{session.label}</Text>
              {(sessions.data?.length ?? 0) > 1 && (
                <Text style={styles.secondary}>{showSessions ? "▴" : "▾"}</Text>
              )}
            </Pressable>
          ) : (
            <Text style={[styles.session, styles.secondary]}>Codex 스킬</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="스킬 목록 새로고침"
            accessibilityState={{ disabled: isRefreshing }}
            disabled={isRefreshing}
            onPress={() => {
              void queryClient.invalidateQueries({ queryKey: workspaceKey });
              if (preferencesFailed) void favorites.reload();
            }}
            style={({ hovered, pressed }: InteractionState) => [
              styles.refresh,
              (hovered || pressed) && styles.active,
            ]}
          >
            <Text style={styles.primary}>새로고침</Text>
          </Pressable>
        </View>
        {showSessions && (sessions.data?.length ?? 0) > 1 && (
          <ScrollView style={styles.sessionList}>
            {sessions.data?.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === session?.id }}
                onPress={() => {
                  setSelectedId(item.id);
                  setShowSessions(false);
                }}
                style={[styles.sessionOption, item.id === session?.id && styles.active]}
              >
                <Text numberOfLines={2} style={styles.primary}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <TextInput
          accessibilityLabel="스킬 검색"
          placeholder="스킬 이름 또는 설명 검색"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.search}
        />
        {skills.data && (
          <Text accessibilityLiveRegion="polite" style={styles.secondary}>
            {terms.length > 0 ? `${visibleSkills.length} / ${skills.data.length}개` : `${skills.data.length}개 스킬`}
          </Text>
        )}
        {preferencesFailed && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            즐겨찾기를 불러오지 못했습니다.
          </Text>
        )}
        {sources.isError && visibleSkills.length > 0 && (
          <Text accessibilityLiveRegion="polite" style={styles.secondary}>
            설치 위치를 불러오지 못했습니다.
          </Text>
        )}
        {error && visibleSkills.length > 0 && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {emptyMessage}
          </Text>
        )}
      </View>
      <FlatList
        data={rows}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(row) => row.kind === "group" ? `group:${row.group.id}` : `skill:${row.skill.name}`}
        ListEmptyComponent={
          <Text accessibilityLiveRegion="polite" style={[styles.empty, error ? styles.error : styles.secondary]}>
            {emptyMessage}
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === "group") {
            const { group, expanded } = item;
            const title = (
              <>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.secondary}>{group.skills.length}</Text>
              </>
            );
            if (searching) return <View style={styles.group}>{title}</View>;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${group.title}, 스킬 ${group.skills.length}개`}
                accessibilityState={{ expanded }}
                onPress={() => setGroupView({
                  expanded: { ...groupView.expanded, [group.id]: !expanded },
                })}
                style={({ hovered, pressed }: InteractionState) => [
                  styles.group,
                  (hovered || pressed) && styles.active,
                ]}
              >
                <Text style={styles.secondary}>{expanded ? "▾" : "▸"}</Text>
                {title}
              </Pressable>
            );
          }

          const { skill } = item;
          const isFavorite = favoriteNames.has(skill.name);
          return (
            <View style={styles.skill}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`/${skill.name} 채팅에 입력`}
                disabled={!composer}
                onPress={() => selectSkill(skill.name)}
                style={({ hovered, focused, pressed }: InteractionState) => [
                  styles.skillCopy,
                  (hovered || focused) && styles.hover,
                  focused && styles.focusRing,
                  pressed && styles.active,
                ]}
              >
                {({ hovered, focused }: InteractionState) => (
                  <>
                    <View style={styles.skillHeading}>
                      <Text style={styles.skillName}>{skill.name}</Text>
                      <Text
                        accessible={false}
                        aria-hidden
                        style={[styles.skillArrow, (hovered || focused) && styles.skillArrowVisible]}
                      >
                        →
                      </Text>
                    </View>
                    {skill.description ? <Text style={styles.description}>{skill.description}</Text> : null}
                  </>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${skill.name} 즐겨찾기 ${isFavorite ? "해제" : "추가"}`}
                disabled={!canSaveFavorite}
                onPress={() => void toggleFavorite(skill.name)}
                style={({ hovered, focused, pressed }: InteractionState) => [
                  styles.favorite,
                  (hovered || focused || pressed) && styles.active,
                  focused && styles.focusRing,
                ]}
              >
                {({ hovered, focused }: InteractionState) => (
                  <Text style={[styles.star, (isFavorite || hovered || focused) && styles.starred]}>
                    {isFavorite ? "★" : "☆"}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

function createStyles(colors: PluginWorkspacePanelProps["theme"]["colors"]) {
  return StyleSheet.create({
    panel: { flex: 1, minHeight: 0, backgroundColor: colors.surface0 },
    controls: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderColor: colors.border },
    toolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
    session: { flex: 1, minWidth: 0, minHeight: 40, gap: 6, flexDirection: "row", alignItems: "center" },
    primary: { color: colors.foreground, fontSize: 13, flexShrink: 1 },
    secondary: { color: colors.foregroundMuted, fontSize: 12, fontVariant: ["tabular-nums"] },
    refresh: { minHeight: 40, justifyContent: "center", paddingHorizontal: 8, borderRadius: 6 },
    hover: { backgroundColor: colors.surface1 },
    active: { backgroundColor: colors.surface2 },
    focusRing: { borderColor: colors.accent },
    sessionList: { maxHeight: 160, borderWidth: 1, borderColor: colors.border, borderRadius: 6 },
    sessionOption: { minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
    search: {
      minHeight: 40,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      backgroundColor: colors.surface1,
      color: colors.foreground,
      fontSize: 13,
    },
    list: { flex: 1 },
    empty: { padding: 12 },
    error: { color: colors.statusDanger, fontSize: 12 },
    group: {
      minHeight: 40, paddingHorizontal: 12, gap: 8, alignItems: "center",
      flexDirection: "row", backgroundColor: colors.surface1,
      borderBottomWidth: 1, borderColor: colors.border,
    },
    groupTitle: { color: colors.foreground, fontSize: 13, fontWeight: "600", flex: 1 },
    skill: {
      paddingHorizontal: 4, paddingVertical: 4, gap: 4,
      flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 1, borderColor: colors.border,
    },
    skillCopy: {
      flex: 1, minWidth: 0, minHeight: 40, gap: 3, paddingHorizontal: 7, paddingVertical: 5,
      borderWidth: 1, borderColor: "transparent", borderRadius: 6,
    },
    skillHeading: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
    skillArrow: { color: colors.accent, opacity: 0, fontSize: 14, lineHeight: 18 },
    skillArrowVisible: { opacity: 1 },
    favorite: {
      width: 40, height: 40, alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: "transparent", borderRadius: 6,
    },
    star: { color: colors.foregroundMuted, fontSize: 19 },
    starred: { color: colors.accent },
    skillName: { color: colors.foreground, fontSize: 13, fontWeight: "600", flex: 1 },
    description: { color: colors.foregroundMuted, fontSize: 12, lineHeight: 18 },
  });
}
