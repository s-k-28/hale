import SwiftUI
import RevenueCat
import Pow

// HALE+ hard paywall (custom UI, not RC's). Conversion-optimized layout:
// value stack → 3-day trial timeline (trust) → annual-default plan selector with
// savings → one pinned primary CTA. No dismiss affordance — the only ways forward
// are starting the trial or restoring an existing purchase. Prices come from the
// live StoreKit product; fallbacks match the App Store Connect pricing.
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
            HaleBackdrop(bloom: UnitPoint(x: 0.30, y: 0.16))
            GeometryReader { proxy in
                ZStack(alignment: .bottom) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            // Header — hard paywall, no dismiss control.
                            Txt.Eyebrow("HALE+", color: Tok.accent).riseIn(0)
                            Txt.H1("Go all in.").riseIn(1)
                            Txt.Lead("Unlock your coach, your data, and your people — and quit for good.")
                                .fixedSize(horizontal: false, vertical: true)
                                .riseIn(1)

                            // Value stack
                            VStack(alignment: .leading, spacing: 10) {
                                featureRow("Unlimited Sage", "Coaching the moment a craving hits — no daily cap.").riseIn(2)
                                featureRow("Full health analytics", "Craving patterns, intensity trends, recovery timeline.").riseIn(3)
                                featureRow("Multiple squads", "Quit alongside more than one group at a time.").riseIn(4)
                            }

                            // Trial timeline — the trust builder
                            trialTimeline.riseIn(4)
                        }
                        .padding(.horizontal, Tok.gutter)
                        .padding(.top, 20)
                        .padding(.bottom, 360)   // clear the pinned plans + CTA
                        .frame(minHeight: proxy.size.height, alignment: .top)
                    }
                    .scrollIndicators(.hidden)

                    ctaFooter
                }
            }
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

    // MARK: - Pinned CTA + legal (always visible for conversion + App Review 3.1.2)

    private var ctaFooter: some View {
        VStack(spacing: 10) {
            // Plan selector — annual is the highlighted default. Pinned with the CTA
            // so the price is always in view (never scrolled off).
            GlassEffectContainer(spacing: 10) {
                VStack(spacing: 10) {
                    planOption("annual", title: "Annual", price: annualPrice,
                               sub: "$4.17/mo · billed yearly", badge: "SAVE 40%")
                    planOption("monthly", title: "Monthly", price: monthlyPrice,
                               sub: "billed monthly", badge: nil)
                }
            }

            HButton(label: "Start my 3-day free trial", variant: .primary, loading: busy) { purchase() }
                .sheen(radius: Tok.R.tile)
                .changeEffect(.shine(duration: 0.6), value: selected)

            Text("No charge today · Cancel anytime in Settings")
                .font(.sora(.semibold, 12)).foregroundStyle(Tok.accent)

            // Auto-renew disclosure (Guideline 3.1.2) — dynamic to the selected plan.
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
        }
        .padding(.horizontal, Tok.gutter)
        .padding(.top, 16)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Rectangle().fill(Tok.stroke).frame(height: 1) }
    }

    // MARK: - Trial timeline

    private var trialTimeline: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("HOW YOUR FREE TRIAL WORKS")
                .font(.sora(.bold, 11)).foregroundStyle(Tok.fg3).kerning(0.6)
            timelineStep("lock.open.fill", "Today", "Full access — Sage, analytics, and squads unlock instantly.", accent: true)
            timelineStep("bell.fill", "Day 2", "We'll send a reminder before your trial ends.")
            timelineStep("checkmark.seal.fill", "Day 3", "Your plan begins. Cancel any time before then and pay nothing.")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous).strokeBorder(Tok.stroke, lineWidth: 1))
    }

    private func timelineStep(_ icon: String, _ day: String, _ detail: String, accent: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(accent ? Tok.accent : Tok.fg2)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(day).font(.sora(.semibold, 14)).foregroundStyle(Tok.fg)
                Text(detail).font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Feature rows

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

    // MARK: - Plan card

    private func planOption(_ key: String, title: String, price: String, sub: String, badge: String?) -> some View {
        let on = selected == key
        return Button { selected = key; Haptics.select() } label: {
            HStack(spacing: 12) {
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
            .padding(18)
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
