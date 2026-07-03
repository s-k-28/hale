import SwiftUI

// Ported from src/ui/LockedFeature.tsx. In SwiftUI we use real .blur/RadialGradient
// instead of the RN stacked-disc fake glow. `locked` stands in for the usePremium
// gate; tapping would route to the paywall (wired in Phase 3/4).
enum LockVariant { case inline, overlay }

private struct DotGrid: View {
    let cols: Int, rows: Int, gap: CGFloat
    var body: some View {
        Canvas { ctx, _ in
            for r in 0..<rows {
                for c in 0..<cols {
                    let rect = CGRect(x: CGFloat(c) * gap, y: CGFloat(r) * gap, width: 3, height: 3)
                    ctx.fill(Path(ellipseIn: rect), with: .color(Color.rgba(52, 211, 153, 0.10)))
                }
            }
        }
        .frame(width: CGFloat(cols) * gap, height: CGFloat(rows) * gap)
        .opacity(0.55)
    }
}

struct LockedFeature<Content: View>: View {
    let feature: String
    var variant: LockVariant = .inline
    var title: String = "Unlock with HALE+"
    var subtitle: String? = nil
    var locked: Bool = true
    var onTap: () -> Void = {}
    @ViewBuilder var content: Content

    private var minH: CGFloat { variant == .inline ? 248 : 320 }
    private var radius: CGFloat { variant == .inline ? 22 : 0 }

    var body: some View {
        if !locked {
            content
        } else {
            ZStack {
                // The real feature shows through refractive Liquid Glass — the
                // "it's right there" tease replaces the old near-opaque scrim.
                content.allowsHitTesting(false)
                Rectangle()
                    .fill(.clear)
                    .glassEffect(.regular.tint(Tok.bg.opacity(0.45)),
                                 in: .rect(cornerRadius: radius, style: .continuous))
                backdrop.allowsHitTesting(false)
                chrome
            }
            .frame(maxWidth: .infinity, minHeight: minH)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Tok.accentEdge, lineWidth: 1))
            .contentShape(Rectangle())
            .onTapGesture { Haptics.press(); onTap() }
        }
    }

    private var backdrop: some View {
        ZStack {
            // soft radial glow (real blur, replaces stacked discs)
            Circle()
                .fill(RadialGradient(colors: [Tok.accent.opacity(0.12), .clear],
                                     center: .center, startRadius: 0,
                                     endRadius: variant == .inline ? 120 : 180))
                .frame(width: variant == .inline ? 240 : 360)
                .blur(radius: 8)
            // faint corner rings
            Circle().strokeBorder(Color.rgba(52, 211, 153, 0.06), lineWidth: 1)
                .frame(width: variant == .inline ? 220 : 460)
                .offset(x: variant == .inline ? 90 : 170, y: variant == .inline ? -90 : -150)
            DotGrid(cols: variant == .inline ? 5 : 7, rows: variant == .inline ? 4 : 7,
                    gap: variant == .inline ? 20 : 26)
        }
    }

    private var chrome: some View {
        VStack(spacing: 0) {
            Image(systemName: "lock.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Tok.accentInk)
                .frame(width: 44, height: 44)
                .background(Tok.accent)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .shadow(color: Tok.accent.opacity(0.35), radius: 14, x: 0, y: 6)
            Txt.H2(title).padding(.top, 16)
            if let subtitle {
                Txt.Body(subtitle).multilineTextAlignment(.center)
                    .frame(maxWidth: 260).padding(.top, 6)
            }
            HButton(label: "Unlock HALE+", variant: .primary)
                .frame(maxWidth: 260).padding(.top, 20)
                .allowsHitTesting(false)   // whole surface is the tap target
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
    }
}
