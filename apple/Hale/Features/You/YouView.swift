import SwiftUI

// Profile / pride / settings. Lifetime stats + settings toggles (haptics, analytics
// consent, AI consent), sign-out, delete-account link. (Share card lands in Phase 5.)
struct YouView: View {
    @Environment(AppState.self) private var app
    @State private var hapticsOn = Haptics.enabled
    @State private var analyticsOn = !Prefs.analyticsOptedOut
    @State private var showPaywall = false

    var body: some View {
      NavigationStack {
        ZStack {
            Tok.bg.ignoresSafeArea()
            if let today = app.today {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Txt.Eyebrow("Your freedom", color: Tok.accent)
                                Txt.H1("You")
                            }
                            Spacer()
                            if today.hasHALEPlus { Badge(label: "HALE+", tone: .soft) }
                        }

                        Card(pad: true) {
                            VStack(alignment: .leading, spacing: 10) {
                                Txt.H3("Your story so far")
                                Txt.Body("Built to be screenshotted.")
                                HButton(label: "Share your progress", variant: .primary, sm: true) {
                                    let now = Date().timeIntervalSince1970 * 1000
                                    let days = Int(max(0, now - today.quitStart) / 86_400_000)
                                    let pct = Int(Plan.recoveryFraction(quitStart: today.quitStart, now: now) * 100)
                                    ShareCard.share(days: days, money: money(today.lifetimeMoneySaved), recoveryPct: pct)
                                }
                            }
                        }

                        HStack(spacing: 12) {
                            Tile(k: "Saved, lifetime", v: money(today.lifetimeMoneySaved), accent: true)
                            Tile(k: "Best streak", v: "\(today.longestStreak)d")
                        }

                        if !today.hasHALEPlus {
                            Button { AnalyticsService.track(.paywallViewed, ["source": "profile"]); showPaywall = true } label: {
                                CardHero(pad: true) {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Txt.Eyebrow("Unlock HALE+", color: Tok.accent)
                                        Txt.Body("Deeper coaching, richer insights, and more ways to stay free.", color: Tok.fg)
                                    }
                                }
                            }.buttonStyle(PressScaleStyle(scale: 0.99))
                        }

                        settings
                        links
                    }
                    .padding(.horizontal, Tok.gutter).padding(.top, 8).padding(.bottom, 40)
                }
            } else {
                ProgressView().tint(Tok.accent)
            }
        }
      }
      .fullScreenCover(isPresented: $showPaywall) { PaywallView(from: "profile") }
    }

    private var links: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 0) {
                linkRow("Treat yourself") { GoalsView() }
                linkRow("Your insights") { InsightsView() }
                linkRow("Advanced toolkit") { ToolkitView() }
                linkRow("Disclaimers & sources") { DisclaimersView() }
                linkRow("Delete account", tint: Tok.coral) { DeleteAccountView() }
            }
        }
    }

    private func linkRow<D: View>(_ title: String, tint: Color = Tok.fg, @ViewBuilder _ dest: @escaping () -> D) -> some View {
        NavigationLink { dest() } label: {
            HStack {
                Text(title).font(.sora(.semibold, 15)).foregroundStyle(tint)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Tok.fg3)
            }
            .padding(.vertical, 12)
        }
    }

    private var settings: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 4) {
                Txt.Eyebrow("Settings")
                toggleRow("Haptic feedback", "Feel taps and milestones", $hapticsOn) { Haptics.enabled = $0; if $0 { Haptics.select() } }
                Divider().overlay(Tok.stroke)
                toggleRow("Share usage analytics", "Linked to your account ID. Never sold, never for ads.", $analyticsOn) { AnalyticsService.setOptedOut(!$0) }
                Divider().overlay(Tok.stroke)
                HButton(label: "Sign out", variant: .secondary, sm: true) { Task { await app.signOut() } }
                    .padding(.top, 8)
            }
        }
    }

    private func toggleRow(_ title: String, _ sub: String, _ binding: Binding<Bool>, _ onChange: @escaping (Bool) -> Void) -> some View {
        Toggle(isOn: binding) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                Text(sub).font(.sora(.regular, 12)).foregroundStyle(Tok.fg2)
            }
        }
        .tint(Tok.accent)
        .padding(.vertical, 10)
        .onChange(of: binding.wrappedValue) { _, v in onChange(v) }
    }

    private func money(_ v: Double) -> String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.maximumFractionDigits = v < 100 ? 2 : 0
        return f.string(from: NSNumber(value: v)) ?? "$0"
    }
}
