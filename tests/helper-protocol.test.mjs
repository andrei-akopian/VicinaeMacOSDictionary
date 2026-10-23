import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/helper-protocol.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const protocol = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);
const {
  DictionaryLookupError,
  NO_DICTIONARIES_MARKER,
  helperFailure,
  parseHelperPayload,
  validateEntries,
  validateSuggestions,
} = protocol;

test("timeout failures report a timeout without suggesting a rebuild", () => {
  const error = helperFailure({ killed: true, code: null, stderr: "" });
  assert.ok(error instanceof DictionaryLookupError);
  assert.match(error.message, /timed out/);
  assert.equal(error.rebuildHelper, false);
});

test("maxBuffer failures get a dedicated message", () => {
  const error = helperFailure(new Error("stdout maxBuffer length exceeded"));
  assert.match(error.message, /more data than expected/);
  assert.equal(error.rebuildHelper, false);
});

test("spawn failures ask for a helper rebuild", () => {
  for (const code of ["ENOENT", "EACCES", "ETXTBSY"]) {
    const error = helperFailure({ code, killed: false });
    assert.equal(error.rebuildHelper, true, `expected rebuild flag for ${code}`);
  }
});

test("non-zero exits surface the helper's stderr detail", () => {
  const error = helperFailure({ code: 70, killed: false, stderr: "Could not encode Dictionary results.\n" });
  assert.match(error.message, /Could not encode Dictionary results/);
  assert.equal(error.rebuildHelper, false);

  const withoutStderr = helperFailure({ code: 64, killed: false, stderr: "" });
  assert.match(withoutStderr.message, /code 64/);
});

test("unknown failures fall back to a generic message", () => {
  assert.match(helperFailure(undefined).message, /lookup failed/);
});

test("parseHelperPayload rejects malformed JSON", () => {
  assert.throws(() => parseHelperPayload("not json", validateEntries), DictionaryLookupError);
});

test("parseHelperPayload validates the payload shape", () => {
  const valid = [{ identifier: "a", dictionary: "d", definition: "t" }];
  assert.deepEqual(parseHelperPayload(JSON.stringify(valid), validateEntries), valid);
  assert.throws(() => parseHelperPayload(JSON.stringify({ nope: true }), validateEntries), DictionaryLookupError);
});

test("validateEntries drops malformed rows but keeps good ones", () => {
  const value = [
    { identifier: "a", dictionary: "d", definition: "t" },
    { identifier: "b", dictionary: "d" },
    null,
    "junk",
  ];
  assert.deepEqual(validateEntries(value), [{ identifier: "a", dictionary: "d", definition: "t" }]);
});

test("validateSuggestions drops empty and malformed rows", () => {
  const value = [
    { term: "hello", snippet: "A greeting" },
    { term: "", snippet: "ignored" },
    { term: "x" },
    42,
  ];
  assert.deepEqual(validateSuggestions(value), [{ term: "hello", snippet: "A greeting" }]);
});

test("the no-dictionaries marker is present for stderr detection", () => {
  assert.equal(typeof NO_DICTIONARIES_MARKER, "string");
  assert.ok(NO_DICTIONARIES_MARKER.length > 0);
});
