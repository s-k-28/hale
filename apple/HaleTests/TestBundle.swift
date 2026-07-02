import Foundation

// Locates a bundled fixture in the test bundle, tolerant of how the resource
// folder is flattened by the build.
enum TestBundle {
    private final class Token {}
    static func url(_ name: String, _ ext: String) -> URL? {
        let bundle = Bundle(for: Token.self)
        if let u = bundle.url(forResource: name, withExtension: ext) { return u }
        if let u = bundle.url(forResource: name, withExtension: ext, subdirectory: "Fixtures") { return u }
        if let root = bundle.resourceURL,
           let en = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) {
            for case let f as URL in en where f.lastPathComponent == "\(name).\(ext)" { return f }
        }
        return nil
    }
}
