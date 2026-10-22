import { Action, ActionPanel, List } from "@vicinae/api";
import { useEffect, useState } from "react";
import { formatDefinition, lookupDefinitions, type DictionaryEntry } from "./dictionary";

export default function SearchDictionary() {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    let cancelled = false;

    setEntries([]);
    setResultsFor("");
    setError(null);

    if (!term) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timeout = setTimeout(() => {
      void lookupDefinitions(term)
        .then((resultEntries) => {
          if (cancelled) return;
          setEntries(resultEntries);
          setResultsFor(resultEntries.length ? term : "");
        })
        .catch((lookupError: unknown) => {
          if (cancelled) return;
          setError(lookupError instanceof Error ? lookupError.message : String(lookupError));
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
  let emptyTitle = "Look up a word";
  let emptyDescription = "Search words and phrases from dictionaries enabled in Dictionary.app.";

  if (error) {
    emptyTitle = "Dictionary helper unavailable";
    emptyDescription = error;
  } else if (isLoading) {
    emptyTitle = "Searching Dictionary…";
    emptyDescription = "Checking your enabled macOS dictionaries.";
  } else if (trimmedQuery) {
    emptyTitle = "No definition found";
    emptyDescription = `No entry for “${trimmedQuery}” in your enabled dictionaries. Check Dictionary.app settings.`;
  }

  return (
    <List
      isShowingDetail
      isLoading={isLoading}
      searchBarPlaceholder="Search macOS Dictionary..."
      searchText={query}
      onSearchTextChange={setQuery}
    >
      {entries.map((entry) => (
        <List.Item
          key={entry.identifier}
          title={entry.dictionary}
          subtitle={resultsFor}
          icon="📖"
          detail={<List.Item.Detail markdown={formatDefinition(entry.definition)} />}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Definition" content={entry.definition} />
              <Action.Open title="Open in Dictionary" target={`dict://${encodeURIComponent(resultsFor)}`} />
            </ActionPanel>
          }
        />
      ))}
      <List.EmptyView title={emptyTitle} description={emptyDescription} icon="📚" />
    </List>
  );
}
