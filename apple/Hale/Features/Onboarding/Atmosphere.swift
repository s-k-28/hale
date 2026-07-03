import SwiftUI

// The onboarding story's living backdrop. One continuous atmosphere travels the
// whole arc — from "the haze of nicotine" (cold murk, drifting smoke) to "clear
// emerald light" (rising fireflies, warm glow) — morphing smoothly between the
// per-scene targets below. Rendered as a single Canvas so gradients + particles
// share one frame clock; scene changes never snap because the view smooths
// toward its target every frame (exponential approach), independent of SwiftUI
// animation timing.
struct Atmosphere: Equatable {
    var clarity: Double   // 0 = smoke haze … 1 = clear emerald light
    var energy: Double    // particle drift speed / liveliness
    var warmth: Double    // 0 = emerald lane … 1 = amber lane (buddy scene ONLY)
    var glow: Double      // light-source intensity
    var glowY: Double     // light-source vertical position (unit; >1 = below screen)

    static let haze     = Atmosphere(clarity: 0.05, energy: 0.45, warmth: 0, glow: 0.35, glowY: 1.25)
    static let building = Atmosphere(clarity: 0.55, energy: 1.9,  warmth: 0, glow: 0.55, glowY: 0.85)
    static let reveal   = Atmosphere(clarity: 1.0,  energy: 1.25, warmth: 0, glow: 1.0,  glowY: 0.22)
    static let commit   = Atmosphere(clarity: 0.9,  energy: 0.7,  warmth: 0, glow: 0.75, glowY: 0.6)
    static let pushCue  = Atmosphere(clarity: 0.85, energy: 0.6,  warmth: 0, glow: 0.6,  glowY: 0.4)
    static let invite   = Atmosphere(clarity: 0.9,  energy: 0.8,  warmth: 1, glow: 0.7,  glowY: 0.35)

    /// The quiz arc: each answered step burns a little more haze away.
    static func journey(_ t: Double) -> Atmosphere {
        let t = min(1, max(0, t))
        return Atmosphere(clarity: 0.08 + 0.42 * t, energy: 0.5 + 0.5 * t,
                          warmth: 0, glow: 0.35 + 0.3 * t, glowY: 1.2 - 0.5 * t)
    }
}

struct AtmosphereView: View {
    var target: Atmosphere
    var parallax: CGFloat = 0

    // Frame-to-frame smoothing state. A reference box (not @State) so the Canvas
    // closure can update it without re-invalidating the view — TimelineView is
    // already redrawing every frame.
    private final class Smooth {
        var a = Atmosphere.haze
        var px: CGFloat = 0
        var last: TimeInterval = 0
    }
    @State private var smooth = Smooth()

    private struct RGB { let r, g, b: Double
        func mix(_ o: RGB, _ t: Double) -> RGB {
            RGB(r: r + (o.r - r) * t, g: g + (o.g - g) * t, b: b + (o.b - b) * t)
        }
        var color: Color { Color(red: r, green: g, blue: b) }
    }
    private let emerald = RGB(r: 0.204, g: 0.827, b: 0.6)     // Tok.accent
    private let amber   = RGB(r: 0.949, g: 0.725, b: 0.361)   // Tok.warm
    private let smokeC  = RGB(r: 0.22, g: 0.28, b: 0.25)      // desaturated murk

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
            Canvas { ctx, size in
                let now = tl.date.timeIntervalSinceReferenceDate
                let dt = smooth.last == 0 ? 1.0 / 30.0 : min(0.1, now - smooth.last)
                smooth.last = now
                // Exponential approach toward the target (≈1.2s to settle).
                let k = 1 - exp(-dt * 2.4)
                smooth.a.clarity += (target.clarity - smooth.a.clarity) * k
                smooth.a.energy  += (target.energy - smooth.a.energy) * k
                smooth.a.warmth  += (target.warmth - smooth.a.warmth) * k
                smooth.a.glow    += (target.glow - smooth.a.glow) * k
                smooth.a.glowY   += (target.glowY - smooth.a.glowY) * k
                smooth.px        += (parallax - smooth.px) * k
                let a = smooth.a

                // ── Base wash: near-black floor, faintly greener as clarity rises.
                let base = RGB(r: 0.043, g: 0.059, b: 0.051)  // Tok.bg
                let deep = RGB(r: 0.055, g: 0.075, b: 0.066).mix(base, 1 - a.clarity * 0.6)
                ctx.fill(Path(CGRect(origin: .zero, size: size)),
                         with: .linearGradient(Gradient(colors: [base.color, deep.color]),
                                               startPoint: .zero,
                                               endPoint: CGPoint(x: 0, y: size.height)))

                // ── The light source: murky pool → clear emerald (or amber) dawn.
                let glowRGB = emerald.mix(amber, a.warmth).mix(smokeC, (1 - a.clarity) * 0.75)
                let gc = CGPoint(x: size.width * 0.5 - smooth.px * 0.35,
                                 y: size.height * a.glowY)
                let gr = size.width * (0.85 + a.glow * 0.45)
                ctx.fill(Path(CGRect(origin: .zero, size: size)),
                         with: .radialGradient(
                            Gradient(stops: [
                                .init(color: glowRGB.color.opacity(0.05 + 0.17 * a.glow), location: 0),
                                .init(color: glowRGB.color.opacity(0.02 + 0.06 * a.glow), location: 0.45),
                                .init(color: .clear, location: 1),
                            ]),
                            center: gc, startRadius: 0, endRadius: gr))

                // ── Smoke wisps (the haze) — fade away as clarity rises.
                let smokeAlpha = (1 - a.clarity) * 0.85
                if smokeAlpha > 0.02 {
                    ctx.drawLayer { layer in
                        layer.addFilter(.blur(radius: 22))
                        for i in 0..<9 {
                            let s = Double(i)
                            let fx = (s * 0.618).truncatingRemainder(dividingBy: 1)
                            let fy = (s * 0.383).truncatingRemainder(dividingBy: 1)
                            let drift = now * (0.008 + fx * 0.012) * a.energy
                            let x = ((fx + drift).truncatingRemainder(dividingBy: 1.2) - 0.1) * size.width
                                    - smooth.px * (0.5 + fx * 0.4)
                            let y = (0.25 + fy * 0.7) * size.height
                                    + sin(now * 0.12 + s * 2.1) * 26
                            let r = 46.0 + fx * 58
                            layer.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r * 0.6,
                                                              width: r * 2, height: r * 1.2)),
                                       with: .color(smokeC.color.opacity(0.045 * smokeAlpha)))
                        }
                    }
                }

                // ── Fireflies (the clearing) — emerge as clarity rises.
                let flyAlpha = a.clarity
                if flyAlpha > 0.02 {
                    let flyRGB = emerald.mix(amber, a.warmth)
                    for i in 0..<22 {
                        let s = Double(i)
                        let fx = (s * 0.618 + 0.17).truncatingRemainder(dividingBy: 1)
                        let fs = 0.5 + (s * 0.271).truncatingRemainder(dividingBy: 1)  // speed
                        let rise = (s * 0.137 + now * 0.022 * fs * a.energy)
                            .truncatingRemainder(dividingBy: 1)
                        let y = (1.05 - rise * 1.1) * size.height
                        let x = fx * size.width
                                + sin(now * (0.35 + fs * 0.3) + s * 1.7) * 18
                                - smooth.px * (0.8 + fx * 0.6)
                        let twinkle = 0.45 + 0.55 * (0.5 + 0.5 * sin(now * (1.1 + fs) + s * 3.3))
                        let r = 1.1 + fs * 1.5
                        let alpha = flyAlpha * twinkle * (rise < 0.12 ? rise / 0.12 : 1)
                        // soft halo + core
                        ctx.fill(Path(ellipseIn: CGRect(x: x - r * 3, y: y - r * 3,
                                                        width: r * 6, height: r * 6)),
                                 with: .color(flyRGB.color.opacity(0.08 * alpha)))
                        ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r,
                                                        width: r * 2, height: r * 2)),
                                 with: .color(flyRGB.color.opacity(0.75 * alpha)))
                    }
                }

                // ── Top vignette keeps titles readable.
                ctx.fill(Path(CGRect(x: 0, y: 0, width: size.width, height: size.height * 0.35)),
                         with: .linearGradient(Gradient(colors: [base.color.opacity(0.85), .clear]),
                                               startPoint: .zero,
                                               endPoint: CGPoint(x: 0, y: size.height * 0.35)))
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}
