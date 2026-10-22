# macOS Dictionary for Vicinae

A small Vicinae extension that searches the dictionaries enabled in Apple's Dictionary app. Local dictionaries work offline; Wikipedia entries may require a network connection.

While typing, the command shows system spell-check completions that are verified against active Dictionary.app sources, with a short definition preview. Selecting a word opens all matching dictionary definitions together. The initial view includes the 20 most recently selected words and their previews.

## Requirements

- macOS
- Vicinae
- Node.js 20 or newer and npm
- Xcode Command Line Tools (`xcode-select --install`), needed to compile the Swift lookup helper on its first search

## Install and develop

```sh
npm install
npm run dev
```

With Vicinae running, the extension will appear in root search as **Search Dictionary**. Type a word or phrase to look it up. The first lookup compiles `assets/dictlook.swift` into Vicinae's writable extension support directory; later searches reuse that binary. Definitions are queried from the dictionaries currently enabled in Dictionary.app.

To build a release extension, run `npm run build` from an environment where Vicinae's `vici` CLI is available.

## Notes

- This extension is macOS-only.
- Enable or disable lookup sources in Dictionary.app → Settings.
- **Open in Dictionary** hands the entry off to the system `dict://` URL handler.
- Results are queried separately from each active Dictionary.app source, so the same word can appear once per matching dictionary.
- macOS does not expose a public API for enumerating per-dictionary results. The helper uses undocumented Dictionary Services symbols and the `DCSActiveDictionaries` preference to enumerate sources; Apple could change these between macOS releases.
- The extension does not parse or bundle dictionary data.

## License

MIT
