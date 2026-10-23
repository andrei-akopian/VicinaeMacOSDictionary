import AppKit
import CoreServices
import Foundation

@_silgen_name("DCSDictionaryCreateWithIdentifier")
private func createDictionaryWithIdentifier(_ identifier: CFString) -> Unmanaged<CFTypeRef>?

@_silgen_name("DCSDictionaryGetLanguages")
private func getDictionaryLanguages(_ dictionary: CFTypeRef) -> Unmanaged<CFArray>?

@_silgen_name("DCSDictionaryGetName")
private func getDictionaryName(_ dictionary: CFTypeRef) -> Unmanaged<CFString>?

@_silgen_name("DCSCopyTextDefinition")
private func copyTextDefinition(
    _ dictionary: CFTypeRef?,
    _ term: CFString,
    _ range: CFRange
) -> Unmanaged<CFString>?

struct DictionaryEntry: Encodable {
    let identifier: String
    let dictionary: String
    let definition: String
}

struct DictionarySuggestion: Encodable {
    let term: String
    let snippet: String
}

struct ActiveDictionary {
    let identifier: String
    let name: String
    let reference: CFTypeRef
}

func activeDictionaries() -> [ActiveDictionary] {
    let identifiers = UserDefaults(suiteName: "com.apple.DictionaryServices")?
        .array(forKey: "DCSActiveDictionaries") as? [String] ?? []

    var seenIdentifiers = Set<String>()
    return identifiers.compactMap { activeIdentifier in
        let identifier: String
        if activeIdentifier.hasPrefix("/"),
           let bundleIdentifier = Bundle(url: URL(fileURLWithPath: activeIdentifier))?.bundleIdentifier {
            identifier = bundleIdentifier
        } else {
            identifier = activeIdentifier
        }

        guard seenIdentifiers.insert(identifier).inserted else {
            return nil
        }
        guard let reference = createDictionaryWithIdentifier(identifier as CFString)?.takeRetainedValue() else {
            return nil
        }
        let name = getDictionaryName(reference)?.takeUnretainedValue() as String? ?? identifier
        return ActiveDictionary(identifier: identifier, name: name, reference: reference)
    }
}

func definition(for term: String, in dictionary: CFTypeRef?) -> String? {
    let range = CFRange(location: 0, length: (term as NSString).length)
    return copyTextDefinition(dictionary, term as CFString, range)?.takeRetainedValue() as String?
}

func dictionaryLanguageCodes(_ dictionaries: [ActiveDictionary]) -> [String] {
    let availableLanguages = Set(NSSpellChecker.shared.availableLanguages)
    var result: [String] = []

    for dictionary in dictionaries {
        let languages = getDictionaryLanguages(dictionary.reference)?.takeUnretainedValue() as NSArray? ?? []
        for value in languages {
            guard let info = value as? [String: String],
                  let rawCode = info["DCSDictionaryIndexLanguage"] else {
                continue
            }

            let normalizedCode = rawCode.replacingOccurrences(of: "_", with: "-")
            let candidates = [normalizedCode, String(normalizedCode.split(separator: "-").first ?? "")]
            guard let language = candidates.first(where: { availableLanguages.contains($0) }),
                  !result.contains(language) else {
                continue
            }
            result.append(language)
        }
    }

    return result
}

func makeSnippet(_ definition: String) -> String {
    let flattened = definition
        .replacingOccurrences(of: "\r", with: " ")
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: "▸", with: " • ")
        .split(whereSeparator: \.isWhitespace)
        .joined(separator: " ")
    let snippet = String(flattened.prefix(180))
    return flattened.count > 180 ? "\(snippet)…" : snippet
}

func suggestions(for query: String, dictionaries: [ActiveDictionary]) -> [DictionarySuggestion] {
    let spellChecker = NSSpellChecker.shared
    let languages = dictionaryLanguageCodes(dictionaries)
    var candidates = [query]
    var seen = Set([query.lowercased()])

    for language in languages {
        let completions = spellChecker.completions(
            forPartialWordRange: NSRange(location: 0, length: (query as NSString).length),
            in: query,
            language: language,
            inSpellDocumentWithTag: 0
        ) ?? []

        for candidate in completions.prefix(24) where seen.insert(candidate.lowercased()).inserted {
            candidates.append(candidate)
            if candidates.count >= 81 { break }
        }
        if candidates.count >= 81 { break }
    }

    var results: [DictionarySuggestion] = []
    for candidate in candidates {
        guard let text = definition(for: candidate, in: nil) else { continue }
        results.append(DictionarySuggestion(term: candidate, snippet: makeSnippet(text)))
        if results.count >= 40 { break }
    }
    return results
}

guard CommandLine.arguments.count == 3 else {
    fputs("Usage: dictlook <suggest|define> <term>\n", stderr)
    exit(64)
}

let mode = CommandLine.arguments[1]
let term = CommandLine.arguments[2].trimmingCharacters(in: .whitespacesAndNewlines)
guard !term.isEmpty else {
    exit(64)
}

let dictionaries = activeDictionaries()

if dictionaries.isEmpty {
    // Lets the extension distinguish "nothing found" from a configuration
    // problem without changing the JSON shape of successful responses.
    fputs("vicinae-dictionary: no-active-dictionaries\n", stderr)
}

switch mode {
case "define":
    let entries = dictionaries.compactMap { dictionary -> DictionaryEntry? in
        guard let text = definition(for: term, in: dictionary.reference) else { return nil }
        return DictionaryEntry(
            identifier: dictionary.identifier,
            dictionary: dictionary.name,
            definition: text
        )
    }
    emitJSON(entries)
case "suggest":
    emitJSON(suggestions(for: term, dictionaries: dictionaries))
default:
    fputs("Unknown mode: \(mode)\n", stderr)
    exit(64)
}

func emitJSON<T: Encodable>(_ value: T) {
    do {
        let output = try JSONEncoder().encode(value)
        FileHandle.standardOutput.write(output)
        FileHandle.standardOutput.write(Data([0x0A]))
    } catch {
        fputs("Could not encode Dictionary results.\n", stderr)
        exit(70)
    }
}
