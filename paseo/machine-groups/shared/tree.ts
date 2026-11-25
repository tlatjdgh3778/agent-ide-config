// Worktrees under the checkout they came from, the way Herdr's space map showed them.
// Paseo knows which workspaces are worktrees and which project each belongs to, so the
// nesting needs no settings: a project's worktrees go under that project's own checkout.

export interface Entry {
  readonly id: string;
  /** The Paseo project the workspace belongs to. */
  readonly project: string;
  /** A worktree, as opposed to the project's own checkout or a plain directory. */
  readonly worktree: boolean;
}

export interface Row<E extends Entry> {
  readonly entry: E;
  /** Worktrees nested under this checkout. Always empty for a worktree row. */
  readonly children: readonly E[];
}

/**
 * Nests each worktree under the first checkout of its project in the same list.
 * A worktree whose checkout isn't in the list (another group, or archived) stays at
 * the top level. Order is kept: checkouts and stray worktrees as given, and each
 * checkout's worktrees in the order they appear.
 */
export function nestWorktrees<E extends Entry>(list: readonly E[]): Row<E>[] {
  const parentOf = new Map<string, string>();
  for (const entry of list) {
    if (!entry.worktree && !parentOf.has(entry.project)) parentOf.set(entry.project, entry.id);
  }
  const children = new Map<string, E[]>();
  const top: E[] = [];
  for (const entry of list) {
    const parent = entry.worktree ? parentOf.get(entry.project) : undefined;
    if (parent) children.set(parent, [...(children.get(parent) ?? []), entry]);
    else top.push(entry);
  }
  return top.map((entry) => ({ entry, children: children.get(entry.id) ?? [] }));
}
