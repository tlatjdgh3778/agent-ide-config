import {
  usePaseo,
  useProject,
  useRpc,
  useWorkspace,
  useWorkspaces,
  type PluginSidebarViewProps,
  type ProjectRef,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { Icon, Modal, TextInput, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useT } from "./i18n";
import { labelColors, labelKey, useLabelCatalog } from "./labels";
import { groupOfProject, type Parents } from "./model";
import { markWorkspaceRpc } from "../shared/rpc";
import type { ProjectGroup } from "../shared/settings";

type Theme = PluginSidebarViewProps["theme"];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function MenuRow({
  label,
  icon,
  theme,
  onPress,
  checked = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  icon: string;
  theme: Theme;
  onPress: () => void;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = danger ? theme.colors.statusDanger : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 36,
        paddingHorizontal: 10,
        borderRadius: 6,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: checked ? theme.colors.surface2 : undefined,
      }}
    >
      <Icon name={icon} size={15} color={danger ? color : theme.colors.foregroundMuted} />
      <Text numberOfLines={1} style={{ flex: 1, color, fontSize: 13 }}>
        {label}
      </Text>
      {checked ? <Icon name="Check" size={15} color={theme.colors.accent} /> : null}
    </Pressable>
  );
}

function MenuSection({ title, theme, children }: { title: string; theme: Theme; children: ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <Text
        style={{ color: theme.colors.foregroundMuted, fontSize: 11, paddingHorizontal: 10, paddingTop: 6 }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function DialogButton({
  label,
  theme,
  onPress,
  kind = "plain",
  disabled = false,
}: {
  label: string;
  theme: Theme;
  onPress: () => void;
  kind?: "plain" | "danger" | "primary";
  disabled?: boolean;
}) {
  const background =
    kind === "danger"
      ? theme.colors.statusDanger
      : kind === "primary"
        ? theme.colors.accent
        : theme.colors.surface2;
  const color = kind === "plain" ? theme.colors.foreground : theme.colors.accentForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: background,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function Body({
  theme,
  children,
  tone = "plain",
}: {
  theme: Theme;
  children: ReactNode;
  tone?: "plain" | "warning";
}) {
  return (
    <Text
      style={{
        color: tone === "warning" ? theme.colors.statusDanger : theme.colors.foreground,
        fontSize: 13,
        lineHeight: 19,
      }}
    >
      {children}
    </Text>
  );
}

function Buttons({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>{children}</View>;
}

const closeOnDismiss = (onClose: () => void) => (open: boolean) => (open ? undefined : onClose());

function ProjectChoice({
  reference,
  checked,
  theme,
  onChoose,
}: {
  reference: ProjectRef;
  checked: boolean;
  theme: Theme;
  onChoose: (key: string) => void;
}) {
  const name = useProject(reference, (item) => item.displayName) ?? reference.id;
  return (
    <MenuRow
      label={name}
      icon="CornerDownRight"
      checked={checked}
      theme={theme}
      onPress={() => onChoose(reference.key)}
    />
  );
}

function MenuHint({ text, theme }: { text: string; theme: Theme }) {
  return (
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, paddingHorizontal: 10 }}>{text}</Text>
  );
}

/** Projects this one can go under: the other top-level projects of its own section, in sidebar order. */
function ParentSection({
  reference,
  candidates,
  parents,
  theme,
  onChoose,
  onUnnest,
}: {
  reference: ProjectRef;
  candidates: readonly ProjectRef[];
  parents: Parents;
  theme: Theme;
  onChoose: (key: string) => void;
  onUnnest: () => void;
}) {
  const t = useT();
  const current = parents[reference.key] ?? null;
  const hasSubProjects = Object.values(parents).includes(reference.key);
  return (
    <MenuSection title={t("project.parentSection")} theme={theme}>
      {hasSubProjects ? (
        <MenuHint text={t("project.parentHasSubProjects")} theme={theme} />
      ) : candidates.length === 0 ? (
        <MenuHint text={t("project.parentNone")} theme={theme} />
      ) : (
        candidates.map((item) => (
          <ProjectChoice
            key={item.key}
            reference={item}
            checked={item.key === current}
            theme={theme}
            onChoose={onChoose}
          />
        ))
      )}
      {current !== null ? (
        <MenuRow label={t("project.unnest")} icon="CornerLeftUp" theme={theme} onPress={onUnnest} />
      ) : null}
    </MenuSection>
  );
}

export function ProjectMenuDialog({
  reference,
  groups,
  parents,
  parentChoices,
  theme,
  onChooseGroup,
  onChooseParent,
  onUnnest,
  onNewWorkspace,
  onOpenSettings,
  onDecorate,
  onRemove,
  onClose,
}: {
  reference: ProjectRef;
  groups: readonly ProjectGroup[];
  parents: Parents;
  /** Projects it can go under, see ParentSection. */
  parentChoices: readonly ProjectRef[];
  theme: Theme;
  onChooseGroup: (groupId: string | null) => void;
  onChooseParent: (parentKey: string) => void;
  onUnnest: () => void;
  onNewWorkspace: () => void;
  /** Undefined where the app's project settings page can't be opened. */
  onOpenSettings?: () => void;
  onDecorate: (name: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const project = useProject(reference, (item) => ({ name: item.displayName, path: item.rootPath }));
  const name = project?.name ?? reference.id;
  // A sub-project is in no group, but it is not in Ungrouped either.
  const current = reference.key in parents ? undefined : groupOfProject(groups, reference.key);
  const copyPath = () => {
    if (!project) return;
    onClose();
    copyText(project.path).then(
      () => toast.show(t("toast.pathCopied")),
      (error: unknown) => toast.error(t("toast.copyFailed", { reason: errorText(error) })),
    );
  };
  return (
    <Modal title={name} open onOpenChange={closeOnDismiss(onClose)}>
      <Modal.Content contentContainerStyle={{ padding: 8, gap: 8 }}>
        <MenuSection title={t("project.moveToGroup")} theme={theme}>
          {groups.map((group) => (
            <MenuRow
              key={group.id}
              label={group.name}
              icon="Layers"
              checked={current === group.id}
              theme={theme}
              onPress={() => onChooseGroup(group.id)}
            />
          ))}
          <MenuRow
            label={t("sidebar.ungrouped")}
            icon="CircleDashed"
            checked={current === null}
            theme={theme}
            onPress={() => onChooseGroup(null)}
          />
        </MenuSection>
        <ParentSection
          reference={reference}
          candidates={parentChoices}
          parents={parents}
          theme={theme}
          onChoose={onChooseParent}
          onUnnest={onUnnest}
        />
        <MenuSection title={t("project.actionsSection")} theme={theme}>
          <MenuRow label={t("project.newWorkspaceItem")} icon="Plus" theme={theme} onPress={onNewWorkspace} />
          {onOpenSettings ? (
            <MenuRow label={t("project.openSettings")} icon="Settings" theme={theme} onPress={onOpenSettings} />
          ) : null}
          <MenuRow
            label={t("project.decorateItem")}
            icon="Palette"
            theme={theme}
            onPress={() => onDecorate(name)}
          />
          <MenuRow
            label={t("project.copyPath")}
            icon="Copy"
            theme={theme}
            onPress={copyPath}
            disabled={!project}
          />
          <MenuRow label={t("project.remove")} icon="Trash2" theme={theme} onPress={onRemove} danger />
        </MenuSection>
      </Modal.Content>
    </Modal>
  );
}

export function RemoveProjectDialog({
  reference,
  theme,
  busy,
  onConfirm,
  onClose,
}: {
  reference: ProjectRef;
  theme: Theme;
  busy: boolean;
  /** Receives the keys of the workspaces Paseo will archive with the project. */
  onConfirm: (workspaceKeys: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const name = useProject(reference, (item) => ({ name: item.displayName }))?.name ?? reference.id;
  const kinds = useWorkspaces({
    where: (item) => item.project.key === reference.key && !item.archivingAt,
    groupBy: (item) => item.kind,
  });
  const total = kinds.reduce((sum, group) => sum + group.items.length, 0);
  const worktrees = kinds.find((group) => group.key === "worktree")?.items.length ?? 0;
  return (
    <Modal
      title={t("project.removeTitle", { name })}
      open
      onOpenChange={closeOnDismiss(busy ? () => {} : onClose)}
    >
      <Modal.Content>
        {worktrees > 0 ? (
          <Body theme={theme} tone="warning">
            {t("project.removeWorktreeWarning", { count: worktrees })}
          </Body>
        ) : null}
        <Body theme={theme}>{t("project.removeBody", { count: total })}</Body>
        <Buttons>
          <DialogButton label={t("common.cancel")} theme={theme} onPress={onClose} disabled={busy} />
          <DialogButton
            label={busy ? t("project.removing") : t("project.removeConfirm")}
            theme={theme}
            kind="danger"
            onPress={() => onConfirm(kinds.flatMap((group) => group.items.map((item) => item.key)))}
            disabled={busy}
          />
        </Buttons>
      </Modal.Content>
    </Modal>
  );
}

export function WorkspaceMenuDialog({
  reference,
  theme,
  onDecorate,
  onArchived,
  onClose,
}: {
  reference: WorkspaceRef;
  theme: Theme;
  onDecorate: (name: string) => void;
  onArchived: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const paseo = usePaseo();
  const toast = useToast();
  const workspace = useWorkspace(reference, (item) => ({
    title: item.title ?? item.name,
    customTitle: item.title,
    pinned: !!item.pinnedAt,
    directory: item.directory,
    branch: item.branch,
    worktree: item.kind === "worktree",
    labels: item.labels,
    status: item.status,
  }));
  const [step, setStep] = useState<"menu" | "rename" | "archive" | "labels">("menu");
  const mark = useRpc(markWorkspaceRpc);
  const [initialName, setInitialName] = useState("");
  const draftName = useRef("");
  const [busy, setBusy] = useState(false);

  if (!workspace) return null;
  const handle = () => paseo.workspaces.ref(reference);
  const run = async (action: () => Promise<unknown>, done: string, failed: string) => {
    setBusy(true);
    try {
      await action();
      onClose();
      toast.show(done);
    } catch (error) {
      setBusy(false);
      toast.error(`${failed} ${errorText(error)}`);
    }
  };
  const copy = (text: string, done: string) => {
    onClose();
    copyText(text).then(
      () => toast.show(done),
      (error: unknown) => toast.error(t("toast.copyFailed", { reason: errorText(error) })),
    );
  };

  if (step === "rename") {
    const submit = () => {
      const next = draftName.current.trim() || null;
      // Saving the name unchanged would pin an automatic name as a fixed title.
      if (next === (initialName.trim() || null)) return onClose();
      void run(() => handle().setTitle(next), t("workspace.renamed"), t("workspace.renameFailed"));
    };
    return (
      <Modal title={t("workspace.renameTitle")} open onOpenChange={closeOnDismiss(onClose)}>
        <Modal.Content>
          <TextInput
            accessibilityLabel={t("workspace.nameLabel")}
            autoFocus
            selectTextOnFocus
            autoCapitalize="none"
            autoCorrect={false}
            // Keep the native IME in charge of composing text; only seed the input on mount.
            defaultValue={initialName}
            onChangeText={(text) => {
              draftName.current = text;
            }}
            onSubmitEditing={submit}
            editable={!busy}
            placeholder={t("workspace.namePlaceholder")}
            placeholderTextColor={theme.colors.foregroundMuted}
            style={{
              color: theme.colors.foreground,
              fontSize: 13,
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
            }}
          />
          <Buttons>
            <DialogButton label={t("common.cancel")} theme={theme} onPress={onClose} disabled={busy} />
            <DialogButton
              label={t("common.save")}
              theme={theme}
              kind="primary"
              onPress={submit}
              disabled={busy}
            />
          </Buttons>
        </Modal.Content>
      </Modal>
    );
  }

  if (step === "labels") {
    return (
      <WorkspaceLabelsDialog
        reference={reference}
        name={workspace.title}
        assigned={workspace.labels}
        theme={theme}
        onClose={onClose}
      />
    );
  }

  if (step === "archive") {
    return (
      <Modal
        title={t("workspace.archiveTitle", { name: workspace.title })}
        open
        onOpenChange={closeOnDismiss(onClose)}
      >
        <Modal.Content>
          {workspace.worktree ? (
            <Body theme={theme} tone="warning">
              {t("workspace.archiveWorktreeWarning")}
            </Body>
          ) : null}
          <Body theme={theme}>{t("workspace.archiveBody")}</Body>
          <Buttons>
            <DialogButton label={t("common.cancel")} theme={theme} onPress={onClose} disabled={busy} />
            <DialogButton
              label={busy ? t("workspace.archiving") : t("workspace.archive")}
              theme={theme}
              kind="danger"
              disabled={busy}
              onPress={() =>
                void run(
                  async () => {
                    await handle().archive();
                    onArchived();
                  },
                  t("workspace.archived"),
                  t("workspace.archiveFailed"),
                )
              }
            />
          </Buttons>
        </Modal.Content>
      </Modal>
    );
  }

  return (
    <Modal title={workspace.title} open onOpenChange={closeOnDismiss(onClose)}>
      <Modal.Content contentContainerStyle={{ padding: 8, gap: 2 }}>
        <MenuRow
          label={t("workspace.rename")}
          icon="Pencil"
          theme={theme}
          onPress={() => {
            const name = workspace.customTitle ?? workspace.title;
            draftName.current = name;
            setInitialName(name);
            setStep("rename");
          }}
        />
        {workspace.status === "attention" || workspace.status === "failed" || workspace.status === "done" ? (
          <MenuRow
            label={workspace.status === "done" ? t("workspace.markUnread") : t("workspace.markRead")}
            icon={workspace.status === "done" ? "CircleDot" : "CircleCheck"}
            theme={theme}
            disabled={busy}
            onPress={() =>
              void run(
                async () => {
                  const result = await mark({
                    hostId: reference.hostId,
                    workspaceId: reference.id,
                    read: workspace.status !== "done",
                  });
                  if (!result.done) throw new Error(t("workspace.markOtherHost"));
                },
                workspace.status === "done" ? t("workspace.markUnread") : t("workspace.markRead"),
                t("workspace.markFailed"),
              )
            }
          />
        ) : null}
        <MenuRow
          label={t("workspace.color")}
          icon="Palette"
          theme={theme}
          onPress={() => onDecorate(workspace.title)}
        />
        <MenuRow
          label={workspace.pinned ? t("workspace.unpin") : t("workspace.pin")}
          icon={workspace.pinned ? "PinOff" : "Pin"}
          theme={theme}
          disabled={busy}
          onPress={() =>
            void run(
              () => handle().setPinned(!workspace.pinned),
              workspace.pinned ? t("workspace.unpinned") : t("workspace.pinned"),
              t("workspace.pinFailed"),
            )
          }
        />
        <MenuRow label={t("workspace.labels")} icon="Tag" theme={theme} onPress={() => setStep("labels")} />
        <MenuRow
          label={t("workspace.copyPath")}
          icon="Copy"
          theme={theme}
          onPress={() => copy(workspace.directory, t("toast.pathCopied"))}
        />
        {workspace.branch ? (
          <MenuRow
            label={t("workspace.copyBranch")}
            icon="GitBranch"
            theme={theme}
            onPress={() => copy(workspace.branch ?? "", t("toast.branchCopied"))}
          />
        ) : null}
        <MenuRow
          label={t("workspace.archive")}
          icon="Archive"
          theme={theme}
          danger
          onPress={() => setStep("archive")}
        />
      </Modal.Content>
    </Modal>
  );
}

/**
 * Ticks the workspace's labels on and off, like the app's Labels submenu. Lists the host's labels
 * with their colors, plus any name seen on a workspace when the host's list is unavailable.
 */
function WorkspaceLabelsDialog({
  reference,
  name,
  assigned,
  theme,
  onClose,
}: {
  reference: WorkspaceRef;
  name: string;
  assigned: readonly string[];
  theme: Theme;
  onClose: () => void;
}) {
  const t = useT();
  const paseo = usePaseo();
  const toast = useToast();
  const catalog = useLabelCatalog(reference.hostId);
  // Grouping by label yields one group per label name in use on this host.
  const seenNames = useWorkspaces({
    where: (item) => item.hostId === reference.hostId,
    groupBy: (item) => item.labels,
  }).map((group) => group.key);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const assignedKeys = new Set(assigned.map(labelKey));
  const colors = new Map((catalog.labels ?? []).map((label) => [labelKey(label.name), label.color]));
  const names = new Map<string, string>();
  for (const label of catalog.labels ?? []) names.set(labelKey(label.name), label.name);
  for (const label of [...seenNames, ...assigned]) if (!names.has(labelKey(label))) names.set(labelKey(label), label);
  const list = [...names.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const toggle = async (label: string, on: boolean) => {
    setBusy(true);
    try {
      await paseo.workspaces.ref(reference).setLabel(label, { assigned: on });
      await catalog.refresh();
    } catch (error) {
      toast.error(`${t("workspace.labelsFailed")} ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    const label = draft.replace(/\s+/g, " ").trim();
    if (!label) return;
    setDraft("");
    void toggle(label, true);
  };

  return (
    <Modal title={t("workspace.labelsTitle", { name })} open onOpenChange={closeOnDismiss(onClose)}>
      <Modal.Content contentContainerStyle={{ padding: 8, gap: 8 }}>
        <View style={{ gap: 2 }}>
          {list.length === 0 ? <MenuHint text={t("workspace.labelsEmpty")} theme={theme} /> : null}
          {list.map((label) => {
            const on = assignedKeys.has(labelKey(label));
            return (
              <Pressable
                key={labelKey(label)}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: on, disabled: busy }}
                disabled={busy}
                onPress={() => void toggle(label, !on)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 36,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: labelColors(colors.get(labelKey(label)), theme).text,
                  }}
                />
                <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.foreground, fontSize: 13 }}>
                  {label}
                </Text>
                {on ? <Icon name="Check" size={15} color={theme.colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            accessibilityLabel={t("workspace.newLabel")}
            autoCapitalize="none"
            autoCorrect={false}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            editable={!busy}
            placeholder={t("workspace.newLabelPlaceholder")}
            placeholderTextColor={theme.colors.foregroundMuted}
            style={{
              flex: 1,
              color: theme.colors.foreground,
              fontSize: 13,
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
            }}
          />
          <DialogButton label={t("workspace.addLabel")} theme={theme} onPress={add} disabled={busy || !draft.trim()} />
        </View>
        <Buttons>
          <DialogButton label={t("workspace.labelsDone")} theme={theme} kind="primary" onPress={onClose} />
        </Buttons>
      </Modal.Content>
    </Modal>
  );
}

export function DeleteGroupDialog({
  group,
  count,
  theme,
  onConfirm,
  onClose,
}: {
  group: ProjectGroup;
  count: number;
  theme: Theme;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Modal title={t("group.deleteTitle", { name: group.name })} open onOpenChange={closeOnDismiss(onClose)}>
      <Modal.Content>
        <Body theme={theme}>{t("group.deleteBody", { count })}</Body>
        <Buttons>
          <DialogButton label={t("common.cancel")} theme={theme} onPress={onClose} />
          <DialogButton label={t("group.deleteConfirm")} theme={theme} kind="danger" onPress={onConfirm} />
        </Buttons>
      </Modal.Content>
    </Modal>
  );
}
