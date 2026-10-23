import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lru.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { LruCache } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("evicts the least recently used entry beyond capacity", () => {
  const cache = new LruCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
});

test("reading an entry refreshes its recency", () => {
  const cache = new LruCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a");
  cache.set("c", 3);

  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), undefined);
});

test("re-setting an existing key does not evict anything", () => {
  const cache = new LruCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 10);
  cache.set("c", 3);

  assert.equal(cache.get("a"), 10);
  assert.equal(cache.get("b"), undefined);
});

test("rejects non-positive capacities", () => {
  assert.throws(() => new LruCache(0), RangeError);
  assert.throws(() => new LruCache(-1), RangeError);
  assert.throws(() => new LruCache(1.5), RangeError);
});
