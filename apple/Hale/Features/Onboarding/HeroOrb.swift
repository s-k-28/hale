import SwiftUI

// The story's through-line visual: a breathing orb of light that starts murky
// inside the haze and clears to living emerald as the user answers. Every
// answer sends a pulse through it (bump `pulse`); `clarity` tracks the
// journey. Procedural Canvas — deterministic, no assets, cheap.
struct HeroOrb: View {
    var clarity: Double         // 0 murk … 1 clear emerald
    var pulse: Int = 0          // increment to ripple the orb
    var energy: Double = 1      // breath rate multiplier
    var diameter: CGFloat = 96

    private final class Beat {
        var lastPulse = -1
        var pulseAt: TimeInterval = -10
    }
    @State private var beat = Beat()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 40.0)) { tl in
            Canvas { ctx, size in
                let now = tl.date.timeIntervalSinceReferenceDate
                if pulse != beat.lastPulse {
                    // First frame just records baseline; later changes ripple.
                    if beat.lastPulse >= 0 { beat.pulseAt = now }
                    beat.lastPulse = pulse
                }
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                let breath = 0.5 + 0.5 * sin(now * (2 * .pi / 4.8) * energy)   // 4.8s breath
                let r = (diameter / 2 - 12) * (0.9 + 0.08 * breath)

                // color: murk → emerald
                let g = 0.28 + 0.55 * clarity
                let core = Color(red: 0.204 * (0.4 + 0.6 * clarity) + 0.1 * (1 - clarity),
                                 green: g, blue: 0.6 * clarity + 0.42 * (1 - clarity) * 0.7)

                // halo
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - r * 2.4, y: c.y - r * 2.4,
                                                width: r * 4.8, height: r * 4.8)),
                         with: .radialGradient(
                            Gradient(stops: [
                                .init(color: core.opacity(0.10 + 0.16 * clarity + 0.08 * breath), location: 0),
                                .init(color: .clear, location: 1)]),
                            center: c, startRadius: 0, endRadius: r * 2.4))

                // pulse ripple (0.7s expanding ring after each answer)
                let pt = (now - beat.pulseAt) / 0.7
                if pt >= 0, pt < 1 {
                    let ease = 1 - pow(1 - pt, 3)
                    let pr = r * (1.05 + ease * 1.15)
                    ctx.stroke(Path(ellipseIn: CGRect(x: c.x - pr, y: c.y - pr,
                                                      width: pr * 2, height: pr * 2)),
                               with: .color(core.opacity((1 - pt) * 0.55)),
                               lineWidth: 1.5 + (1 - pt) * 1.5)
                }

                // outer breathing ring
                ctx.stroke(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)),
                           with: .color(core.opacity(0.4 + 0.25 * clarity)),
                           lineWidth: 1.5)

                // inner luminous body
                let ir = r * 0.62 * (0.94 + 0.06 * breath)
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - ir, y: c.y - ir, width: ir * 2, height: ir * 2)),
                         with: .radialGradient(
                            Gradient(stops: [
                                .init(color: core.opacity(0.5 + 0.4 * clarity), location: 0),
                                .init(color: core.opacity(0.12), location: 0.75),
                                .init(color: .clear, location: 1)]),
                            center: CGPoint(x: c.x, y: c.y - ir * 0.15),
                            startRadius: 0, endRadius: ir))

                // tiny bright heart
                let hr = 2.2 + 1.6 * clarity + 0.8 * breath
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - hr, y: c.y - hr, width: hr * 2, height: hr * 2)),
                         with: .color(Color.white.opacity(0.35 + 0.4 * clarity)))
            }
        }
        .frame(width: diameter * 2.2, height: diameter * 1.35)
        .allowsHitTesting(false)
    }
}
