import SwiftUI

// Ported from src/ui/Card.tsx, Tile.tsx, Badge.tsx.

private struct CardSurface: ViewModifier {
    let radius: CGFloat
    let bg: Color
    let border: Color
    let pad: Bool
    let padAmount: CGFloat
    func body(content: Content) -> some View {
        content
            .padding(pad ? padAmount : 0)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(bg)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(border, lineWidth: 1))
    }
}

struct Card<Content: View>: View {
    var pad: Bool = false
    @ViewBuilder var content: Content
    var body: some View {
        content.modifier(CardSurface(radius: Tok.R.panel, bg: Tok.surface, border: Tok.stroke, pad: pad, padAmount: Tok.cardPad))
    }
}
struct Card2<Content: View>: View {
    var pad: Bool = false
    @ViewBuilder var content: Content
    var body: some View {
        content.modifier(CardSurface(radius: Tok.R.tile, bg: Tok.surface2, border: Tok.stroke, pad: pad, padAmount: 16))
    }
}
struct CardHero<Content: View>: View {
    var pad: Bool = false
    @ViewBuilder var content: Content
    var body: some View {   // the one accent-edged card — real glass since iOS 26
        content
            .padding(pad ? Tok.cardPad : 0)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(.regular.tint(Tok.accentSoft),
                         in: .rect(cornerRadius: Tok.R.panel, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tok.R.panel, style: .continuous)
                .strokeBorder(Tok.accentEdge, lineWidth: 1))
    }
}
struct CardInk<Content: View>: View {
    var pad: Bool = false
    @ViewBuilder var content: Content
    var body: some View {
        content.modifier(CardSurface(radius: Tok.R.panel, bg: Tok.bg2, border: Tok.stroke, pad: pad, padAmount: Tok.cardPad))
    }
}

// Stat tile.
struct Tile<Content: View>: View {
    let k: String
    var v: String? = nil
    var accent: Bool = false
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(k.uppercased())
                .font(.sora(.semibold, 11.5)).tracking(0.92)
                .foregroundStyle(Tok.fg3)
            if let v {
                Text(v)
                    .font(.sora(.bold, 28)).tracking(-0.56)
                    .foregroundStyle(accent ? Tok.accent : Tok.fg)
                    .padding(.top, 6)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background(Tok.surface)
        .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous).strokeBorder(Tok.stroke, lineWidth: 1))
    }
}

// Convenience: a Tile with no trailing content (the common case).
extension Tile where Content == EmptyView {
    init(k: String, v: String? = nil, accent: Bool = false) {
        self.init(k: k, v: v, accent: accent) { EmptyView() }
    }
}

enum BadgeTone { case soft, solid, warm }
struct Badge: View {
    let label: String
    var tone: BadgeTone = .soft

    private var bg: Color { switch tone { case .soft: Tok.accentSoft; case .solid: Tok.accent; case .warm: Tok.warmSoft } }
    private var border: Color { switch tone { case .soft: Tok.accentEdge; case .solid: .clear; case .warm: Tok.warmEdge } }
    private var fg: Color { switch tone { case .soft: Tok.accent; case .solid: Tok.accentInk; case .warm: Tok.warm } }

    var body: some View {
        Text(label.uppercased())
            .font(.sora(.semibold, 12)).tracking(0.72)
            .foregroundStyle(fg)
            .frame(height: 30)
            .padding(.horizontal, 13)
            .background(bg)
            .clipShape(Capsule())
            .overlay(Capsule().strokeBorder(border, lineWidth: tone == .solid ? 0 : 1))
    }
}
