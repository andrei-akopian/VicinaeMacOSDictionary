import CoreServices
import Foundation

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: dictlook <term>\n", stderr)
    exit(64)
}

let term = CommandLine.arguments[1].trimmingCharacters(in: .whitespacesAndNewlines)
guard !term.isEmpty else {
    exit(64)
}

let range = CFRange(location: 0, length: (term as NSString).length)
guard let definition = DCSCopyTextDefinition(nil, term as CFString, range)?.takeRetainedValue() else {
    exit(1)
}

print(definition as String)
