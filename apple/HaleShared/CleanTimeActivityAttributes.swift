import Foundation
#if canImport(ActivityKit)
import ActivityKit

// The Live Activity for the running clean-time counter (Lock Screen + Dynamic
// Island). Shared so the app can start/update it and the widget extension can
// render it. The elapsed time ticks entirely client-side via Text(timerInterval:)
// off `quitStartMs`, so ticking needs no push updates — the ContentState only
// carries the values that actually change (streak, money, next milestone).
struct CleanTimeAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var currentStreak: Int
        var moneySaved: Double
        var nextMilestoneLabel: String?
    }

    // Fixed for the life of the activity — the clean-time anchor.
    var quitStartMs: Double
}
#endif
