import WidgetKit
import SwiftUI
#if canImport(ActivityKit)
import ActivityKit

// The clean-time Live Activity (Lock Screen banner + Dynamic Island). The lock-screen
// banner view (CleanTimeLockView) + time helpers live in HaleShared; this file wires
// them into the ActivityConfiguration and lays out the Dynamic Island.
struct CleanTimeLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CleanTimeAttributes.self) { context in
            CleanTimeLockView(quitStartMs: context.attributes.quitStartMs,
                              currentStreak: context.state.currentStreak,
                              moneySaved: context.state.moneySaved,
                              milestone: context.state.nextMilestoneLabel)
                .activityBackgroundTint(Brand.bg.opacity(0.92))
                .activitySystemActionForegroundColor(Brand.accent)
        } dynamicIsland: { context in
            let days = haleCleanDays(context.attributes.quitStartMs)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(days)d", systemImage: "leaf.fill")
                        .font(Brand.sora("Sora-SemiBold", 15)).foregroundStyle(Brand.accent)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Label("\(context.state.currentStreak)", systemImage: "flame.fill")
                        .font(Brand.sora("Sora-SemiBold", 15)).foregroundStyle(Brand.accent)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(days == 1 ? "day clean" : "days clean")
                        .font(Brand.sora("Sora-Medium", 12)).foregroundStyle(Brand.fg2)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        haleLiveTimer(context.attributes.quitStartMs, font: Brand.sora("Sora-Bold", 22))
                            .foregroundStyle(Brand.fg)
                        Spacer()
                        Text("\(haleMoney(context.state.moneySaved)) saved")
                            .font(Brand.sora("Sora-Medium", 12)).foregroundStyle(Brand.warm)
                    }
                    .padding(.top, 2)
                }
            } compactLeading: {
                Image(systemName: "leaf.fill").foregroundStyle(Brand.accent)
            } compactTrailing: {
                Text("\(days)d").font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(Brand.accent)
            } minimal: {
                Image(systemName: "leaf.fill").foregroundStyle(Brand.accent)
            }
            .keylineTint(Brand.accent)
        }
    }
}
#endif
