import Foundation

// Shared identifiers + the small data projection the app hands to its extensions.
// This folder is compiled into BOTH the app and the widget targets (see project.yml),
// so the two sides always agree on the App Group id, the storage key, and the shape.
enum HaleShared {
    // Reuse the existing App Group the app + OneSignal NSE already declare — no new
    // provisioning needed. (A dedicated group.com.ravipulavarthy.hale.widget could be
    // swapped in here later; it only has to match the .entitlements on every target.)
    static let appGroup   = "group.com.ravipulavarthy.hale.onesignal"
    static let snapshotKey = "hale.snapshot.v1"

    static let msPerDay: Double = 86_400_000
}

// A tiny Codable projection of TodayState. The app writes it whenever the live
// todayState changes; the widget + Live Activity render entirely from this, with
// no auth or backend access of their own.
struct HaleSnapshot: Codable, Equatable {
    var quitStartMs: Double          // epoch ms — the clean-time anchor
    var currentStreak: Int           // consecutive check-in days
    var longestStreak: Int
    var moneySaved: Double            // current attempt, USD
    var nextMilestoneLabel: String?  // e.g. "Nicotine leaves your system"
    var nextMilestoneHours: Double?  // target hours since quitStart
    var hasBuddy: Bool
    var updatedAtMs: Double

    // Whole clean days elapsed at `now` (matches Today's hero count).
    func cleanDays(now: Double) -> Int {
        Int(max(0, now - quitStartMs) / HaleShared.msPerDay)
    }
    // Epoch ms at which the current clean day began — a stable anchor for a
    // within-day live H:M:S timer (00:00:00 → 23:59:59).
    func dayAnchorMs(now: Double) -> Double {
        quitStartMs + Double(cleanDays(now: now)) * HaleShared.msPerDay
    }

    // A safe placeholder for widget previews / the "no data yet" gallery state:
    // ~3 days clean.
    static var placeholder: HaleSnapshot {
        HaleSnapshot(
            quitStartMs: 0,   // resolved to now-3d by callers that have a clock
            currentStreak: 3, longestStreak: 7, moneySaved: 42.5,
            nextMilestoneLabel: "Sense of taste & smell sharpen",
            nextMilestoneHours: 96, hasBuddy: false, updatedAtMs: 0)
    }
}
