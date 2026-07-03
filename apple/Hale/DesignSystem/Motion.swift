import SwiftUI

// Ported from src/components/motion.tsx. SwiftUI's interpolatingSpring takes
// mass/stiffness/damping — the exact same params Reanimated withSpring uses,
// so these are 1:1 with the RN springs.
enum Springs {
    static let pressIn  = Animation.interpolatingSpring(mass: 0.5,  stiffness: 420, damping: 15) // PRESS_IN_SPRING
    static let pressOut = Animation.interpolatingSpring(mass: 0.6,  stiffness: 320, damping: 12) // PRESS_OUT_SPRING
    static let rise     = Animation.interpolatingSpring(mass: 0.85, stiffness: 150, damping: 20) // RISE_SPRING
    static let button   = Animation.interpolatingSpring(mass: 1.0,  stiffness: 400, damping: 20) // Button's inline spring
    static let ring     = Animation.interpolatingSpring(mass: 0.9,  stiffness: 80,  damping: 18) // Ring progress
    static let trackFill = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.6)                 // Track width
}

// RiseIn: opacity 0→1 + translateY distance→0 on mount, staggered 40ms per index.
struct RiseIn: ViewModifier {
    var index: Int = 0
    var delay: Double = 0
    var distance: CGFloat = 12
    @State private var shown = false
    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : distance)
            .onAppear {
                withAnimation(Springs.rise.delay(Double(index) * 0.04 + delay)) { shown = true }
            }
    }
}

extension View {
    func riseIn(_ index: Int = 0, delay: Double = 0, distance: CGFloat = 12) -> some View {
        modifier(RiseIn(index: index, delay: delay, distance: distance))
    }
}

// Breathing — a slow sine oscillation of scale + opacity, the "alive" idle for
// glows (Today ring aura, SOS coral field). Static under Reduce Motion.
struct Breathing: ViewModifier {
    var period: Double = 3.2
    var scaleRange: ClosedRange<CGFloat> = 0.96...1.04
    var opacityRange: ClosedRange<Double> = 0.65...1.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content.opacity((opacityRange.lowerBound + opacityRange.upperBound) / 2)
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { tl in
                let t = tl.date.timeIntervalSinceReferenceDate
                let wave = (sin(t * 2 * .pi / period) + 1) / 2   // 0…1
                content
                    .scaleEffect(scaleRange.lowerBound + (scaleRange.upperBound - scaleRange.lowerBound) * CGFloat(wave))
                    .opacity(opacityRange.lowerBound + (opacityRange.upperBound - opacityRange.lowerBound) * wave)
            }
        }
    }
}

extension View {
    func breathing(period: Double = 3.2,
                   scale: ClosedRange<CGFloat> = 0.96...1.04,
                   opacity: ClosedRange<Double> = 0.65...1.0) -> some View {
        modifier(Breathing(period: period, scaleRange: scale, opacityRange: opacity))
    }

    /// Rolling-odometer digits (H/M/S counters, streak numbers): pair with a
    /// monospacedDigit font. Animates each numeral change with a snappy spring.
    func digitRoll<V: Equatable>(_ value: V) -> some View {
        self
            .contentTransition(.numericText())
            .animation(.snappy(duration: 0.35), value: value)
    }
}

// Sheen — a specular band that sweeps across the view every few seconds (Paywall
// CTA). Masked to the content's rounded shape; off under Reduce Motion.
struct Sheen: ViewModifier {
    var radius: CGFloat = Tok.R.tile
    var interval: Double = 3.6      // full cycle incl. rest
    var travel: Double = 1.1        // sweep portion of the cycle, seconds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.overlay {
            if !reduceMotion {
                TimelineView(.animation(minimumInterval: 1.0 / 60)) { tl in
                    GeometryReader { geo in
                        let t = tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: interval)
                        let p = t / travel   // 0…1 during the sweep, >1 while resting
                        if p <= 1 {
                            LinearGradient(
                                colors: [.clear, .white.opacity(0.28), .clear],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                            .frame(width: geo.size.width * 0.45)
                            .offset(x: -geo.size.width * 0.45 + (geo.size.width * 1.45) * p)
                            .blendMode(.plusLighter)
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .allowsHitTesting(false)
            }
        }
    }
}

extension View {
    func sheen(radius: CGFloat = Tok.R.tile, interval: Double = 3.6) -> some View {
        modifier(Sheen(radius: radius, interval: interval))
    }
}

// Immediate press-scale for Chip/IconBtn/OptRow (RN `active:scale-[x]`), with an
// optional haptic fired on press-in.
struct PressScaleStyle: ButtonStyle {
    var scale: CGFloat = 0.96
    var haptic: (() -> Void)? = nil
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, pressed in
                if pressed { haptic?() }
            }
    }
}
