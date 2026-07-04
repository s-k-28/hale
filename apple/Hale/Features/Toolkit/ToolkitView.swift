import SwiftUI

// Advanced craving toolkit — urge-surfing guide + trigger pattern + 24h craving map.
// Premium-gated. Emerald lane only (this is not an SOS/buddy surface).
struct ToolkitView: View {
    @Environment(AppState.self) private var app
    @State private var patterns = LiveQuery<CravingPatterns>(Fn.cravingPatterns)
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
            VStack(alignment: .leading, spacing: Tok.section) {
                Txt.Eyebrow("Advanced toolkit", color: Tok.accent)
                Txt.H1("Urge surfing")

                LockedFeature(feature: "toolkit", variant: .inline,
                              title: "Unlock with HALE+", subtitle: "Urge-surfing, trigger patterns, and your craving map.",
                              locked: !premium, onTap: { showPaywall = true }) {
                    VStack(alignment: .leading, spacing: Tok.section) {
                        urgeSurfCard
                        triggerCard
                        mapCard
                    }
                }
            }
            .frame(maxWidth: Tok.maxContent).frame(maxWidth: .infinity)
            .padding(.horizontal, Tok.gutter).padding(.top, Tok.screenTop).padding(.bottom, 40)
        }
        .background(HaleBackdrop())
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showPaywall) { PaywallView(from: "toolkit") }
        .onAppear { AnalyticsService.track(.analyticsViewed, ["surface": "advanced_toolkit"]) }
    }

    // MARK: urge-surf 4-step machine
    private var urgeSurfCard: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 12) {
                Txt.Eyebrow("Step \(step + 1) of \(steps.count)", color: Tok.accent)
                Txt.H3(steps[step].0)
                Txt.Body(steps[step].1)
                // progress dots
                HStack(spacing: 6) {
                    ForEach(0..<steps.count, id: \.self) { i in
                        Capsule()
                            .fill(i <= step ? Tok.accent : Tok.track)
                            .frame(width: i == step ? 22 : 7, height: 7)
                            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: step)
                    }
                }
                HButton(label: step < steps.count - 1 ? "Next" : "Done", variant: .primary, sm: true) {
                    if step == 0 { AnalyticsService.track(.cravingSosOpened, ["tool": "urge_surf"]) }
                    if step < steps.count - 1 { step += 1; Haptics.select() }
                    else { step = 0; AnalyticsService.track(.cravingSurvived, ["resolved_by": "urge_surf"]); Haptics.success() }
                }
            }
        }
    }

    // MARK: trigger pattern insight
    private var triggerCard: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 10) {
                Txt.Eyebrow("Your pattern")
                if let p = patterns.value, p.total > 0 {
                    if let t = p.topTrigger {
                        insightRow(icon: "bolt.fill", label: "Top trigger", value: t.capitalized)
                    }
                    if let win = hardestWindow(p.byHour) {
                        insightRow(icon: "clock.fill", label: "Hardest window", value: win)
                    }
                    insightRow(icon: "chart.bar.fill", label: "Logged so far", value: "\(p.total) craving\(p.total == 1 ? "" : "s")")
                } else if patterns.loaded {
                    Txt.Muted("Log a few cravings in SOS and your triggers surface here.")
                } else {
                    SkeletonBlock(height: 60, radius: Tok.R.inset)
                }
            }
        }
    }

    private func insightRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Tok.accent)
                .frame(width: 30, height: 30)
                .background(Tok.accentSoft, in: RoundedRectangle(cornerRadius: Tok.R.inset, style: .continuous))
            Text(label).font(.sora(.regular, 14)).foregroundStyle(Tok.fg2)
            Spacer()
            Text(value).font(.sora(.semibold, 14)).foregroundStyle(Tok.fg)
        }
    }

    // MARK: 24-hour craving map (heatmap)
    private var mapCard: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Txt.Eyebrow("Your 24-hour map")
                    Spacer()
                    if let h = patterns.value?.peakHour { Txt.Muted("peak \(hourLabel(h))") }
                }
                if let p = patterns.value, p.total > 0 {
                    CravingHeatmap(buckets: p.byHour, peakHour: p.peakHour)
                } else if patterns.loaded {
                    Txt.Muted("Your craving map fills in as you log.").padding(.vertical, 10)
                } else {
                    SkeletonBlock(height: 84, radius: Tok.R.inset)
                }
            }
        }
    }

    // MARK: derivations
    private func hardestWindow(_ buckets: [CravingPatterns.HourBucket]) -> String? {
        guard !buckets.isEmpty else { return nil }
        var counts = [Int](repeating: 0, count: 24)
        for b in buckets { counts[b.hour % 24] = b.count }
        var best = 0, bestSum = -1
        for start in 0..<24 {
            let sum = (0..<3).reduce(0) { $0 + counts[(start + $1) % 24] }
            if sum > bestSum { bestSum = sum; best = start }
        }
        guard bestSum > 0 else { return nil }
        return "\(hourLabel(best))–\(hourLabel((best + 3) % 24))"
    }

    private func hourLabel(_ h: Int) -> String {
        let hr = ((h % 12) == 0) ? 12 : h % 12
        return "\(hr)\(h < 12 ? "a" : "p")"
    }
}

// AM/PM grid heatmap — two rows of 12 rounded cells, sequential emerald by volume,
// peak cell lit. The "less → more" legend keeps the ramp legible.
struct CravingHeatmap: View {
    let buckets: [CravingPatterns.HourBucket]
    let peakHour: Int?
    private var byHour: [Int: Int] {
        Dictionary(uniqueKeysWithValues: buckets.map { ($0.hour % 24, $0.count) })
    }
    private var maxCount: Int { max(1, buckets.map(\.count).max() ?? 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            row(label: "AM", hours: Array(0..<12))
            row(label: "PM", hours: Array(12..<24))
            HStack(spacing: 8) {
                Text("12·3·6·9").font(.sora(.regular, 10)).foregroundStyle(Tok.fg4)
                Spacer()
                Text("less").font(.sora(.regular, 10)).foregroundStyle(Tok.fg3)
                HStack(spacing: 3) {
                    ForEach([0.18, 0.42, 0.66, 0.9], id: \.self) { o in
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(Tok.accent.opacity(o)).frame(width: 12, height: 8)
                    }
                }
                Text("more").font(.sora(.regular, 10)).foregroundStyle(Tok.fg3)
            }
            .padding(.top, 2)
        }
    }

    private func row(label: String, hours: [Int]) -> some View {
        HStack(spacing: 5) {
            Text(label).font(.sora(.semibold, 10)).foregroundStyle(Tok.fg3)
                .frame(width: 22, alignment: .leading)
            ForEach(hours, id: \.self) { h in
                let c = byHour[h] ?? 0
                let frac = Double(c) / Double(maxCount)
                let isPeak = h == peakHour && c > 0
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(isPeak
                          ? AnyShapeStyle(LinearGradient(colors: [Tok.accent2, Tok.accent], startPoint: .top, endPoint: .bottom))
                          : AnyShapeStyle(c == 0 ? Tok.track : Tok.accent.opacity(0.18 + 0.72 * frac)))
                    .frame(height: 26)
                    .frame(maxWidth: .infinity)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(isPeak ? Tok.accentEdge : Tok.stroke, lineWidth: isPeak ? 1 : 0.5))
            }
        }
    }
}
