import SwiftUI
import Charts

// Insights — craving frequency trend, 24-hour pattern, intensity, and recovery.
// Data fetched for everyone, gated behind LockedFeature for free users (usePremium).
// Palette discipline: emerald lane + neutral ink only (no warm/coral here — those are
// reserved for buddy/SOS). Every chart is single-axis; count and intensity never share
// a y-scale (separate cards instead of a dual axis).
struct InsightsView: View {
    @Environment(AppState.self) private var app
    @State private var trend = LiveQuery<[CravingTrendPoint]>(Fn.cravingTrend)
    @State private var patterns = LiveQuery<CravingPatterns>(Fn.cravingPatterns)
    @State private var recovery = LiveQuery<RecoverySummary>(Fn.recoverySummary)
    @State private var showPaywall = false
    @State private var firedViewed = false

    private var premium: Bool { app.today?.hasHALEPlus ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tok.section) {
                Txt.Eyebrow("Your insights", color: Tok.accent)
                Txt.H1("Insights")

                LockedFeature(feature: "insights", variant: .inline,
                              title: "Unlock with HALE+", subtitle: "See your craving patterns and recovery trend.",
                              locked: !premium, onTap: { showPaywall = true }) {
                    VStack(alignment: .leading, spacing: Tok.section) {
                        recoveryCard
                        frequencyCard.haleScrollReveal(0)
                        hourlyCard.haleScrollReveal(1)
                        intensityCard.haleScrollReveal(2)
                    }
                }
            }
            .frame(maxWidth: Tok.maxContent).frame(maxWidth: .infinity)
            .padding(.horizontal, Tok.gutter).padding(.top, Tok.screenTop).padding(.bottom, 40)
        }
        .background(HaleBackdrop())
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showPaywall) { PaywallView(from: "insights") }
        .onAppear {
            if !firedViewed { firedViewed = true; AnalyticsService.track(.analyticsViewed, ["locked": !premium]) }
        }
    }

    // MARK: recovery — segmented milestone track
    @ViewBuilder private var recoveryCard: some View {
        if let r = recovery.value {
            Card(pad: true) {
                // The one synced count-up+fill reveal: milestones-reached counts up
                // (44pt hero, "/ total" demoted) while the segmented track lights up
                // in sync below. "Next" is the Muted metadata.
                VStack(alignment: .leading, spacing: 14) {
                    StatReveal(
                        eyebrow: "Recovery",
                        value: Double(r.reached),
                        format: { "\(Int($0.rounded()))" },
                        meta: r.nextLabel.map { "Next: \($0)" } ?? "Every milestone reached 🌿",
                        suffix: "/ \(r.total)",
                        bar: false,
                        numberSize: 44
                    )
                    MilestoneTrack(reached: r.reached, total: max(1, r.total))
                }
            }
        }
    }

    // MARK: frequency — smooth emerald area+line (the focal chart)
    private var frequencyCard: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 12) {
                cardHead("Cravings", "last 30 days", trailing: freqTrailing)
                if !trend.loaded {
                    SkeletonBlock(height: 128, radius: Tok.R.inset)
                } else if dayPoints.isEmpty {
                    emptyNote("No cravings logged yet. They'll chart here as you use SOS.", glyph: .breathe)
                } else {
                    FrequencyChart(points: dayPoints)
                        .frame(height: 128)
                }
            }
        }
    }

    private var freqTrailing: String? {
        guard !dayPoints.isEmpty else { return nil }
        let total = dayPoints.reduce(0) { $0 + $1.count }
        return "\(total) total"
    }

    // MARK: 24-hour pattern — sequential emerald bars, peak highlighted
    private var hourlyCard: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 12) {
                cardHead("Your hardest hours", "when cravings hit",
                         trailing: patterns.value?.peakHour.map { "peak \(hourLabel($0))" })
                if let p = patterns.value, p.total > 0 {
                    HourlyChart(buckets: p.byHour, peakHour: p.peakHour)
                        .frame(height: 132)
                } else if patterns.loaded {
                    emptyNote("We'll map your craving hours once you've logged a few.", glyph: .clock)
                } else {
                    SkeletonBlock(height: 132, radius: Tok.R.inset)
                }
            }
        }
    }

    // MARK: intensity — deeper-emerald line on its own 0–5 axis
    private var intensityCard: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 12) {
                cardHead("Craving intensity", "average per day, 1–5", trailing: intensityTrailing)
                if !trend.loaded {
                    SkeletonBlock(height: 96, radius: Tok.R.inset)
                } else if dayPoints.filter({ $0.count > 0 }).isEmpty {
                    emptyNote("Intensity shows here once cravings are logged.")
                } else {
                    IntensityChart(points: dayPoints)
                        .frame(height: 96)
                }
            }
        }
    }

    private var intensityTrailing: String? {
        let withData = dayPoints.filter { $0.count > 0 }
        guard !withData.isEmpty else { return nil }
        let avg = withData.reduce(0.0) { $0 + $1.intensity } / Double(withData.count)
        return String(format: "avg %.1f", avg)
    }

    // MARK: shared card chrome
    private func cardHead(_ title: String, _ sub: String, trailing: String?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Txt.Eyebrow(title)
                Txt.Muted(sub)
            }
            Spacer()
            if let trailing {
                Text(trailing).font(.sora(.semibold, 12)).foregroundStyle(Tok.accent)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Tok.accentSoft, in: Capsule())
            }
        }
    }

    private func emptyNote(_ s: String, glyph: Glyph = .insights) -> some View {
        VStack(spacing: 10) {
            Icon(glyph, size: 24, weight: .regular, color: Tok.accent.opacity(0.55))
            Txt.Muted(s).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    private func hourLabel(_ h: Int) -> String {
        let hr = ((h % 12) == 0) ? 12 : h % 12
        return "\(hr)\(h < 12 ? "a" : "p")"
    }

    // MARK: data
    private var dayPoints: [DayPoint] { (trend.value ?? []).compactMap(DayPoint.init) }
}

// One parsed trend point with a real Date for the time axis.
struct DayPoint: Identifiable {
    let id: String
    let date: Date
    let count: Int
    let intensity: Double
    init?(_ p: CravingTrendPoint) {
        guard let d = DayPoint.fmt.date(from: p.date) else { return nil }
        id = p.date; date = d; count = p.count; intensity = p.avgIntensity
    }
    static let fmt: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current; return f
    }()
}

// MARK: - Frequency chart (area + line, smooth, emerald)
struct FrequencyChart: View {
    let points: [DayPoint]
    private var maxCount: Int { max(1, points.map(\.count).max() ?? 1) }
    var body: some View {
        Chart(points) { p in
            AreaMark(x: .value("Day", p.date), y: .value("Cravings", p.count))
                .interpolationMethod(.catmullRom)
                .foregroundStyle(LinearGradient(
                    colors: [Tok.accent.opacity(0.30), Tok.accent.opacity(0.02)],
                    startPoint: .top, endPoint: .bottom))
            LineMark(x: .value("Day", p.date), y: .value("Cravings", p.count))
                .interpolationMethod(.catmullRom)
                .foregroundStyle(Tok.accent)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
        }
        .chartYScale(domain: 0...(Double(maxCount) * 1.15))
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in
                AxisGridLine().foregroundStyle(Tok.stroke)
                AxisValueLabel().font(.sora(.regular, 10)).foregroundStyle(Tok.fg3)
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: 10)) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    .font(.sora(.regular, 10)).foregroundStyle(Tok.fg3)
            }
        }
    }
}

// MARK: - Intensity chart (line on a fixed 1–5 axis, deeper emerald)
struct IntensityChart: View {
    let points: [DayPoint]
    private var withData: [DayPoint] { points.filter { $0.count > 0 } }
    var body: some View {
        Chart(withData) { p in
            LineMark(x: .value("Day", p.date), y: .value("Intensity", p.intensity))
                .interpolationMethod(.catmullRom)
                .foregroundStyle(Tok.accentDeep)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
            PointMark(x: .value("Day", p.date), y: .value("Intensity", p.intensity))
                .symbolSize(14)
                .foregroundStyle(Tok.accent2)
        }
        .chartYScale(domain: 0...5)
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 2.5, 5]) { _ in
                AxisGridLine().foregroundStyle(Tok.stroke)
                AxisValueLabel().font(.sora(.regular, 10)).foregroundStyle(Tok.fg3)
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: 10)) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    .font(.sora(.regular, 10)).foregroundStyle(Tok.fg3)
            }
        }
    }
}

// MARK: - 24-hour pattern (rounded bars, sequential emerald by volume, peak lit)
struct HourlyChart: View {
    let buckets: [CravingPatterns.HourBucket]
    let peakHour: Int?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown = false
    private var byHour: [Int: CravingPatterns.HourBucket] {
        Dictionary(uniqueKeysWithValues: buckets.map { ($0.hour, $0) })
    }
    private var maxCount: Int { max(1, buckets.map(\.count).max() ?? 1) }

    var body: some View {
        GeometryReader { geo in
            let gap: CGFloat = 3
            let barW = (geo.size.width - gap * 23) / 24
            VStack(spacing: 6) {
                HStack(alignment: .bottom, spacing: gap) {
                    ForEach(0..<24, id: \.self) { h in
                        let count = byHour[h]?.count ?? 0
                        let frac = CGFloat(count) / CGFloat(maxCount)
                        let isPeak = h == peakHour && count > 0
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(barFill(frac: frac, isPeak: isPeak))
                            .frame(width: barW, height: max(3, frac * 92))
                            // grow from baseline, 40ms/bar stagger, 500ms ease-out
                            .scaleEffect(y: (grown || reduceMotion) ? 1 : 0.001, anchor: .bottom)
                            .animation(reduceMotion ? nil : .easeOut(duration: 0.5).delay(Double(h) * 0.04), value: grown)
                            .overlay(alignment: .top) {
                                if isPeak {
                                    Circle().fill(Tok.accent2).frame(width: 4, height: 4).offset(y: -7)
                                        .opacity((grown || reduceMotion) ? 1 : 0)
                                }
                            }
                    }
                }
                .frame(height: 100, alignment: .bottom)
                // axis: 12a · 6a · 12p · 6p
                HStack(spacing: 0) {
                    ForEach(["12a", "6a", "12p", "6p"], id: \.self) { l in
                        Text(l).font(.sora(.regular, 10)).foregroundStyle(Tok.fg3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .onAppear { grown = true }
    }

    // Sequential single-hue ramp: quiet hours read as faint emerald, busy hours full.
    private func barFill(frac: CGFloat, isPeak: Bool) -> LinearGradient {
        let top = isPeak ? Tok.accent2 : Tok.accent.opacity(0.35 + 0.65 * frac)
        let bottom = isPeak ? Tok.accent : Tok.accentDeep.opacity(0.30 + 0.55 * frac)
        return LinearGradient(colors: [top, bottom], startPoint: .top, endPoint: .bottom)
    }
}

// MARK: - Recovery milestone track (discrete segments, rounded)
// Reached segments light up left→right in sync with the count-up (40ms/segment,
// grow-from-leading). Unreached segments are the static trough. Reduce Motion → final.
struct MilestoneTrack: View {
    let reached: Int
    let total: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lit = false
    var body: some View {
        GeometryReader { geo in
            let gap: CGFloat = 4
            let segW = (geo.size.width - gap * CGFloat(total - 1)) / CGFloat(total)
            HStack(spacing: gap) {
                ForEach(0..<total, id: \.self) { i in
                    let isReached = i < reached
                    let on = lit || reduceMotion
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(isReached
                              ? AnyShapeStyle(LinearGradient(colors: [Tok.accent2, Tok.accent],
                                                             startPoint: .leading, endPoint: .trailing))
                              : AnyShapeStyle(Tok.track))
                        .frame(width: max(2, segW), height: 10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .strokeBorder(isReached ? Tok.accentEdge : Tok.stroke, lineWidth: 1))
                        .opacity(isReached && !on ? 0 : 1)
                        .scaleEffect(x: isReached && !on ? 0.55 : 1, anchor: .leading)
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.5).delay(Double(i) * 0.04), value: lit)
                }
            }
        }
        .frame(height: 10)
        .onAppear { lit = true }
    }
}
