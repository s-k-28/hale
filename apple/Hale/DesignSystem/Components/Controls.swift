import SwiftUI

// Ported from src/ui/Chip.tsx, IconBtn.tsx, OptRow.tsx.

struct Chip: View {
    let label: String
    var on: Bool = false
    var action: () -> Void = {}
    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.sora(on ? .semibold : .medium, 15))
                .foregroundStyle(on ? Tok.accentInk : Tok.fg)
                .frame(height: 44)
                .padding(.horizontal, 18)
                .background(on ? Tok.accent : Tok.surface2)
                .clipShape(Capsule())
                .overlay(Capsule().strokeBorder(on ? .clear : Tok.stroke, lineWidth: on ? 0 : 1))
        }
        .buttonStyle(PressScaleStyle(scale: 0.96, haptic: { Haptics.select() }))
    }
}

struct IconBtn: View {
    let systemName: String
    /// VoiceOver label. Defaults to a humanized name from the SF Symbol.
    var label: String? = nil
    var action: () -> Void = {}
    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Tok.fg)
                .frame(width: 44, height: 44)
                .background(Tok.surface2)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(Tok.stroke, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle(scale: 0.94, haptic: { Haptics.tap() }))
        .accessibilityLabel(label ?? Self.defaultLabel(systemName))
    }

    private static func defaultLabel(_ symbol: String) -> String {
        switch symbol {
        case "xmark": return "Close"
        case "chevron.left": return "Back"
        case "chevron.right": return "Open"
        case "chevron.down": return "Collapse"
        case "chevron.up": return "Expand"
        default: return symbol.replacingOccurrences(of: ".", with: " ")
        }
    }
}

struct OptRow: View {
    let label: String
    var sub: String? = nil
    var on: Bool = false
    var icon: String? = nil          // SF Symbol name
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(on ? Tok.accentInk : Tok.fg2)
                        .frame(width: 42, height: 42)
                        .background(on ? Tok.accent : Tok.surface2)
                        .clipShape(RoundedRectangle(cornerRadius: Tok.R.md, style: .continuous))
                        .overlay {
                            if !on {
                                RoundedRectangle(cornerRadius: Tok.R.md, style: .continuous)
                                    .strokeBorder(Tok.stroke, lineWidth: 1)
                            }
                        }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.sora(.semibold, 16)).foregroundStyle(Tok.fg)
                    if let sub { Text(sub).font(.sora(.regular, 13)).foregroundStyle(Tok.fg2) }
                }
                Spacer(minLength: 0)
                ZStack {
                    Circle().strokeBorder(on ? Tok.accent : Tok.stroke2, lineWidth: 2).frame(width: 23, height: 23)
                    if on { Circle().fill(Tok.accent).frame(width: 11, height: 11) }
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 17)
            .frame(maxWidth: .infinity)
            .background(on ? Tok.accentSoft : Tok.surface)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous)
                    .strokeBorder(on ? Tok.accentEdge : Tok.stroke, lineWidth: 1)
            )
        }
        .buttonStyle(PressScaleStyle(scale: 0.99, haptic: { Haptics.select() }))
    }
}
