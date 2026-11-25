const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = readFileSync(path.join(__dirname, "..", "client", "lucide-names.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const icons = {};
vm.runInNewContext(outputText, { exports: icons });
// Arrays from the sandbox come from another realm; copy them before deepEqual.
const search = (...args) => [...icons.searchIcons(...args)];

test("the name list holds every Lucide icon once", () => {
  assert.equal(icons.LUCIDE_NAMES.length, 1858);
  assert.equal(new Set(icons.LUCIDE_NAMES).size, icons.LUCIDE_NAMES.length);
  assert.ok(icons.LUCIDE_NAMES.every((name) => /^[A-Z][A-Za-z0-9]*$/.test(name)));
});

test("search ignores case, spaces and dashes, and puts prefix matches first", () => {
  const names = ["CloudRain", "Rainbow", "Umbrella", "Rain"];
  assert.deepEqual(search("rain", 10, names), ["Rainbow", "Rain", "CloudRain"]);
  assert.deepEqual(search("cloud-r", 10, names), ["CloudRain"]);
  assert.deepEqual(search("Cloud R", 10, names), ["CloudRain"]);
});

test("search returns nothing for an empty query and stops at the limit", () => {
  assert.deepEqual(search("  ", 10), []);
  assert.equal(icons.searchIcons("a", 5).length, 5);
  assert.deepEqual(search("squirrel", 10), ["Squirrel"]);
});
