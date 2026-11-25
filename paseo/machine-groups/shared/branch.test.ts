import { test } from "node:test";
import assert from "node:assert/strict";
import { branchProblem } from "./branch.ts";

test("ordinary branch names pass, trimmed", () => {
  for (const name of ["fix/clq-61-event-empty-content", "feature/f-014", "  develop-2  ", "v1.2"])
    assert.equal(branchProblem(name), null, name);
});

test("names git refuses are explained", () => {
  for (const name of [
    "",
    "   ",
    "two words",
    "a:b",
    "what?",
    "-flag",
    "a..b",
    "a//b",
    "/lead",
    "trail/",
    "end.",
    "x/.hidden",
    "topic.lock",
    "a@{1}",
    "@",
  ])
    assert.notEqual(branchProblem(name), null, JSON.stringify(name));
});
