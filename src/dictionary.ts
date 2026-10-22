import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { environment } from "@vicinae/api";

const execFileAsync = promisify(execFile);
export interface DictionaryEntry {
  identifier: string;
  dictionary: string;
  definition: string;
}

export interface DictionarySuggestion {
  term: string;
  snippet: string;
}

const definitionCache = new Map<string, DictionaryEntry[]>();
const suggestionCache = new Map<string, DictionarySuggestion[]>();
let helperBuild: Promise<string> | undefined;

async function compileHelper(): Promise<string> {
  if (process.platform !== "darwin") {
    throw new Error("macOS Dictionary lookup is only available on macOS.");
  }

  const sourcePath = path.join(environment.assetsPath, "dictlook.swift");
  const source = await readFile(sourcePath);
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
    return helperPath;
  } catch {
    await unlink(temporaryPath).catch(() => undefined);
    throw new Error(
      "Could not compile the Dictionary helper. Install Xcode Command Line Tools with `xcode-select --install`, then try again.",
    );
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

async function runHelper<T>(mode: "define" | "suggest", term: string): Promise<T> {
  const helperPath = await getHelperPath();
  try {
    const { stdout } = await execFileAsync(helperPath, [mode, term], {
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error("The macOS Dictionary lookup failed. Please try again.");
  }
}

export async function lookupDefinitions(term: string): Promise<DictionaryEntry[]> {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return [];

  const cacheKey = normalizedTerm.toLowerCase();
  if (definitionCache.has(cacheKey)) return definitionCache.get(cacheKey) ?? [];

  const result = await runHelper<DictionaryEntry[]>("define", normalizedTerm);
  if (!Array.isArray(result)) throw new Error("The macOS Dictionary returned an invalid response.");
  definitionCache.set(cacheKey, result);
  return result;
}

export async function lookupSuggestions(term: string): Promise<DictionarySuggestion[]> {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return [];

  const cacheKey = normalizedTerm.toLowerCase();
  if (suggestionCache.has(cacheKey)) return suggestionCache.get(cacheKey) ?? [];

  const result = await runHelper<DictionarySuggestion[]>("suggest", normalizedTerm);
  if (!Array.isArray(result)) throw new Error("The macOS Dictionary returned an invalid response.");
  suggestionCache.set(cacheKey, result);
  return result;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}\[\]()#+.!|>~-])/g, "\\$1");
}

export function formatDefinition(text: string, headingLevel = 1): string {
  const segments = text.replace(/\r\n?/g, "\n").trim().split(/\s*▸\s*/u);
  const overview = segments.shift()?.trim() ?? "";
  const divider = overview.indexOf("|");
  const heading = divider >= 0 ? overview.slice(0, divider).trim() : "Definition";
  const body = divider >= 0 ? overview.slice(divider + 1).trim() : overview;
  const examples = segments.map((segment) => segment.trim()).filter(Boolean);

  return [
    `${"#".repeat(Math.min(6, Math.max(1, headingLevel)))} ${escapeMarkdown(heading)}`,
    body ? escapeMarkdown(body) : "",
    examples.length ? examples.map((example) => `- ${escapeMarkdown(example)}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
