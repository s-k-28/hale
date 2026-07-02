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
