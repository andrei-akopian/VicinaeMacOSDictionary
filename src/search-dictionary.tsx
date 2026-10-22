import { Action, ActionPanel, Detail, List, LocalStorage } from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  formatDefinition,
  lookupDefinitions,
  lookupSuggestions,
  type DictionaryEntry,
  type DictionarySuggestion,
} from "./dictionary";
import { loadRecentTerms, rememberRecentTerm, type RecentTerm } from "./recent-terms";
import { suggestionsForQueryChange } from "./search-state";

interface DictionaryDetailProps {
  term: string;
  snippet: string;
  onRecentTermsChange: (terms: RecentTerm[]) => void;
}

function DictionaryDetail({ term, snippet, onRecentTermsChange }: DictionaryDetailProps) {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setEntries([]);
    setError(null);
    setIsLoading(true);

    void lookupDefinitions(term)
      .then((results) => {
        if (!cancelled) setEntries(results);
      })
      .catch((lookupError: unknown) => {
        if (!cancelled) setError(lookupError instanceof Error ? lookupError.message : String(lookupError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    void rememberRecentTerm(term, snippet, LocalStorage)
      .then((recentTerms) => {
        if (!cancelled) onRecentTermsChange(recentTerms);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [term, snippet, onRecentTermsChange]);

  const markdown = error
    ? `# ${term}\n\n${error}`
    : isLoading
      ? `# ${term}\n\nSearching your enabled dictionaries…`
      : entries.length
        ? `# ${term}\n\n${entries
            .map((entry) => `## ${entry.dictionary}\n\n${formatDefinition(entry.definition, 3)}`)
            .join("\n\n---\n\n")}`
        : `# ${term}\n\nNo definition found in your enabled dictionaries.`;
  const allDefinitions = entries
    .map((entry) => `${entry.dictionary}\n${entry.definition}`)
    .join("\n\n");

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.Open title="Open in Dictionary" target={`dict://${encodeURIComponent(term)}`} />
          {allDefinitions ? (
            <Action.CopyToClipboard title="Copy All Definitions" content={allDefinitions} />
          ) : null}
          <Action.CopyToClipboard title="Copy Word" content={term} />
        </ActionPanel>
      }
    />
  );
}

export default function SearchDictionary() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DictionarySuggestion[]>([]);
  const [recentTerms, setRecentTerms] = useState<RecentTerm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadRecentTerms(LocalStorage)
      .then((terms) => {
        if (!cancelled) setRecentTerms(terms);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoadingRecent(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const term = query.trim();
    let cancelled = false;
    setSuggestions((current) => suggestionsForQueryChange(current, term));
    setError(null);

    if (!term) {
      setIsLoading(false);
      void loadRecentTerms(LocalStorage)
        .then((terms) => {
          if (!cancelled) setRecentTerms(terms);
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    const timeout = setTimeout(() => {
      void lookupSuggestions(term)
        .then((results) => {
          if (!cancelled) setSuggestions(results);
        })
        .catch((lookupError: unknown) => {
          if (!cancelled) setError(lookupError instanceof Error ? lookupError.message : String(lookupError));
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const trimmedQuery = query.trim();
  const shownSuggestions =
    !isLoading && !error && trimmedQuery && suggestions.length === 0
      ? [{ term: trimmedQuery, snippet: "Look up this exact term in your enabled dictionaries." }]
      : suggestions;

  let emptyTitle = "Start with a word";
  let emptyDescription = "Search your enabled dictionaries, or choose a recent word.";
  if (error) {
    emptyTitle = "Dictionary search unavailable";
    emptyDescription = error;
  } else if (isLoading || isLoadingRecent) {
    emptyTitle = "Searching Dictionary…";
    emptyDescription = "Checking your enabled dictionaries.";
  } else if (!trimmedQuery && recentTerms.length === 0) {
    emptyTitle = "No recent words yet";
    emptyDescription = "Search for a word and press Enter to see its definitions.";
  }

  const renderTermItem = (item: RecentTerm | DictionarySuggestion) => (
    <List.Item
      key={item.term.toLowerCase()}
      title={item.term}
      subtitle={item.snippet}
      icon="📖"
      actions={
        <ActionPanel>
          <Action.Push
            title="Show Definitions"
            target={
              <DictionaryDetail
                term={item.term}
                snippet={item.snippet}
                onRecentTermsChange={setRecentTerms}
              />
            }
          />
          <Action.CopyToClipboard title="Copy Word" content={item.term} />
        </ActionPanel>
      }
    />
  );

  return (
    <List
      isLoading={isLoading || (!trimmedQuery && isLoadingRecent)}
      searchBarPlaceholder="Search word..."
      searchText={query}
      onSearchTextChange={setQuery}
    >
      {!trimmedQuery && recentTerms.length > 0 ? (
        <List.Section title="Recent Words">{recentTerms.map(renderTermItem)}</List.Section>
      ) : null}
      {trimmedQuery && shownSuggestions.length > 0 ? (
        <List.Section title="Suggestions">{shownSuggestions.map(renderTermItem)}</List.Section>
      ) : null}
      <List.EmptyView title={emptyTitle} description={emptyDescription} icon="📚" />
    </List>
  );
}
