import SwiftUI

// Debug-only visual harness for the data-viz pass (Insights charts + Toolkit heatmap
// + share card) rendered with mock data, so the *populated* charts can be reviewed and
// screenshotted without a live backend. Reachable only via SIMCTL_CHILD_HALE_VIZ=1
// (see HaleApp). Reuses the real chart components from InsightsView/ToolkitView.
struct VizDemoView: View {
    var body: some View {
        ZStack {
            HaleBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Txt.Eyebrow("Data-viz demo", color: Tok.accent)
                    Txt.H1("Insights")

                    card("Recovery", trailing: "4 / 9") {
                        MilestoneTrack(reached: 4, total: 9)
                    }
                    card("Cravings", sub: "last 30 days", trailing: "78 total") {
                        FrequencyChart(points: Self.trend).frame(height: 128)
                    }
                    card("Your hardest hours", sub: "when cravings hit", trailing: "peak 8p") {
                        HourlyChart(buckets: Self.patterns.byHour, peakHour: Self.patterns.peakHour)
                            .frame(height: 132)
                    }
                    card("Craving intensity", sub: "average per day, 1–5", trailing: "avg 2.8") {
                        IntensityChart(points: Self.trend).frame(height: 96)
                    }

                    Txt.H2("Toolkit").padding(.top, 10)
                    card("Your 24-hour map", trailing: "peak 8p") {
                        CravingHeatmap(buckets: Self.patterns.byHour, peakHour: Self.patterns.peakHour)
                    }

                    Txt.H2("Share card").padding(.top, 10)
                    TransformationCard(days: 47, money: "$284", recoveryPct: 62)
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 24)
                }
                .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
            }
        }
    }

    // Card chrome mirroring InsightsView's cardHead.
    @ViewBuilder private func card<Content: View>(
        _ title: String, sub: String? = nil, trailing: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Txt.Eyebrow(title)
                        if let sub { Txt.Muted(sub) }
                    }
                    Spacer()
                    if let trailing {
                        Text(trailing).font(.sora(.semibold, 12)).foregroundStyle(Tok.accent)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(Tok.accentSoft, in: Capsule())
                    }
                }
                content()
            }
        }
    }

    // MARK: mock data (a believable "improving" 30-day recovery)
    static let trend: [DayPoint] = {
        let counts = [6,5,7,4,5,6,4,3,5,4,3,4,2,3,4,2,3,2,3,1,2,3,1,2,1,2,0,1,1,0]
        let cal = Calendar.current
        let today = Date()
        return (0..<30).compactMap { i in
            guard let d = cal.date(byAdding: .day, value: -(29 - i), to: today) else { return nil }
            let s = DayPoint.fmt.string(from: d)
            let c = counts[i]
            let intensity = c == 0 ? 0.0 : Double(2 + (i % 3))
            return DayPoint(CravingTrendPoint(date: s, count: c, avgIntensity: intensity))
        }
    }()

    static let patterns: CravingPatterns = {
        let dist = [0,0,1,0,0,1,2,3,2,1,2,3,4,3,2,3,4,5,6,7,8,6,4,2]
        let buckets = (0..<24).map {
            CravingPatterns.HourBucket(hour: $0, count: dist[$0], avgIntensity: Double(2 + $0 % 3))
        }
        return CravingPatterns(byHour: buckets, peakHour: 20, topTrigger: "stress", total: dist.reduce(0, +))
    }()
}
