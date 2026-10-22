# macOS Dictionary for Vicinae

A small Vicinae extension that searches the dictionaries enabled in Apple's Dictionary app. Lookups are provided by macOS Dictionary Services, so definitions work offline and use the user's installed dictionaries.

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
- The helper uses the public `DCSCopyTextDefinition` API and does not parse dictionary bundles or use network services.

## License

MIT
