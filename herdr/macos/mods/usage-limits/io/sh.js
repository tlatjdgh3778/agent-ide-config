import { exec } from "herdr";

const PLAIN_SHELL = "sh";
const CANNOT_START = "cannot run";
const GIT_CORE = /\/[^/]+\/libexec\/git-core$/;

let shell = PLAIN_SHELL;

const run = (bin, args, opts) => (opts ? exec(bin, args, opts) : exec(bin, args));

const plainShellMissing = (error) => shell === PLAIN_SHELL && String(error?.message ?? error).includes(CANNOT_START);

async function gitBundledShell() {
  const core = (await exec("git", ["--exec-path"]).catch(() => null))?.stdout.trim() ?? "";
  const root = core.replace(GIT_CORE, "");
  return root && root !== core ? `${root}/bin/sh.exe` : null;
}

export async function runSh(args, opts) {
  try {
    return await run(shell, args, opts);
  } catch (error) {
    if (!plainShellMissing(error)) throw error;
    const found = await gitBundledShell();
    const result = found && await run(found, args, opts).catch(() => null);
    if (!result) throw error;
    shell = found;
    return result;
  }
}
