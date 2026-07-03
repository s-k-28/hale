import SwiftUI

// HALE's single iconography surface. The RN app spoke Lucide; the port mixes
// SF Symbols with a handful of distinctive Lucide marks bundled as template
// SVGs (Resources/Assets.xcassets/Icons). Route EVERY icon through `Glyph` so
// weights, sizes, and the lane color stay consistent across screens.
//
// Rule of thumb:
//   • A mark that carries brand meaning and has no faithful SF twin → bundled
//     Lucide template (buddy/heart-handshake, gift, breathe/wind, flame,
//     shield, sparkles).
//   • Everything else → the closest SF Symbol, standardized here.
enum Glyph {
    // ── Bundled Lucide templates (Icons/*.imageset) ──────────────────────────
    case buddy          // heart-handshake — the together/buddy mark (warm lane)
    case gift           // referral rewards (warm lane)
    case breathe        // wind — breathing / lungs clearing
    case flame          // streak
    case shield         // safety / privacy / protected
    case sparkles       // celebrate / new / delight

    // ── SF Symbols (standardized) ────────────────────────────────────────────
    case coach          // Sage chat
    case today          // home / leaf of progress
    case goals          // targets
    case insights       // charts / trends
    case toolkit        // tools
    case leagues        // leaderboard
    case squad          // group of people
    case premium        // HALE+ crown
    case trophy         // milestone / win
    case bell           // reminders / nudges
    case lock           // gated
    case sos            // crisis / SOS
    case heart          // health / motivation
    case check          // done
    case chevronRight
    case chevronLeft
    case close
    case plus
    case trash
    case share
    case arrowUp
    case link
    case message
    case clock

    /// Bundled template asset name (nil ⇒ this is an SF Symbol).
    var asset: String? {
        switch self {
        case .buddy:    return "heart-handshake"
        case .gift:     return "gift"
        case .breathe:  return "wind"
        case .flame:    return "flame"
        case .shield:   return "shield-check"
        case .sparkles: return "sparkles"
        default:        return nil
        }
    }

    /// SF Symbol name for the non-bundled cases.
    var symbol: String {
        switch self {
        case .coach:        return "bubble.left.and.text.bubble.right.fill"
        case .today:        return "leaf.fill"
        case .goals:        return "target"
        case .insights:     return "chart.line.uptrend.xyaxis"
        case .toolkit:      return "wrench.and.screwdriver.fill"
        case .leagues:      return "chart.bar.fill"
        case .squad:        return "person.2.fill"
        case .premium:      return "crown.fill"
        case .trophy:       return "trophy.fill"
        case .bell:         return "bell.fill"
        case .lock:         return "lock.fill"
        case .sos:          return "cross.case.fill"
        case .heart:        return "heart.fill"
        case .check:        return "checkmark"
        case .chevronRight: return "chevron.right"
        case .chevronLeft:  return "chevron.left"
        case .close:        return "xmark"
        case .plus:         return "plus"
        case .trash:        return "trash"
        case .share:        return "square.and.arrow.up"
        case .arrowUp:      return "arrow.up"
        case .link:         return "link"
        case .message:      return "message.fill"
        case .clock:        return "clock.fill"
        // bundled marks never reach here, but keep the switch total
        case .buddy, .gift, .breathe, .flame, .shield, .sparkles:
            return "questionmark"
        }
    }
}

/// Standardized icon view. Bundled Lucide marks render as tintable templates
/// (their native 2px stroke on a 24-grid); SF Symbols use a matched weight so a
/// row mixing both reads as one set.
struct Icon: View {
    let glyph: Glyph
    var size: CGFloat = 20
    var weight: Font.Weight = .semibold
    var color: Color = Tok.fg

    init(_ glyph: Glyph, size: CGFloat = 20, weight: Font.Weight = .semibold, color: Color = Tok.fg) {
        self.glyph = glyph; self.size = size; self.weight = weight; self.color = color
    }

    var body: some View {
        Group {
            if let asset = glyph.asset {
                Image(asset)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    // Lucide's stroke reads a touch heavier than SF at the same
                    // box; nudge the frame so optical weight matches its neighbors.
                    .frame(width: size * 1.06, height: size * 1.06)
            } else {
                Image(systemName: glyph.symbol)
                    .font(.system(size: size, weight: weight))
            }
        }
        .foregroundStyle(color)
    }
}
