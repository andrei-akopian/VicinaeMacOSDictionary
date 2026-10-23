import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/markdown.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { escapeMarkdown, formatDefinition } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("escapeMarkdown escapes characters that carry markdown meaning", () => {
  assert.equal(escapeMarkdown("Plain word"), "Plain word");
  assert.equal(escapeMarkdown("a_b *c* [x](y) #1 `code`"), "a\\_b \\*c\\* \\[x\\]\\(y\\) \\#1 \\`code\\`");
  assert.equal(escapeMarkdown("pipe | and hyphen -"), "pipe \\| and hyphen \\-");
  // Individual ASCII letters and digits must never be swallowed.
  assert.equal(escapeMarkdown("abcXYZ019"), "abcXYZ019");
});

test("formatDefinition splits headword, body, and examples", () => {
  const formatted = formatDefinition(
    'hello |  used as a greeting ▸ "hello, what do you want?" ▸ say hello',
    3,
  );
  const lines = formatted.split("\n");
  assert.equal(lines[0], "### hello");
  assert.ok(lines.includes('used as a greeting'), "expected the unescaped body");
  assert.ok(lines.some((line) => line === '- "hello, what do you want?"'));
  assert.ok(lines.some((line) => line === "- say hello"));
});

test("formatDefinition falls back to a Definition heading without a divider", () => {
  const formatted = formatDefinition("just some text", 1);
  assert.ok(formatted.startsWith("# Definition\n"));
});

test("formatDefinition clamps heading levels to the 1-6 range", () => {
  assert.ok(formatDefinition("x | y", 99).startsWith("###### x"));
  assert.ok(formatDefinition("x | y", 0).startsWith("# x"));
});

test("formatDefinition escapes markdown in headwords, bodies, and examples", () => {
  const formatted = formatDefinition("a_b | body with *star* ▸ e!xample", 1);
  assert.ok(formatted.includes("# a\\_b"));
  assert.ok(formatted.includes("body with \\*star\\*"));
  assert.ok(formatted.includes("- e\\!xample"));
});
