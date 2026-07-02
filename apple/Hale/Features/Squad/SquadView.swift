import SwiftUI

// 1:1 buddy tab — solo (invite) vs paired (shared streak, cheer, unpair). Live myBuddy.
struct SquadView: View {
    @Environment(AppState.self) private var app
    @State private var buddy = LiveQuery<MyBuddy?>(Fn.myBuddy)
    @State private var shareCode: String?
    @State private var cheered = false

    var body: some View {
      NavigationStack {
        ZStack {
            Tok.bg.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Txt.H1("Squad")
                    Txt.Body("Quitting sticks when you're not doing it alone.")
                    if !buddy.loaded {
                        ProgressView().tint(Tok.accent).frame(maxWidth: .infinity).padding(.top, 40)
                    } else if let b = buddy.value ?? nil {
                        paired(b)
                    } else {
                        solo
                    }
                    moreLinks
                }
                .padding(.horizontal, Tok.gutter).padding(.top, 8).padding(.bottom, 40)
            }
        }
        .task { shareCode = await app.getOrCreateMyCode() }
      }
    }

    private var moreLinks: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 0) {
                Txt.Eyebrow("More ways to connect").padding(.bottom, 4)
                navRow("Invite & rewards") { ReferralView() }
                navRow("Squads & challenges") { SquadsHubView() }
                navRow("Weekly league") { LeaguesView() }
            }
        }
    }
    private func navRow<D: View>(_ title: String, @ViewBuilder _ dest: @escaping () -> D) -> some View {
        NavigationLink { dest() } label: {
            HStack {
                Text(title).font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Tok.fg3)
            }.padding(.vertical, 12)
        }
    }

    private var solo: some View {
        CardHero(pad: true) {
            VStack(alignment: .leading, spacing: 12) {
                Txt.H3("Invite a buddy")
                Txt.Body("Pair with a friend who's also quitting. You'll see each other's streaks and send support when it's hard — never your slip-ups.")
                if let code = shareCode {
                    ShareLink(item: "Quit nicotine with me on HALE. Use my invite code: \(code)") {
                        HButtonLabel(label: "Share my invite link")
                    }
                    .simultaneousGesture(TapGesture().onEnded {
                        AnalyticsService.track(.referralShared, ["surface": "squad_tab"])
                    })
                }
            }
        }
    }

    private func paired(_ b: MyBuddy) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            CardHero(pad: true) {
                VStack(alignment: .leading, spacing: 6) {
                    Txt.Eyebrow("Shared streak", color: Tok.warm)
                    Txt.Display("\(b.link.sharedStreak)", size: 44, color: Tok.warm)
                    Txt.Body("\(b.link.sharedStreak) day\(b.link.sharedStreak == 1 ? "" : "s") strong together")
                }
            }
            Card(pad: true) {
                VStack(alignment: .leading, spacing: 10) {
                    Txt.H3(b.buddy.name ?? "Your buddy")
                    Txt.Body("\(b.buddy.currentStreak) day\(b.buddy.currentStreak == 1 ? "" : "s") clean")
                    HButton(label: cheered ? "Support sent" : "Send support", variant: .warm, disabled: cheered) {
                        Task { if await app.cheer() { cheered = true; Haptics.success() } }
                    }
                }
            }
            Button("End pairing") { Task { await app.unpair() } }
                .font(.sora(.medium, 14)).foregroundStyle(Tok.fg3)
        }
    }
}
