import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/recent-terms.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const recentTerms = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
const { loadRecentTerms, rememberRecentTerm } = recentTerms;

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: async (key) => values.get(key),
    setItem: async (key, value) => values.set(key, value),
  };
}

test("recent terms are newest-first, deduplicated, and limited to twenty", async () => {
  const storage = createMemoryStorage();

  for (let index = 1; index <= 21; index += 1) {
    await rememberRecentTerm(`word-${index}`, `Definition ${index}`, storage);
  }
  await rememberRecentTerm("WORD-5", "Updated definition", storage);

  const recent = await loadRecentTerms(storage);
  assert.equal(recent.length, 20);
  assert.equal(recent[0].term, "WORD-5");
  assert.equal(recent[0].snippet, "Updated definition");
  assert.equal(recent.some((item) => item.term === "word-1"), false);
  assert.equal(recent.filter((item) => item.term.toLowerCase() === "word-5").length, 1);
});
