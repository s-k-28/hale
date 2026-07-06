import SwiftUI

// 1:1 buddy tab — calm solo (invite) and paired (shared streak) states. Each has
// ONE clear focal element with room to breathe; the "more ways to connect" links
// are demoted to a quiet list at the bottom. Live myBuddy.
struct SquadView: View {
    @Environment(AppState.self) private var app
    @State private var buddy = LiveQuery<MyBuddy?>(Fn.myBuddy)
    @State private var shareCode: String?
    @State private var cheered = false
    @State private var showUnpairConfirm = false
    @Namespace private var zoomNS

    var body: some View {
      NavigationStack {
        ZStack {
            HaleBackdrop()
            ScrollView {
                VStack(spacing: Tok.sectionLg) {
                    if !buddy.loaded {
                        ProgressView().tint(Tok.accent).frame(maxWidth: .infinity).padding(.top, 60)
                    } else if let b = buddy.value ?? nil {
                        paired(b)
                    } else {
                        solo
                    }
                    moreLinks
                }
                .frame(maxWidth: Tok.maxContent)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, Tok.gutter)
                .padding(.top, Tok.screenTop)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
        .task { shareCode = await app.getOrCreateMyCode() }
      }
    }

    // ── SOLO: the invite is the one focal moment ─────────────────────────────
    private var solo: some View {
      VStack(spacing: 16) {
        Txt.Eyebrow("Quit together", color: Tok.warm).riseIn(0)
        Medallion(glyph: .buddy, tone: Tok.warm, size: 96)
            .padding(.top, 20)
            .riseIn(1, distance: 16)
        Txt.H1("Better with\na buddy").multilineTextAlignment(.center).riseIn(2)
        Txt.Body("Pair with someone who's also quitting, or a friend who'll cheer you on. You'll see each other's streaks and send backup when it's hard.")
            .multilineTextAlignment(.center).frame(maxWidth: 320).riseIn(3)
        if let code = shareCode {
            ShareLink(item: Links.appStore, message: Text(Links.buddyShareText(code: code))) {
                warmCTA("Share my invite link", icon: .share)
            }
            .simultaneousGesture(TapGesture().onEnded {
                AnalyticsService.track(.buddyInvited,
                                       ["method": "share_sheet", "invite_source": "squad_tab",
                                        "pairing_method": "code", "link_id": code])
            })
            .padding(.top, 12)
            .riseIn(4)
        }
      }
      .frame(maxWidth: .infinity)
      .padding(.top, 8)
    }

    // ── PAIRED: the shared streak is the hero ────────────────────────────────
    private func paired(_ b: MyBuddy) -> some View {
        VStack(spacing: Tok.sectionLg) {
            // Focal: the shared streak, a warm hero number in its own breathing glow.
            VStack(spacing: 8) {
                Txt.Eyebrow("Shared streak", color: Tok.warm)
                Txt.Display("\(b.link.sharedStreak)", size: 78, color: Tok.warm)
                    .background(
                        RadialGradient(colors: [Tok.warm.opacity(0.18), .clear],
                                       center: .center, startRadius: 8, endRadius: 150)
                            .frame(width: 300, height: 300)
                            .breathing(period: 4.0, scale: 0.94...1.06, opacity: 0.6...1.0)
                            .allowsHitTesting(false)
                    )
                Txt.Body("\(b.link.sharedStreak) day\(b.link.sharedStreak == 1 ? "" : "s") strong together")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 12)

            // Buddy + support — one calm card, one action.
            Card(pad: true) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        Circle().fill(Tok.warmSoft).frame(width: 44, height: 44)
                            .overlay(Text(String((b.buddy.name ?? "★").prefix(1))).font(.sora(.bold, 18)).foregroundStyle(Tok.warm))
                        VStack(alignment: .leading, spacing: 2) {
                            Txt.H3(b.buddy.name ?? "Your buddy")
                            Text("\(b.buddy.currentStreak) day\(b.buddy.currentStreak == 1 ? "" : "s") clean")
                                .font(.sora(.regular, 14)).foregroundStyle(Tok.fg2)
                        }
                        Spacer()
                    }
                    HButton(label: cheered ? "Support sent" : "Send support", variant: .warm, disabled: cheered) {
                        cheered = true; Haptics.success()
                        Task {
                            if await app.cheer() {
                                AnalyticsService.track(.nudgeSent, ["type": "cheer", "surface": "squad"])
                            } else {
                                cheered = false
                                Toast.error("Couldn't send your cheer. Try again.")
                            }
                        }
                    }
                    Txt.Muted("They'll see your cheer, never your private details.")
                }
            }

            Button("End pairing") { showUnpairConfirm = true }
                .font(.sora(.medium, 14)).foregroundStyle(Tok.fg3)
                .frame(maxWidth: .infinity)
                .accessibilityHint("Ends your buddy pairing")
        }
        .alert("End pairing with \(b.buddy.name ?? "your buddy")?", isPresented: $showUnpairConfirm) {
            Button("End pairing", role: .destructive) {
                Task {
                    if await app.unpair() {
                        AnalyticsService.track(.buddyUnpaired, ["surface": "squad"])
                        Toast.success("Pairing ended.")
                    } else {
                        Toast.error("Couldn't end pairing. Try again.")
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You'll both keep your own streaks.")
        }
    }

    // Demoted: quiet grouped links, one calm surface, hairline-separated rows.
    private var moreLinks: some View {
        Card(pad: true) {
            VStack(spacing: 0) {
                navRow("Invite & rewards", glyph: .gift) { ReferralView() }
                rowDivider
                navRow("Squads & challenges", glyph: .squad) { SquadsHubView() }
                rowDivider
                navRow("Weekly league", glyph: .leagues) { LeaguesView() }
            }
        }
    }
    private var rowDivider: some View { Rectangle().fill(Tok.hairline).frame(height: 1) }

    private func navRow<D: View>(_ title: String, glyph: Glyph, @ViewBuilder _ dest: @escaping () -> D) -> some View {
        // Push zooms out of the tapped row (iOS 18+ zoom transition).
        NavigationLink { dest().navigationTransition(.zoom(sourceID: title, in: zoomNS)) } label: {
            HStack(spacing: 12) {
                Icon(glyph, size: 17, color: Tok.fg2)
                Text(title).font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Tok.fg3)
            }
            .padding(.vertical, 14)
        }
        .buttonStyle(PressScaleStyle(scale: 0.99))
        .matchedTransitionSource(id: title, in: zoomNS)
    }

    // Warm-lane CTA label (buddy / together lane — amber, not emerald).
    private func warmCTA(_ label: String, icon: Glyph) -> some View {
        HStack(spacing: 8) {
            Icon(icon, size: 16, color: Tok.warmInk)
            Text(label).font(.sora(.bold, 16)).tracking(-0.16).foregroundStyle(Tok.warmInk)
        }
        .frame(maxWidth: .infinity).frame(height: 56)
        .background(Tok.warm)
        .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        .shadow(color: Tok.warm.opacity(0.30), radius: 14, x: 0, y: 6)
    }
}
