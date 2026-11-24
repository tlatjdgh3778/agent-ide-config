// Groups on one machine (a Paseo host): a name, and which workspaces were put in it.
// Membership is only ever explicit. There is no rule that sorts a workspace into a
// group by its path; that idea was dropped on purpose in the Herdr version.

export interface Group {
  readonly id: string;
  readonly name: string;
}

export interface Machine {
  readonly groups: Group[];
  /** workspaceId -> groupId. Kept for archived workspaces so they return to their group. */
  readonly assignments: Record<string, string>;
}

/** Every machine's groups, keyed by the host's serverId. */
export type Machines = Record<string, Machine>;

export const EMPTY: Machine = { groups: [], assignments: {} };

export const machineOf = (all: Machines, hostId: string): Machine => all[hostId] ?? EMPTY;

const withMachine = (all: Machines, hostId: string, machine: Machine): Machines => ({
  ...all,
  [hostId]: machine,
});

/** Why `name` can't name a group on this machine, or null when it can. */
export function nameProblem(machine: Machine, name: string, exceptId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "이름을 입력하세요.";
  const taken = machine.groups.some(
    (g) => g.id !== exceptId && g.name.toLowerCase() === trimmed.toLowerCase(),
  );
  return taken ? "이 머신에 같은 이름의 그룹이 있습니다." : null;
}

export class GroupError extends Error {}

function check(machine: Machine, name: string, exceptId?: string): string {
  const problem = nameProblem(machine, name, exceptId);
  if (problem) throw new GroupError(problem);
  return name.trim();
}

export function addGroup(all: Machines, hostId: string, name: string, id: string): Machines {
  const machine = machineOf(all, hostId);
  const clean = check(machine, name);
  return withMachine(all, hostId, { ...machine, groups: [...machine.groups, { id, name: clean }] });
}

export function renameGroup(all: Machines, hostId: string, groupId: string, name: string): Machines {
  const machine = machineOf(all, hostId);
  if (!machine.groups.some((g) => g.id === groupId)) return all;
  const clean = check(machine, name, groupId);
  return withMachine(all, hostId, {
    ...machine,
    groups: machine.groups.map((g) => (g.id === groupId ? { ...g, name: clean } : g)),
  });
}

/** Deleting a group only lets its workspaces out; they stay under the machine. */
export function deleteGroup(all: Machines, hostId: string, groupId: string): Machines {
  const machine = machineOf(all, hostId);
  if (!machine.groups.some((g) => g.id === groupId)) return all;
  const assignments = Object.fromEntries(
    Object.entries(machine.assignments).filter(([, g]) => g !== groupId),
  );
  return withMachine(all, hostId, {
    groups: machine.groups.filter((g) => g.id !== groupId),
    assignments,
  });
}

/** Put a workspace in a group, or take it out with `groupId` null. */
export function assign(
  all: Machines,
  hostId: string,
  workspaceId: string,
  groupId: string | null,
): Machines {
  const machine = machineOf(all, hostId);
  if (groupId !== null && !machine.groups.some((g) => g.id === groupId)) return all;
  const { [workspaceId]: _previous, ...rest } = machine.assignments;
  const assignments = groupId === null ? rest : { ...rest, [workspaceId]: groupId };
  return withMachine(all, hostId, { ...machine, assignments });
}

/** The group a workspace is shown in, ignoring assignments to groups that no longer exist. */
export function groupOf(machine: Machine, workspaceId: string): string | null {
  const id = machine.assignments[workspaceId];
  return id && machine.groups.some((g) => g.id === id) ? id : null;
}

export const newGroupId = (): string =>
  `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
