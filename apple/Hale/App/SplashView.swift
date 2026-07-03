import SwiftUI

// Launch continuation. The static UILaunchScreen paints the mark on the dark base
// the instant the process starts; this SwiftUI splash picks up that same mark and
// gives it an intentional first frame — a soft scale-in with a breathing emerald
// bloom — before dissolving to reveal the app. Uses the LaunchMark asset so the
// hand-off from the static launch screen is pixel-identical (no pop).
struct SplashView: View {
    @State private var settled = false
    @State private var bloom = false

    var body: some View {
        ZStack {
            Tok.bg.ignoresSafeArea()
            Image("LaunchMark")
                .scaleEffect(settled ? 1.0 : 0.90)
                .opacity(settled ? 1 : 0)
                .shadow(color: Tok.accent.opacity(bloom ? 0.45 : 0.10),
                        radius: bloom ? 38 : 10)
        }
        .onAppear {
            withAnimation(.interpolatingSpring(mass: 1, stiffness: 90, damping: 15)) {
                settled = true
            }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                bloom = true
            }
        }
    }
}
