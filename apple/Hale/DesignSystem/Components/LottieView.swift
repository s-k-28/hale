import SwiftUI
import Lottie

// SwiftUI wrapper over Lottie for the app's emotional/empty moments. Assets live
// in Resources/Lottie/*.json and are bundled loosely (looked up by name). Every
// call site passes a `fallback` procedural view so a missing/failed animation
// never leaves a hole — the illustration degrades to a native SwiftUI baseline.
//
// Keep these SUBTLE and LOOPING: a calm presence, a gentle reward shimmer — not
// attention-grabbing motion.

struct LoopingLottie<Fallback: View>: View {
    let name: String
    var loopMode: LottieLoopMode = .loop
    var speed: Double = 1
    @ViewBuilder var fallback: Fallback
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if reduceMotion || LottieAnimation.named(name) == nil {
            // Reduce Motion → show the calm static/procedural baseline instead of
            // looping motion; also the graceful path if the asset is absent.
            fallback
        } else {
            LottieView(animation: .named(name))
                .configure { $0.contentMode = .scaleAspectFit }
                .playing(loopMode: loopMode)
                .animationSpeed(speed)
        }
    }
}

// One-shot (e.g. a reward-unlock burst) with a completion + fallback.
struct OneShotLottie<Fallback: View>: View {
    let name: String
    var speed: Double = 1
    var onFinished: (() -> Void)? = nil
    @ViewBuilder var fallback: Fallback
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if reduceMotion || LottieAnimation.named(name) == nil {
            fallback
        } else {
            LottieView(animation: .named(name))
                .configure { $0.contentMode = .scaleAspectFit }
                .playing(loopMode: .playOnce)
                .animationDidFinish { _ in onFinished?() }
                .animationSpeed(speed)
        }
    }
}
