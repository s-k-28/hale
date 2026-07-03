import SwiftUI

// Sora is the ONLY family (matches RN). PostScript names verified from the bundled TTFs.
enum SoraWeight {
    case light, regular, medium, semibold, bold, extrabold
    var ps: String {
        switch self {
        case .light:     return "Sora-Light"
        case .regular:   return "Sora-Regular"
        case .medium:    return "Sora-Medium"
        case .semibold:  return "Sora-SemiBold"
        case .bold:      return "Sora-Bold"
        case .extrabold: return "Sora-ExtraBold"
        }
    }
}

extension Font {
    static func sora(_ weight: SoraWeight, _ size: CGFloat) -> Font {
        .custom(weight.ps, size: size)
    }
}

// One ramp entry from src/theme/tokens.js. lineHeight is applied as lineSpacing
// (extra leading = lineHeight − size) so multiline blocks match the RN leading.
// `relativeTo` opts every ramp entry into Dynamic Type — the Sora glyphs scale
// with the user's text-size / accessibility setting instead of staying fixed.
private struct RampStyle: ViewModifier {
    let weight: SoraWeight
    let size: CGFloat
    let tracking: CGFloat
    let lineHeight: CGFloat
    let color: Color
    let relativeTo: Font.TextStyle
    func body(content: Content) -> some View {
        content
            .font(.custom(weight.ps, size: size, relativeTo: relativeTo))
            .tracking(tracking)
            .lineSpacing(max(0, lineHeight - size))
            .foregroundStyle(color)
    }
}

extension Text {
    fileprivate func ramp(_ w: SoraWeight, _ s: CGFloat, _ t: CGFloat, _ lh: CGFloat, _ c: Color,
                          _ relativeTo: Font.TextStyle = .body) -> some View {
        modifier(RampStyle(weight: w, size: s, tracking: t, lineHeight: lh, color: c, relativeTo: relativeTo))
    }
}

enum Txt {
    // Type-ramp components — same names as RN src/ui/Text.tsx exports.
    struct Hero: View { let s: String; var color: Color = Tok.fg
        init(_ s: String, color: Color = Tok.fg) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.bold, 88, -2.6, 92, color, .largeTitle) }
    }
    struct H1: View { let s: String; var color: Color = Tok.fg
        init(_ s: String, color: Color = Tok.fg) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.bold, 32, -0.85, 38, color, .largeTitle) }
    }
    struct H2: View { let s: String; var color: Color = Tok.fg
        init(_ s: String, color: Color = Tok.fg) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.bold, 23, -0.46, 28, color, .title) }
    }
    struct H3: View { let s: String; var color: Color = Tok.fg
        init(_ s: String, color: Color = Tok.fg) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.semibold, 18, -0.18, 23, color, .title3) }
    }
    struct Lead: View { let s: String; var color: Color = Tok.fg2
        init(_ s: String, color: Color = Tok.fg2) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.regular, 17, 0, 26, color, .body) }
    }
    struct Body: View { let s: String; var color: Color = Tok.fg2
        init(_ s: String, color: Color = Tok.fg2) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.regular, 15, 0, 23, color, .body) }
    }
    struct Eyebrow: View { let s: String; var color: Color = Tok.fg3
        init(_ s: String, color: Color = Tok.fg3) { self.s = s; self.color = color }
        var body: some View { Text(s.uppercased()).ramp(.semibold, 12, 1.56, 16, color, .caption) }
    }
    struct Muted: View { let s: String; var color: Color = Tok.fg3
        init(_ s: String, color: Color = Tok.fg3) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.regular, 15, 0, 23, color, .body) }
    }
    // Display: caller sets size (used for big numerals). Bold, tight tracking, tabular.
    struct Display: View {
        let s: String; var size: CGFloat; var color: Color = Tok.fg
        init(_ s: String, size: CGFloat, color: Color = Tok.fg) { self.s = s; self.size = size; self.color = color }
        var body: some View {
            Text(s).font(.sora(.bold, size)).tracking(size * -0.02)
                .monospacedDigit().foregroundStyle(color)
        }
    }
}
