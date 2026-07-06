import SwiftUI

// Liquid Glass (iOS 26) — the ONE place that decides how HALE glass looks, so
// every surface refracts the same way. One restrained material family:
//
//   .haleGlassPanel(radius:)        — cards, docks, sheets (rest state)
//   .haleGlassNav(radius:)          — floating nav / header chrome (same material)
//   .haleGlassInteractive(radius:)  — tappable surfaces (press shimmer + flex)
//   .haleGlassAccent(radius:)       — THE one emerald-tinted glass element / screen
//   .haleGlassCoral(radius:)        — SOS lane only
//
// The system tab bar uses iOS 26's automatic glass (no appearance override), so
// nav/tab chrome already matches these panels. Brand discipline still applies on
// top of glass: one emerald accent per screen; coral = SOS; warm = buddy.
extension View {
    /// Standard glass slab in HALE's continuous-corner language, with the same
    /// quiet hairline cards use so edges stay legible over dark content.
    func haleGlassPanel(radius: CGFloat = Tok.R.panel, stroked: Bool = true) -> some View {
        self
            .glassEffect(.regular, in: .rect(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Tok.stroke, lineWidth: stroked ? 1 : 0)
            )
    }

    /// Floating nav / header chrome — identical material to a panel, pill by
    /// default, so a glass header reads as the same system as the dock and cards.
    func haleGlassNav(radius: CGFloat = Tok.R.pill) -> some View {
        haleGlassPanel(radius: radius)
    }

    /// Tappable glass: refracts and responds to touch (shimmer + flex).
    func haleGlassInteractive(radius: CGFloat = Tok.R.tile) -> some View {
        self.glassEffect(.regular.interactive(), in: .rect(cornerRadius: radius, style: .continuous))
    }

    /// Emerald-tinted glass — reserve for the screen's focal surface. Pass
    /// `interactive: false` for non-tappable heroes (e.g. CardHero) so the
    /// material still matches without press shimmer.
    func haleGlassAccent(radius: CGFloat = Tok.R.tile, tint: Color = Tok.accentSoft,
                         interactive: Bool = true) -> some View {
        self.glassEffect(interactive ? .regular.tint(tint).interactive() : .regular.tint(tint),
                         in: .rect(cornerRadius: radius, style: .continuous))
    }

    /// Coral-tinted glass — SOS lane only.
    func haleGlassCoral(radius: CGFloat = Tok.R.tile) -> some View {
        self.glassEffect(.regular.tint(Tok.coralSoft).interactive(), in: .rect(cornerRadius: radius, style: .continuous))
    }

    /// Selectable glass row/card (e.g. paywall plans): plain interactive glass
    /// at rest, the screen's one emerald tint when chosen — same material both
    /// ways so selection reads as light, not a repaint.
    func haleGlassSelectable(_ selected: Bool, radius: CGFloat = Tok.R.tile) -> some View {
        self.glassEffect(selected ? .regular.tint(Tok.accentSoft).interactive() : .regular.interactive(),
                         in: .rect(cornerRadius: radius, style: .continuous))
    }

    /// Dark refractive veil for locked/teased content — dims what's beneath
    /// while keeping it legibly *there*. (LockedFeature's material.)
    func haleGlassVeil(radius: CGFloat = Tok.R.panel) -> some View {
        self.glassEffect(.regular.tint(Tok.bg.opacity(0.45)),
                         in: .rect(cornerRadius: radius, style: .continuous))
    }
}
