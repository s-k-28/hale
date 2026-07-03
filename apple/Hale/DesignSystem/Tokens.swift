import SwiftUI

// HALE — "Clean Dark" design tokens (v2). Ported verbatim from src/theme/tokens.js
// (the RN single source of truth). Dark-only. Discipline: ONE emerald accent per
// screen; coral = SOS/danger ONLY; warm amber = buddy/together/referral ONLY.
enum Tok {
    // MARK: Base / surfaces
    static let bg        = Color(hex: 0x0B0F0D)              // app base — premium dark, never pure black
    static let bg2       = Color(hex: 0x0E1311)
    static let surface   = Color(hex: 0x151B18)             // card
    static let surface2  = Color(hex: 0x1C2420)             // elevated / input
    static let surface3  = Color(hex: 0x25302A)             // pressed / hover
    static let stroke    = Color.rgba(255, 255, 255, 0.06)  // hairline borders (quiet)
    static let stroke2   = Color.rgba(255, 255, 255, 0.12)  // stronger divider / control edge
    static let hairline  = Color.rgba(255, 255, 255, 0.05)  // dividers between rows — barely there
    static let hi        = Color.rgba(255, 255, 255, 0.04)  // top inner highlight on cards

    // MARK: Text
    static let fg        = Color(hex: 0xEAF1EC)             // primary
    static let fg2       = Color(hex: 0x97A39B)             // secondary
    static let fg3       = Color(hex: 0x616B64)             // muted / labels
    static let fg4       = Color(hex: 0x424A45)

    // MARK: Accent (emerald) lane
    static let accent     = Color(hex: 0x34D399)            // THE focal emerald
    static let accent2    = Color(hex: 0x5EE3B0)
    static let accentDeep = Color(hex: 0x1FA577)
    static let accentInk  = Color(hex: 0x052B1E)            // text on accent
    static let accentSoft = Color.rgba(52, 211, 153, 0.12)
    static let accentEdge = Color.rgba(52, 211, 153, 0.26)  // accent hairline ring
    static let accentGlow = Color.rgba(52, 211, 153, 0.35)

    // MARK: Warm (buddy / together / referral) lane
    static let warm      = Color(hex: 0xF2B95C)
    static let warmSoft  = Color.rgba(242, 185, 92, 0.12)
    static let warmEdge  = Color.rgba(242, 185, 92, 0.28)
    static let warmInk   = Color(hex: 0x2B1E07)

    // MARK: Coral (SOS / relapse) lane
    static let coral     = Color(hex: 0xFF6B5C)
    static let coralSoft = Color.rgba(255, 107, 92, 0.12)
    static let coralEdge = Color.rgba(255, 107, 92, 0.30)
    static let coralInk  = Color(hex: 0x2A0B07)

    static let track     = Color.rgba(255, 255, 255, 0.08)  // progress-bar trough

    // MARK: Radii (pt)
    enum R {
        static let pill:  CGFloat = 999
        static let panel: CGFloat = 22   // r-card
        static let tile:  CGFloat = 16   // r-lg
        static let inset: CGFloat = 9    // r-sm
        static let xl2:   CGFloat = 26   // r-xl (sheets)
        static let md:    CGFloat = 12   // r-md (Tailwind default rounded-xl)
    }

    // MARK: Spacing & rhythm
    // One rhythm every screen inherits: a consistent gutter, larger breathing
    // room between sections, generous top padding, and a comfortable max content
    // width so nothing sprawls on big devices. (Restraint > density.)
    static let gutter:     CGFloat = 24   // standard horizontal screen padding
    static let section:    CGFloat = 28   // space between major sections in a screen
    static let sectionLg:  CGFloat = 32   // hero → first section (extra air)
    static let screenTop:  CGFloat = 20   // generous top padding under the safe area
    static let maxContent: CGFloat = 440  // comfortable reading width (clamps on iPad)
    static let cardPad:    CGFloat = 20   // default card inner padding
}
