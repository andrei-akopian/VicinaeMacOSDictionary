import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { environment } from "@vicinae/api";
import { LruCache } from "./lru";
import {
  DictionaryLookupError,
  NO_DICTIONARIES_MARKER,
  helperFailure,
  parseHelperPayload,
  validateEntries,
  validateSuggestions,
  type DictionaryEntry,
  type DictionarySuggestion,
} from "./helper-protocol";

export type { DictionaryEntry, DictionarySuggestion };

const execFileAsync = promisify(execFile);

const HELPER_TIMEOUT = 15_000;
const HELPER_MAX_BUFFER = 10 * 1024 * 1024;
const CACHE_LIMIT = 100;
const HELPER_BINARY_PATTERN = /^dictlook-[0-9a-f]{12}$/;

const definitionCache = new LruCache<DictionaryEntry[]>(CACHE_LIMIT);
const suggestionCache = new LruCache<DictionarySuggestion[]>(CACHE_LIMIT);
let helperBuild: Promise<string> | undefined;

async function compileHelper(): Promise<string> {
  if (process.platform !== "darwin") {
    throw new DictionaryLookupError(
      "macOS Dictionary lookup is only available on macOS.",
    );
  }

  const sourcePath = path.join(environment.assetsPath, "dictlook.swift");
  let source: Buffer;
  try {
    source = await readFile(sourcePath);
  } catch (error) {
    throw new DictionaryLookupError(
      `Could not read the Dictionary helper source at ${sourcePath}. Reinstall or rebuild the extension, then try again.`,
      { cause: error },
    );
  }

  const version = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const helperPath = path.join(environment.supportPath, `dictlook-${version}`);

  try {
    await access(helperPath);
    return helperPath;
  } catch {
    // Compile below when this version of the helper has not been built yet.
  }

  await mkdir(environment.supportPath, { recursive: true });
  const temporaryPath = `${helperPath}.${process.pid}.tmp`;

  try {
    await execFileAsync("swiftc", ["-O", sourcePath, "-o", temporaryPath], {
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    await rename(temporaryPath, helperPath);
    void removeStaleHelpers(helperPath);
    return helperPath;
  } catch {
    await unlink(temporaryPath).catch(() => undefined);
    throw new DictionaryLookupError(
      "Could not compile the Dictionary helper. Install Xcode Command Line Tools with `xcode-select --install`, then try again.",
    );
  }
}

/**
 * Deletes compiled helpers from earlier versions of the Swift source so the
 * support directory does not accumulate a binary per source change. Failures
 * are intentionally ignored: leftover binaries are harmless.
 */
async function removeStaleHelpers(currentHelperPath: string): Promise<void> {
  try {
    const entries = await readdir(environment.supportPath);
    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry !== path.basename(currentHelperPath) && HELPER_BINARY_PATTERN.test(entry),
        )
        .map((entry) => unlink(path.join(environment.supportPath, entry)).catch(() => undefined)),
    );
  } catch {
    // Cleanup is best-effort.
  }
}

function getHelperPath(): Promise<string> {
  if (!helperBuild) {
    helperBuild = compileHelper().catch((error: unknown) => {
      helperBuild = undefined;
      throw error;
    });
  }
  return helperBuild;
}

async function invokeHelper<T>(
  mode: "define" | "suggest",
  term: string,
  validate: (value: unknown) => T,
): Promise<T> {
  const helperPath = await getHelperPath();
  let stdout: string;
  let stderr: string;

  try {
    ({ stdout, stderr } = await execFileAsync(helperPath, [mode, term], {
      encoding: "utf8",
      timeout: HELPER_TIMEOUT,
      maxBuffer: HELPER_MAX_BUFFER,
    }));
  } catch (error) {
    throw helperFailure(error);
  }

  const result = parseHelperPayload(stdout, validate);

  if (Array.isArray(result) && result.length === 0 && stderr.includes(NO_DICTIONARIES_MARKER)) {
    throw new DictionaryLookupError(
      "No dictionaries are enabled. Turn on at least one source in Dictionary.app → Settings, then try again.",
    );
  }

  return result;
}

async function runHelper<T>(
  mode: "define" | "suggest",
  term: string,
  validate: (value: unknown) => T,
): Promise<T> {
  try {
    return await invokeHelper(mode, term, validate);
  } catch (error) {
    if (error instanceof DictionaryLookupError && error.rebuildHelper) {
      // The compiled binary vanished or cannot run; compile it again once.
      helperBuild = undefined;
      return invokeHelper(mode, term, validate);
    }
    throw error;
  }
}

export async function lookupDefinitions(term: string): Promise<DictionaryEntry[]> {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return [];

  const cacheKey = normalizedTerm.toLowerCase();
  const cached = definitionCache.get(cacheKey);
  if (cached) return cached;

  const result = await runHelper("define", normalizedTerm, validateEntries);
  definitionCache.set(cacheKey, result);
  return result;
}

export async function lookupSuggestions(term: string): Promise<DictionarySuggestion[]> {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return [];

  const cacheKey = normalizedTerm.toLowerCase();
  const cached = suggestionCache.get(cacheKey);
  if (cached) return cached;

  const result = await runHelper("suggest", normalizedTerm, validateSuggestions);
  suggestionCache.set(cacheKey, result);
  return result;
}
