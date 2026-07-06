import SwiftUI
import Pow

// Celebrations, re-authored around the app's core metaphor: smoke CLEARING, not a
// party. Nothing here is multicolor confetti — the reward is haze lifting into
// clean emerald light. Rising embers (upward only, smoke-gray at birth → emerald
// as they rise and thin) plus a single one-shot bloom. Calm, premium, on-message.

// Smoke-gray at birth → emerald as it rises: the haze turning to clean light.
// Shared by RingBurst and EmberField so every ember reads from the same ramp.
enum Ember {
    static func color(_ t: Double, seed: Double) -> Color {
        let warmth = (seed * 97.3).truncatingRemainder(dividingBy: 1) * 0.05
        let r = 0.50 + (0.204 - 0.50) * t + warmth
        let g = 0.52 + (0.827 - 0.52) * t
        let b = 0.53 + (0.600 - 0.53) * t
        return Color(red: r, green: g, blue: b)
    }
}

// A single one-shot emerald bloom — a soft radial breath of light that scales up
// and fades once. Punctuates a moment without a burst of debris.
struct EmberBloom: View {
    var color: Color = Tok.accent
    var life: Double = 1.0
    var maxRadius: CGFloat = 150
    @State private var shown = false

    var body: some View {
        RadialGradient(colors: [color.opacity(0.34), .clear],
                       center: .center, startRadius: 0, endRadius: maxRadius)
            .scaleEffect(shown ? 1.4 : 0.6)
            .opacity(shown ? 0 : 0.95)
            .allowsHitTesting(false)
            .onAppear { withAnimation(.easeOut(duration: life)) { shown = true } }
    }
}

// RingBurst — fired on check-in (remount via .id(surge) to replay). Embers lift
// upward from the ring's center and thin to nothing; a single bloom breathes
// behind them. The old sparks-with-gravity confetti is gone.
struct RingBurst: View {
    @State private var startDate: Date?
    @State private var fired = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let count = 16                 // ~40% fewer than the old 28
    private let life: Double = 1.1

    var body: some View {
        // Reduce Motion: skip particles entirely (the ring surge + haptic remain).
        if reduceMotion {
            Color.clear
        } else {
            ZStack {
                EmberBloom(maxRadius: 130)
                embers
            }
        }
    }

    private var embers: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60)) { tl in
            Canvas { ctx, size in
                guard fired, let start = startDate else { return }
                let t = min(1, tl.date.timeIntervalSince(start) / life)
                guard t < 1 else { return }
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                let eased = 1 - pow(1 - t, 2.2)                 // easeOut, calmer than cubic

                for i in 0..<count {
                    let seed = Double(i)
                    let jitter = (seed * 127.1).truncatingRemainder(dividingBy: 1)
                    let spread = (seed * 311.7).truncatingRemainder(dividingBy: 1) - 0.5  // -0.5…0.5
                    // upward only; a little sideways drift like real smoke
                    let rise = eased * (120 + jitter * 90)
                    let x = c.x + CGFloat(spread * 66 + sin(t * 3 + seed) * 12)
                    let y = c.y - CGFloat(rise)
                    let r = CGFloat(2.6 - t * 1.9) * CGFloat(0.7 + jitter * 0.6)   // shrink as it rises
                    guard r > 0.2 else { continue }
                    ctx.fill(
                        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                        with: .color(Ember.color(t, seed: seed).opacity((1 - t) * 0.9))
                    )
                }
            }
        }
        .allowsHitTesting(false)
        .onAppear { startDate = .now; fired = true }
    }
}

// MilestoneCelebration — full-screen landmark-day overlay. A drifting emerald
// shader aura + a breathing radial core behind the number, a field of embers
// rising through the whole screen, and one bloom at the peak. No confetti.
struct MilestoneCelebration: View {
    let day: Int
    var onClose: () -> Void

    @State private var heroShown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Tok.bg.opacity(0.94).ignoresSafeArea()

            // ONE emerald glow behind the number — the drifting shader aura (the
            // breathing radial core was a redundant second glow; removed for restraint).
            ShaderAura(tint: Tok.accent, intensity: 0.7, speed: 1.0)

            if !reduceMotion {
                EmberField(count: 16)          // was 30 — calmer, less debris
                EmberBloom(color: Tok.accent, life: 1.6, maxRadius: 300)
            }

            VStack(spacing: 8) {
                Txt.Eyebrow("Milestone", color: Tok.accent)
                Txt.Display("\(day)", size: 88, color: Tok.accent)
                    .scaleEffect(heroShown ? 1 : 0.3)
                    .opacity(heroShown ? 1 : 0)
                    .shadow(color: Tok.accentGlow, radius: heroShown ? 34 : 0)
                Txt.H2(day == 1 ? "day clean" : "days clean")
                    .opacity(heroShown ? 1 : 0)
                HButton(label: "Keep going", variant: .primary) { onClose() }
                    .frame(maxWidth: 220).padding(.top, 16)
                    .opacity(heroShown ? 1 : 0)
            }
        }
        .onAppear {
            Haptics.crescendo()
            withAnimation(.interpolatingSpring(mass: 0.9, stiffness: 180, damping: 12).delay(0.12)) {
                heroShown = true
            }
        }
    }
}

// MARK: - StatReveal — the payoff number

// The hero-number reveal used on payoff surfaces (You lifetime saved, Insights
// recovery). A big numeral counts up while an accompanying bar fills 0→target IN
// SYNC (~900ms ease-out, the bar's spring carries the slight overshoot), then a
// SINGLE one-shot glow+shine lands on the numeral — never a loop. Eyebrow above,
// Muted metadata below; the number is the star. Reduce Motion → final values,
// no draw, no sparkle. Set `bar: false` when the caller supplies its own synced
// fill (e.g. Insights' segmented MilestoneTrack).
struct StatReveal: View {
    let eyebrow: String
    let value: Double
    var format: (Double) -> String
    var meta: String? = nil
    var suffix: String? = nil           // demoted text after the numeral, e.g. "/ 10"
    var fillTarget: Double = 1          // 0…1 bar fill target
    var bar: Bool = true                // false → caller draws its own fill
    var color: Color = Tok.accent
    var numberSize: CGFloat = 52
    var duration: Double = 0.9
    var startDelay: Double = 0.12

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var begin: Date?
    @State private var landed = false
    @State private var sparkle = 0
    @State private var pop: CGFloat = 1
    @State private var barFrac: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Txt.Eyebrow(eyebrow, color: color)
            numeral
                .scaleEffect(pop, anchor: .leading)
                .changeEffect(.glow(color: color, radius: 22), value: sparkle)
                .changeEffect(.shine(duration: 0.9), value: sparkle)
            if bar { fillBar }
            if let meta { Txt.Muted(meta) }
        }
        .onAppear(perform: run)
    }

    @ViewBuilder private var numeral: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            countingText
            if let suffix {
                Text(suffix).font(.sora(.semibold, max(13, numberSize * 0.32)))
                    .foregroundStyle(Tok.fg3)
            }
        }
    }

    @ViewBuilder private var countingText: some View {
        if reduceMotion {
            number(format(value))
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 40.0, paused: landed)) { tl in
                let t = progress(at: tl.date)
                let eased = 1 - pow(1 - t, 3)                 // ease-out
                number(format(value * eased))
                    .scaleEffect(0.99 + 0.01 * eased, anchor: .leading)
            }
        }
    }

    private func number(_ s: String) -> some View {
        Text(s)
            .font(.sora(.bold, numberSize)).tracking(-1)
            .foregroundStyle(color)
            .monospacedDigit()
            .contentTransition(.numericText())
    }

    private var fillBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Tok.track).frame(height: 6)
                Capsule().fill(color)
                    .frame(width: max(0, geo.size.width * barFrac), height: 6)
                    .shadow(color: color.opacity(0.45), radius: 4)   // emerald glow, not a border
            }
        }
        .frame(height: 6)
    }

    private func progress(at date: Date) -> Double {
        guard let begin else { return 0 }
        return min(1, max(0, date.timeIntervalSince(begin) / duration))
    }

    private func run() {
        if reduceMotion {
            landed = true
            barFrac = CGFloat(fillTarget)
            return
        }
        begin = Date().addingTimeInterval(startDelay)
        // Bar fills on a gentle spring → the "slight overshoot" the arc/number share.
        withAnimation(.interpolatingSpring(mass: 0.9, stiffness: 160, damping: 15).delay(startDelay)) {
            barFrac = CGFloat(fillTarget)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + startDelay + duration) {
            guard !landed else { return }
            landed = true
            sparkle += 1                       // one-shot glow + shine
            Haptics.soft()
            pop = 1.05
            withAnimation(.interpolatingSpring(mass: 0.5, stiffness: 220, damping: 12)) { pop = 1 }
        }
    }
}

// (Scroll-in reveal lives in ScrollFX.swift: `.haleScrollReveal(_:)` — reused by
// the milestone rows / Insights cards below.)

// A slow field of embers rising the full height — clean air lifting through the
// screen. Deterministic per-index, each on its own loop so the field is steady.
private struct EmberField: View {
    var count = 30

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { tl in
            Canvas { ctx, size in
                let elapsed = tl.date.timeIntervalSinceReferenceDate
                for i in 0..<count {
                    let seed = Double(i)
                    let lane = (seed * 61.7).truncatingRemainder(dividingBy: 1)
                    let phase = (seed * 13.3).truncatingRemainder(dividingBy: 1)
                    let riseTime = 7.5
                    let p = (elapsed / riseTime + phase).truncatingRemainder(dividingBy: 1)  // 0 bottom → 1 top
                    let x = lane * size.width + sin(elapsed * (0.6 + lane) + seed) * 18
                    let y = size.height * (1.05 - p * 1.1)
                    let r = (1.4 + lane * 1.8) * (1 - p * 0.55)
                    let fade = sin(p * .pi)                       // in near bottom, out near top
                    ctx.fill(
                        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                        with: .color(Ember.color(p, seed: seed).opacity(fade * 0.5))
                    )
                }
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}
