import CoreServices
import Foundation

@_silgen_name("DCSDictionaryCreateWithIdentifier")
private func createDictionaryWithIdentifier(_ identifier: CFString) -> Unmanaged<CFTypeRef>?

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

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: dictlook <term>\n", stderr)
    exit(64)
}

let term = CommandLine.arguments[1].trimmingCharacters(in: .whitespacesAndNewlines)
guard !term.isEmpty else {
    exit(64)
}

let range = CFRange(location: 0, length: (term as NSString).length)
let activeIdentifiers = UserDefaults(suiteName: "com.apple.DictionaryServices")?
    .array(forKey: "DCSActiveDictionaries") as? [String] ?? []
var entries: [DictionaryEntry] = []

for activeIdentifier in activeIdentifiers {
    let identifier: String
    if activeIdentifier.hasPrefix("/"),
       let bundleIdentifier = Bundle(url: URL(fileURLWithPath: activeIdentifier))?.bundleIdentifier {
        identifier = bundleIdentifier
    } else {
        identifier = activeIdentifier
    }

    guard let dictionary = createDictionaryWithIdentifier(identifier as CFString)?.takeRetainedValue(),
          let definition = copyTextDefinition(dictionary, term as CFString, range)?.takeRetainedValue() else {
        continue
    }

    let name = getDictionaryName(dictionary)?.takeUnretainedValue() as String? ?? identifier
    entries.append(
        DictionaryEntry(
            identifier: identifier,
            dictionary: name,
            definition: definition as String
        )
    )
}

do {
    let output = try JSONEncoder().encode(entries)
    FileHandle.standardOutput.write(output)
    FileHandle.standardOutput.write(Data([0x0A]))
} catch {
    fputs("Could not encode Dictionary results.\n", stderr)
    exit(70)
}
