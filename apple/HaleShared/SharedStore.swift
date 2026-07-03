import Foundation

// App Group-backed read/write of the single HaleSnapshot. The app is the only
// writer; the widget + Live Activity are readers.
enum SharedStore {
    private static var defaults: UserDefaults? { UserDefaults(suiteName: HaleShared.appGroup) }

    static func write(_ snapshot: HaleSnapshot) {
        guard let d = defaults, let data = try? JSONEncoder().encode(snapshot) else { return }
        d.set(data, forKey: HaleShared.snapshotKey)
    }

    static func read() -> HaleSnapshot? {
        guard let d = defaults, let data = d.data(forKey: HaleShared.snapshotKey) else { return nil }
        return try? JSONDecoder().decode(HaleSnapshot.self, from: data)
    }

    static func clear() {
        defaults?.removeObject(forKey: HaleShared.snapshotKey)
    }
}
