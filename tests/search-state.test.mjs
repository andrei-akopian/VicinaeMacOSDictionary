import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/search-state.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { suggestionsForQueryChange } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("keeps old suggestions while searching and clears them when returning to recents", () => {
  const visible = [
    { term: "hello", snippet: "A greeting" },
    { term: "help", snippet: "To assist" },
  ];

  assert.deepEqual(suggestionsForQueryChange(visible, "help"), visible);
  assert.deepEqual(suggestionsForQueryChange(visible, "  "), []);
});
