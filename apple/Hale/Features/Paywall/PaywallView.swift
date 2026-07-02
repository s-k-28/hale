import SwiftUI
import RevenueCat

// HALE+ hard paywall (custom UI, not RC's). annual/monthly selector, purchase,
// restore. Offerings are empty on a sim without StoreKit config — chrome still shows.
struct PaywallView: View {
    var from: String = "paywall_screen"
    @Environment(\.dismiss) private var dismiss
    @State private var annual: Package?
    @State private var monthly: Package?
    @State private var selected = "annual"
    @State private var busy = false

    var body: some View {
        ZStack {
            Tok.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Spacer()
                    IconBtn(systemName: "xmark") { dismiss() }
                }
                Spacer()
                Txt.Eyebrow("HALE+", color: Tok.accent)
                Txt.H1("Everything you need\nto stay free")
                featureRow("Unlimited Sage coaching")
                featureRow("Your craving insights & patterns")
                featureRow("Advanced urge-surfing toolkit")
                Spacer()
                planOption("annual", title: "Annual", price: annual?.storeProduct.localizedPriceString ?? "—", note: "Best value")
                planOption("monthly", title: "Monthly", price: monthly?.storeProduct.localizedPriceString ?? "—", note: nil)
                HButton(label: "Start HALE+", variant: .primary, loading: busy) { purchase() }
                Button("Restore purchases") { restore() }
                    .font(.sora(.medium, 14)).foregroundStyle(Tok.fg2)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, Tok.gutter).padding(.bottom, 24).padding(.top, 8)
        }
        .task {
            AnalyticsService.track(.paywallViewed, ["from": from])
            let pkgs = await PurchasesService.offerPackages()
            annual = pkgs.annual; monthly = pkgs.monthly
        }
    }

    private func featureRow(_ s: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Tok.accent)
            Txt.Lead(s, color: Tok.fg)
        }
    }

    private func planOption(_ key: String, title: String, price: String, note: String?) -> some View {
        Button { selected = key; Haptics.select() } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.sora(.semibold, 16)).foregroundStyle(Tok.fg)
                    if let note { Text(note).font(.sora(.medium, 12)).foregroundStyle(Tok.accent) }
                }
                Spacer()
                Text(price).font(.sora(.bold, 16)).foregroundStyle(Tok.fg)
            }
            .padding(18)
            .background(selected == key ? Tok.accentSoft : Tok.surface)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous)
                .strokeBorder(selected == key ? Tok.accentEdge : Tok.stroke, lineWidth: selected == key ? 1.5 : 1))
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
    }

    private func purchase() {
        guard let pkg = selected == "annual" ? annual : monthly else { return }
        busy = true
        Task {
            let ok = await PurchasesService.purchase(pkg)
            busy = false
            if ok { AnalyticsService.track(.purchaseCompleted, ["from": from]); Haptics.success(); dismiss() }
        }
    }
    private func restore() {
        busy = true
        Task { let ok = await PurchasesService.restore(); busy = false; if ok { Haptics.success(); dismiss() } }
    }
}
