import SwiftUI

// RingBurst — radial particle burst fired on check-in (Skia → Canvas). Remount via
// .id(surgeCounter) to replay. Deterministic per-index, easeOutCubic over 0.82s.
struct RingBurst: View {
    @State private var t: Double = 0
    var body: some View {
        Canvas { ctx, size in
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            let eased = 1 - pow(1 - t, 3)
            for i in 0..<20 {
                let angle = Double(i) / 20 * 2 * .pi
                let dist = eased * 130
                let x = c.x + CGFloat(cos(angle) * dist)
                let y = c.y + CGFloat(sin(angle) * dist)
                let r: CGFloat = i % 2 == 0 ? 3 : 2
                let color = i % 3 == 0 ? Tok.accent2 : Tok.accent
                ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                         with: .color(color.opacity(1 - t)))
            }
        }
        .allowsHitTesting(false)
        .onAppear { withAnimation(.easeOut(duration: 0.82)) { t = 1 } }
    }
}

// MilestoneCelebration — full-screen landmark-day overlay with falling confetti.
struct MilestoneCelebration: View {
    let day: Int
    var onClose: () -> Void

    var body: some View {
        ZStack {
            Tok.bg.opacity(0.92).ignoresSafeArea()
            TimelineView(.animation) { tl in
                Canvas { ctx, size in
                    let elapsed = tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 6)
                    for i in 0..<60 {
                        let seed = Double(i)
                        let x = (seed * 61.7).truncatingRemainder(dividingBy: 1) * size.width
                        let fall = (elapsed / 6 + (seed * 13.3).truncatingRemainder(dividingBy: 1)).truncatingRemainder(dividingBy: 1)
                        let y = fall * (size.height + 40) - 20
                        let rot = elapsed * 3 + seed
                        let color: Color = i % 3 == 0 ? Tok.accent : (i % 3 == 1 ? Tok.accent2 : Tok.warm)
                        var rect = Path(CGRect(x: -3, y: -5, width: 6, height: 10))
                        rect = rect.applying(.init(translationX: x, y: y).rotated(by: rot))
                        ctx.fill(rect, with: .color(color.opacity(0.9)))
                    }
                }
            }
            .allowsHitTesting(false)
            VStack(spacing: 8) {
                Txt.Eyebrow("Milestone", color: Tok.accent)
                Txt.Display("\(day)", size: 88, color: Tok.accent)
                Txt.H2(day == 1 ? "day clean" : "days clean")
                HButton(label: "Keep going", variant: .primary) { onClose() }
                    .frame(maxWidth: 220).padding(.top, 16)
            }
        }
        .onAppear { Haptics.celebrate() }
    }
}
