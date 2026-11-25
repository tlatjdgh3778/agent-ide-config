const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function loadBranch() {
  const source = readFileSync(path.join(__dirname, "..", "shared", "branch.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports });
  return exports;
}

const { branchProblem } = loadBranch();

test("ordinary branch names pass, trimmed", () => {
  for (const name of ["fix/clq-61-event-empty-content", "feature/f-014", "  develop-2  ", "v1.2"])
    assert.equal(branchProblem(name), null, name);
});

test("names git refuses are explained", () => {
  for (const name of ["", "   ", "two words", "a:b", "what?", "-flag", "a..b", "a//b", "/lead", "trail/", "end.", "x/.hidden", "topic.lock", "a@{1}", "@"])
    assert.notEqual(branchProblem(name), null, JSON.stringify(name));
});
