import SwiftUI

// Debug-only per-screen harness. Launch with SIMCTL_CHILD_HALE_SCREEN=<name> to mount
// exactly one owned screen in isolation (pushed screens wrapped in a NavigationStack,
// with a bare AppState in the environment) so each can be screenshotted without
// navigating the live app. Data-backed screens render their loading/first-run state
// without a backend; Paywall / SOS / Disclaimers / Delete render fully.
// Names: paywall · sos · goals · insights · toolkit · leagues · squads · referral ·
//        delete · disclaimers
struct ScreenGalleryView: View {
    let which: String
    @State private var app = AppState()

    var body: some View {
        Group {
            switch which {
            case "paywall":     PaywallView()
            case "sos":         SOSView()
            case "goals":       nav { GoalsView() }
            case "insights":    nav { InsightsView() }
            case "toolkit":     nav { ToolkitView() }
            case "leagues":     nav { LeaguesView() }
            case "squads":      nav { SquadsHubView() }
            case "referral":    nav { ReferralView() }
            case "delete":      nav { DeleteAccountView() }
            case "disclaimers": nav { DisclaimersView() }
            default:            RootRouter()
            }
        }
        .environment(app)
    }

    private func nav<V: View>(@ViewBuilder _ content: () -> V) -> some View {
        NavigationStack { content() }
    }
}
