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

const definitionCache = new Map<string, DictionaryEntry[]>();
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

export async function lookupDefinitions(term: string): Promise<DictionaryEntry[]> {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return [];

  const cacheKey = normalizedTerm.toLowerCase();
  if (definitionCache.has(cacheKey)) return definitionCache.get(cacheKey) ?? [];

  const helperPath = await getHelperPath();
  try {
    const { stdout } = await execFileAsync(helperPath, [normalizedTerm], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const result = JSON.parse(stdout) as DictionaryEntry[];
    if (!Array.isArray(result)) throw new Error("Invalid Dictionary response.");
    definitionCache.set(cacheKey, result);
    return result;
  } catch {
    throw new Error("The macOS Dictionary lookup failed. Please try again.");
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}\[\]()#+.!|>~-])/g, "\\$1");
}

export function formatDefinition(text: string): string {
  const segments = text.replace(/\r\n?/g, "\n").trim().split(/\s*▸\s*/u);
  const overview = segments.shift()?.trim() ?? "";
  const divider = overview.indexOf("|");
  const heading = divider >= 0 ? overview.slice(0, divider).trim() : "Definition";
  const body = divider >= 0 ? overview.slice(divider + 1).trim() : overview;
  const examples = segments.map((segment) => segment.trim()).filter(Boolean);

  return [
    `# ${escapeMarkdown(heading)}`,
    body ? escapeMarkdown(body) : "",
    examples.length ? examples.map((example) => `- ${escapeMarkdown(example)}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
