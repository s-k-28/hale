import SwiftUI
import UIKit

// The viral share card (never gated). Rendered to a PNG via ImageRenderer and shared
// through the system sheet. 9:16, layered emerald gradients, a gradient-filled hero
// numeral, money + recovery stat tiles, and the HALE wordmark. No glass/materials here
// — ImageRenderer doesn't rasterize them reliably; everything is plain gradients/fills.
struct TransformationCard: View {
    let days: Int
    let money: String
    let recoveryPct: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Wordmark
            HStack(spacing: 7) {
                Circle().fill(LinearGradient(colors: [Tok.accent2, Tok.accentDeep],
                                             startPoint: .top, endPoint: .bottom))
                    .frame(width: 9, height: 9)
                Text("HALE").font(.sora(.extrabold, 15)).tracking(4).foregroundStyle(Tok.fg)
                Spacer()
                Text("NICOTINE-FREE").font(.sora(.semibold, 11)).tracking(1.5).foregroundStyle(Tok.accent)
            }

            Spacer()

            // Hero numeral
            Text("\(days)")
                .font(.sora(.bold, 128)).tracking(-5)
                .foregroundStyle(LinearGradient(colors: [Tok.fg, Tok.accent2],
                                                startPoint: .top, endPoint: .bottom))
                .shadow(color: Tok.accentGlow, radius: 24, y: 6)
                .padding(.bottom, -6)
            Text(days == 1 ? "day nicotine-free" : "days nicotine-free")
                .font(.sora(.semibold, 22)).foregroundStyle(Tok.fg)

            // Recovery progress bar
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text("Recovery").font(.sora(.medium, 12)).foregroundStyle(Tok.fg2)
                    Spacer()
                    Text("\(recoveryPct)%").font(.sora(.bold, 12)).foregroundStyle(Tok.accent)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Tok.track)
                        Capsule()
                            .fill(LinearGradient(colors: [Tok.accentDeep, Tok.accent2],
                                                 startPoint: .leading, endPoint: .trailing))
                            .frame(width: max(6, geo.size.width * CGFloat(min(100, max(0, recoveryPct))) / 100))
                    }
                }
                .frame(height: 8)
            }
            .padding(.top, 22)

            // Stat tiles
            HStack(spacing: 12) {
                statTile(label: "Money saved", value: money, accent: true)
                statTile(label: "Clean days", value: "\(days)", accent: false)
            }
            .padding(.top, 16)

            Spacer()

            // Footer
            HStack {
                Text("Quit for good with HALE").font(.sora(.medium, 12)).foregroundStyle(Tok.fg3)
                Spacer()
                Text("hale-app.com").font(.sora(.semibold, 12)).foregroundStyle(Tok.fg3)
            }
        }
        .padding(30)
        .frame(width: 360, height: 640, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Tok.R.xl2, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Tok.R.xl2, style: .continuous)
                .strokeBorder(Tok.stroke2, lineWidth: 1))
        .environment(\.colorScheme, .dark)
    }

    private func statTile(label: String, value: String, accent: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.sora(.medium, 12)).foregroundStyle(Tok.fg2)
            Text(value).font(.sora(.bold, 24)).foregroundStyle(accent ? Tok.accent : Tok.fg)
                .minimumScaleFactor(0.6).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(accent ? Tok.accentSoft : Tok.surface2,
                    in: RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous)
                .strokeBorder(accent ? Tok.accentEdge : Tok.stroke, lineWidth: 1))
    }

    private var cardBackground: some View {
        ZStack {
            Tok.bg
            // upper emerald glow behind the numeral
            RadialGradient(colors: [Tok.accent.opacity(0.22), .clear],
                           center: UnitPoint(x: 0.15, y: 0.34), startRadius: 8, endRadius: 420)
            // bottom deep-emerald wash
            LinearGradient(colors: [.clear, Tok.accentDeep.opacity(0.14)],
                           startPoint: .center, endPoint: .bottom)
            // top-leading tint for depth
            LinearGradient(colors: [Tok.accent.opacity(0.10), .clear],
                           startPoint: .topLeading, endPoint: .center)
        }
    }
}

enum ShareCard {
    @MainActor
    static func share(days: Int, money: String, recoveryPct: Int) {
        let renderer = ImageRenderer(content: TransformationCard(days: days, money: money, recoveryPct: recoveryPct))
        renderer.scale = 3
        guard let image = renderer.uiImage else { return }
        let text = "\(days) days nicotine-free with HALE."
        let av = UIActivityViewController(activityItems: [image, text], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.keyWindow?.rootViewController else { return }
        var top = root
        while let presented = top.presentedViewController { top = presented }
        av.popoverPresentationController?.sourceView = top.view
        top.present(av, animated: true)
        AnalyticsService.track(.cardShared, ["surface": "transformation_card"])
    }
}
