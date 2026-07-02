import SwiftUI
import UIKit

// The viral share card (never gated). Rendered to a PNG via ImageRenderer and
// shared through the system sheet. 9:16-ish, stacked gradients, big day numeral.
struct TransformationCard: View {
    let days: Int
    let money: String
    let recoveryPct: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Txt.Eyebrow("HALE", color: Tok.accent)
            Spacer()
            Text("\(days)").font(.sora(.bold, 132)).tracking(-4).foregroundStyle(Tok.fg)
            Txt.H2(days == 1 ? "day nicotine-free" : "days nicotine-free")
            HStack(spacing: 12) {
                Tile(k: "Saved", v: money, accent: true)
                Tile(k: "Recovery", v: "\(recoveryPct)%")
            }.padding(.top, 20)
            Spacer()
            Text("hale-app.com").font(.sora(.semibold, 13)).foregroundStyle(Tok.fg3)
        }
        .padding(28)
        .frame(width: 340, height: 600, alignment: .leading)
        .background(
            ZStack {
                Tok.bg
                LinearGradient(colors: [Tok.accent.opacity(0.16), .clear], startPoint: .topLeading, endPoint: .center)
                LinearGradient(colors: [.clear, Tok.accentDeep.opacity(0.10)], startPoint: .center, endPoint: .bottom)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .environment(\.colorScheme, .dark)
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
        AnalyticsService.track(.referralShared, ["surface": "transformation_card"])
    }
}
