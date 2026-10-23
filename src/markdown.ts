export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+.!|>~\-])/g, "\\$1");
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
