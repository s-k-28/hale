import SwiftUI

// Brand tokens scoped to the widget extension (a small, self-contained mirror of
// the app's DesignSystem/Tokens.swift — the app's Tok enum lives in the app module
// and can't be imported here). Values are byte-identical to the app: emerald
// #34D399 on the "Clean Dark" #0B0F0D base, Sora everywhere.
enum Brand {
    static let bg         = hex(0x0B0F0D)
    static let bg2        = hex(0x0E1311)
    static let surface    = hex(0x151B18)
    static let fg         = hex(0xEAF1EC)
    static let fg2        = hex(0x97A39B)
    static let fg3        = hex(0x616B64)
    static let accent     = hex(0x34D399)
    static let accent2    = hex(0x5EE3B0)
    static let accentDeep = hex(0x1FA577)
    static let warm       = hex(0xF2B95C)
    static let track      = Color.white.opacity(0.08)
    static let accentSoft = Color(red: 0x34/255, green: 0xD3/255, blue: 0x99/255, opacity: 0.12)

    static func hex(_ v: UInt32) -> Color {
        Color(.sRGB, red: Double((v >> 16) & 0xFF)/255,
              green: Double((v >> 8) & 0xFF)/255, blue: Double(v & 0xFF)/255, opacity: 1)
    }

    // Sora is bundled into the widget (UIAppFonts in Info.plist); falls back to the
    // system face if registration ever fails, so the widget never renders blank.
    static func sora(_ ps: String, _ size: CGFloat) -> Font { .custom(ps, size: size) }
    static let ringGradient = LinearGradient(colors: [accentDeep, accent2],
                                             startPoint: .topLeading, endPoint: .bottomTrailing)
}

extension View {
    // The app's hero Ring, distilled: faint trough + emerald progress arc, rounded cap.
    func haleRing(progress: Double, line: CGFloat) -> some View {
        self.overlay(
            ZStack {
                Circle().stroke(Color.white.opacity(0.06), lineWidth: line)
                Circle()
                    .trim(from: 0, to: max(0.001, min(1, progress)))
                    .stroke(Brand.ringGradient, style: StrokeStyle(lineWidth: line, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
        )
    }
}
