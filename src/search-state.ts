export function suggestionsForQueryChange<T>(suggestions: T[], query: string): T[] {
  return query.trim() ? suggestions : [];
}
