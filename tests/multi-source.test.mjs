import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("returns matching entries from multiple active Dictionary sources", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "vicinae-dictionary-test-"));
  const helperPath = path.join(temporaryDirectory, "dictlook");

  try {
    await execFileAsync("swiftc", ["-O", "assets/dictlook.swift", "-o", helperPath], {
      encoding: "utf8",
      timeout: 60_000,
    });
    const { stdout } = await execFileAsync(helperPath, ["define", "apple"], {
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const entries = JSON.parse(stdout);
    const sourceNames = new Set(entries.map((entry) => entry.dictionary));

    assert.ok(sourceNames.size > 1, "expected results from more than one active dictionary");
    assert.ok(sourceNames.has("Apple Dictionary"));
    assert.ok(sourceNames.has("New Oxford American Dictionary"));
    assert.ok(sourceNames.has("Oxford German Dictionary"));
    assert.ok(sourceNames.has("Gran Diccionario Oxford - Español-Inglés • Inglés-Español"));
    assert.ok(sourceNames.has("牛津英汉汉英词典"));
    assert.ok(sourceNames.has("Wikipedia"));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("returns headword suggestions with readable snippets for a partial query", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "vicinae-dictionary-test-"));
  const helperPath = path.join(temporaryDirectory, "dictlook");

  try {
    await execFileAsync("swiftc", ["-O", "assets/dictlook.swift", "-o", helperPath], {
      encoding: "utf8",
      timeout: 60_000,
    });
    const { stdout } = await execFileAsync(helperPath, ["suggest", "hel"], {
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const suggestions = JSON.parse(stdout);
    const suggestedTerms = new Set(suggestions.map((suggestion) => suggestion.term.toLowerCase()));
    const hello = suggestions.find((suggestion) => suggestion.term.toLowerCase() === "hello");

    assert.ok(hello, "expected a headword suggestion for hello");
    assert.ok(hello.snippet.length > 20, "expected a useful definition snippet");
    assert.ok(suggestedTerms.has("helfen"), "expected a German headword suggestion");
    assert.ok(suggestedTerms.has("helado"), "expected a Spanish headword suggestion");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
