import SwiftUI

// Debug-only per-screen harness. Launch with SIMCTL_CHILD_HALE_SCREEN=<name> to mount
// exactly one owned screen in isolation (pushed screens wrapped in a NavigationStack,
// with a bare AppState in the environment) so each can be screenshotted without
// navigating the live app. Data-backed screens render their loading/first-run state
// without a backend; Paywall / SOS / Disclaimers / Delete render fully.
// Names: paywall · sos · goals · insights · toolkit · leagues · squads · referral ·
//        delete · disclaimers · sage · you
struct ScreenGalleryView: View {
    let which: String
    @State private var app = AppState()

    var body: some View {
        Group {
            switch which {
            case "paywall":     PaywallView()
            case "sage":        CoachView()
            case "you":         YouView()
            case "sos":         SOSView()
            case "goals":       nav { GoalsView() }
            case "insights":    nav { InsightsView() }
            case "toolkit":     nav { ToolkitView() }
            case "leagues":     nav { LeaguesView() }
            case "squads":      nav { SquadsHubView() }
            case "referral":    nav { ReferralView() }
            case "delete":      nav { DeleteAccountView() }
            case "disclaimers": nav { DisclaimersView() }
            case "ring":        RingShowcase()          // Today hero ring + shimmer shader
            case "milestone":   MilestoneCelebration(day: 30) {}  // emerald aura shader
            default:            RootRouter()
            }
        }
        .environment(app)
        #if DEBUG
        // Data-backed screens (You) need a TodayState to render past their
        // loading gate; inject a representative fixture, no backend required.
        .onAppear {
            app.debugSetToday(TodayState(
                userId: "gallery", hardestHour: 21, quitStart: Date().timeIntervalSince1970 * 1000 - 30 * 86_400_000,
                currentMoneySaved: 187.50, lifetimeMoneySaved: 412.25, currentStreak: 30, longestStreak: 42,
                freezesRemaining: 2, lastCheckInLocalDate: nil,
                nextMilestone: .init(hours: 1_440, label: "Circulation fully restored"),
                premium: false, trialEndsAt: nil, trialActive: false, trialDaysRemaining: 0,
                hasHALEPlus: false, entitlementSource: "none",
                referralRewardActive: false, rewardDaysRemaining: 0, timezone: nil))
        }
        #endif
    }

    private func nav<V: View>(@ViewBuilder _ content: () -> V) -> some View {
        NavigationStack { content() }
    }
}

// Backend-free isolation of the Today hero ring so the shimmer shader (and
// breathing aura) can be screenshotted without a live session.
private struct RingShowcase: View {
    var body: some View {
        ZStack {
            HaleBackdrop(bloom: UnitPoint(x: 0.5, y: 0.34))
            Ring(progress: 0.62, size: 256, stroke: 9, breathes: true, shimmer: true) {
                VStack(spacing: 2) {
                    Txt.Eyebrow("Clean for")
                    Txt.Display("30", size: 68)
                    Txt.Eyebrow("Days", color: Tok.accent)
                    HStack(spacing: 12) {
                        unit(14, "H"); unit(52, "M"); unit(9, "S")
                    }
                    .padding(.top, 8)
                }
            }
        }
    }
    private func unit(_ v: Int, _ u: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(String(format: "%02d", v)).font(.sora(.bold, 15)).monospacedDigit().foregroundStyle(Tok.fg2)
            Text(u).font(.sora(.semibold, 10)).foregroundStyle(Tok.fg3)
        }
    }
}
