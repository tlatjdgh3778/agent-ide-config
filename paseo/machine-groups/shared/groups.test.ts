import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addGroup,
  assign,
  deleteGroup,
  groupOf,
  GroupError,
  machineOf,
  nameProblem,
  renameGroup,
  type Machines,
} from "./groups.ts";

const WIN = "srv_win";
const WSL = "srv_wsl";

test("groups belong to one machine", () => {
  const all = addGroup({}, WIN, "Work", "g1");
  assert.deepEqual(machineOf(all, WIN).groups, [{ id: "g1", name: "Work" }]);
  assert.deepEqual(machineOf(all, WSL).groups, []);
  // The same name is fine on another machine.
  assert.doesNotThrow(() => addGroup(all, WSL, "work", "g2"));
});

test("names are trimmed and unique per machine, ignoring case", () => {
  let all = addGroup({}, WIN, "  Work  ", "g1");
  assert.equal(machineOf(all, WIN).groups[0].name, "Work");
  assert.throws(() => addGroup(all, WIN, "WORK", "g2"), GroupError);
  assert.throws(() => addGroup(all, WIN, "   ", "g2"), GroupError);
  all = addGroup(all, WIN, "Study", "g2");
  assert.throws(() => renameGroup(all, WIN, "g2", "work"), GroupError);
  // Renaming a group to its own name in another case is allowed.
  assert.equal(machineOf(renameGroup(all, WIN, "g1", "WORK"), WIN).groups[0].name, "WORK");
});

test("nameProblem explains the refusal", () => {
  const machine = machineOf(addGroup({}, WIN, "Work", "g1"), WIN);
  assert.equal(nameProblem(machine, "Other"), null);
  assert.match(nameProblem(machine, "work") ?? "", /같은 이름/);
  assert.match(nameProblem(machine, "") ?? "", /입력/);
});

test("assigning moves a workspace between groups and out of them", () => {
  let all: Machines = addGroup(addGroup({}, WIN, "A", "a"), WIN, "B", "b");
  all = assign(all, WIN, "w1", "a");
  assert.equal(groupOf(machineOf(all, WIN), "w1"), "a");
  all = assign(all, WIN, "w1", "b");
  assert.equal(groupOf(machineOf(all, WIN), "w1"), "b");
  all = assign(all, WIN, "w1", null);
  assert.equal(groupOf(machineOf(all, WIN), "w1"), null);
  assert.deepEqual(machineOf(all, WIN).assignments, {});
});

test("assigning to a missing group changes nothing", () => {
  const all = addGroup({}, WIN, "A", "a");
  assert.equal(assign(all, WIN, "w1", "nope"), all);
});

test("deleting a group lets its workspaces out and keeps the rest", () => {
  let all: Machines = addGroup(addGroup({}, WIN, "A", "a"), WIN, "B", "b");
  all = assign(assign(all, WIN, "w1", "a"), WIN, "w2", "b");
  all = deleteGroup(all, WIN, "a");
  const machine = machineOf(all, WIN);
  assert.deepEqual(machine.groups, [{ id: "b", name: "B" }]);
  assert.equal(groupOf(machine, "w1"), null);
  assert.equal(groupOf(machine, "w2"), "b");
});

test("assignments of workspaces not shown (archived) are kept", () => {
  let all: Machines = addGroup({}, WIN, "A", "a");
  all = assign(all, WIN, "archived", "a");
  all = addGroup(all, WIN, "B", "b");
  all = renameGroup(all, WIN, "a", "A2");
  assert.equal(groupOf(machineOf(all, WIN), "archived"), "a");
});

test("operations do not mutate their input", () => {
  const all: Machines = Object.freeze(addGroup({}, WIN, "A", "a"));
  assert.doesNotThrow(() => assign(deleteGroup(all, WIN, "a"), WIN, "w", null));
  assert.deepEqual(machineOf(all, WIN).groups, [{ id: "a", name: "A" }]);
});
