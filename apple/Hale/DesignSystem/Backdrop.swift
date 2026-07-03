import SwiftUI

// HaleBackdrop — the premium-depth replacement for a flat `Tok.bg` floor.
// Three cheap layers, all static (zero per-frame work):
//   1. a barely-there vertical gradient (lifted crown → base → deeper floor)
//      so large dark regions read as lit space instead of dead #0B0F0D,
//   2. an optional emerald bloom anchored under a hero element (Today ring,
//      Paywall headline) — one per screen, matching the one-accent rule,
//   3. a fine film-grain tile (static noise image, tiled + plusLighter at 3%)
//      that kills banding on the gradient and gives the dark a physical grain.
//
// Drop-in for `Tok.bg.ignoresSafeArea()` — works as a ZStack floor or in
// `.background(...)`.
struct HaleBackdrop: View {
    var bloom: UnitPoint? = nil
    var bloomColor: Color = Tok.accent
    var grain: Bool = true

    // Derived from Tok.bg #0B0F0D: crown +3 luminance, floor −3. Subtle enough
    // to stay "Clean Dark", strong enough to not read as flat black.
    private static let crown = Color(hex: 0x0E1310)
    private static let floor = Color(hex: 0x080B09)

    var body: some View {
        ZStack {
            LinearGradient(
                stops: [
                    .init(color: Self.crown, location: 0),
                    .init(color: Tok.bg, location: 0.38),
                    .init(color: Tok.bg, location: 0.62),
                    .init(color: Self.floor, location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
            if let bloom {
                // One barely-there emerald lift under the hero — a suggestion of
                // light, not a spotlight. Kept low so the focal element leads.
                RadialGradient(colors: [bloomColor.opacity(0.055), .clear],
                               center: bloom, startRadius: 40, endRadius: 440)
            }
            if grain {
                Image(uiImage: GrainTile.image)
                    .resizable(resizingMode: .tile)
                    .opacity(0.025)
                    .blendMode(.plusLighter)
                    .accessibilityHidden(true)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

// One 128×128 grayscale noise tile, generated once per launch with a seeded
// xorshift so it's deterministic. Tiling a tiny static image is far cheaper
// than any Canvas/shader noise and completely still (film grain, not TV static).
private enum GrainTile {
    static let image: UIImage = {
        let n = 128
        var seed: UInt64 = 0x9E37_79B9_7F4A_7C15
        var px = [UInt8](repeating: 0, count: n * n)
        for i in 0..<(n * n) {
            seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17
            px[i] = UInt8(truncatingIfNeeded: seed)
        }
        let provider = CGDataProvider(data: Data(px) as CFData)!
        let cg = CGImage(width: n, height: n,
                         bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: n,
                         space: CGColorSpaceCreateDeviceGray(),
                         bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                         provider: provider, decode: nil,
                         shouldInterpolate: false, intent: .defaultIntent)!
        return UIImage(cgImage: cg)
    }()
}
