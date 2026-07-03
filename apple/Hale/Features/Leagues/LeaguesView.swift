import SwiftUI

// Weekly consistency league — opt-in vs ranked leaderboard by quit-stage.
struct LeaguesView: View {
    @Environment(AppState.self) private var app
    @State private var league = LiveQuery<MyLeague>(Fn.myLeague)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tok.section) {
                Txt.Eyebrow("Weekly league", color: Tok.accent)
                Txt.H1("League")
                Txt.Body("A fresh leaderboard every week. Most clean days wins.")
                if let l = league.value {
                    if l.optedIn {
                        if let rank = l.rank {
                            Txt.Eyebrow("#\(rank)\(l.bucket.map { " · \($0)" } ?? "")", color: Tok.accent)
                        }
                        ForEach(Array(l.entries.enumerated()), id: \.offset) { i, e in
                            Card2(pad: true) {
                                HStack(spacing: 10) {
                                    Text("\(i + 1)").font(.sora(.bold, 15)).foregroundStyle(Tok.fg3).frame(width: 28)
                                    Text(e.isMe ? "You" : e.name)
                                        .font(.sora(.semibold, 15)).foregroundStyle(e.isMe ? Tok.accent : Tok.fg)
                                    if i == 0 { Image(systemName: "crown.fill").font(.system(size: 12)).foregroundStyle(Tok.warm).accessibilityHidden(true) }
                                    Spacer()
                                    Text("\(e.score) day\(e.score == 1 ? "" : "s")").font(.sora(.bold, 15)).foregroundStyle(Tok.fg)
                                }
                            }
                        }
                        HButton(label: "Leave this week", variant: .secondary, sm: true) {
                            Task {
                                await app.leaveLeague()
                                AnalyticsService.track(.leagueOptin, ["action": "leave", "bucket": l.bucket ?? ""])
                            }
                        }
                        Txt.Muted("Leaving won't affect your streak or progress.")
                    } else {
                        Card(pad: true) {
                            VStack(alignment: .leading, spacing: 10) {
                                Txt.H3("Join this week")
                                Txt.Body("Compete on check-in consistency with others at your stage. Friendly, private, resets weekly.")
                                HButton(label: "Join the league", variant: .primary) {
                                    Task {
                                        await app.leagueOptIn(); Haptics.success()
                                        AnalyticsService.track(.leagueOptin, ["action": "join", "bucket": l.bucket ?? ""])
                                    }
                                }
                            }
                        }
                        Txt.Muted("Segmented by your stage so you're matched with people at a similar point.")
                    }
                } else if league.loaded {
                    BrandEmptyState(
                        glyph: .leagues,
                        title: "No league\nthis week",
                        message: "Check back once this week's league opens — you'll be matched with people at your stage.")
                        .padding(.top, 12)
                } else {
                    ProgressView().tint(Tok.accent)
                }
            }
            .frame(maxWidth: Tok.maxContent).frame(maxWidth: .infinity)
            .padding(.horizontal, Tok.gutter).padding(.top, Tok.screenTop).padding(.bottom, 40)
        }
        .background(HaleBackdrop())
        .navigationTitle("League").navigationBarTitleDisplayMode(.inline)
    }
}
