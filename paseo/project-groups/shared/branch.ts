// A new worktree's branch name, checked before asking Paseo so the form can say what's
// wrong. Follows git's ref-name rules (git check-ref-format) for the parts people trip on.

/** Why `name` can't name a new branch, or null when it can. */
export function branchProblem(name: string): string | null {
  const branch = name.trim();
  if (!branch) return "브랜치 이름을 입력하세요.";
  if (/\s/.test(branch)) return "브랜치 이름에 공백을 쓸 수 없습니다.";
  if (/[~^:?*[\\\x00-\x1f\x7f]/.test(branch)) return "브랜치 이름에 ~ ^ : ? * [ \\ 를 쓸 수 없습니다.";
  if (branch.startsWith("-")) return "브랜치 이름은 - 로 시작할 수 없습니다.";
  if (branch === "@" || branch.includes("@{")) return "브랜치 이름에 @{ 를 쓸 수 없습니다.";
  if (branch.includes("..") || branch.includes("//")) return "브랜치 이름에 .. 이나 // 를 쓸 수 없습니다.";
  if (branch.startsWith("/") || branch.endsWith("/") || branch.endsWith("."))
    return "브랜치 이름은 / 로 시작하거나 / 나 . 으로 끝날 수 없습니다.";
  if (branch.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock")))
    return "경로의 각 부분은 . 으로 시작하거나 .lock 으로 끝날 수 없습니다.";
  return null;
}
