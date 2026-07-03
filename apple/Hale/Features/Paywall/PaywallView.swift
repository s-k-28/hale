import SwiftUI
import RevenueCat
import Pow

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
            // bloom haloes the "Go all in." headline
            HaleBackdrop(bloom: UnitPoint(x: 0.30, y: 0.22))
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Spacer()
                    IconBtn(systemName: "xmark") { dismiss() }
                }
                Spacer()
                Txt.Eyebrow("HALE+", color: Tok.accent).riseIn(0)
                Txt.H1("Go all in.").riseIn(1)
                Txt.Lead("Quitting sticks when you stop holding back. Unlock the full toolkit — and your people.")
                    .fixedSize(horizontal: false, vertical: true)   // wrap; never ellipsize under vertical squeeze
                    .riseIn(1)
                featureRow("Unlimited Sage", "Coaching whenever a craving hits, no daily cap.").riseIn(2)
                featureRow("Full health analytics", "Craving patterns, intensity trends, recovery timeline.").riseIn(3)
                featureRow("Multiple squads", "Join more than one group challenge at a time.").riseIn(4)
                Spacer()
                GlassEffectContainer(spacing: 12) {
                    VStack(spacing: 12) {
                        planOption("annual", title: "Annual",
                                   price: annual?.storeProduct.localizedPriceString ?? "$79.99", note: "/yr · $6.67/mo")
                        planOption("monthly", title: "Monthly",
                                   price: monthly?.storeProduct.localizedPriceString ?? "$12.99", note: "/mo")
                    }
                }
                HButton(label: "Start my 14-day free trial", variant: .primary, loading: busy) { purchase() }
                    .sheen(radius: Tok.R.tile)                       // looping specular sweep
                    .changeEffect(.shine(duration: 0.6), value: selected)  // flash when plan changes
                subscriptionDisclosure
                HStack(spacing: 18) {
                    Button("Restore purchases") { restore() }
                    Button("Continue with the free version") { dismiss() }
                }
                .font(.sora(.medium, 14)).foregroundStyle(Tok.fg2)
                .lineLimit(1).minimumScaleFactor(0.8)   // shrink, don't ellipsize
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, Tok.gutter).padding(.bottom, 24).padding(.top, 8)
        }
        .task {
            AnalyticsService.track(.paywallViewed, ["surface": from])
            let pkgs = await PurchasesService.offerPackages()
            annual = pkgs.annual; monthly = pkgs.monthly
        }
    }

    // App Review 3.1.2: auto-renew disclosure + working Terms & Privacy links.
    private var subscriptionDisclosure: some View {
        VStack(spacing: 6) {
            Text("14-day free trial, then your plan renews automatically. Cancel anytime — auto-renews unless turned off at least 24 hours before the period ends. Manage in Settings ▸ Apple ID ▸ Subscriptions.")
                .font(.sora(.regular, 11)).foregroundStyle(Tok.fg3)
                .multilineTextAlignment(.center)
                // 3.1.2 disclosure must never truncate — wrap even when the
                // Spacer-driven layout is vertically squeezed.
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
            HStack(spacing: 16) {
                Link("Privacy Policy", destination: Links.privacy)
                Link("Terms of Use", destination: Links.terms)
            }
            .font(.sora(.semibold, 11)).foregroundStyle(Tok.fg2)
        }
    }

    private func featureRow(_ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Tok.accent)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Txt.Lead(title, color: Tok.fg)
                Txt.Body(detail)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func planOption(_ key: String, title: String, price: String, note: String?) -> some View {
        let on = selected == key
        return Button { selected = key; Haptics.select() } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.sora(.semibold, 16)).foregroundStyle(Tok.fg)
                    if let note { Text(note).font(.sora(.medium, 12)).foregroundStyle(Tok.accent) }
                }
                Spacer()
                Text(price).font(.sora(.bold, 16)).foregroundStyle(Tok.fg)
            }
            .padding(18)
            // interactive glass plans; selection = the screen's one emerald tint
            .glassEffect(on ? .regular.tint(Tok.accentSoft).interactive() : .regular.interactive(),
                         in: .rect(cornerRadius: Tok.R.tile, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous)
                .strokeBorder(on ? Tok.accentEdge : Tok.stroke, lineWidth: on ? 1.5 : 1))
            .scaleEffect(on ? 1.02 : 1)
            .animation(Springs.button, value: on)
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
    }

    private func purchase() {
        guard let pkg = selected == "annual" ? annual : monthly else { return }
        busy = true
        Task {
            let ok = await PurchasesService.purchase(pkg)
            busy = false
            if ok {
                AnalyticsService.track(.trialStarted, ["trial_days": 14, "trial_type": "storekit", "surface": from])
                Haptics.success(); dismiss()
            } else {
                Toast.error("Purchase didn't go through. You weren't charged.")
            }
        }
    }
    private func restore() {
        busy = true
        Task {
            let ok = await PurchasesService.restore(); busy = false
            if ok { Haptics.success(); Toast.success("Purchases restored."); dismiss() }
            else { Toast.info("No purchases to restore.") }
        }
    }
}
