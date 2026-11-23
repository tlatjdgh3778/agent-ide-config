import { View, div, svg, image, PathBuilder } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, layout, run, settings, shared, setShared, spaces, theme } from "herdr";

const ASSETS = "mods/workspace-chrome";
const STATUS = [
  ["blocked", "입력 대기"],
  ["working", "작업 중"],
  ["done", "완료"],
  ["idle", "유휴"],
];

// See personal-company-spaces/main.js for the full comment on this model; duplicated
// here since each mod is its own sandbox with no shared imports.
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

// Every machine's groups share one column list here, since the map draws all
// machines together; spaces in no group come last, under a plain heading.
function allGroups() {
  return [
    ...groupList().map(({ id, name }) => ({ id, name })),
    { id: DEFAULT_GROUP_ID, name: "그룹 없음" },
  ];
}

const shortTitle = (agent) => {
  const title = (agent.title ?? "").replace(/^\[ [!.] \] /, "")
    .replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}~/]+/u, "").trim();
  const tab = agent.tab_name;
  const program = agent.program?.name;
  if (tab && tab !== program && !/^\d+$/.test(tab)) return tab;
  if (title && !/^[~/]|^[A-Za-z]:\\/.test(title) && title !== agent.address) return title;
  return program ?? "에이전트";
};

function groupsFor(list) {
  return STATUS.map(([status, label]) => ({
    status, label, agents: list.filter(agent => agent.status === status),
  })).filter(group => group.agents.length > 0);
}

// Group membership is explicit; a space nobody placed sits in the default one.
function fallbackCategory(space, overrides) {
  return overrides[space.id] ?? DEFAULT_GROUP_ID;
}

function buildMap(allSpaces, allAgents, metadata, overrides, scope) {
  const active = allSpaces.find(space => space.active);
  const nodes = new Map(allSpaces.map(space => [space.id, {
    space, branch: metadata[space.id]?.branch ?? space.branch, agents: [], children: [],
  }]));
  for (const agent of allAgents) nodes.get(agent.space)?.agents.push(agent);

  const roots = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(metadata[node.space.id]?.parent);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const visible = scope === "current"
    ? roots.filter(root => root.space.id === active?.id || root.children.some(child => child.space.id === active?.id))
    : roots;
  const categories = allGroups().map(({ id, name }) => ({
    id, name,
    projects: visible.filter(root => (overrides[root.space.id] ?? metadata[root.space.id]?.category
      ?? fallbackCategory(root.space, overrides)) === id).map(root => ({
      ...root,
      children: scope === "current" && root.space.id !== active?.id
        ? root.children.filter(child => child.space.id === active?.id)
        : root.children,
    })),
  }));
  return { categories, active, agentCount: allAgents.length };
}

const PAD = 20, GAP = 34, ROW_GAP = 12, SECTION_GAP = 30;
const heading = 64, agentRow = 25, statusRow = 20;
const heightOf = (groups) => heading + (groups.length
  ? groups.reduce((height, group) => height + statusRow + group.agents.length * agentRow, 0) + 10
  : 24);

function geometry(categories, width) {
  const categoryWidth = 144;
  const cardWidth = Math.max(235, Math.min(380, Math.floor((width - PAD * 2 - categoryWidth - GAP * 2) / 2)));
  const columns = [PAD, PAD + categoryWidth + GAP, PAD + categoryWidth + cardWidth + GAP * 2];
  const cards = [], edges = [];
  let top = 43;
  for (const category of categories) {
    const categoryCard = { kind: "category", category, x: columns[0], y: top, width: categoryWidth, height: 65 };
    cards.push(categoryCard);
    let row = top;
    for (const project of category.projects) {
      const groups = groupsFor(project.agents);
      const projectCard = { kind: "project", node: project, groups, x: columns[1], y: row, width: cardWidth, height: heightOf(groups) };
      cards.push(projectCard);
      edges.push([categoryCard, projectCard]);
      let worktreeY = row;
      for (const worktree of project.children) {
        const worktreeGroups = groupsFor(worktree.agents);
        const worktreeCard = { kind: "worktree", node: worktree, groups: worktreeGroups, x: columns[2], y: worktreeY, width: cardWidth, height: heightOf(worktreeGroups) };
        cards.push(worktreeCard);
        edges.push([projectCard, worktreeCard]);
        worktreeY += worktreeCard.height + ROW_GAP;
      }
      row = Math.max(row + projectCard.height + ROW_GAP, worktreeY);
    }
    top = Math.max(top + categoryCard.height, row - ROW_GAP) + SECTION_GAP;
  }
  const occupied = cards.some(card => card.kind === "worktree") ? columns : columns.slice(0, 2);
  return { columns: occupied, cards, edges, width: occupied.at(-1) + cardWidth + PAD, height: top };
}

function connectors(edges, color, scale) {
  if (!edges.length) return [];
  const outgoing = new Map();
  for (const [from, to] of edges) {
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(to);
  }
  let path = PathBuilder.stroke(Math.max(0.8, 1.5 * scale));
  for (const [from, targets] of outgoing) {
    const x = (from.x + from.width) * scale, y = (from.y + 27) * scale;
    const trunk = x + (targets[0].x * scale - x) / 2;
    const ends = targets.map(to => (to.y + 27) * scale);
    path = path.move_to(x, y).line_to(trunk, y)
      .move_to(trunk, Math.min(y, ...ends)).line_to(trunk, Math.max(y, ...ends));
    for (const to of targets) path = path.move_to(trunk, (to.y + 27) * scale).line_to(to.x * scale, (to.y + 27) * scale);
  }
  return [window.paint_path(path.build(), color).absolute().left(0).top(0).size_full()];
}

function agentItem(agent, tone, t, px) {
  const name = shortTitle(agent);
  const program = agent.program;
  const icon = program?.icon
    ? (program.tint ? svg(program.icon).text_color(t.muted) : image(program.icon)).size(px(13)).flex_none()
    : div().size(px(7)).rounded(px(4)).bg(tone).flex_none();
  return h_flex().id(`map-agent-${agent.address}`).h(px(agentRow)).px(px(5)).gap(px(7)).items_center()
    .rounded(px(5)).cursor_pointer().hover(style => style.bg(t.hover)).tooltip(`${name} · 터미널 열기`)
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .on_click(() => run("agent.focus", { terminal: agent.address }))
    .child(icon)
    .child(div().flex_1().min_w(0).truncate().text_size(px(12)).text_color(t.foreground).child(name));
}

function graphCard(card, t, scale) {
  const px = size => size * scale;
  const base = v_flex().absolute().left(px(card.x)).top(px(card.y)).w(px(card.width)).h(px(card.height))
    .rounded(px(10)).border_1().border_color(t.border).bg(t.background);
  if (card.kind === "category") {
    const { category } = card;
    return base.id(`map-category-${category.id}`).px(px(12)).gap(px(5)).justify_center().bg(t.raised)
      .child(div().text_size(px(15)).font_semibold().text_color(t.foreground).child(category.name))
      .child(div().text_size(px(11)).text_color(t.muted).child(`프로젝트 ${category.projects.length}개`));
  }
  const { node, groups } = card;
  const { space } = node;
  const children = node.children.length;
  const meta = [node.branch, space.machine, children ? `워크트리 ${children}개` : null].filter(Boolean).join(" · ");
  return base.id(`map-space-${space.id}`).px(px(10))
    .when(space.active, el => el.border_color(t.accent))
    .child(v_flex().id(`map-open-space-${space.id}`).h(px(heading)).flex_none().px(px(5)).gap(px(5)).justify_center()
      .rounded(px(6)).cursor_pointer().hover(style => style.bg(t.hover)).tooltip(space.name)
      .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
      .on_click(() => run("space.select", { id: space.id }))
      .child(h_flex().gap(px(7)).items_center()
        .child(svg(`${ASSETS}/${card.kind === "worktree" ? "git-branch" : "layers"}.svg`).size(px(14)).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().text_size(px(14)).font_semibold().text_color(t.foreground).child(space.name))
        .when(space.active, el => el.child(div().text_size(px(10)).text_color(t.accent).child("현재"))))
      .when(Boolean(meta), el => el.child(div().truncate().text_size(px(11)).text_color(t.muted).child(meta))))
    .when(!groups.length, el => el.child(div().px(px(5)).text_size(px(11)).text_color(t.dim).child("에이전트 없음")))
    .children(groups.map(({ status, label, agents }) => v_flex().flex_none()
      .child(h_flex().h(px(statusRow)).items_center().gap(px(5)).px(px(5)).text_size(px(11))
        .child(div().text_color(t[status] ?? t.muted).font_medium().child(label))
        .child(div().text_color(t.dim).child(String(agents.length))))
      .children(agents.map(agent => agentItem(agent, t[status] ?? t.muted, t, px)))));
}

const MAX_SCALE = 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function fitView(plot, viewport) {
  const gutter = 10;
  const scale = Math.min(1, Math.max(1, viewport.width - gutter * 2) / plot.width,
    Math.max(1, viewport.height - gutter * 2) / plot.height);
  return {
    scale,
    x: (viewport.width - plot.width * scale) / 2,
    y: (viewport.height - plot.height * scale) / 2,
  };
}

function restrictPan(view, plot, viewport) {
  const overlap = 28;
  return {
    ...view,
    x: clamp(view.x, Math.min(0, overlap - plot.width * view.scale), Math.max(0, viewport.width - overlap)),
    y: clamp(view.y, Math.min(0, overlap - plot.height * view.scale), Math.max(0, viewport.height - overlap)),
  };
}

export default class SpaceMap extends View {
  init() {
    this.scope = "all";
    this.viewport = { width: 0, height: 0 };
    this.view = { scale: 1, x: 0, y: 0 };
    this.fitting = false;
    this.press = null;
  }

  zoomBy(factor, point, plot, current) {
    if (!this.viewport.width || !this.viewport.height) return;
    const origin = point ?? { x: this.viewport.width / 2, y: this.viewport.height / 2 };
    const minimum = Math.min(0.18, fitView(plot, this.viewport).scale);
    const scale = clamp(current.scale * factor, minimum, MAX_SCALE);
    const ratio = scale / current.scale;
    this.fitting = false;
    this.view = restrictPan({
      scale, x: origin.x - (origin.x - current.x) * ratio, y: origin.y - (origin.y - current.y) * ratio,
    }, plot, this.viewport);
  }

  panTo(view, plot) {
    this.fitting = false;
    this.view = restrictPan(view, plot, this.viewport);
  }

  render() {
    const t = theme();
    const appZoom = settings().zoom || 1;
    const model = buildMap(spaces(), agents(), shared("personal-company.space-map.graph") ?? {},
      shared("groups.assignments") ?? {}, this.scope);
    const categories = this.scope === "current" ? model.categories.filter(category => category.projects.length) : model.categories;
    const plot = geometry(categories, this.viewport.width);
    const canFit = this.viewport.width > 0 && this.viewport.height > 0;
    const view = this.fitting && canFit ? fitView(plot, this.viewport) : this.view;
    const viewportPoint = point => point && { x: point.x / appZoom, y: point.y / appZoom };
    const scale = view.scale;
    const currentView = () => this.fitting ? view : this.view;
    const isVisible = card => !canFit || (
      view.x + card.x * scale < this.viewport.width && view.x + (card.x + card.width) * scale > 0
      && view.y + card.y * scale < this.viewport.height && view.y + (card.y + card.height) * scale > 0);
    const scopeButton = (id, text) => div().id(`map-scope-${id}`).px(10).py(5).rounded(5).cursor_pointer()
      .text_size(12).text_color(id === this.scope ? t.foreground : t.muted)
      .when(id === this.scope, el => el.bg(t.selected)).hover(style => style.bg(t.hover))
      .on_click((_e, cx) => {
        if (this.scope === id) return;
        this.scope = id;
        this.fitting = true;
        cx.notify();
      }).child(text);
    const zoomButton = (id, icon, label, factor) => h_flex().id(id).size(26).flex_none().items_center().justify_center()
      .rounded(5).cursor_pointer().text_color(t.muted).tooltip(label).hover(style => style.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { this.zoomBy(factor, null, plot, currentView()); cx.notify(); })
      .child(svg(`${ASSETS}/${icon}.svg`).size(13));
    return v_flex().id("space-map").size_full().min_h(0).min_w(0).bg(t.canvas)
      .child(h_flex().h(53).flex_none().px(PAD).gap(12).items_center().border_b(1).border_color(t.border).bg(t.chrome)
        .child(div().text_size(16).font_semibold().text_color(t.foreground).child("Space 맵"))
        .child(h_flex().p(2).gap(2).rounded(7).border_1().border_color(t.border)
          .child(scopeButton("all", "전체")).child(scopeButton("current", "현재 Space")))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted)
          .child(this.scope === "current" ? model.active?.name ?? "" : `에이전트 ${model.agentCount}개`))
        .child(h_flex().p(2).gap(3).flex_none().rounded(7).items_center().border_1().border_color(t.border)
          .child(zoomButton("map-zoom-out", "minus", "축소", 0.8))
          .child(div().w(40).text_size(11).text_center().text_color(t.muted).child(`${Math.round(scale * 100)}%`))
          .child(zoomButton("map-zoom-in", "plus", "확대", 1.25)))
        .child(div().id("map-fit").px(8).py(5).flex_none().rounded(5).cursor_pointer().text_size(12)
          .text_color(t.foreground).when(this.fitting, el => el.bg(t.selected))
          .tooltip("맵 전체를 화면 안에 표시").hover(style => style.bg(t.hover))
          .on_click((_e, cx) => { this.fitting = true; cx.notify(); }).child("화면 맞춤")))
      .child(div().id("space-map-canvas").relative().flex_1().min_h(0).min_w(0).overflow_hidden()
        .when(Boolean(this.press), el => el.cursor_grabbing()).when(!this.press, el => el.cursor_grab())
        .on_size_change((size, cx) => {
          const width = size.width / appZoom, height = size.height / appZoom;
          if (width === this.viewport.width && height === this.viewport.height) return;
          this.viewport = { width, height };
          cx.notify();
        })
        .on_mouse_down("left", (e, cx) => { this.press = { start: viewportPoint(e.position), view }; cx.notify(); })
        .on_mouse_move((e, cx) => {
          if (!this.press) return;
          const point = viewportPoint(e.position), { start, view } = this.press;
          this.panTo({ ...view, x: view.x + point.x - start.x, y: view.y + point.y - start.y }, plot);
          cx.notify();
        })
        .on_mouse_up("left", (_e, cx) => { this.press = null; cx.notify(); })
        .on_hover((on, cx) => {
          if (!on && this.press) { this.press = null; cx.notify(); }
        })
        .on_scroll_wheel((e, cx) => {
          const delta = viewportPoint(e.delta);
          if (e.modifiers.platform || e.modifiers.control) {
            const factor = Math.exp(clamp(delta.y, -60, 60) * 0.006);
            this.zoomBy(factor, viewportPoint(e.local_position), plot, currentView());
          } else {
            const current = currentView();
            this.panTo({ ...current, x: current.x + delta.x, y: current.y + delta.y }, plot);
          }
          cx.notify();
        })
        .on_pinch((e, cx) => {
          if (!e.delta) return;
          this.zoomBy(Math.max(0.2, 1 + e.delta), viewportPoint(e.local_position), plot, currentView());
          cx.notify();
        })
        .child(div().absolute().left(view.x).top(view.y).w(plot.width * scale).h(plot.height * scale)
          .children(plot.columns.map((x, index) => div().absolute().left(x * scale).top(14 * scale)
            .text_size(11 * scale).text_color(t.muted).child(["구분", "프로젝트", "워크트리"][index])))
          .children(connectors(plot.edges, t.input ?? t.border, scale))
          .children(plot.cards.filter(isVisible).map(card => graphCard(card, t, scale)))));
  }
}
