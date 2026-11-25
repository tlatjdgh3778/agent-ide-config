import { test } from "node:test";
import assert from "node:assert/strict";
import { nestWorktrees, type Entry } from "./tree.ts";

const root = (id: string, project: string): Entry => ({ id, project, worktree: false });
const tree = (id: string, project: string): Entry => ({ id, project, worktree: true });
const shape = (list: Entry[]) =>
  nestWorktrees(list).map((row) => [row.entry.id, row.children.map((c) => c.id)]);

test("worktrees go under their project's checkout", () => {
  assert.deepEqual(
    shape([tree("c2c", "cdm"), root("legato", "cdm"), root("tools", "tools"), tree("pier", "cdm")]),
    [
      ["legato", ["c2c", "pier"]],
      ["tools", []],
    ],
  );
});

test("a worktree without its checkout in the list stays at the top", () => {
  assert.deepEqual(shape([root("ui", "ui"), tree("pm", "pm")]), [
    ["ui", []],
    ["pm", []],
  ]);
});

test("with two checkouts of one project, worktrees go under the first", () => {
  assert.deepEqual(shape([root("a", "p"), root("b", "p"), tree("w", "p")]), [
    ["a", ["w"]],
    ["b", []],
  ]);
});

test("a worktree never takes children", () => {
  assert.deepEqual(shape([tree("w1", "p"), tree("w2", "p")]), [
    ["w1", []],
    ["w2", []],
  ]);
});
