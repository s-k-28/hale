import SwiftUI

// Insights — craving trend + patterns + recovery. Data fetched for everyone,
// gated behind LockedFeature for free users (usePremium).
struct InsightsView: View {
    @Environment(AppState.self) private var app
    @State private var trend = LiveQuery<[CravingTrendPoint]>(Fn.cravingTrend)
    @State private var patterns = LiveQuery<CravingPatterns>(Fn.cravingPatterns)
    @State private var recovery = LiveQuery<RecoverySummary>(Fn.recoverySummary)
    @State private var showPaywall = false

    private var premium: Bool { app.today?.hasHALEPlus ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Txt.Eyebrow("Your insights", color: Tok.accent)
                Txt.H1("Insights")
                LockedFeature(feature: "insights", variant: .inline,
                              title: "Unlock with HALE+", subtitle: "See your craving patterns and recovery trend.",
                              locked: !premium, onTap: { showPaywall = true }) {
                    VStack(alignment: .leading, spacing: 18) {
                        if let r = recovery.value {
                            Card(pad: true) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Txt.Eyebrow("Recovery")
                                    Txt.Display("\(r.reached)/\(r.total)", size: 40, color: Tok.accent)
                                    if let n = r.nextLabel { Txt.Body("Next: \(n)") }
                                }
                            }
                        }
                        Card(pad: true) {
                            VStack(alignment: .leading, spacing: 10) {
                                Txt.Eyebrow("Cravings — last 30 days")
                                barChart(trend.value ?? [])
                            }
                        }
                        if let p = patterns.value {
                            Card(pad: true) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Txt.Eyebrow("Patterns")
                                    Txt.Body(p.peakHour != nil ? "Peak craving hour: \(p.peakHour!):00" : "Not enough data yet.", color: Tok.fg)
                                    if let t = p.topTrigger { Txt.Body("Top trigger: \(t)", color: Tok.fg) }
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(Tok.bg.ignoresSafeArea())
        .navigationTitle("Insights").navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showPaywall) { PaywallView(from: "insights") }
    }

    private func barChart(_ pts: [CravingTrendPoint]) -> some View {
        let maxC = max(1, pts.map(\.count).max() ?? 1)
        return HStack(alignment: .bottom, spacing: 2) {
            ForEach(Array(pts.enumerated()), id: \.offset) { _, p in
                Capsule().fill(Tok.accent)
                    .frame(maxWidth: .infinity)
                    .frame(height: max(2, CGFloat(p.count) / CGFloat(maxC) * 80))
            }
        }
        .frame(height: 80)
    }
}
