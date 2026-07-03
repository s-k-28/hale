import SwiftUI

// The shared screen scaffold — the ONE place that owns screen rhythm so every
// screen breathes the same way. Ported from src/ui/Screen.tsx, then tightened
// for restraint: consistent 24pt gutter, a comfortable max content width, a
// generous top pad, larger section spacing, and a calm header pattern.
//
//   Screen        — backdrop floor + free-form content (you own the layout)
//   ScreenScroll  — the common case: scrolling column with all rhythm applied
//   ScreenTitle   — the calm header (quiet eyebrow · one focal title · lead)
//   CtaDock       — bottom-pinned Liquid Glass action slab

struct Screen<Content: View>: View {
    var bloom: UnitPoint? = nil   // optional hero glow (one per screen)
    @ViewBuilder var content: Content
    var body: some View {
        ZStack(alignment: .top) {
            HaleBackdrop(bloom: bloom)
            content
        }
    }
}

// Drop-in scrolling scaffold: backdrop + gutter + max width + generous top
// padding + section rhythm. Space the sections you pass in with `Tok.section`
// (or let the default VStack spacing do it). This is the default screen shell.
struct ScreenScroll<Content: View>: View {
    var bloom: UnitPoint? = nil
    var spacing: CGFloat = Tok.section
    var topPad: CGFloat = Tok.screenTop
    @ViewBuilder var content: Content
    var body: some View {
        Screen(bloom: bloom) {
            ScrollView {
                VStack(alignment: .leading, spacing: spacing) { content }
                    .frame(maxWidth: Tok.maxContent, alignment: .leading)
                    .frame(maxWidth: .infinity, alignment: .center)   // center the column on wide devices
                    .padding(.horizontal, Tok.gutter)
                    .padding(.top, topPad)
                    .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
    }
}

// Calm header: a quiet eyebrow, ONE focal title, and an optional lead line —
// everything below the title visually demoted. Consistent spacing everywhere.
struct ScreenTitle: View {
    var eyebrow: String? = nil
    let title: String
    var subtitle: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let eyebrow { Txt.Eyebrow(eyebrow) }
            Txt.H1(title)
            if let subtitle { Txt.Lead(subtitle).padding(.top, 2) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// Free-form header/body slices (used when you don't want the full ScreenScroll).
struct ScreenHead<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: Tok.maxContent, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.horizontal, Tok.gutter)
            .padding(.top, Tok.screenTop)
    }
}

struct ScreenBody<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: Tok.maxContent, alignment: .leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.horizontal, Tok.gutter)
    }
}

// Bottom-pinned action dock — a floating Liquid Glass slab (iOS 26). Content
// scrolling underneath refracts through it; a soft fade cap keeps the last line
// of scroll content legible as it meets the dock.
struct CtaDock<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [Tok.bg.opacity(0), Tok.bg.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                .frame(height: 24)
                .allowsHitTesting(false)
            GlassEffectContainer {
                VStack(spacing: 10) { content }
                    .frame(maxWidth: Tok.maxContent)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 14)
                    .haleGlassPanel(radius: Tok.R.xl2)
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 10)
        }
    }
}
