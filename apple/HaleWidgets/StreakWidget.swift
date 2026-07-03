import WidgetKit
import SwiftUI

// The clean-time / streak widget. Views + entry live in HaleShared (StreakWidgetView,
// StreakEntry) so the app's debug gallery can render them too; this file is just the
// timeline provider + configuration.

struct StreakProvider: TimelineProvider {
    private func sample(_ now: Date) -> HaleSnapshot {
        var s = HaleSnapshot.placeholder
        s.quitStartMs = now.timeIntervalSince1970 * 1000 - 3 * HaleShared.msPerDay
        return s
    }
    private func current(_ now: Date) -> HaleSnapshot {
        guard var s = SharedStore.read() else { return sample(now) }
        if s.quitStartMs <= 0 { s.quitStartMs = now.timeIntervalSince1970 * 1000 }
        return s
    }

    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(date: Date(), snapshot: sample(Date()))
    }
    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        let now = Date()
        completion(StreakEntry(date: now, snapshot: context.isPreview ? sample(now) : current(now)))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let now = Date()
        let snap = current(now)
        let entry = StreakEntry(date: now, snapshot: snap)
        // Refresh at the next clean-day boundary so the day count rolls over even
        // without the app running; the app also reloads timelines on every change.
        let nextBoundaryMs = snap.dayAnchorMs(now: now.timeIntervalSince1970 * 1000) + HaleShared.msPerDay
        let next = Date(timeIntervalSince1970: nextBoundaryMs / 1000)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct StreakWidget: Widget {
    let kind = "HaleStreakWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakProvider()) { entry in
            StreakWidgetView(entry: entry)
        }
        .configurationDisplayName("Clean Time")
        .description("Your days clean, current streak, and money saved.")
        .supportedFamilies([.systemSmall, .systemMedium,
                            .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
