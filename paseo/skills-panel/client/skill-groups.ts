import type { SkillSource, SkillSourceEntry } from "../shared/skill-sources";

export interface Skill {
  name: string;
  description: string;
}

export type GroupId = SkillSource | "favorites" | "unknown";
const labels: Record<GroupId, string> = {
  favorites: "즐겨찾기",
  workspace: "작업공간",
  user: "사용자",
  plugin: "플러그인",
  system: "시스템",
  admin: "관리자",
  unknown: "위치 미확인",
};

export const initiallyExpanded: ReadonlySet<GroupId> = new Set(["favorites", "workspace", "user"]);

export type SkillGroup = { id: GroupId; title: string; skills: Skill[] };
export type SkillRow =
  | { kind: "group"; group: SkillGroup; expanded: boolean }
  | { kind: "skill"; skill: Skill };

export function skillRows(
  skills: Skill[],
  favoriteNames: ReadonlySet<string>,
  sources: readonly SkillSourceEntry[],
  expanded: Partial<Record<GroupId, boolean>>,
  searching: boolean,
): SkillRow[] {
  const sourceBySkill = new Map<string, SkillSource | "unknown">();
  for (const entry of sources) {
    const key = skillKey(entry);
    const previous = sourceBySkill.get(key);
    sourceBySkill.set(key, previous && previous !== entry.source ? "unknown" : entry.source);
  }

  const groups = new Map<GroupId, Skill[]>();
  for (const skill of skills) {
    const id = favoriteNames.has(skill.name)
      ? "favorites"
      : sourceBySkill.get(skillKey(skill)) ?? "unknown";
    const group = groups.get(id);
    if (group) group.push(skill);
    else groups.set(id, [skill]);
  }

  const rows: SkillRow[] = [];
  for (const id of Object.keys(labels) as GroupId[]) {
    const members = groups.get(id);
    if (!members) continue;
    const open = searching || (expanded[id] ?? initiallyExpanded.has(id));
    rows.push({ kind: "group", group: { id, title: labels[id], skills: members }, expanded: open });
    if (open) {
      for (const skill of members) rows.push({ kind: "skill", skill });
    }
  }
  return rows;
}

function skillKey({ name, description }: Skill): string {
  return `${name}\0${description.trim()}`;
}
