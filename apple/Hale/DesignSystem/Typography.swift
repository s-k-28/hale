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
private struct RampStyle: ViewModifier {
    let weight: SoraWeight
    let size: CGFloat
    let tracking: CGFloat
    let lineHeight: CGFloat
    let color: Color
    func body(content: Content) -> some View {
        content
            .font(.sora(weight, size))
            .tracking(tracking)
            .lineSpacing(max(0, lineHeight - size))
            .foregroundStyle(color)
    }
}

extension Text {
    fileprivate func ramp(_ w: SoraWeight, _ s: CGFloat, _ t: CGFloat, _ lh: CGFloat, _ c: Color) -> some View {
        modifier(RampStyle(weight: w, size: s, tracking: t, lineHeight: lh, color: c))
    }
}

enum Txt {
    // Type-ramp components — same names as RN src/ui/Text.tsx exports.
    struct Hero: View { let s: String; var color: Color = Tok.fg
        init(_ s: String, color: Color = Tok.fg) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.bold, 88, -2.6, 92, color) }
    }
    struct H1: View { let s: String; var color: Color = Tok.fg
        init(_ s: String, color: Color = Tok.fg) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.bold, 30, -0.75, 36, color) }
    }
    struct H2: View { let s: String; var color: Color = Tok.fg
        init(_ s: String, color: Color = Tok.fg) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.bold, 23, -0.46, 28, color) }
    }
    struct H3: View { let s: String; var color: Color = Tok.fg
        init(_ s: String, color: Color = Tok.fg) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.semibold, 18, -0.18, 23, color) }
    }
    struct Lead: View { let s: String; var color: Color = Tok.fg2
        init(_ s: String, color: Color = Tok.fg2) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.regular, 16, 0, 25, color) }
    }
    struct Body: View { let s: String; var color: Color = Tok.fg2
        init(_ s: String, color: Color = Tok.fg2) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.regular, 15, 0, 23, color) }
    }
    struct Eyebrow: View { let s: String; var color: Color = Tok.fg3
        init(_ s: String, color: Color = Tok.fg3) { self.s = s; self.color = color }
        var body: some View { Text(s.uppercased()).ramp(.semibold, 12, 1.56, 16, color) }
    }
    struct Muted: View { let s: String; var color: Color = Tok.fg3
        init(_ s: String, color: Color = Tok.fg3) { self.s = s; self.color = color }
        var body: some View { Text(s).ramp(.regular, 15, 0, 23, color) }
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
