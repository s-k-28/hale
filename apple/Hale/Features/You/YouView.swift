import SwiftUI

// Profile / pride / settings — a serene, well-spaced screen. Quiet lifetime
// stats, then two calm focal moments (share your story, HALE+), then grouped
// settings and links as quiet rows with generous breathing room.
struct YouView: View {
    @Environment(AppState.self) private var app
    @State private var hapticsOn = Haptics.enabled
    @State private var analyticsOn = !Prefs.analyticsOptedOut
    @State private var showPaywall = false
    @State private var aiConsent = LiveQuery<AiConsent>(Fn.aiConsentStatus)
    @State private var aiOn = false

    var body: some View {
      NavigationStack {
        ZStack {
            HaleBackdrop()
            if let today = app.today {
                ScrollView {
                    VStack(alignment: .leading, spacing: Tok.section) {
                        header(today)
                        lifetimeStats(today)
                        shareMoment(today)
                        premiumMoment(today)
                        milestoneHistory(today)
                        settings
                        links
                    }
                    .frame(maxWidth: Tok.maxContent)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, Tok.gutter)
                    .padding(.top, Tok.screenTop)
                    .padding(.bottom, 40)
                }
                .scrollIndicators(.hidden)
            } else {
                ProgressView().tint(Tok.accent)
            }
        }
      }
      .fullScreenCover(isPresented: $showPaywall) { PaywallView(from: "profile") }
      .onChange(of: aiConsent.value?.consented) { _, v in if let v { aiOn = v } }
    }

    private func header(_ today: TodayState) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 8) {
                Txt.Eyebrow("Your freedom", color: Tok.accent)
                Txt.H1("You")
            }
            Spacer()
            if today.hasHALEPlus { Badge(label: "HALE+", tone: .soft) }
        }
    }

    // Lifetime pride — two quiet stats, hairline-separated. No card.
    private func lifetimeStats(_ today: TodayState) -> some View {
        HStack(spacing: 0) {
            quietStat("Saved, lifetime", money(today.lifetimeMoneySaved), accent: true)
            Rectangle().fill(Tok.hairline).frame(width: 1, height: 40)
            quietStat("Best streak", "\(today.longestStreak)d", accent: false)
        }
    }
    private func quietStat(_ label: String, _ value: String, accent: Bool) -> some View {
        VStack(spacing: 6) {
            Txt.Eyebrow(label)
            Text(value).font(.sora(.bold, 26)).tracking(-0.5)
                .foregroundStyle(accent ? Tok.accent : Tok.fg)
        }
        .frame(maxWidth: .infinity)
    }

    // Focal moment #1 — share your story. Calm card, one action.
    private func shareMoment(_ today: TodayState) -> some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 12) {
                Txt.Eyebrow("Your story so far", color: Tok.accent)
                Txt.H3("Built to be screenshotted")
                Txt.Body("A clean card of your progress — share it, and maybe start someone else on their way.")
                HButton(label: "Share your progress", variant: .primary, sm: true, icon: "square.and.arrow.up") {
                    let now = Date().timeIntervalSince1970 * 1000
                    let days = Int(max(0, now - today.quitStart) / 86_400_000)
                    let pct = Int(Plan.recoveryFraction(quitStart: today.quitStart, now: now) * 100)
                    ShareCard.share(days: days, money: money(today.currentMoneySaved), recoveryPct: pct)
                }
                .fixedSize()
                .padding(.top, 2)
            }
        }
    }

    // Focal moment #2 — HALE+ (the one emerald-glass card on the screen).
    @ViewBuilder
    private func premiumMoment(_ today: TodayState) -> some View {
        if today.hasHALEPlus {
            CardHero(pad: true) {
                VStack(alignment: .leading, spacing: 6) {
                    Txt.Eyebrow("You're on HALE+", color: Tok.accent)
                    Txt.Body("Thank you for backing your own freedom.", color: Tok.fg)
                }
            }
        } else {
            Button { AnalyticsService.track(.paywallViewed, ["surface": "profile"]); showPaywall = true } label: {
                CardHero(pad: true) {
                    HStack(spacing: 14) {
                        VStack(alignment: .leading, spacing: 6) {
                            Txt.Eyebrow("Unlock HALE+", color: Tok.accent)
                            Txt.Body("Deeper coaching, richer insights, and more ways to stay free.", color: Tok.fg)
                        }
                        Spacer(minLength: 8)
                        Icon(.premium, size: 22, color: Tok.accent)
                    }
                }
            }.buttonStyle(PressScaleStyle(scale: 0.99))
        }
    }

    // "Your recovery so far" — health milestones already reached (most recent first).
    @ViewBuilder
    private func milestoneHistory(_ today: TodayState) -> some View {
        let now = Date().timeIntervalSince1970 * 1000
        let reached = Plan.reachedHealthMilestones(quitStart: today.quitStart, now: now)
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Txt.Eyebrow("Your recovery so far")
                    Spacer()
                    if !reached.isEmpty { Badge(label: "\(reached.count)", tone: .soft) }
                }
                if reached.isEmpty {
                    Txt.Muted("Your first recovery milestone unlocks within the hour of your quit. Keep going.")
                } else {
                    ForEach(Array(reached.reversed().enumerated()), id: \.offset) { _, m in
                        HStack(alignment: .top, spacing: 10) {
                            Icon(.check, size: 13, color: Tok.accent).padding(.top, 3)
                            Txt.Body(m.label, color: Tok.fg)
                        }
                    }
                    Txt.Muted("Commonly reported recovery timeline — supportive, not medical advice.")
                }
            }
        }
    }

    // Grouped settings — quiet rows, hairline-separated, generous room.
    private var settings: some View {
        Card(pad: true) {
            VStack(spacing: 0) {
                Txt.Eyebrow("Settings").frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 4)
                toggleRow("Haptic feedback", "Feel taps and milestones", $hapticsOn) { Haptics.enabled = $0; if $0 { Haptics.select() } }
                rowDivider
                toggleRow("Share usage analytics", "Usage data linked to your account ID that helps us improve HALE. Never sold, never for ads.", $analyticsOn) { AnalyticsService.setOptedOut(!$0) }
                rowDivider
                toggleRow("AI coach data sharing", "Lets Sage work by sharing your chats and quit stats with our AI providers. Off pauses the coach.", $aiOn) { on in
                    guard on != (aiConsent.value?.consented ?? false) else { return }
                    Task { if on { await app.setAiConsent() } else { await app.revokeAiConsent() } }
                }
                .disabled(!aiConsent.loaded)
                HButton(label: "Sign out", variant: .secondary, sm: true) { Task { await app.signOut() } }
                    .padding(.top, 14)
            }
        }
    }

    private var links: some View {
        Card(pad: true) {
            VStack(spacing: 0) {
                linkRow("Treat yourself", glyph: .gift) { GoalsView() }
                rowDivider
                linkRow("Your insights", glyph: .insights) { InsightsView() }
                rowDivider
                linkRow("Advanced toolkit", glyph: .toolkit) { ToolkitView() }
                rowDivider
                linkRow("Disclaimers & sources", glyph: .shield) { DisclaimersView() }
                rowDivider
                urlRow("Privacy policy", Links.privacy)
                rowDivider
                urlRow("Terms of service", Links.terms)
                rowDivider
                urlRow("Contact support", Links.supportMailto)
                rowDivider
                linkRow("Delete account", glyph: .trash, tint: Tok.coral) { DeleteAccountView() }
            }
        }
    }

    private var rowDivider: some View { Rectangle().fill(Tok.hairline).frame(height: 1) }

    private func urlRow(_ title: String, _ url: URL) -> some View {
        Button {
            UIApplication.shared.open(url) { ok in
                if !ok, url.scheme == "mailto" { Toast.info("Email us: \(Links.supportEmail)") }
            }
        } label: {
            HStack {
                Text(title).font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Tok.fg3)
            }
            .padding(.vertical, 14)
        }
        .accessibilityLabel(title)
    }

    private func linkRow<D: View>(_ title: String, glyph: Glyph, tint: Color = Tok.fg, @ViewBuilder _ dest: @escaping () -> D) -> some View {
        NavigationLink { dest() } label: {
            HStack(spacing: 12) {
                Icon(glyph, size: 16, color: tint == Tok.coral ? Tok.coral : Tok.fg2)
                Text(title).font(.sora(.semibold, 15)).foregroundStyle(tint)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Tok.fg3)
            }
            .padding(.vertical, 14)
        }
        .buttonStyle(PressScaleStyle(scale: 0.99))
    }

    private func toggleRow(_ title: String, _ sub: String, _ binding: Binding<Bool>, _ onChange: @escaping (Bool) -> Void) -> some View {
        Toggle(isOn: binding) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                Text(sub).font(.sora(.regular, 12)).foregroundStyle(Tok.fg2)
            }
        }
        .tint(Tok.accent)
        .padding(.vertical, 12)
        .onChange(of: binding.wrappedValue) { _, v in onChange(v) }
    }

    private func money(_ v: Double) -> String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.maximumFractionDigits = v < 100 ? 2 : 0
        return f.string(from: NSNumber(value: v)) ?? "$0"
    }
}
