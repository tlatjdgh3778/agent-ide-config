// Dialog: manage grouping, one machine at a time — add, rename and delete the
// groups under each machine, and name the default bucket every machine keeps.
// Which space is in which group is set from the space's own right-click menu.
// See personal-company-spaces/main.js for the full comment on this data model;
// duplicated here since each mod is its own sandbox with no shared imports.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { shared, setShared, closeOverlay, props, theme, layout, machines, spaces } from "herdr";

const DEFAULT_GROUP_ID = "__default__";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function installFolders() {
  return find(layout(), "spaces")?.content?.props?.companyFolders ?? [];
}

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

function assignments() {
  const a = shared("groups.assignments");
  return a && typeof a === "object" ? a : {};
}

// This computer first, then every machine that has spaces, groups or a live
// connection — so a machine can be set up before it holds anything.
function machineNames() {
  const names = new Set();
  for (const m of machines()) if (m.name) names.add(m.name);
  for (const s of spaces()) if (s.machine) names.add(s.machine);
  for (const g of groupList()) if (g.machine) names.add(g.machine);
  return [null, ...[...names].sort()];
}

function groupsOn(machine) {
  const m = machine ?? null;
  return groupList().filter((g) => (g.machine ?? null) === m);
}

function memberCount(groupId, machine) {
  const assign = assignments();
  return spaces().filter((s) => (s.machine ?? null) === (machine ?? null) && assign[s.id] === groupId).length;
}

function setGroups(next) {
  setShared("groups.list", next);
}

function updateGroup(id, patch) {
  setGroups(groupList().map((g) => (g.id === id ? { ...g, ...patch } : g)));
}

export default class Folders extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    // InputState.new() is only legal in init() or an event handler, never in
    // render(), so every field is made here and new ones in the handler that
    // creates the group.
    this.nameInputs = new Map(); // group id -> InputState
    for (const g of groupList()) this.makeNameInput(g.id, g.name);
  }

  makeNameInput(id, name) {
    const input = InputState.new({ value: name });
    input.on("change", (_e, cx) => {
      updateGroup(id, { name: input.value() });
      cx.notify();
    });
    this.nameInputs.set(id, input);
    return input;
  }

  addGroup(machine, cx) {
    const id = `g-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    setGroups([...groupList(), { id, machine: machine ?? null, name: "새 그룹" }]);
    this.makeNameInput(id, "새 그룹").focus();
    cx.notify();
  }

  removeGroup(id, cx) {
    setGroups(groupList().filter((g) => g.id !== id));
    this.nameInputs.delete(id);
    cx.notify();
  }

  render() {
    const t = theme();

    const groupRow = (group, machine) => {
      const input = this.nameInputs.get(group.id);
      const count = memberCount(group.id, machine);
      return h_flex().id(`group-${group.id}`).gap(6).items_center().flex_none()
        .child(svg("mods/workspace-chrome/layers.svg").size(12).flex_none().text_color(t.muted))
        .child(input
          ? Input.new(input).flex_1().h(30).px(8).rounded(6).border_1().border_color(t.input)
              .bg(t.background).text_size(12.5).text_color(t.foreground)
          : div().flex_1().h(30).px(8).flex().items_center().text_color(t.foreground).child(group.name))
        .child(div().flex_none().w(26).text_size(11).text_color(t.dim).child(String(count)))
        .child(div().id(`rm-${group.id}`).flex_none().size(22).rounded(5).flex().items_center().justify_center()
          .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.blocked))
          .tooltip(count ? `그룹 삭제 — Space ${count}개는 기본 그룹으로 돌아갑니다` : "그룹 삭제")
          .on_click((_e, cx) => this.removeGroup(group.id, cx))
          .child(svg("mods/workspace-chrome/x.svg").size(11)));
    };

    const machineSection = (machine) => {
      const local = (machine ?? null) === null;
      return v_flex().id(`machine-${machine ?? "local"}`).gap(5).flex_none()
        .child(h_flex().gap(6).items_center()
          .child(svg(`mods/workspace-chrome/${local ? "monitor" : "server"}.svg`).size(12).flex_none().text_color(t.muted))
          .child(div().flex_1().font_bold().text_size(12).text_color(t.foreground)
            .child(local ? "This computer" : machine)))
        .children(groupsOn(machine).map((g) => groupRow(g, machine)))
        .child(h_flex().id(`add-${machine ?? "local"}`).h(28).px(8).gap(5).flex_none()
          .items_center().justify_center().rounded(6).bg(t.raised).text_size(11.5).text_color(t.muted)
          .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => this.addGroup(machine, cx))
          .child(svg("mods/workspace-chrome/plus.svg").size(11))
          .child("그룹 추가"));
    };

    return v_flex()
      .id("folders")
      .track_focus(this.handle)
      .size_full()
      .p(14)
      .gap(10)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, _cx) => { if (e.key === "escape") closeOverlay(props()?.overlay); })
      .child(div().font_bold().text_color(t.foreground).child("그룹 설정"))
      .child(div().text_size(11).text_color(t.muted)
        .child("그룹은 머신에 속합니다. Space를 사이드바에서 그룹으로 끌어다 놓거나, 우클릭해서 옮기세요. 어느 그룹에도 안 넣은 Space는 머신 바로 아래에 표시됩니다."))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().gap(14)
        .children(machineNames().map(machineSection)));
  }
}
