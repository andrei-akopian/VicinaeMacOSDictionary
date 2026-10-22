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

export async function loadRecentTerms(storage: StringStorage): Promise<RecentTerm[]> {
  const serialized = await storage.getItem(RECENT_TERMS_KEY);
  if (!serialized) return [];

  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is RecentTerm =>
          typeof item === "object" &&
          item !== null &&
          "term" in item &&
          typeof item.term === "string" &&
          "snippet" in item &&
          typeof item.snippet === "string",
      )
      .slice(0, MAX_RECENT_TERMS);
  } catch {
    return [];
  }
}

export async function rememberRecentTerm(
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
