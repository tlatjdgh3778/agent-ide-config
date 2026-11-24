// Workspace spaces grouped by company/personal and Git checkout.
// Keep Herdr's Space actions and Git metadata while folding only the sidebar.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, machines, panes, run, openOverlay, exec, hc, theme, props, shared, setShared, notify, watchFolder, window, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 28 : 30);
const RAIL_CELL = 32;
// A space's name and its git tail never shrink below this, so a short one ("api")
// stays readable instead of turning into an ellipsis next to a long branch.
const SIDE_MIN = 48;
const railCell = (el) => h_flex().flex_none().justify_center().child(el);
const gitKey = (s, folder) => JSON.stringify([s.machine ?? null, folder]);
const where = (s, ps) => gitKey(s, place(s, ps));
const spaceFolder = (s) => gitKey(s, s.folder);
const base = (path) => path.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const portablePath = path => {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\/|^\/\//.test(path.replace(/\\/g, "/")) ? normalized.toLowerCase() : normalized;
};
const inFolder = (path, folder) => {
  const full = portablePath(path), root = portablePath(folder);
  return full === root || full.startsWith(root + "/");
};
const FALLBACK = 60000;
// Places looked at together (two git runs each). All at once, a few hundred spaces
// run out of the app's open files (256 when started from the Dock on macOS) or
// past a machine core's 16 running execs, and those spaces wait for FALLBACK.
const AT_ONCE = 6;

// Both runs, finished: a place isn't done while one of its runs still holds a slot.
async function both(a, b) {
  const done = await Promise.allSettled([a, b]);
  const failed = done.find((d) => d.status === "rejected");
  if (failed) throw failed.reason;
  return done.map((d) => d.value);
}

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// An arbitrary number of named groups, each belonging to one machine (null is
// this computer). Membership is explicit — a space is in the group someone put
// it in, nothing is inferred from its path — and a space in no group is shown
// plainly under its machine, with no header of its own; DEFAULT_GROUP_ID is
// how that absence is written down, not a group anyone can see or name.
// `groups.list`/`groups.assignments` are the source of truth; migrate() seeds
// them from this bundle's older, binary company/personal keys, and absorbs the
// folder rules that earlier versions matched on into plain memberships.
const DEFAULT_GROUP_ID = "__default__";
const UNGROUPED_LABEL = "그룹에서 빼기";

function installFolders() {
  return find(layout(), "spaces")?.content?.props?.companyFolders ?? [];
}

// Per key, so a half-written migration (a render that threw after the first
// write, say) heals itself on the next call instead of staying incomplete.
function migrate() {
  const haveList = shared("groups.list") !== undefined;
  const haveAssign = shared("groups.assignments") !== undefined;
  if (haveList && haveAssign) return;
  const oldLabels = shared("personal-company.labels");
  const l = oldLabels && typeof oldLabels === "object" ? oldLabels : {};
  if (!haveList) {
    const storedFolders = shared("personal-company.folders");
    const oldFolders = Array.isArray(storedFolders) ? storedFolders : installFolders();
    setShared("groups.list", oldFolders.length || l.company
      ? [{ id: "company", machine: null, name: l.company || "지정 그룹", folders: oldFolders }] : []);
  }
  if (!haveAssign) {
    const oldAssign = shared("personal-company.categories");
    const next = {};
    if (oldAssign && typeof oldAssign === "object") {
      for (const [id, cat] of Object.entries(oldAssign)) next[id] = cat === "company" ? "company" : DEFAULT_GROUP_ID;
    }
    setShared("groups.assignments", next);
  }
}

function groupList() {
  migrate();
  const list = shared("groups.list");
  return Array.isArray(list) ? list : [];
}

// One machine's groups, then the bucket holding everything in none of them.
function groupsOn(machine) {
  const m = machine ?? null;
  return [
    ...groupList().filter((g) => (g.machine ?? null) === m),
    { id: DEFAULT_GROUP_ID, machine: m, name: UNGROUPED_LABEL },
  ];
}

function assignments() {
  const a = shared("groups.assignments");
  return a && typeof a === "object" ? a : {};
}

// Groups used to carry folder paths and claim every space beneath one. That
// rule is gone; the spaces those folders would match become plain members
// once, here, so nothing jumps out of its group on the upgrade.
function absorbFolders() {
  const list = groupList();
  if (!list.some((g) => g.folders?.length)) return;
  const assign = { ...assignments() };
  for (const s of spaces()) {
    if (assign[s.id]) continue;
    const machine = s.machine ?? null;
    for (const g of list) {
      if ((g.machine ?? null) !== machine) continue;
      if (s.folder && (g.folders ?? []).some((folder) => inFolder(s.folder, folder))) {
        assign[s.id] = g.id;
        break;
      }
    }
  }
  setShared("groups.assignments", assign);
  setShared("groups.list", list.map(({ folders, ...rest }) => rest));
}

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.trees = {}; // repo -> [{ path, branch }], every checkout of it but the main one
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Map(); // local repos' pending folder watches
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.overGroup = null; // the group a dragged space would join on release
    this.scroll = ScrollHandle.new(); // the list's position: the active space is brought into view through it
    this.activeAt = -1; // the active space's place among the list's children (headers and rows), -1 when not drawn
    this.machines = [];
    try {
      this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
      if (!this.reconnecting || typeof this.reconnecting !== "object" || Array.isArray(this.reconnecting)) this.reconnecting = {};
      for (const state of Object.values(this.reconnecting)) state.busy = false;
    } catch { this.reconnecting = {}; }
    try { this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]")); } catch { this.folded = new Set(); }
    const savedFolds = localStorage.getItem("projects.folded");
    try { this.projectFolds = new Set(JSON.parse(savedFolds ?? "[]")); }
    catch { this.projectFolds = new Set(); }
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // Refresh only when the refs could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    absorbFolders();
    const sp = spaces();
    this.classifyNewSpace(sp, now);
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set([...Object.values(at), ...sp.map(spaceFolder)].filter(k => JSON.parse(k)[1]));
    // Repos a space just left. Closing a worktree's space often means the
    // worktree went with it, so ask again rather than letting it linger as a
    // ghost row until the fallback comes round.
    const left = new Set();
    for (const k of Object.keys(this.git)) if (!keys.has(k)) {
      if (this.git[k]) left.add(this.git[k].repo);
      delete this.git[k];
      delete this.checked[k];
      this.unsure.delete(k);
    }
    const repos = new Set(Object.values(this.git).filter(Boolean).map((g) => g.repo));
    for (const k of Object.keys(this.trees)) if (!repos.has(k)) delete this.trees[k];
    for (const [repo, pending] of this.watching) if (!repos.has(JSON.stringify([null, portablePath(repo)]))) {
      this.watching.delete(repo);
      pending.cancel();
    }
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    if (left.size) for (const [k, g] of Object.entries(this.git)) if (g && left.has(g.repo)) due.add(k);
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(AT_ONCE, keys.length) }, async () => {
          while (next < keys.length) await this.check(keys[next++], cx);
        }));
      }
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // Ref-only reads avoid scanning the worktree or waking its index watch.
      // Two reads: a folder name may itself contain a newline.
      const [r, common] = await both(
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
        exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
      );
      if (r.code !== 0 || common.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr)) {
          this.unsure.add(key);
          this.git[key] ??= null;
        } else this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
      // Branch and upstream are display metadata. A detached or untracked checkout
      // still supplies a Git identity for worktree grouping.
      const [branch, counts] = await Promise.all([
        exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }).catch(() => null),
        exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, on }).catch(() => null),
      ]);
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const [ahead, behind] = counts?.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
      const info = { name, top: portablePath(top), branch: branch?.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo: JSON.stringify([on, portablePath(repo)]), linked: portablePath(repo) !== portablePath(`${top}/.git`) };
      this.git[key] = info;
      // Only the main checkout is asked, so one repo is listed once however
      // many of its checkouts are open.
      if (!info.linked) await this.checkTrees(info.repo, cwd, on);
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  // A repo's other checkouts, so ones nobody opened a space for can still be
  // seen and opened from the sidebar (another tool may have made them).
  async checkTrees(repoKey, cwd, on) {
    const list = await exec("git", ["worktree", "list", "--porcelain"], { cwd, on });
    if (list.code !== 0) return;
    const out = [];
    let main = true; // git lists the main checkout first, and it is not a worktree
    for (const block of list.stdout.split(/\n\n+/)) {
      const lines = block.split("\n");
      const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
      // Bare and prunable entries have no working tree to open.
      if (!path || lines.some((l) => l === "bare" || l.startsWith("prunable"))) continue;
      if (main) { main = false; continue; }
      out.push({ path, branch: lines.find((l) => l.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? null });
    }
    this.trees[repoKey] = out;
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    const pending = watchFolder(repo);
    this.watching.set(repo, pending);
    cx.spawn(async (cx) => {
      let current = pending;
      try {
        for (;;) {
          await current;
          if (this.watching.get(repo) !== current) return;
          const mine = JSON.stringify([null, portablePath(repo)]);
          const keys = Object.keys(this.git).filter((k) => this.git[k]?.repo === mine);
          if (!keys.length) break;
          this.refreshGit(keys, cx);
          current = watchFolder(repo);
          this.watching.set(repo, current);
        }
      } catch {}
      if (this.watching.get(repo) === current) this.watching.delete(repo);
    });
  }

  menu(row) {
    const project = row.parent ? this.ordered().find(item => item.w.id === row.parent) : row;
    const origin = spaceFolder(row.w);
    const declared = this.git[origin];
    // An unchecked Space folder must not inherit another repository from a shell.
    const canFollowTerminal = !row.w.folder || (declared === null && !this.unsure.has(origin));
    const checkout = canFollowTerminal ? row.g : declared;
    openOverlay({
      mod: "pc-win-menu", kind: "popup", width: 245, height: 300,
      props: { tab: "space", target: {
        id: row.w.id,
        project: project?.w.id ?? row.w.id,
        category: this.category(project ?? row),
        machine: row.w.machine ?? null,
        checkoutFolder: checkout?.top ?? row.w.folder,
        checkoutVerified: Boolean(checkout),
        worktree: Boolean(row.g?.linked || row.parent),
      } },
    });
  }

  newSpace(machine) {
    openOverlay({
      mod: "pc-win-menu", kind: "dialog", width: 300,
      props: { tab: "new-space", target: { machine } },
    });
  }

  classifyNewSpace(current, now) {
    const pending = shared("personal-company.pending");
    if (!pending) return;
    const known = new Set(pending.known);
    const matches = current.filter(space =>
      !known.has(space.id) && space.machine === pending.machine
      && (!pending.folder || portablePath(space.folder) === portablePath(pending.folder)));
    if (now < pending.deadline && matches.length === 1) {
      const id = matches[0].id;
      setShared("groups.assignments", { ...assignments(), [id]: pending.category });
      setShared("personal-company.pending", null);
    } else if (now >= pending.deadline || matches.length > 1) {
      setShared("personal-company.pending", null);
      notify({
        title: "새 Space의 분류를 저장하지 못했습니다",
        body: "Space가 열렸다면 사이드바에서 우클릭해 분류를 선택하세요.",
        level: "warning",
      });
    }
  }

  // Where the space actually is decides what it shows; the folder it was made
  // in only answers while that place hasn't been looked at yet. A looked-at
  // place that holds no repo answers null, which is an answer, not a miss --
  // otherwise a space whose shell moved to a plain folder would keep showing
  // the repository it was opened on.
  gitForSpace(space, ps) {
    const live = where(space, ps);
    if (live in this.git) return this.git[live];
    const declared = spaceFolder(space);
    return declared in this.git ? this.git[declared] : null;
  }

  // Reuse Git's common directory to group checkout spaces in this view only.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || this.gitForSpace(w, ps)
      || (spaceFolder(w) in this.git && where(w, ps) in this.git)
      || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const rows = sp.map((w, i) => ({ w, i, g: this.gitForSpace(w, ps) }))
      .filter(({ w }) => this.shown.has(w.id));
    const roots = new Map(), declaredRoots = new Map();
    for (const row of rows) {
      if (row.g && !row.g.linked && !roots.has(row.g.repo)) roots.set(row.g.repo, row);
      if (row.w.folder && !row.g?.linked) {
        const key = gitKey(row.w, portablePath(row.w.folder) + "/.git");
        if (!declaredRoots.has(key)) declaredRoots.set(key, row);
      }
    }
    const children = new Map();
    for (const row of rows) {
      // A checkout git confirmed wins; the folder a space declares is only a
      // stand-in for while that probe is in flight or the machine is away.
      const parent = row.g?.linked && (roots.get(row.g.repo) ?? declaredRoots.get(row.g.repo));
      if (!parent || parent === row) continue;
      row.parent = parent.w.id;
      if (!children.has(row.parent)) children.set(row.parent, []);
      children.get(row.parent).push(row);
    }
    return rows.filter((row) => !row.parent).flatMap((row) => {
      const kids = children.get(row.w.id) ?? [];
      for (const child of kids) child.tree = true;
      return [{ ...row, children: kids }, ...kids];
    });
  }

  // Whichever group of its own machine it was put in, else that machine's
  // default bucket. A group deleted since then leaves its spaces in default.
  category(row) {
    const machine = row.w.machine ?? null;
    const group = assignments()[row.w.id];
    if (!group) return DEFAULT_GROUP_ID;
    if (group === DEFAULT_GROUP_ID) return group;
    return groupList().some((g) => g.id === group && (g.machine ?? null) === machine) ? group : DEFAULT_GROUP_ID;
  }

  // A project's worktrees that no space is open on. A space sits in the
  // deepest checkout containing it, so a main checkout doesn't claim a
  // worktree nested inside it (Claude Code puts them in .claude/worktrees).
  ghosts(row, ps) {
    if (row.parent || !row.g || row.g.linked) return [];
    const list = this.trees[row.g.repo] ?? [];
    if (!list.length) return [];
    const machine = row.w.machine ?? null;
    const paths = list.map((w) => portablePath(w.path));
    const taken = new Set();
    for (const s of spaces()) {
      if ((s.machine ?? null) !== machine) continue;
      const at = this.gitForSpace(s, ps)?.top ?? portablePath(place(s, ps) ?? "");
      if (!at) continue;
      let best = null;
      for (const p of paths) {
        if ((at === p || at.startsWith(p + "/")) && (!best || p.length > best.length)) best = p;
      }
      if (best) taken.add(best);
    }
    return list.filter((w) => !taken.has(portablePath(w.path)));
  }

  toggleProject(key, cx) {
    if (!this.projectFolds.delete(key)) this.projectFolds.add(key);
    localStorage.setItem("projects.folded", JSON.stringify([...this.projectFolds]));
    cx.notify();
  }

  // Finish a drag onto a group: the space joins it, worktrees follow their
  // project. Dropping where it already was changes nothing.
  drop(group, machine, cx) {
    const id = this.pressed;
    this.pressed = null;
    this.over = null;
    this.overGroup = null;
    const space = id !== null && spaces().find(s => s.id === id);
    if (!space || (space.machine ?? null) !== (machine ?? null)) { cx.notify(); return; }
    const row = this.ordered().find(r => r.w.id === id);
    const target = row?.parent ?? id;
    if (assignments()[target] !== group) {
      setShared("groups.assignments", { ...assignments(), [target]: group });
    }
    cx.notify();
  }

  sections(rows, t, machine) {
    const projects = rows.filter(row => !row.parent);
    const items = [];
    const ps = panes();
    let active = -1;
    const groups = groupsOn(machine);
    const dragging = this.pressed !== null
      && (spaces().find(s => s.id === this.pressed)?.machine ?? null) === (machine ?? null);
    for (const { id: key, name: label } of groups) {
      const members = projects.filter(row => this.category(row) === key);
      // Spaces in no group just stand under the machine. Only a drag, which
      // needs somewhere to drop them, brings that bucket a header.
      const bare = key === DEFAULT_GROUP_ID && !dragging;
      const foldKey = `section-${JSON.stringify([machine, key])}`;
      const folded = !bare && this.projectFolds.has(foldKey);
      if (!bare) {
        const ungrouped = key === DEFAULT_GROUP_ID;
        const holdsActive = members.some(row => row.w.active || row.children.some(child => child.w.active));
        const dropping = dragging && this.overGroup === key;
        if (folded && holdsActive) active = items.length;
        items.push(h_flex().id(foldKey).h(29).flex_none().px(7).gap(7).items_center().rounded(6)
          .text_size(12).font_bold().text_color(folded && holdsActive ? t.foreground : t.muted)
          .cursor_pointer().hover(style => style.bg(t.hover))
          .when(dropping, el => el.bg(t.selected).text_color(t.foreground))
          .when(ungrouped, el => el.border_1().border_color(dropping ? t.accent : t.border))
          .tooltip(ungrouped ? label : (dragging ? `${label}으로 옮기기` : `${label} ${folded ? "펼치기" : "접기"}`))
          .on_mouse_move((_e, cx) => {
            if (this.pressed !== null && this.overGroup !== key) { this.overGroup = key; this.over = null; cx.notify(); }
          })
          .on_mouse_up("left", (_e, cx) => this.drop(key, machine, cx))
          .on_click((_event, cx) => { if (this.pressed === null && !ungrouped) this.toggleProject(foldKey, cx); })
          .when(!ungrouped, el => el
            .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()))
          .child(div().flex_1().child(label))
          .when(!ungrouped, el => el.child(div().flex_none().text_color(t.dim).child(String(members.length)))));
      }
      if (folded) continue;
      for (const row of members) {
        const projectFold = `project-${row.w.id}`;
        const projectClosed = this.projectFolds.has(projectFold);
        const childActive = projectClosed && row.children.some(child => child.w.active);
        const ghosts = this.ghosts(row, ps);
        if (row.w.active || childActive) active = items.length;
        items.push(this.row(row, t, { projectFold, projectClosed, childActive, group: key, ghosts: ghosts.length }));
        if (projectClosed) continue;
        for (const child of row.children) {
          if (child.w.active) active = items.length;
          items.push(this.row(child, t, { group: key }));
        }
        for (const tree of ghosts) items.push(this.ghostRow(row, tree, t));
      }
    }
    return { items, active };
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed, rows) {
    const draw = (r) => (collapsed ? this.compact(r, t) : this.row(r, t));
    // Where the active space's row lands among the children this returns: the list scrolls by its direct
    // children, and machine headers, login notes and loading rows count too.
    this.activeAt = -1;
    let before = 0;
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).items_center().when(collapsed, el => el.justify_center()).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) {
      if (loading(null) && !rows.length) return [loadingRow(null)];
      if (collapsed) {
        this.activeAt = rows.findIndex(r => r.w.active);
        return rows.map(draw);
      }
      const section = this.sections(rows, t, null);
      this.activeAt = section.active;
      return section.items;
    }
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
      const folded = this.folded.has(m);
      const icon = svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none();
      const badge = div().absolute().right(-3).bottom(-2).size(6).rounded(3).border_1().border_color(t.chrome).bg(connected ? t.ansi2 : t.dim);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .when(collapsed, el => el.mt(4).w(RAIL_CELL).justify_center().rounded(6).tooltip(login ? `${m} needs a login: run ${login}. Click for Copy.` : m ? `${m} · ${connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ")}` : "This computer"))
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          if (collapsed && login) { run("app.settings", { section: "machines" }); return; }
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .when(machine?.keeps_running_after_logout === false, el => el.child(div().id(`machine-logout-${m}`)
          .flex_none().text_color(t.blocked).tooltip("Agents stop when you disconnect. Click for the fix.")
          .on_click((_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "machine-add", kind: "dialog", width: 560 }); }).child("⚠")))
        .when(!collapsed, el => el.child(icon))
        .when(collapsed, el => el.child(div().relative().flex_none().child(icon).when(Boolean(m), el => el.child(badge))))
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt && !login, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); this.newSpace(m); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => this.newSpace(m))
        .when(collapsed, el => el.w(RAIL_CELL).rounded(6).justify_center().tooltip(`New space on ${m ?? "this computer"}`)
          .child(h_flex().size(18).rounded(5).border_1().border_color(t.dim).items_center().justify_center()
            .child(svg("mods/workspace-chrome/plus.svg").size(10))))
        .when(!collapsed, el => el.child(svg("mods/workspace-chrome/plus.svg").size(12)).child("New space there"));
      if (!collapsed && rebuilt) { before += 1; return [head]; }
      const cell = collapsed ? railCell : (el) => el;
      const guidance = !collapsed && login ? [v_flex().px(8).pb(6).gap(3).flex_none()
        .child(div().text_size(11).text_color(t.blocked).child("needs a login: run"))
        .child(h_flex().gap(5).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(login).text_size(11).text_color(t.muted).child(login))
          .child(div().id(`machine-login-copy-${m}`).flex_none().px(5).py(2).rounded(4)
            .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover(s => s.bg(t.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
            .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
      const section = folded || collapsed || !mine.length ? null : this.sections(mine, t, m);
      const body = section?.items ?? (mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : cell(empty)]);
      const items = [cell(head), ...guidance, ...(folded ? [] : body)];
      const first = folded ? -1 : (section?.active ?? mine.findIndex(r => r.w.active));
      if (first >= 0) this.activeAt = before + 1 + guidance.length + first;
      before += items.length;
      return items;
    });
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one. When the row is full, it
  // and the name both start from their text's width and give way in proportion.
  gitTail(g, tree, name, t) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_auto()
      .min_w(where ? SIDE_MIN : 0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  // A worktree with no space on it: dim, and opening one is a click away.
  ghostRow(project, tree, t) {
    const machine = project.w.machine ?? null;
    return h_flex()
      .id(`tree-${machine ?? "local"}-${tree.path}`)
      .h(rowHeight({ tree: true }))
      .flex_none()
      .pl(47)
      .pr(8)
      .gap(9)
      .items_center()
      .rounded(8)
      .opacity(0.6)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover).opacity(1))
      .tooltip(`${tree.path} — 클릭하면 Space로 엽니다`)
      .on_click(() => run("space.new", { folder: tree.path, machine: machine ?? "" }))
      .child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none().text_color(t.dim))
      .child(div().flex_initial().min_w(SIDE_MIN).truncate().text_color(t.muted).child(base(tree.path)))
      .child(h_flex().flex_auto().min_w(0).justify_end().text_size(11.5).text_color(t.dim)
        .child(div().min_w(0).truncate().child(tree.branch ?? "detached")));
  }

  row(row, t, { projectFold, projectClosed, childActive, group, ghosts } = {}) {
    const { w, i, g, tree, children } = row;
    const on = w.active;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    const hasWorktrees = Boolean(children?.length || ghosts);
    const item = v_flex()
      .relative()
      .id(`space-${w.id}`)
      .pl(hasWorktrees ? 2 : 25)
      .pr(8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(childActive, el => el.bg(t.raised))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, line => line.bottom(0))
          .when(fromIndex > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        const onGroup = over ? group ?? null : null;
        if (this.pressed !== null && (this.over !== over || this.overGroup !== onGroup)) {
          this.over = over;
          this.overGroup = onGroup;
          cx.notify();
        }
      })
      // Dropped on a row of another group, a space joins that group as well
      // as taking its place in the order.
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        const onGroup = this.overGroup;
        this.pressed = null;
        this.over = null;
        this.overGroup = null;
        if (from !== null && over === w.id && from !== w.id) {
          if (onGroup) {
            const source = this.ordered().find(r => r.w.id === from);
            const target = source?.parent ?? from;
            if (assignments()[target] !== onGroup) {
              setShared("groups.assignments", { ...assignments(), [target]: onGroup });
            }
          }
          const index = spaces().findIndex(s => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(row))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none().text_color(t.dim)))
          .when(!tree, el => el.child(h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?")))
          .child(div().flex_initial().min_w(SIDE_MIN).truncate().text_color(t.foreground).child(w.name))
          .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1()),
      );
    if (!hasWorktrees) return item;
    return h_flex().h(rowHeight({ tree })).flex_none().items_center()
      .child(h_flex().w(23).flex_none().justify_center()
        .child(h_flex().id(projectFold).size(21).rounded(5).items_center().justify_center()
          .cursor_pointer().text_color(childActive ? t.foreground : t.muted)
          .hover(style => style.bg(t.hover).text_color(t.foreground))
          .tooltip(`${w.name} 워크트리 ${projectClosed ? "펼치기" : "접기"}`)
          .on_click((_event, cx) => this.toggleProject(projectFold, cx))
          .child(svg(`mods/workspace-chrome/chevron-${projectClosed ? "right" : "down"}.svg`).size(10))))
      .child(item.flex_1().min_w(0));
  }

  compact(row, t) {
    const { w, i } = row;
    return railCell(h_flex()
      .id(`space-${w.id}`)
      .relative()
      .w(RAIL_CELL)
      .h(26)
      .rounded(6)
      .justify_center()
      .items_center()
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .on_mouse_down("right", () => this.menu(row))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(5).text_color(tone(t, w.status)).child(glyph(w.status))));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    const rows = this.ordered();
    const graph = Object.fromEntries(rows.map(row => [row.w.id, {
      parent: row.parent ?? null,
      category: row.parent ? null : this.category(row),
      branch: row.g?.branch ?? null,
    }]));
    if (JSON.stringify(graph) !== JSON.stringify(shared("personal-company.space-map.graph"))) {
      setShared("personal-company.space-map.graph", graph);
    }
    const list = this.grouped(t, collapsed, rows);
    // Bring the active space into view when it, or its place in the list, changes; a row already in view stays put.
    const active = sp.find(p => p.active)?.id;
    if (active !== this.revealed || this.activeAt !== this.revealedAt) {
      this.revealed = active;
      this.revealedAt = this.activeAt;
      if (this.activeAt >= 0) this.scroll.scroll_to_item(this.activeAt);
    }
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(collapsed, el => el.pl(0).pr(0).justify_center())
        .when(!collapsed, el => el.child("Spaces"))
        .when(!collapsed, el => el.child(div().id("manage-folders").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .tooltip("그룹 설정")
          .on_click(() => openOverlay({ mod: "pc-win-folders", kind: "dialog", width: 400, height: 440 }))
          .child(svg("mods/workspace-chrome/folder-plus.svg").size(14))))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .tooltip("새 Space")
          .on_click(() => this.newSpace(sp.find(space => space.active)?.machine ?? null))
          .child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always").track_scroll(this.scroll)
        // A block above (another mod's) growing, or the window resizing, shrinks this list and can push the active space out.
        .on_size_change((_size, cx) => { if (this.activeAt >= 0) { this.scroll.scroll_to_item(this.activeAt); cx.notify(); } })
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; this.overGroup = null; cx.notify(); })
        .children(list));
  }
}
