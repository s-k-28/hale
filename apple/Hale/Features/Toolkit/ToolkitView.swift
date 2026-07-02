import SwiftUI

// Advanced craving toolkit — urge-surfing guide. Premium-gated.
struct ToolkitView: View {
    @Environment(AppState.self) private var app
    @State private var step = 0
    @State private var showPaywall = false
    private let steps = [
        ("Notice", "Where do you feel the craving in your body? Name it without fighting it."),
        ("Don't fight it", "You don't have to push it away. Just watch it, like a wave forming."),
        ("Breathe into the peak", "It's cresting now. Slow breath in… and out. Stay with it."),
        ("Ride it down", "Feel it fading. You didn't act on it — and it passed anyway."),
    ]
    private var premium: Bool { app.today?.hasHALEPlus ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Txt.Eyebrow("Advanced toolkit", color: Tok.accent)
                Txt.H1("Urge surfing")
                LockedFeature(feature: "toolkit", variant: .inline,
                              title: "Unlock with HALE+", subtitle: "Urge-surfing, trigger patterns, and your craving map.",
                              locked: !premium, onTap: { showPaywall = true }) {
                    Card(pad: true) {
                        VStack(alignment: .leading, spacing: 12) {
                            Txt.Eyebrow("Step \(step + 1) of \(steps.count)", color: Tok.accent)
                            Txt.H3(steps[step].0)
                            Txt.Body(steps[step].1)
                            HButton(label: step < steps.count - 1 ? "Next" : "Done", variant: .primary, sm: true) {
                                if step < steps.count - 1 { step += 1; Haptics.select() }
                                else { step = 0; AnalyticsService.track(.cravingSurvived, ["resolvedBy": "urge_surf"]); Haptics.success() }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(Tok.bg.ignoresSafeArea())
        .navigationTitle("Toolkit").navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showPaywall) { PaywallView(from: "toolkit") }
    }
}
