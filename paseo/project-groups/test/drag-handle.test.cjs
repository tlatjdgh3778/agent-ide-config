const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const React = require("react");
const { act, create } = require("react-test-renderer");
const ts = require("typescript");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, modules) {
  const source = readFileSync(path.join(__dirname, "..", "client", file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    setTimeout,
    require(name) {
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

const drag = load("drag.tsx", {
  react: React,
  "react-native": {
    Animated: { Value: class {} },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    Platform: { OS: "web" },
  },
  "./hit": {},
});

/** Renders a row's drag handle with a fake controller. Returns the handle and the press count. */
function mount({ mouse, dragging = () => false }) {
  const controller = { armTouch: () => !mouse, release: () => {}, isDragging: dragging };
  const pressed = { count: 0 };
  let handle;
  function Row() {
    handle = drag.useDragHandle({ kind: "group", id: "g1", label: "Group" }, () => {
      pressed.count += 1;
    });
    return null;
  }
  act(() => {
    create(React.createElement(drag.DragProvider, { value: controller }, React.createElement(Row)));
  });
  return { handle, pressed };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("a still mouse long press runs the row's press on release", async () => {
  const { handle, pressed } = mount({ mouse: true });
  handle.onLongPress();
  handle.onPressOut();
  await settle();
  assert.equal(pressed.count, 1);
});

test("a mouse long press that turns into a drag does not press the row", async () => {
  const { handle, pressed } = mount({ mouse: true, dragging: () => true });
  handle.onLongPress();
  handle.onPressOut();
  await settle();
  assert.equal(pressed.count, 0);
});

test("a touch long press only arms the drag", async () => {
  const { handle, pressed } = mount({ mouse: false });
  handle.onLongPress();
  handle.onPressOut();
  await settle();
  assert.equal(pressed.count, 0);
});

test("a short press leaves the press to the row", async () => {
  const { handle, pressed } = mount({ mouse: true });
  handle.onPressOut();
  await settle();
  assert.equal(pressed.count, 0);
});
