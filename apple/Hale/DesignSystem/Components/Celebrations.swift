import SwiftUI

// RingBurst — radial particle burst fired on check-in (remount via .id(surge) to
// replay). Deterministic per-index physics: each particle gets its own launch
// angle (with jitter), speed, size and hue; velocity decays on an ease-out curve
// while gravity pulls the tail down, so the burst blooms then falls like sparks.
struct RingBurst: View {
    @State private var fired = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let count = 28
    private let life: Double = 0.95

    var body: some View {
        // Reduce Motion: skip the particle burst entirely (the ring surge + haptic remain).
        if reduceMotion {
            Color.clear
        } else {
            burst
        }
    }

    private var burst: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60)) { tl in
            Canvas { ctx, size in
                guard fired, let start = startDate else { return }
                let t = min(1, tl.date.timeIntervalSince(start) / life)
                guard t < 1 else { return }
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                let eased = 1 - pow(1 - t, 3)                     // easeOutCubic

                for i in 0..<count {
                    let seed = Double(i)
                    // deterministic pseudo-random per index
                    let jitter = (seed * 127.1).truncatingRemainder(dividingBy: 1)
                    let speedVar = 0.72 + (seed * 311.7).truncatingRemainder(dividingBy: 1) * 0.56
                    let angle = (seed / Double(count) + jitter * 0.05) * 2 * .pi
                    let dist = eased * 148 * speedVar
                    let gravity = 90 * t * t                       // px of sag by end of life
                    let x = c.x + CGFloat(cos(angle) * dist)
                    let y = c.y + CGFloat(sin(angle) * dist + gravity * (0.3 + jitter * 0.7))
                    // sparks flicker; dots fade smoothly
                    let isSpark = i % 4 == 0
                    let flicker = isSpark ? (0.75 + 0.25 * sin(seed + t * 26)) : 1
                    let r: CGFloat = (isSpark ? 1.6 : (i % 2 == 0 ? 3.2 : 2.2)) * CGFloat(1 - t * 0.35)
                    let color: Color = isSpark ? .white : (i % 3 == 0 ? Tok.accent2 : Tok.accent)
                    ctx.fill(
                        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                        with: .color(color.opacity((1 - t) * flicker))
                    )
                }
            }
        }
        .allowsHitTesting(false)
        .onAppear { startDate = .now; fired = true }
    }
    @State private var startDate: Date?
}

// MilestoneCelebration — full-screen landmark-day overlay. Layered confetti
// (blurred back layer + crisp front layer at different speeds = depth), a
// breathing emerald aura, spring hero-number pop, and a haptic crescendo.
struct MilestoneCelebration: View {
    let day: Int
    var onClose: () -> Void

    @State private var heroShown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Tok.bg.opacity(0.94).ignoresSafeArea()

            // breathing emerald aura behind the number
            RadialGradient(colors: [Tok.accent.opacity(0.20), .clear],
                           center: .center, startRadius: 0, endRadius: 260)
                .breathing(period: 2.8, scale: 0.94...1.06, opacity: 0.55...1.0)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            if !reduceMotion {
                ConfettiLayer(flakes: 26, speed: 0.55, sizeScale: 1.5, opacity: 0.35)
                    .blur(radius: 3)                    // far layer — soft, slow, large
                ConfettiLayer(flakes: 44, speed: 1.0, sizeScale: 1.0, opacity: 0.9)
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

// One confetti sheet — deterministic flakes falling with sway + tumble. Two
// instances at different speed/size/blur read as parallax depth.
private struct ConfettiLayer: View {
    let flakes: Int
    let speed: Double
    let sizeScale: CGFloat
    let opacity: Double

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { tl in
            Canvas { ctx, size in
                let elapsed = tl.date.timeIntervalSinceReferenceDate
                for i in 0..<flakes {
                    let seed = Double(i)
                    let lane = (seed * 61.7).truncatingRemainder(dividingBy: 1)
                    let phase = (seed * 13.3).truncatingRemainder(dividingBy: 1)
                    let fallTime = 5.2 / speed
                    let fall = (elapsed / fallTime + phase).truncatingRemainder(dividingBy: 1)
                    let sway = sin(elapsed * (1.1 + lane) + seed) * 14
                    let x = lane * size.width + sway
                    let y = fall * (size.height + 60) - 30
                    let rot = elapsed * (1.8 + lane * 2.4) + seed
                    let color: Color = i % 3 == 0 ? Tok.accent : (i % 3 == 1 ? Tok.accent2 : Tok.warm)
                    let w = 6 * sizeScale, h = 10 * sizeScale
                    // tumble: squash width with a cosine so flakes appear to flip
                    let squash = max(0.25, abs(cos(elapsed * (2.2 + lane) + seed)))
                    var rect = Path(CGRect(x: -w / 2 * squash, y: -h / 2, width: w * squash, height: h))
                    rect = rect.applying(.init(translationX: x, y: y).rotated(by: rot))
                    ctx.fill(rect, with: .color(color.opacity(opacity)))
                }
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}
