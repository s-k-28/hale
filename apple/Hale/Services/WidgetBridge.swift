import Foundation
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

// The app is the only writer of the shared snapshot. Whenever the live todayState
// changes we (1) project it into the App Group for the widget, (2) reload widget
// timelines, and (3) keep the clean-time Live Activity in sync. Extensions never
// touch the backend — they render entirely off the snapshot + the fixed quitStart.
@MainActor
enum WidgetBridge {
    static func publish(_ today: TodayState) {
        let snap = HaleSnapshot(
            quitStartMs: today.quitStart,
            currentStreak: today.currentStreak,
            longestStreak: today.longestStreak,
            moneySaved: today.currentMoneySaved,
            nextMilestoneLabel: today.nextMilestone?.label,
            nextMilestoneHours: today.nextMilestone?.hours,
            hasBuddy: false,
            updatedAtMs: Date().timeIntervalSince1970 * 1000)
        SharedStore.write(snap)
        WidgetCenter.shared.reloadAllTimelines()
        LiveActivityController.shared.sync(snap)
    }

    // Sign-out / delete: wipe the shared snapshot and tear down the Live Activity.
    static func clear() {
        SharedStore.clear()
        WidgetCenter.shared.reloadAllTimelines()
        LiveActivityController.shared.stopAll()
    }
}

// Owns the single clean-time Live Activity. `sync` starts one if none is running
// (this is the "start after onboarding" moment — todayState first resolves right
// after the quiz commit) and otherwise updates the running one's streak/money.
@MainActor
final class LiveActivityController {
    static let shared = LiveActivityController()

    func sync(_ snap: HaleSnapshot) {
        #if canImport(ActivityKit)
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let state = CleanTimeAttributes.ContentState(
            currentStreak: snap.currentStreak,
            moneySaved: snap.moneySaved,
            nextMilestoneLabel: snap.nextMilestoneLabel)
        let content = ActivityContent(state: state, staleDate: nil)

        if let active = Activity<CleanTimeAttributes>.activities.first {
            Task { await active.update(content) }
        } else {
            let attrs = CleanTimeAttributes(quitStartMs: snap.quitStartMs)
            // Foreground request; throws if the user disabled Live Activities or the
            // system limit is hit — non-fatal, the widget still covers the surface.
            _ = try? Activity.request(attributes: attrs, content: content, pushType: nil)
        }
        #endif
    }

    func stopAll() {
        #if canImport(ActivityKit)
        for activity in Activity<CleanTimeAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
        #endif
    }
}
