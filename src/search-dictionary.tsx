import { Action, ActionPanel, List } from "@vicinae/api";
import { useEffect, useState } from "react";
import { formatDefinition, lookupDefinition } from "./dictionary";

export default function SearchDictionary() {
  const [query, setQuery] = useState("");
  const [definition, setDefinition] = useState<string | null>(null);
  const [definitionFor, setDefinitionFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    let cancelled = false;

    setDefinition(null);
    setDefinitionFor("");
    setError(null);

    if (!term) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timeout = setTimeout(() => {
      void lookupDefinition(term)
        .then((result) => {
          if (cancelled) return;
          setDefinition(result);
          setDefinitionFor(result ? term : "");
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
    emptyDescription = `No entry for “${trimmedQuery}”. Check that dictionaries are enabled in Dictionary.app.`;
  }

  return (
    <List
      isShowingDetail
      isLoading={isLoading}
      searchBarPlaceholder="Search macOS Dictionary..."
      searchText={query}
      onSearchTextChange={setQuery}
    >
      {definition && definitionFor ? (
        <List.Item
          key={definitionFor}
          title={definitionFor}
          icon="📖"
          detail={<List.Item.Detail markdown={formatDefinition(definition)} />}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Definition" content={definition} />
              <Action.Open
                title="Open in Dictionary"
                target={`dict://${encodeURIComponent(definitionFor)}`}
              />
            </ActionPanel>
          }
        />
      ) : null}
      <List.EmptyView title={emptyTitle} description={emptyDescription} icon="📚" />
    </List>
  );
}
