import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import type { SkillSource, SkillSourceEntry } from "../shared/skill-sources";

const skillMetadata = z.object({
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  scope: z.string(),
  path: z.string(),
  pluginId: z.string().nullish(),
});

const listResult = z.object({
  data: z.array(z.object({ cwd: z.string(), skills: z.array(skillMetadata) })),
});

function installationSource(
  skill: z.infer<typeof skillMetadata>,
  pluginCache: string,
): SkillSource | undefined {
  const fromCache = relative(pluginCache, skill.path);
  if (skill.pluginId || (fromCache && !isAbsolute(fromCache) && fromCache !== ".." && !fromCache.startsWith(`..${sep}`))) {
    return "plugin";
  }
  if (skill.scope === "repo") return "workspace";
  if (skill.scope === "user" || skill.scope === "system" || skill.scope === "admin") return skill.scope;
}

export async function readCodexSkillSources(cwd: string): Promise<SkillSourceEntry[]> {
  const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
    cwd,
    stdio: ["pipe", "pipe", "ignore"],
    timeout: 10_000,
    killSignal: "SIGKILL",
  });
  const lines = createInterface({ input: child.stdout });
  const codexHome = resolve(cwd, process.env.CODEX_HOME || join(homedir(), ".codex"));
  const pluginCache = join(codexHome, "plugins", "cache");

  try {
    return await new Promise((resolveList, reject) => {
      const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
      child.once("error", reject);
      child.stdin.on("error", reject);
      lines.once("close", () => reject(new Error("Codex 스킬 목록 조회가 종료되었습니다.")));
      lines.on("line", (line) => {
        try {
          const response = JSON.parse(line);
          if (response.id !== 1 && response.id !== 2) return;
          if (response.error) throw new Error("Codex 스킬 메타데이터를 읽을 수 없습니다.");
          if (response.id === 1) {
            send({ method: "initialized" });
            send({ id: 2, method: "skills/list", params: { cwds: [cwd] } });
            return;
          }

          const result = listResult.parse(response.result);
          const skills = result.data.find((entry) => entry.cwd === cwd)?.skills ?? [];
          resolveList(skills.flatMap((skill) => {
            if (!skill.enabled) return [];
            const source = installationSource(skill, pluginCache);
            return source ? [{ name: skill.name, description: skill.description, source }] : [];
          }));
        } catch (error) {
          reject(error);
        }
      });
      send({
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "paseo-skills-panel", version: "0.1.0" } },
      });
    });
  } finally {
    lines.close();
    child.stdin.destroy();
    child.kill();
  }
}
