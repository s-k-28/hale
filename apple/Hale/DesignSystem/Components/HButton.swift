import SwiftUI

// Ported from src/ui/Button.tsx. Named HButton to avoid clashing with SwiftUI.Button.
enum HButtonVariant { case primary, secondary, ghost, coral, warm }
enum HButtonHaptic { case press, tap, select, none }

struct HButton: View {
    let label: String
    var variant: HButtonVariant = .primary
    var sm: Bool = false
    var loading: Bool = false
    var disabled: Bool = false
    var icon: String? = nil          // SF Symbol name
    var haptic: HButtonHaptic? = nil // nil = default per variant
    var action: () -> Void = {}

    private var off: Bool { disabled || loading }
    private var height: CGFloat { sm ? 46 : (variant == .ghost ? 50 : 56) }
    private var radius: CGFloat { sm ? Tok.R.md : Tok.R.tile }
    private var fontSize: CGFloat { sm ? 14 : 16 }

    var body: some View {
        Button {
            guard !off else { return }
            fireHaptic()
            action()
        } label: {
            chrome
        }
        .buttonStyle(SpringPress())
        .disabled(off)
    }

    // Secondary rides on interactive Liquid Glass. Primary now rides TINTED
    // interactive glass — the emerald identity is kept via .tint(), but the one
    // hero CTA per screen gains the iOS 26 press-deform + specular under the finger
    // (the press itself becomes the reward). Coral/warm stay solid.
    private var isGlass: Bool { variant == .secondary && !disabled }
    private var isPrimaryGlass: Bool { variant == .primary && !off }

    @ViewBuilder
    private var chrome: some View {
        let core = ZStack {
            if loading {
                ProgressView().tint(labelColor)
            } else {
                HStack(spacing: 8) {
                    if let icon { Image(systemName: icon).font(.system(size: fontSize, weight: .bold)) }
                    Text(label).font(.sora(.bold, fontSize)).tracking(-0.16)
                }
                .foregroundStyle(labelColor)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)

        if isGlass {
            core
                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: radius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(Tok.stroke, lineWidth: 1)
                )
        } else if isPrimaryGlass {
            core
                .glassEffect(.regular.tint(Tok.accent).interactive(),
                             in: .rect(cornerRadius: radius, style: .continuous))
                .shadow(color: glowColor, radius: glowRadius, x: 0, y: glowY)
        } else {
            core
                .background(bg)
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(borderColor, lineWidth: hasBorder ? 1 : 0)
                )
                .shadow(color: glowColor, radius: glowRadius, x: 0, y: glowY)
        }
    }

    private func fireHaptic() {
        let kind = haptic ?? (variant == .secondary || variant == .ghost ? .tap : .press)
        switch kind {
        case .press: Haptics.press()
        case .tap: Haptics.tap()
        case .select: Haptics.select()
        case .none: break
        }
    }

    // MARK: computed chrome
    private var bg: Color {
        if disabled { return Tok.surface2 }   // disabled = neutral; loading keeps variant color
        switch variant {
        case .primary:   return Tok.accent
        case .secondary: return Tok.surface2
        case .ghost:     return .clear
        case .coral:     return Tok.coral
        case .warm:      return Tok.warm
        }
    }
    private var labelColor: Color {
        if disabled { return Tok.fg2 }
        switch variant {
        case .primary:   return Tok.accentInk
        case .secondary: return Tok.fg
        case .ghost:     return Tok.fg2
        case .coral:     return Tok.coralInk
        case .warm:      return Tok.warmInk
        }
    }
    private var hasBorder: Bool {
        if disabled { return true }
        return variant == .secondary
    }
    private var borderColor: Color { hasBorder ? Tok.stroke2 : .clear }

    // Softer, wider glow reads as calm depth rather than a heavy halo.
    private var showGlow: Bool { variant == .primary && !off }
    private var glowColor: Color { showGlow ? Tok.accent.opacity(0.26) : .clear }
    private var glowRadius: CGFloat { showGlow ? 18 : 0 }
    private var glowY: CGFloat { showGlow ? 6 : 0 }
}

// Button press: scale → 0.98 on the inline spring from Button.tsx.
struct SpringPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(Springs.button, value: configuration.isPressed)
    }
}
