import SwiftUI

// Designed empty / first-run moments. No screen in HALE should ever show a bare
// spinner-less void: every empty state gets a focal illustration (a calm
// procedural presence or a glowing icon medallion), a warm title, and a line of
// copy that reads like encouragement, not an error. Optional CTA.
//
// Two focal styles:
//   • `.orb`      — the calm "Sage presence" (Coach empty, reflective moments)
//   • `.medallion(glyph, tone)` — a glowing icon tile (most feature empties)

// MARK: - Focal: calm Sage presence (procedural, reacts to nothing, just breathes)

/// A serene emerald presence — concentric breathing halos around a soft core.
/// Deliberately calmer than onboarding's HeroOrb: this is "I'm here", not "let's
/// go". Also used as the Coach empty-state hero (a Rive/Lottie asset can swap in
/// later via `SageOrbLottie`; this is the always-available baseline).
struct SageOrb: View {
    var tone: Color = Tok.accent
    var diameter: CGFloat = 132
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: reduceMotion ? 10 : 1.0 / 30)) { tl in
            Canvas { ctx, size in
                let now = tl.date.timeIntervalSinceReferenceDate
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                let breath = reduceMotion ? 0.5 : (sin(now * 2 * .pi / 5.4) + 1) / 2   // slow 5.4s
                let r = (diameter / 2) * (0.82 + 0.06 * breath)

                // outer aura
                ctx.fill(
                    Path(ellipseIn: CGRect(x: c.x - r * 2.1, y: c.y - r * 2.1, width: r * 4.2, height: r * 4.2)),
                    with: .radialGradient(
                        Gradient(stops: [
                            .init(color: tone.opacity(0.16 + 0.08 * breath), location: 0),
                            .init(color: .clear, location: 1)]),
                        center: c, startRadius: 0, endRadius: r * 2.1))

                // three concentric rings, each breathing on a slight phase offset
                for i in 0..<3 {
                    let phase = reduceMotion ? 0.5 : (sin(now * 2 * .pi / 5.4 - Double(i) * 0.6) + 1) / 2
                    let rr = r * (0.62 + Double(i) * 0.19) * (0.97 + 0.05 * phase)
                    ctx.stroke(
                        Path(ellipseIn: CGRect(x: c.x - rr, y: c.y - rr, width: rr * 2, height: rr * 2)),
                        with: .color(tone.opacity(0.34 - Double(i) * 0.08)),
                        lineWidth: 1.5)
                }

                // luminous core
                let ir = r * 0.5 * (0.94 + 0.08 * breath)
                ctx.fill(
                    Path(ellipseIn: CGRect(x: c.x - ir, y: c.y - ir, width: ir * 2, height: ir * 2)),
                    with: .radialGradient(
                        Gradient(stops: [
                            .init(color: tone.opacity(0.85), location: 0),
                            .init(color: tone.opacity(0.18), location: 0.72),
                            .init(color: .clear, location: 1)]),
                        center: CGPoint(x: c.x, y: c.y - ir * 0.12), startRadius: 0, endRadius: ir))

                // bright heart
                let hr = 3.0 + 1.4 * breath
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - hr, y: c.y - hr, width: hr * 2, height: hr * 2)),
                         with: .color(.white.opacity(0.7)))
            }
        }
        .frame(width: diameter * 1.9, height: diameter * 1.4)
        .allowsHitTesting(false)
    }
}

// MARK: - Focal: glowing icon medallion

/// A brand icon floating in a soft, breathing glass tile with a lane-colored
/// glow. The default focal for feature empty states.
struct Medallion: View {
    let glyph: Glyph
    var tone: Color = Tok.accent
    var size: CGFloat = 84

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.32, style: .continuous)
                .fill(tone.opacity(0.10))
                .overlay(
                    RoundedRectangle(cornerRadius: size * 0.32, style: .continuous)
                        .strokeBorder(tone.opacity(0.28), lineWidth: 1))
                .frame(width: size, height: size)
                .shadow(color: tone.opacity(0.35), radius: 22, y: 6)
            Icon(glyph, size: size * 0.44, weight: .medium, color: tone)
        }
        .breathing(period: 4.4, scale: 0.97...1.03, opacity: 0.9...1.0)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - The composed empty state

struct BrandEmptyState<Focal: View>: View {
    let focal: Focal
    let title: String
    var message: String? = nil
    var eyebrow: String? = nil
    var eyebrowTone: Color = Tok.accent
    var cta: (label: String, action: () -> Void)? = nil
    var ghost: (label: String, action: () -> Void)? = nil

    init(title: String,
         message: String? = nil,
         eyebrow: String? = nil,
         eyebrowTone: Color = Tok.accent,
         cta: (label: String, action: () -> Void)? = nil,
         ghost: (label: String, action: () -> Void)? = nil,
         @ViewBuilder focal: () -> Focal) {
        self.focal = focal()
        self.title = title; self.message = message
        self.eyebrow = eyebrow; self.eyebrowTone = eyebrowTone
        self.cta = cta; self.ghost = ghost
    }

    var body: some View {
        VStack(spacing: 14) {
            focal.riseIn(0, distance: 16)
            VStack(spacing: 8) {
                if let eyebrow { Txt.Eyebrow(eyebrow, color: eyebrowTone).riseIn(1) }
                Txt.H2(title).multilineTextAlignment(.center).riseIn(2)
                if let message {
                    Txt.Body(message).multilineTextAlignment(.center)
                        .frame(maxWidth: 320).riseIn(3)
                }
            }
            if cta != nil || ghost != nil {
                VStack(spacing: 8) {
                    if let cta {
                        HButton(label: cta.label, variant: .primary, action: cta.action)
                            .fixedSize()
                    }
                    if let ghost {
                        HButton(label: ghost.label, variant: .ghost, sm: true, action: ghost.action)
                            .fixedSize()
                    }
                }
                .padding(.top, 4)
                .riseIn(4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Tok.gutter)
        .accessibilityElement(children: .combine)
    }
}

// Convenience: the common medallion-based empty state in one call.
extension BrandEmptyState where Focal == Medallion {
    init(glyph: Glyph,
         tone: Color = Tok.accent,
         title: String,
         message: String? = nil,
         eyebrow: String? = nil,
         cta: (label: String, action: () -> Void)? = nil,
         ghost: (label: String, action: () -> Void)? = nil) {
        self.init(title: title, message: message, eyebrow: eyebrow, eyebrowTone: tone,
                  cta: cta, ghost: ghost) {
            Medallion(glyph: glyph, tone: tone)
        }
    }
}
