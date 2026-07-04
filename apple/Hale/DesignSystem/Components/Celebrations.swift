import SwiftUI

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

            // drifting emerald shader glow + a breathing radial core behind the number
            ShaderAura(tint: Tok.accent, intensity: 0.9, speed: 1.0)
            RadialGradient(colors: [Tok.accent.opacity(0.20), .clear],
                           center: .center, startRadius: 0, endRadius: 260)
                .breathing(period: 2.8, scale: 0.94...1.06, opacity: 0.55...1.0)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            if !reduceMotion {
                EmberField(count: 30)
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
