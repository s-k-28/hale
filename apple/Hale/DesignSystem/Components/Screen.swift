import SwiftUI

// Ported from src/ui/Screen.tsx — screen scaffold + the pinned CTA dock.

struct Screen<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ZStack(alignment: .top) {
            Tok.bg.ignoresSafeArea()
            content
        }
    }
}

struct ScreenHead<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tok.gutter)
            .padding(.top, 4)
    }
}

struct ScreenBody<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.horizontal, Tok.gutter)
    }
}

// Bottom-pinned action dock: a 22pt transparent→bg fade cap over a SOLID floor
// (never a translucent dock).
struct CtaDock<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [Tok.bg.opacity(0), Tok.bg], startPoint: .top, endPoint: .bottom)
                .frame(height: 22)
                .allowsHitTesting(false)
            VStack(spacing: 0) { content }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, Tok.gutter)
                .padding(.top, 8)
                .padding(.bottom, 30)
                .background(Tok.bg)
        }
    }
}
