import SwiftUI

// SwiftUI bridges for the HALE Metal shaders (HaleShaders.metal). Each is
// TimelineView-driven for a live `time` uniform and each provides a calm, static
// fallback under Reduce Motion — the shaders only ever *add* light, so removing
// them never changes layout or meaning.

// MARK: Ring shimmer — a traveling specular band on a stroked progress ring.
// Applied to the arc itself; `.visualEffect` gives us the exact pixel size so the
// shader's center/angle math is correct regardless of padding.
private struct RingShimmerFX: ViewModifier {
    let active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if active && !reduceMotion {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { tl in
                // wrap time so the Float stays small and precise over long sessions
                let t = Float(tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600))
                content.visualEffect { view, proxy in
                    view.colorEffect(
                        ShaderLibrary.haleRingShimmer(
                            .float2(Float(proxy.size.width), Float(proxy.size.height)),
                            .float(t)
                        )
                    )
                }
            }
        } else {
            content
        }
    }
}

extension View {
    /// A soft emerald/coral sheen that sweeps around a stroked ring. Off under
    /// Reduce Motion (the ring keeps its static gradient).
    func ringShimmer(active: Bool = true) -> some View {
        modifier(RingShimmerFX(active: active))
    }
}

// MARK: Shader aura — a slow drifting glow field (SOS calming coral, milestone
// emerald). A full-bleed Metal field by default; a single soft radial when
// Reduce Motion is on so the moment still reads without any movement.
struct ShaderAura: View {
    var tint: Color
    var intensity: Double = 1.0
    var speed: Double = 1.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if reduceMotion {
                RadialGradient(colors: [tint.opacity(0.14 * intensity), .clear],
                               center: UnitPoint(x: 0.5, y: 0.32),
                               startRadius: 20, endRadius: 320)
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30)) { tl in
                    let t = Float((tl.date.timeIntervalSinceReferenceDate * speed)
                        .truncatingRemainder(dividingBy: 3600))
                    Rectangle()
                        .fill(.black)
                        .visualEffect { view, proxy in
                            view.colorEffect(
                                ShaderLibrary.haleAura(
                                    .float2(Float(proxy.size.width), Float(proxy.size.height)),
                                    .float(t),
                                    .color(tint),
                                    .float(Float(intensity))
                                )
                            )
                        }
                }
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}
