// Context menus (Herdr's items). Opened as a popup with
// props { tab: "pane" | "tab" | "space" | "global", target }.
// ↑/↓ move, Enter runs, Esc closes. An item is [label, command, args];
// a command "worktree" opens the worktree dialog instead.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, keys, terminals, spaces, panes, exec, pickFolder, shared, setShared, notify } from "herdr";

const LOCKS = "personal-company.tab-locks";
const lockedTabs = () => shared(LOCKS) ?? [];

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

function items(p, git) {
  p = p ?? {};
  const tg = p.target ?? {};
  switch (p.tab ?? "new-space") {
    case "new-space":
      return [["지정 그룹", "category.new", { category: "company" }], ["기본 그룹", "category.new", { category: "personal" }]];
    case "pane": {
      // A kept sub-agent can go back under its parent, still running.
      const all = terminals();
      const term = all.find((t) => t.address === tg.terminal);
      const parent = term?.parent && all.find((t) => t.address === term.parent);
      // Once they go to the program, Shift+right-click still opens this menu.
      const toProgram = term?.labels?.["herdr.right-click"] === "program";
      // A terminal shown outside a tab (a layout terminal block, a window) has
      // no pane to split, zoom or close: its pane is the block's id.
      const inTab = panes().some((pane) => pane.pane === tg.pane);
      return [
        ...(inTab
          ? [
              ["Split right", "pane.split", { direction: "right", pane: tg.pane }],
              ["Split down", "pane.split", { direction: "down", pane: tg.pane }],
              ["Zoom", "pane.zoom", { pane: tg.pane }],
            ]
          : []),
        ...(term
          ? [
              toProgram
                ? ["Use Herdr right-click menu", "terminal.right_click", { terminal: term.address, to: "menu" }]
                : ["Send right-clicks to pane", "terminal.right_click", { terminal: term.address, to: "program" }],
            ]
          : []),
        ...(parent ? [[`Send back to ${parent.name || parent.address}`, "terminal.park", { terminal: term.address }]] : []),
        ...(inTab ? [["Close pane", "pane.close", { pane: tg.pane }]] : []),
      ];
    }
    case "tab": {
      const locked = lockedTabs().includes(tg.id);
      return [
        ["Rename", "tab.rename", { id: tg.id }],
        ["New tab", "tab.new", { space: tg.space }],
        [locked ? "잠금 해제" : "잠금", "tab.toggle-lock", { id: tg.id }],
        [locked ? "닫기 (잠김)" : "Close", "tab.close", { id: tg.id }, locked],
      ];
    }
    case "space": {
      const next = tg.category === "company" ? "personal" : "company";
      return [
        [next === "company" ? "지정 그룹으로 이동" : "기본 그룹으로 이동", "category.move", { id: tg.project ?? tg.id, category: next }],
        ["Rename", "space.rename", { id: tg.id }],
        ...(git ? [["New worktree", "worktree", { space: tg.id, action: "new" }], ["Open worktree", "worktree", { space: tg.id, action: "open" }]] : []),
        ...(git === "linked" ? [["Remove worktree", "worktree", { space: tg.id, action: "remove" }]] : []),
        ["Close", "space.close", { id: tg.id }],
      ];
    }
    default:
      return [
        ["New space", "space.new", {}],
        ["Keybinds", "app.help", {}],
        ["Theme: graphite", "app.theme", { name: "graphite" }],
        ["Theme: ink", "app.theme", { name: "ink" }],
        ["Theme: moss", "app.theme", { name: "moss" }],
        ["Theme: atom one dark", "app.theme", { name: "atom-one-dark" }],
      ];
  }
}

function menuIcon(command) {
  if (command === "tab.toggle-lock") return "mods/personal-company-tabs/lock.svg";
  const name = command.endsWith(".close") ? "x" : command.endsWith(".rename") ? "square-pen" : command.endsWith(".new") ? "plus" : command === "worktree" ? "git-branch" : command === "app.help" ? "terminal" : command === "app.theme" ? "settings" : command === "pane.split" ? "panel-right" : command === "pane.zoom" ? "square" : "terminal";
  return `mods/workspace-chrome/${name}.svg`;
}

// The key bound to a command, for the hint on the right.
function shortcut(name, args) {
  // `pane.split:right` binds pane.split with { direction: "right" }.
  const value = args && Object.values(args)[0];
  const k = keys().find((b) => b.section === "global" && (b.action === name || b.action === `${name}:${value}`));
  return k ? k.keys : "";
}

export default class Menu extends View {
  create(category, cx) {
    if (this.picking) return;
    const p = props() ?? {};
    const machine = p.target && "machine" in p.target
      ? p.target.machine : spaces().find(space => space.active)?.machine ?? null;
    this.picking = true;
    cx.spawn(async (cx) => {
      try {
        const folder = machine === null ? await pickFolder({ prompt: "Space 폴더 선택" }) : null;
        if (machine === null && !folder) return;
        const pending = shared("personal-company.pending");
        if (pending && pending.deadline > Date.now()) {
          notify({ title: "이전 Space를 만드는 중입니다", body: "생성이 끝나면 다시 선택할 수 있습니다." });
          return;
        }
        const known = spaces().map(space => space.id);
        setShared("personal-company.pending", { known, machine, folder, category, deadline: Date.now() + 15000 });
        try {
          run("space.new", { machine: machine ?? "", ...(folder ? { folder } : {}) });
        } catch (error) {
          setShared("personal-company.pending", null);
          throw error;
        }
        closeOverlay(p.overlay);
      } catch (error) {
        notify({ title: "Space를 만들지 못했습니다", body: String(error), level: "error" });
      } finally {
        this.picking = false;
      }
    });
  }

  init(_props, cx) {
    this.at = 0;
    this.git = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const p = props();
    const space = p?.tab === "space" && spaces().find((s) => s.id === p.target?.id);
    const folder = space && place(space);
    if (folder)
      cx.spawn(async (cx) => {
        this.git = await checkout(folder, space.machine).catch(() => null);
        cx.notify();
      });
  }

  choose(i, cx) {
    const it = items(props(), this.git)[i];
    if (!it || it[3]) return;
    if (it[1] === "tab.toggle-lock") {
      const id = it[2].id;
      if (spaces().some(space => space.tabs.some(tab => tab.id === id))) {
        const locks = lockedTabs();
        setShared(LOCKS, locks.includes(id) ? locks.filter(locked => locked !== id) : [...locks, id]);
      }
      closeOverlay(props()?.overlay);
      return;
    }
    if (it[1] === "category.new") { this.create(it[2].category, cx); return; }
    if (it[1] === "category.move") {
      if (spaces().some(space => space.id === it[2].id)) {
        setShared("personal-company.categories", { ...(shared("personal-company.categories") ?? {}), [it[2].id]: it[2].category });
      }
      closeOverlay(props()?.overlay);
      return;
    }
    closeOverlay(props()?.overlay);
    if (it[1] === "worktree") openOverlay({ mod: "worktree", kind: "dialog", ...(it[2].action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it[2] });
    else run(it[1], it[2]);
  }

  render(cx) {
    const t = theme();
    const list = items(props(), this.git);
    const creating = (props()?.tab ?? "new-space") === "new-space";
    return v_flex()
      .id("menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .when(creating, el => el.child(v_flex().px(9).py(7).gap(4)
        .child(div().font_bold().text_color(t.foreground).child("새 Space"))
        .child(div().text_size(11).text_color(t.muted).child("새 Space가 속할 그룹을 선택하세요."))))
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at, cx);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(
        list.map((it, i) =>
          v_flex()
            .when(i > 0 && (it[1].endsWith(".close") || it[1] === "app.help" || (it[1] === "app.theme" && list[i - 1][1] !== "app.theme")), el => el.child(div().mx(7).my(4).h(1).bg(t.border)))
            .child(h_flex()
            .id(`mi-${i}`)
            .h(31)
            .px(8)
            .gap(9)
            .rounded(7)
            .items_center()
            .justify_between()
            .text_color(it[3] ? t.dim : t.foreground)
            .when(!it[3] && i === this.at, (el) => el.bg(t.selected))
            .when(!it[3], el => el.hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.choose(i, cx)))
            .when(!creating, el => el.child(svg(menuIcon(it[1])).size(14).flex_none().text_color(t.muted)))
            .child(div().flex_1().child(it[0]))
            .child(div().text_size(11).text_color(t.dim).child(shortcut(it[1], it[2])))),
        ),
      );
  }
}
