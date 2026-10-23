export interface RecentTerm {
  term: string;
  snippet: string;
}

export interface StringStorage {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<void>;
}

const RECENT_TERMS_KEY = "dictionary-recent-terms";
const MAX_RECENT_TERMS = 20;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRecentTerm(value: unknown): value is { term: string; snippet: unknown } {
  return (
    isPlainObject(value) &&
    typeof value.term === "string" &&
    value.term.trim().length > 0
  );
}

export async function loadRecentTerms(storage: StringStorage): Promise<RecentTerm[]> {
  const serialized = await storage.getItem(RECENT_TERMS_KEY);
  if (!serialized) return [];

  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    const result: RecentTerm[] = [];
    for (const item of value) {
      if (!isRecentTerm(item)) continue;
      const key = item.term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // Repair entries whose snippet field was lost or corrupted.
      result.push({
        term: item.term,
        snippet: typeof item.snippet === "string" ? item.snippet : "",
      });
      if (result.length >= MAX_RECENT_TERMS) break;
    }
    return result;
  } catch {
    return [];
  }
}

let writeChain: Promise<unknown> = Promise.resolve();

/**
 * Serializes read-modify-write cycles so concurrent calls cannot lose
 * each other's updates when several words are opened in quick succession.
 */
export function rememberRecentTerm(
  term: string,
  snippet: string,
  storage: StringStorage,
): Promise<RecentTerm[]> {
  const write = writeChain
    .catch(() => undefined)
    .then(() => performRememberRecentTerm(term, snippet, storage));
  writeChain = write.catch(() => undefined);
  return write;
}

async function performRememberRecentTerm(
  term: string,
  snippet: string,
  storage: StringStorage,
): Promise<RecentTerm[]> {
  const normalizedTerm = term.trim();
  const recent = await loadRecentTerms(storage);
  if (!normalizedTerm) return recent;

  const previous = recent.find((item) => item.term.toLowerCase() === normalizedTerm.toLowerCase());
  const updated: RecentTerm[] = [
    { term: normalizedTerm, snippet: snippet.trim() || previous?.snippet || "" },
    ...recent.filter((item) => item.term.toLowerCase() !== normalizedTerm.toLowerCase()),
  ].slice(0, MAX_RECENT_TERMS);

  await storage.setItem(RECENT_TERMS_KEY, JSON.stringify(updated));
  return updated;
}
