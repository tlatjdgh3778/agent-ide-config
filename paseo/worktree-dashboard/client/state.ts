import type { PluginAgentSnapshot, PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import type { AgentRef } from "@getpaseo/plugin/client";

export const statusLabels = {
  needs: "입력 필요",
  work: "작업 중",
  ready: "완료 미확인",
  failed: "실패",
  idle: "대기",
} as const;

export type AgentState = keyof typeof statusLabels;
export type Filter = "all" | AgentState;

const priority: Record<AgentState, number> = {
  needs: 0, failed: 1, work: 2, ready: 3, idle: 4,
};

export function agentState(agent: PluginAgentSnapshot): AgentState {
  if (agent.attentionReason === "permission") return "needs";
  if (agent.status === "error" || agent.attentionReason === "error") return "failed";
  if (agent.status === "running" || agent.status === "initializing" ||
      agent.backgroundWork.count > 0) return "work";
  return agent.requiresAttention && agent.attentionReason === "finished" ? "ready" : "idle";
}

export function agentStateLabel(agent: PluginAgentSnapshot, state = agentState(agent)) {
  if (state === "work" && agent.status === "initializing") return "시작 중";
  if (state === "work" && agent.status !== "running") return "백그라운드 작업 중";
  if (state === "idle" && agent.status === "closed") return "세션 종료";
  return statusLabels[state];
}

const workspaceStates = {
  needs_input: "needs",
  failed: "failed",
  running: "work",
  attention: "ready",
  done: null,
} as const satisfies Record<PluginWorkspaceSnapshot["indicator"], AgentState | null>;

export function workspaceState(workspace: PluginWorkspaceSnapshot): AgentState | null {
  return workspaceStates[workspace.indicator];
}

export function hasCodexQuestion(lines: readonly string[]): boolean {
  const lastLine = lines.findLastIndex(line => line.trim() !== "");
  if (lastLine < 0 || lines.length - lastLine > 5) return false;

  // The answer controls are at the bottom of the active Codex overlay. Ignore
  // prompts found only in earlier terminal output.
  const tail = lines.slice(Math.max(0, lastLine - 2), lastLine + 1).join(" ");
  if (!/tab\s+to\s+add\s+notes\s*\|\s*enter\s+to\s+submit\s+answer\s*\|\s*esc\s+to\s+interrupt\s*$/i.test(tail)) {
    return false;
  }
  return lines.slice(0, lastLine).some(line =>
    /^\s*Question\s+\d+\s*\/\s*\d+\s*\(\d+\s+unanswered\)\s*$/i.test(line));
}

export function compareAgents(left: PluginAgentSnapshot, right: PluginAgentSnapshot) {
  return priority[agentState(left)] - priority[agentState(right)] ||
    right.lastActivityAt.localeCompare(left.lastActivityAt);
}

export function compareWorkspaces(left: PluginWorkspaceSnapshot, right: PluginWorkspaceSnapshot) {
  const project = left.projectDisplayName.localeCompare(right.projectDisplayName) ||
    left.project.key.localeCompare(right.project.key);
  const state = priority[workspaceState(left) ?? "idle"] - priority[workspaceState(right) ?? "idle"];
  return project || state || (left.title ?? left.name).localeCompare(right.title ?? right.name);
}

export function providerName(provider: string) {
  const known: Record<string, string> = {
    claude: "Claude Code",
    codex: "Codex",
    opencode: "OpenCode",
    copilot: "GitHub Copilot",
  };
  return known[provider] ?? provider;
}

export interface AgentNode {
  ref: AgentRef;
  children: AgentNode[];
}

export function buildTree(
  agents: readonly AgentRef[],
  parentGroups: readonly { key: string; items: readonly AgentRef[] }[],
): AgentNode[] {
  const keys = new Set(agents.map(agent => agent.key));
  const parentByChild = new Map<string, string>();
  const childrenByParent = new Map<string, readonly AgentRef[]>();
  for (const group of parentGroups) {
    if (!keys.has(group.key)) continue;
    const children = group.items.filter(child => keys.has(child.key));
    childrenByParent.set(group.key, children);
    for (const child of children) parentByChild.set(child.key, group.key);
  }

  const visited = new Set<string>();
  function visit(ref: AgentRef): AgentNode {
    visited.add(ref.key);
    const children: AgentNode[] = [];
    for (const child of childrenByParent.get(ref.key) ?? []) {
      if (!visited.has(child.key)) children.push(visit(child));
    }
    return { ref, children };
  }

  const roots = agents.filter(ref => !parentByChild.has(ref.key)).map(visit);
  for (const ref of agents) {
    if (!visited.has(ref.key)) roots.push(visit(ref));
  }
  return roots;
}
