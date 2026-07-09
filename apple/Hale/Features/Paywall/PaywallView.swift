import SwiftUI
import RevenueCat
import Pow

// HALE+ hard paywall (custom UI, not RC's). Single-screen, no-scroll conversion
// layout: value stack, social proof + 3-day trial timeline, annual-default plan
// selector with savings, one primary CTA — all visible at once. No dismiss
// affordance; the only ways forward are starting the trial or restoring.
struct PaywallView: View {
    var from: String = "paywall_screen"
    @Environment(\.dismiss) private var dismiss
    @State private var annual: Package?
    @State private var monthly: Package?
    @State private var selected = "annual"
    @State private var busy = false
    @Namespace private var glassNS

    private var annualPrice: String { annual?.storeProduct.localizedPriceString ?? "$49.99" }
    private var monthlyPrice: String { monthly?.storeProduct.localizedPriceString ?? "$6.99" }
    private var selectedRenewal: String {
        selected == "annual" ? "\(annualPrice)/yr" : "\(monthlyPrice)/mo"
    }

    var body: some View {
        ZStack {
            HaleBackdrop(bloom: UnitPoint(x: 0.30, y: 0.14))
            VStack(alignment: .leading, spacing: 10) {
                // Header — hard paywall, no dismiss control.
                Txt.Eyebrow("HALE+", color: Tok.accent).riseIn(0)
                Txt.H1("Go all in.").riseIn(1)
                Txt.Lead("Your coach, your data, your people. No limits.")
                    .fixedSize(horizontal: false, vertical: true).riseIn(1)

                // Value stack — title over detail so nothing looks squished.
                VStack(alignment: .leading, spacing: 10) {
                    featureRow("Unlimited Sage", "Your AI coach the second a craving hits.").riseIn(2)
                    featureRow("Full health analytics", "Every pattern, trend, and recovery milestone.").riseIn(3)
                    featureRow("Multiple squads", "Quit alongside more than one group.").riseIn(4)
                }

                // Social proof + trial timeline.
                trialCard.riseIn(4)

                Spacer(minLength: 4)

                // Plan selector — annual is the highlighted default.
                GlassEffectContainer(spacing: 10) {
                    VStack(spacing: 10) {
                        planOption("annual", title: "Annual", price: annualPrice,
                                   sub: "$4.17/mo · billed yearly", badge: "SAVE 40%")
                        planOption("monthly", title: "Monthly", price: monthlyPrice,
                                   sub: "billed monthly", badge: nil)
                    }
                }

                // Reassurance + CTA + legal (App Review 3.1.2).
                Label("No payment due now", systemImage: "checkmark")
                    .font(.sora(.semibold, 13)).foregroundStyle(Tok.accent)
                    .frame(maxWidth: .infinity)

                HButton(label: "Start my 3-day free trial", variant: .primary, loading: busy) { purchase() }
                    .sheen(radius: Tok.R.tile)
                    .changeEffect(.shine(duration: 0.6), value: selected)

                Text("No charge today · Cancel anytime in Settings")
                    .font(.sora(.semibold, 12)).foregroundStyle(Tok.accent)
                    .frame(maxWidth: .infinity)

                Text("3-day free trial, then \(selectedRenewal). Auto-renews until cancelled.")
                    .font(.sora(.regular, 11)).foregroundStyle(Tok.fg3)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity)

                HStack(spacing: 18) {
                    Button("Restore") { restore() }
                    Link("Privacy", destination: Links.privacy)
                    Link("Terms", destination: Links.terms)
                }
                .font(.sora(.medium, 12)).foregroundStyle(Tok.fg3)
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, Tok.gutter)
            .padding(.top, 12)
            .padding(.bottom, 8)
        }
        .task {
            AnalyticsService.track(.paywallViewed, ["surface": from])
            // Screenshot / screen-gallery harness has no backend — render the
            // fallback (intended) prices rather than waiting on offerings.
            if ProcessInfo.processInfo.environment["HALE_SCREEN"] == nil {
                let pkgs = await PurchasesService.offerPackages()
                annual = pkgs.annual; monthly = pkgs.monthly
            }
        }
    }

    // MARK: - Social proof + trial timeline

    private var trialCard: some View {
        VStack(alignment: .leading, spacing: 11) {
            Text("Join a community quitting together.")
                .font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
            Text("HOW YOUR FREE TRIAL WORKS")
                .font(.sora(.bold, 11)).foregroundStyle(Tok.fg3).kerning(0.6)
            timelineStep("lock.open.fill", "Today", "Everything unlocks instantly.", accent: true)
            timelineStep("bell.fill", "Day 2", "A reminder before your trial ends.")
            timelineStep("checkmark.seal.fill", "Day 3", "Your plan starts. Cancel anytime before then.")
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous).strokeBorder(Tok.stroke, lineWidth: 1))
    }

    private func timelineStep(_ icon: String, _ day: String, _ detail: String, accent: Bool = false) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(accent ? Tok.accent : Tok.fg2)
                .frame(width: 22)
                .accessibilityHidden(true)
            HStack(spacing: 6) {
                Text(day).font(.sora(.semibold, 13)).foregroundStyle(Tok.fg)
                Text(detail).font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Feature rows (title over detail — clean, never squished)

    private func featureRow(_ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 19))
                .foregroundStyle(Tok.accent)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                Text(detail).font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Plan card (selection ring + circle indicator)

    private func planOption(_ key: String, title: String, price: String, sub: String, badge: String?) -> some View {
        let on = selected == key
        return Button { selected = key; Haptics.select() } label: {
            HStack(spacing: 12) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(on ? Tok.accent : Tok.fg3)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text(title).font(.sora(.semibold, 16)).foregroundStyle(Tok.fg)
                        if let badge {
                            Text(badge)
                                .font(.sora(.bold, 10))
                                .foregroundStyle(Color.black)
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(Capsule().fill(Tok.accent))
                        }
                    }
                    Text(sub).font(.sora(.medium, 12)).foregroundStyle(on ? Tok.accent : Tok.fg3)
                }
                Spacer()
                Text(price).font(.sora(.bold, 20)).foregroundStyle(Tok.fg)
            }
            .padding(16)
            .haleGlassSelectable(on)
            .glassEffectID("plan-\(key)", in: glassNS)
            .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous)
                .strokeBorder(on ? Tok.accentEdge : Tok.stroke, lineWidth: on ? 1.5 : 1))
            .scaleEffect(on ? 1.02 : 1)
            .animation(Springs.button, value: on)
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
    }

    // MARK: - Purchase / restore

    private func purchase() {
        guard let pkg = selected == "annual" ? annual : monthly else { return }
        busy = true
        Task {
            let ok = await PurchasesService.purchase(pkg)
            busy = false
            if ok {
                AnalyticsService.track(.trialStarted, ["trial_days": 3, "trial_type": "storekit", "surface": from])
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
